/**
 * 第三方接口 POST /v1/responses —— 兼容 OpenAI Responses API 的一问一答。
 * 第三方把 OpenAI SDK 的 baseURL 设为 http://<host>/v1 即可调用；model 填角色 id（见 GET /v1/models）。
 *
 * 与儿童端网页共用 runChat，注入拦截、意图审查、输出审查全部照常执行，只返回审查后的结果。
 * 只取 input 中最后一条用户消息，没有上下文，也就无法伪造历史回复绕过审查；
 * instructions、temperature 等字段一律忽略，系统提示词只由服务端决定。
 *
 * stream: true 时按 OpenAI Responses 的流式事件返回，但仍然先审后放：
 * 立即推送 response.created，审查与画画期间每 15 秒发一次心跳；
 * 审查通过后再把最终文本分段推送 output_text.delta，未经审查的内容不会出现在流里。
 */
import { randomUUID } from 'crypto'
import { findRole, type Role } from '@/lib/server/config'
import { verifyKey } from '@/lib/server/apikeys'
import { chatReady, runChat, type ChatResult } from '@/lib/server/chat'
import { log, shortId, withRequest } from '@/lib/server/log'

export const dynamic = 'force-dynamic'

const MAX_CHARS = 500
const CHUNK = 8 // 流式时每个 delta 的字数

// OpenAI 风格的错误响应；每个错误都记一条日志，写明状态码与原因
function fail(status: number, message: string, type: string, code: string | null = null) {
  log.warn(`${status < 500 ? '入参审批：拒绝' : '处理失败'}，返回 ${status} ${code ?? type}（${message}）`)
  return Response.json({ error: { message, type, param: null, code } }, { status })
}

// 日志中只显示 Key 的首尾，不打印明文
const maskKey = (header: string | null) => {
  const k = header?.match(/^Bearer\s+(\S+)$/i)?.[1]
  return k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '未提供'
}

// input 可以是字符串，或消息数组（content 为字符串或 input_text 片段）；只取最后一条用户消息
function lastUserText(input: unknown) {
  if (typeof input === 'string') return input
  if (!Array.isArray(input)) return
  const m = input.findLast(i => i?.role === 'user')
  if (typeof m?.content === 'string') return m.content
  if (Array.isArray(m?.content))
    return m.content
      .filter((p: { type?: string; text?: unknown }) => p?.type === 'input_text' && typeof p.text === 'string')
      .map((p: { text: string }) => p.text)
      .join('\n')
}

const rid = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`

// 构造 Responses 对象；流式与非流式共用，保证两种方式返回的结构一致
function responseObject(id: string, role: Role, created: number, status: string, item?: object, metadata: Record<string, string> = {}) {
  return { id, object: 'response', created_at: created, status, model: role.id, output: item ? [item] : [], usage: null, metadata }
}

const messageItem = (id: string, text: string, status = 'completed') => ({
  id,
  type: 'message',
  role: 'assistant',
  status,
  content: status === 'completed' ? [{ type: 'output_text', text, annotations: [] }] : [],
})

// metadata 为扩展字段，值均为字符串：guided 表示引导或拒绝话术，image_url 为画画结果的绝对地址
function metadataOf(r: ChatResult, req: Request) {
  const m: Record<string, string> = { path: r.path, guided: String(!!r.guided) }
  if (r.image) m.image_url = `${req.headers.get('x-forwarded-proto') ?? 'http'}://${req.headers.get('host')}${r.image}`
  return m
}

// 每个请求分配一个短编号，之后的所有日志都带上它
export const POST = (req: Request) => withRequest(shortId(), () => handle(req))

async function handle(req: Request) {
  // ① 入参审批：鉴权 → 请求体 → 角色与配置 → 提问内容
  const auth = req.headers.get('authorization')
  const key = verifyKey(auth)
  if (!key) return fail(401, `无效的 API Key（${maskKey(auth)}）`, 'invalid_request_error', 'invalid_api_key')
  log.debug(`入参审批：鉴权通过 调用方=${key.name}（ctk_…${key.hint}）`)

  const body = await req.json().catch(() => null)
  if (!body) return fail(400, '请求体必须是 JSON', 'invalid_request_error')

  let role
  try {
    role = findRole(body.model)
    if (!chatReady()) return fail(503, '对话模型或审查模型尚未配置', 'server_error', 'not_configured')
  } catch (e) {
    log.error('入参审批：读取配置失败', e)
    return fail(503, '服务配置有误', 'server_error', 'not_configured')
  }
  if (!role) return fail(400, `模型 ${body.model ?? ''} 不存在，可用模型见 GET /v1/models`, 'invalid_request_error', 'model_not_found')

  const text = lastUserText(body.input)?.trim().slice(0, MAX_CHARS)
  if (!text) return fail(400, 'input 中没有用户消息', 'invalid_request_error', 'missing_input')
  log.debug(`入参审批：通过 入口=第三方 角色=${role.id} 流式=${body.stream ? '是' : '否'} 输入=${Array.isArray(body.input) ? `${body.input.length}条消息，取最后一条用户消息` : '字符串'}`)

  const id = rid('resp')
  const msgId = rid('msg')
  const created = Math.floor(Date.now() / 1000)
  const chat = () => runChat({ role, messages: [{ role: 'user', content: text }], signal: req.signal, client: key.name })

  if (!body.stream) {
    const r = await chat()
    if (r.error) return fail(502, r.text, 'server_error', r.path)
    return Response.json(responseObject(id, role, created, 'completed', messageItem(msgId, r.text), metadataOf(r, req)))
  }

  // 流式：事件顺序与 OpenAI Responses 一致，SDK 的 stream: true 可直接使用
  const enc = new TextEncoder()
  const body$ = new ReadableStream({
    async start(ctrl) {
      let seq = 0
      const send = (type: string, data: object) => {
        if (!req.signal.aborted) ctrl.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: seq++, ...data })}\n\n`))
      }
      const ping = setInterval(() => {
        if (!req.signal.aborted) ctrl.enqueue(enc.encode(': ping\n\n'))
      }, 15000)
      try {
        const pending = responseObject(id, role, created, 'in_progress')
        send('response.created', { response: pending })
        send('response.in_progress', { response: pending })

        const r = await chat()
        if (r.error) {
          // 顶层 code/message 符合 OpenAI 规范，嵌套的 error 供 SDK 抛出 APIError
          const error = { message: r.text, type: 'server_error', param: null, code: r.path }
          send('error', { code: r.path, message: r.text, param: null, error })
          send('response.failed', { response: { ...responseObject(id, role, created, 'failed'), error: { code: r.path, message: r.text } } })
          return
        }

        const pos = { item_id: msgId, output_index: 0, content_index: 0 }
        send('response.output_item.added', { output_index: 0, item: messageItem(msgId, '', 'in_progress') })
        send('response.content_part.added', { ...pos, part: { type: 'output_text', text: '', annotations: [] } })
        const chars = Array.from(r.text)
        for (let i = 0; i < chars.length; i += CHUNK) send('response.output_text.delta', { ...pos, delta: chars.slice(i, i + CHUNK).join('') })
        send('response.output_text.done', { ...pos, text: r.text })
        send('response.content_part.done', { ...pos, part: { type: 'output_text', text: r.text, annotations: [] } })
        const item = messageItem(msgId, r.text)
        send('response.output_item.done', { output_index: 0, item })
        send('response.completed', { response: responseObject(id, role, created, 'completed', item, metadataOf(r, req)) })
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
