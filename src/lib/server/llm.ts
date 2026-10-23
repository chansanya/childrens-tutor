/**
 * 大模型统一调用层：对话模型和审查模型都通过这里调用，屏蔽两种协议的差异。
 *   - openai-responses：OpenAI Responses API，系统提示词放 instructions，带 store:false 不让厂商留存对话
 *   - anthropic：Anthropic Messages API
 *
 * 一律以流式方式请求，complete() 再把结果拼成完整文本。"先审后放"要求拿到全文才能审查，
 * 流式只用于更快拿到内容、以及支持中途中止。
 */
import 'server-only'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { Endpoint } from './config'

export interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface Req {
  ep: Endpoint
  system: string
  messages: Msg[]
  model?: string
  maxTokens?: number
  signal?: AbortSignal
}

// 按连接配置缓存客户端；控制台保存配置后会生成新的配置对象，旧客户端随之失效
const clients = new WeakMap<Endpoint, OpenAI | Anthropic>()

function client<T extends OpenAI | Anthropic>(ep: Endpoint, make: () => T): T {
  let c = clients.get(ep) as T | undefined
  if (!c) clients.set(ep, (c = make()))
  return c
}

// baseURL 传 null 以免 SDK 回退读取 OPENAI_BASE_URL / ANTHROPIC_BASE_URL
export async function* stream({ ep, system, messages, model = ep.model, maxTokens, signal }: Req) {
  if (ep.provider === 'openai-responses') {
    const s = await client(ep, () => new OpenAI({ apiKey: ep.apiKey, baseURL: ep.baseURL ?? null })).responses.create(
      // max_output_tokens 最小为 16；store: false 不在厂商侧留存孩子的对话
      { ...ep.extra, model, stream: true, store: false, instructions: system, input: messages, max_output_tokens: maxTokens && Math.max(16, maxTokens) },
      { signal },
    )
    for await (const ev of s) {
      if (ev.type === 'response.output_text.delta') yield ev.delta
    }
  } else {
    const s = await client(ep, () => new Anthropic({ apiKey: ep.apiKey, baseURL: ep.baseURL ?? null })).messages.create(
      // Anthropic 要求必填 max_tokens；extra 在前，不能覆盖核心字段
      { ...ep.extra, model, stream: true, max_tokens: maxTokens ?? 4096, system, messages },
      { signal },
    )
    for await (const ev of s) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text
    }
  }
}

// 控制页"加载模型"用，临时连接不进缓存
export async function listModels({ provider, apiKey, baseURL }: Pick<Endpoint, 'provider' | 'apiKey' | 'baseURL'>) {
  const opts = { signal: AbortSignal.timeout(15000) }
  const ids: string[] = []
  const pages =
    provider === 'anthropic'
      ? new Anthropic({ apiKey, baseURL: baseURL ?? null }).models.list({ limit: 1000 }, opts)
      : new OpenAI({ apiKey, baseURL: baseURL ?? null }).models.list(opts)
  for await (const m of pages) ids.push(m.id)
  return ids.sort()
}

// 拼成完整文本：主模型回答、审查结论、画画提示词都通过它获取
export async function complete(req: Req) {
  let out = ''
  for await (const t of stream(req)) out += t
  return out
}
