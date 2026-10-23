/**
 * 对话接口 POST /api/chat —— 整条"引导 + 审查"链路的编排者。
 *
 * 核心原则：先审后放。模型生成的内容先在服务端攒齐、通过审查后才下发；
 * 孩子能看到的只有两类内容：通过审查的模型回答，以及 policy.ts 里预置的固定话术。
 *
 * 一次请求的流程（编号与 docs/对话流程.md 对应）：
 *   ① 校验配置与角色、清洗消息
 *   ② 注入关键词拦截（不调用任何模型）
 *   ③ 意图审查 ∥ 主模型生成（同时开始，正常路径不增加等待）
 *        draw → 画画流程；unsafe / bypass → 中止生成并回固定话术；normal → 继续
 *   ④ 输出审查：pass 下发；homework 按严格引导重写并再审；unsafe / error 回固定话术
 *   ⑤ 写审计记录（finally 中，无论走哪条路径都只写一次）
 *
 * 下发给前端的 SSE 事件：reviewing（开始输出审查）、drawing（画画进度）、answer（最终内容）、error。
 */
import { config, findRole } from '@/lib/server/config'
import { complete, type Msg } from '@/lib/server/llm'
import { startAudit } from '@/lib/server/audit'
import { buildSystem, withReminder, refusal, GUARD_DOWN, GUIDE_FALLBACK, REWRITE_HINT, UNSAFE_REPLY } from '@/lib/server/guard/policy'
import { checkIntent, isInjection, needsGuide } from '@/lib/server/guard/intent'
import { review } from '@/lib/server/guard/review'
import { drawReply } from '@/lib/server/draw'

export const dynamic = 'force-dynamic'

const MAX_HISTORY = 20
const MAX_CHARS = 500

// ① 清洗：只保留孩子与学伴的消息，丢弃客户端伪造的 system 消息；截断长度与条数；最后一条必须是孩子说的
function sanitize(input: unknown): Msg[] | undefined {
  if (!Array.isArray(input)) return
  const msgs = input
    .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role as Msg['role'], content: m.content.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_HISTORY)
  while (msgs[0]?.role === 'assistant') msgs.shift()
  return msgs.at(-1)?.role === 'user' ? msgs : undefined
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const messages = sanitize(body?.messages)

  // ① 模型与系统提示词只由服务端决定，客户端只能指定 roleId；对话或审查模型缺一不可
  let role, main, guard
  try {
    role = findRole(body?.roleId)
    main = config().main
    guard = config().guard
    if (!main || !guard) throw new Error('对话模型或审查模型未配置，请在 /admin 中配置')
  } catch (e) {
    console.error('[chat]', e)
    return Response.json({ message: '学伴还没准备好，请让大人检查一下配置' }, { status: 503 })
  }
  if (!role || !messages) return Response.json({ message: '请求格式不正确' }, { status: 400 })

  const signal = req.signal // 孩子点"停止"时中止，会一路传到所有模型调用与 ComfyUI 轮询
  const enc = new TextEncoder()
  const last = messages.at(-1)!.content
  // 引导模式：最后一句命中作业关键词时，在系统提示词末尾追加"只引导、不给成品"的指令
  const guide = needsGuide(last)
  const audit = startAudit({ role: role.id, mainModel: role.model ?? main.model, guardModel: guard.model, inChars: last.length, guide })

  const body$ = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: object = {}) => {
        if (!signal.aborted) ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      // 画画等待较久，定时心跳防止代理断开连接（前端会忽略这种注释帧）
      const ping = setInterval(() => {
        if (!signal.aborted) ctrl.enqueue(enc.encode(': ping\n\n'))
      }, 15000)
      let path = 'error' // 审计路径，各分支覆盖，finally 中写入
      try {
        // ② 注入拦截："忽略规则""开发者模式"等明显话术，直接友好拒绝，不调用任何模型
        if (isInjection(last)) {
          path = 'injection'
          return send('answer', { text: refusal(), guided: true })
        }

        // 主模型的输入：最后一句前加"守则提醒"；系统提示词 = 守护硬规则 + 角色人设（+ 引导模式）
        const prompt = withReminder(messages)
        const gen = (system: string, s: AbortSignal) =>
          complete({ ep: main, model: role.model ?? main.model, system, messages: prompt, signal: s })

        // ③ 意图审查与主模型生成同时开始：生成挂在 draftCtrl 上，意图一旦判为非正常就立刻中止，不浪费 token
        const draftCtrl = new AbortController()
        const draft = audit.time('generate', gen(buildSystem(role, guide), AbortSignal.any([signal, draftCtrl.signal])))
        draft.catch(() => {}) // 被中止时的拒绝由这里吞掉，避免未处理的 Promise 拒绝

        // 意图审查：审查模型读最近 5 条消息，只输出一个词（unsafe > bypass > draw > normal）；出错按 normal 放行
        const intent = await audit.time('intent', checkIntent(messages, signal, config().draw.enabled))
        audit.set({ intent })
        if (intent !== 'normal') draftCtrl.abort()

        // ③-draw 孩子想画画：改走画画流程（提示词改写 → 安全复核 → ComfyUI），返回值即审计路径
        if (intent === 'draw') {
          path = await drawReply(messages, signal, audit, send)
          return
        }
        // ③-unsafe / bypass：不等生成结果，直接回固定话术。绕过规则的给友好拒绝，并引导孩子自己思考
        if (intent !== 'normal') {
          path = intent === 'unsafe' ? 'unsafe_intent' : 'refusal'
          return send('answer', intent === 'unsafe' ? { text: UNSAFE_REPLY } : { text: refusal(), guided: true })
        }

        // ④ 输出审查：等生成完成，先通知前端"守护检查中"（不含任何内容），再交给审查模型判定
        const answer = await draft
        if (!answer.trim()) throw new Error('empty answer')
        send('reviewing')
        const verdict = await audit.time('review', review(messages, answer, signal))
        audit.set({ verdict, outChars: answer.length })

        if (verdict === 'pass') {
          // 通过：原样下发
          path = 'answer'
          send('answer', { text: answer })
        } else if (verdict === 'unsafe') {
          // 不适合儿童：换成安全提示话术
          path = 'unsafe_output'
          send('answer', { text: UNSAFE_REPLY })
        } else if (verdict === 'error') {
          // 审查调用失败且处于严格模式：宁可不答，也不放行未审内容
          path = 'guard_error'
          send('error', { message: GUARD_DOWN })
        } else {
          // homework（模型替孩子写了成品或给了答案）：强制引导模式 + 纠正提示让主模型重写，
          // 重写结果必须再审一次；仍不通过就用固定引导话术兜底
          const retry = await audit.time('rewrite', gen(`${buildSystem(role, true)}\n\n${REWRITE_HINT}`, signal))
          const ok = (await audit.time('review2', review(messages, retry, signal))) === 'pass'
          path = ok ? 'rewrite' : 'fallback'
          send('answer', { text: ok ? retry : GUIDE_FALLBACK, guided: true })
        }
      } catch (e) {
        // 孩子中止时不再下发；其他异常（主模型报错、空回答等）给出友好提示
        if (!signal.aborted) {
          console.error('[chat]', e)
          send('error', { message: '我刚刚走神了，再问我一次好吗？' })
        }
      } finally {
        // ⑤ 无论走哪条路径都写一行审计记录（各阶段耗时、路径、结论，不含对话原文）
        clearInterval(ping)
        audit.finish(signal.aborted ? 'aborted' : path)
        try {
          ctrl.close()
        } catch {}
      }
    },
  })

  return new Response(body$, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
}
