/**
 * 儿童端对话接口 POST /api/chat：清洗消息后调用对话主链路 runChat（见 lib/server/chat.ts），以 SSE 下发。
 *
 * 下发的 SSE 事件：reviewing（开始输出审查）、drawing（画画进度）、answer（最终内容）、error。
 * 引导与审查逻辑全部在 runChat 中，与第三方接口 /v1/responses 共用。
 */
import { findRole } from '@/lib/server/config'
import type { Msg } from '@/lib/server/llm'
import { chatReady, runChat } from '@/lib/server/chat'
import { log, shortId, withRequest } from '@/lib/server/log'

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

// 每个请求分配一个短编号，之后的所有日志都带上它
export const POST = (req: Request) => withRequest(shortId(), () => handle(req))

async function handle(req: Request) {
  const body = await req.json().catch(() => null)
  const messages = sanitize(body?.messages)

  // ① 入参审批：模型与系统提示词只由服务端决定，客户端只能指定 roleId；对话或审查模型缺一不可
  let role
  try {
    role = findRole(body?.roleId)
    if (!chatReady()) throw new Error('对话模型或审查模型未配置，请在 /admin 中配置')
  } catch (e) {
    log.warn('入参审批：服务未就绪，返回 503', e)
    return Response.json({ message: '学伴还没准备好，请让大人检查一下配置' }, { status: 503 })
  }
  if (!role || !messages) {
    log.warn(`入参审批：拒绝，返回 400（${!role ? `角色 ${body?.roleId ?? '未提供'} 不存在` : '消息为空或最后一条不是孩子说的'}）`)
    return Response.json({ message: '请求格式不正确' }, { status: 400 })
  }
  const raw = Array.isArray(body?.messages) ? body.messages.length : 0
  log.debug(`入参审批：通过 入口=网页 角色=${role.id} 消息=${messages.length}条${raw > messages.length ? `（原始 ${raw} 条，已清洗）` : ''}`)

  const signal = req.signal // 孩子点"停止"时中止，会一路传到所有模型调用与 ComfyUI 轮询
  const enc = new TextEncoder()

  const body$ = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: object = {}) => {
        if (!signal.aborted) ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      // 画画等待较久，定时心跳防止代理断开连接（前端会忽略这种注释帧）
      const ping = setInterval(() => {
        if (!signal.aborted) ctrl.enqueue(enc.encode(': ping\n\n'))
      }, 15000)
      try {
        const r = await runChat({ role, messages, signal, client: 'web', emit: send })
        if (r.error) send('error', { message: r.text })
        else send('answer', { text: r.text, guided: r.guided, image: r.image })
      } finally {
        clearInterval(ping)
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
