/**
 * 对话主链路 —— 儿童端网页（/api/chat）与第三方接口（/v1/responses）共用，确保两边的引导与审查完全一致。
 *
 * 核心原则：先审后放。只返回两类内容：通过审查的模型回答，以及 policy.ts 里预置的固定话术。
 *
 * 流程（编号与 docs/对话流程.md 对应，① 清洗与配置检查由调用方完成）：
 *   ② 注入关键词拦截（不调用任何模型）
 *   ③ 意图审查 ∥ 主模型生成（同时开始，正常路径不增加等待）
 *        draw → 画画流程；unsafe / bypass → 中止生成并回固定话术；normal → 继续
 *   ④ 输出审查：pass 返回；homework 按严格引导重写并再审；unsafe / error 回固定话术
 *   ⑤ 写审计记录（无论走哪条路径都只写一次）
 */
import 'server-only'
import { config, type Role } from './config'
import { complete, type Msg } from './llm'
import { startAudit } from './audit'
import { buildSystem, withReminder, refusal, GUARD_DOWN, GUIDE_FALLBACK, REWRITE_HINT, UNSAFE_REPLY } from './guard/policy'
import { checkIntent, isInjection, needsGuide } from './guard/intent'
import { review } from './guard/review'
import { drawReply } from './draw'
import { brief, log } from './log'
import { INTENT_LABEL, VERDICT_LABEL, withLabel } from '../labels'

export interface ChatResult {
  text: string
  guided?: boolean // 引导或拒绝话术
  image?: string // 画画结果，站内相对地址
  error?: boolean // text 为面向用户的错误提示
  path: string // 审计路径
}

// 进度事件：reviewing（开始输出审查）、drawing（画画进度）。网页用来推送 SSE，第三方接口不需要
type Emit = (event: string, data?: object) => void

// 对话模型与审查模型都已配置才能对话；配置文件损坏时向上抛出
export const chatReady = () => !!(config().main && config().guard)

export async function runChat({ role, messages, signal, client, emit = () => {} }: { role: Role; messages: Msg[]; signal: AbortSignal; client: string; emit?: Emit }): Promise<ChatResult> {
  const main = config().main!
  const last = messages.at(-1)!.content
  // 引导模式：最后一句命中作业关键词时，在系统提示词末尾追加"只引导、不给成品"的指令
  const guide = needsGuide(last)
  const audit = startAudit({ client, role: role.id, mainModel: role.model ?? main.model, guardModel: config().guard!.model, inChars: last.length, guide })
  log.debug(`开始：调用方=${client} 角色=${role.id}（${role.name}） 历史=${messages.length}条 问题="${brief(last)}"（${last.length}字）`)

  // answer / error 收集为返回值，其余进度事件交给 emit；画画流程沿用同一套 send 接口
  let result: Omit<ChatResult, 'path'> | undefined
  const send = (event: string, data: object = {}) => {
    const d = data as { text?: string; guided?: boolean; image?: string; message?: string }
    if (event === 'answer') result = { text: d.text!, guided: d.guided, image: d.image }
    else if (event === 'error') result = { text: d.message!, error: true }
    else emit(event, data)
  }

  let path = 'error' // 审计路径，各分支覆盖
  try {
    // ② 注入拦截："忽略规则""开发者模式"等明显话术，直接友好拒绝，不调用任何模型
    if (isInjection(last)) {
      log.debug('注入检查：命中注入话术，直接友好拒绝，不调用模型')
      path = 'injection'
      send('answer', { text: refusal(), guided: true })
    } else {
      log.debug('注入检查：未命中')
      log.debug(guide ? '引导模式：命中作业关键词，本轮追加"只引导、不给成品"' : '引导模式：未命中作业关键词')
      // 主模型的输入：最后一句前加"守则提醒"；系统提示词 = 守护硬规则 + 角色人设（+ 引导模式）
      const prompt = withReminder(messages)
      const gen = (system: string, s: AbortSignal) => complete({ ep: main, model: role.model ?? main.model, system, messages: prompt, signal: s })

      // ③ 意图审查与主模型生成同时开始：生成挂在 draftCtrl 上，意图一旦判为非正常就立刻中止，不浪费 token
      const draftCtrl = new AbortController()
      const draft = audit.time('generate', gen(buildSystem(role, guide), AbortSignal.any([signal, draftCtrl.signal])))
      draft.catch(() => {}) // 被中止时的拒绝由这里吞掉，避免未处理的 Promise 拒绝

      // 意图审查：审查模型读最近 5 条消息，只输出一个词（unsafe > bypass > draw > normal）；出错按 normal 放行
      log.debug(`意图分析：开始，与主模型生成同时进行（绘画${config().draw.enabled ? '已启用' : '未启用'}）`)
      const intent = await audit.time('intent', checkIntent(messages, signal, config().draw.enabled))
      audit.set({ intent })
      log.debug(`意图分析：intent=${withLabel(INTENT_LABEL, intent)} 耗时=${audit.took('intent')}${intent === 'normal' ? '' : '，中止主模型生成'}`)
      if (intent !== 'normal') draftCtrl.abort()

      if (intent === 'draw') {
        // ③-draw 想画画：改走画画流程（提示词改写 → 安全复核 → ComfyUI），返回值即审计路径
        path = await drawReply(messages, signal, audit, send)
      } else if (intent !== 'normal') {
        // ③-unsafe / bypass：不等生成结果，直接回固定话术。绕过规则的给友好拒绝，并引导孩子自己思考
        path = intent === 'unsafe' ? 'unsafe_intent' : 'refusal'
        send('answer', intent === 'unsafe' ? { text: UNSAFE_REPLY } : { text: refusal(), guided: true })
      } else {
        // ④ 输出审查：等生成完成，先通知"守护检查中"（不含任何内容），再交给审查模型判定
        const answer = await draft
        log.debug(`生成回答：${answer.length}字 耗时=${audit.took('generate')}`)
        if (!answer.trim()) throw new Error('主模型返回了空内容')
        emit('reviewing')
        const verdict = await audit.time('review', review(messages, answer, signal))
        audit.set({ verdict, outChars: answer.length })
        const next = { pass: '原样返回', unsafe: '替换为安全提示话术', error: '严格模式下不放行，返回兜底话术', homework: '按严格引导改写' }[verdict]
        log.debug(`输出审查：verdict=${withLabel(VERDICT_LABEL, verdict)} 耗时=${audit.took('review')} → ${next}`)

        if (verdict === 'pass') {
          // 通过：原样返回
          path = 'answer'
          send('answer', { text: answer })
        } else if (verdict === 'unsafe') {
          // 不适合儿童：换成安全提示话术
          path = 'unsafe_output'
          send('answer', { text: UNSAFE_REPLY })
        } else if (verdict === 'error') {
          // 审查调用失败且处于严格模式：不放行未审内容，以正常回答形式返回兜底话术，不向客户端暴露故障
          path = 'guard_error'
          send('answer', { text: GUARD_DOWN, guided: true })
        } else {
          // homework（模型替孩子写了成品或给了答案）：强制引导模式 + 纠正提示让主模型重写，
          // 重写结果必须再审一次；仍不通过就用固定引导话术兜底
          const retry = await audit.time('rewrite', gen(`${buildSystem(role, true)}\n\n${REWRITE_HINT}`, signal))
          log.debug(`改写：${retry.length}字 耗时=${audit.took('rewrite')}`)
          const v2 = await audit.time('review2', review(messages, retry, signal))
          const ok = v2 === 'pass'
          log.debug(`二次审查：verdict=${withLabel(VERDICT_LABEL, v2)} 耗时=${audit.took('review2')} → ${ok ? '返回改写结果' : '改用固定引导话术'}`)
          path = ok ? 'rewrite' : 'fallback'
          send('answer', { text: ok ? retry : GUIDE_FALLBACK, guided: true })
        }
      }
    }
  } catch (e) {
    // 主模型报错、空回答等给出友好提示；调用方中止时只记一条 debug
    if (signal.aborted) log.debug('调用方已中止请求')
    else log.error('对话出错', e)
    result = { text: '我刚刚走神了，再问我一次好吗？', error: true }
  } finally {
    // ⑤ 无论走哪条路径都写一行审计记录（各阶段耗时、路径、结论，不含对话原文）
    if (signal.aborted) path = 'aborted'
    audit.finish(path)
  }
  return { ...(result ?? { text: '我刚刚走神了，再问我一次好吗？', error: true }), path }
}
