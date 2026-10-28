/**
 * 云端文生图客户端，两种协议：
 *   - openai-images：POST {baseURL}/images/generations，适用于 OpenAI gpt-image、火山方舟 Seedream、百炼 qwen-image 等
 *   - dashscope：POST {baseURL}/services/aigc/multimodal-generation/generation，阿里云百炼原生接口（如 z-image-turbo）
 *
 * 与 ComfyUI 的差异：
 *   - 没有队列接口，繁忙检查用进程内的在途请求数，同时起到控制费用的作用
 *   - 同步返回，进度只有"渲染中"；中止只能断开请求，已提交的任务厂商仍可能计费
 *   - 返回 url 或 b64_json 都支持，统一存到本地再下发
 *   - 厂商内容审核拦截时抛出 ImageRejected，由调用方按"不安全"回复孩子
 */
import 'server-only'
import type { ImageApi } from '../config'
import { saveImage } from './image'
import { brief, log } from '../log'

export class ImageRejected extends Error {}

// 各厂商审核拦截的错误码：content_policy_violation、moderation_blocked（OpenAI）、
// InputTextSensitiveContentDetected、OutputImageSensitiveContentDetected（火山方舟）、DataInspectionFailed、IPInfringementSuspect（阿里云）
const REJECTED = /content_policy|moderation|sensitive|inspection|infringement/i

type Body = Record<string, any> | null // eslint-disable-line @typescript-eslint/no-explicit-any -- 各厂商响应结构不一，按协议取字段

interface Protocol {
  path: string
  body: (api: ImageApi, prompt: string) => object
  error: (b: Body) => { code?: string; type?: string; message?: string } | undefined
  image: (b: Body) => { url?: string; b64_json?: string } | undefined
}

const PROTOCOL: Record<ImageApi['provider'], Protocol> = {
  'openai-images': {
    path: '/images/generations',
    body: (api, prompt) => ({ model: api.model, prompt, n: 1, ...(api.size && { size: api.size }), ...api.extra }),
    error: b => b?.error,
    image: b => b?.data?.[0],
  },
  dashscope: {
    path: '/services/aigc/multimodal-generation/generation',
    // prompt_extend 固定关闭：开启后百炼会用自己的模型改写提示词，审查过的提示词就不再是实际出图用的
    body: (api, prompt) => ({
      model: api.model,
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { ...(api.size && { size: api.size.replace(/x/i, '*') }), ...api.extra, prompt_extend: false },
    }),
    // 失败时顶层返回 {code, message}
    error: b => (b?.code ? b : undefined),
    image: b => ({ url: b?.output?.choices?.[0]?.message?.content?.find((c: { image?: string }) => c.image)?.image }),
  },
}

let inflight = 0
export const apiBusy = (maxQueue: number) => inflight >= maxQueue

export async function generateApi(api: ImageApi, prompt: string, timeoutSec: number, signal: AbortSignal) {
  const p = PROTOCOL[api.provider]
  const s = AbortSignal.any([signal, AbortSignal.timeout(timeoutSec * 1000)])
  const t0 = Date.now()
  inflight++
  try {
    const url = api.baseURL.replace(/\/+$/, '') + p.path
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${api.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(p.body(api, prompt)),
      signal: s,
    })
    const body: Body = await r.json().catch(() => null)
    const err = p.error(body)
    if (!r.ok || err) {
      // 带上请求地址：404 这类错误厂商通常不返回内容，协议与地址不匹配时只能靠地址判断
      const detail = `HTTP ${r.status}${err?.code ? ` ${err.code}` : ''}${err?.message ? `（${brief(String(err.message), 80)}）` : ''} POST ${url}`
      if (REJECTED.test(`${err?.code} ${err?.type}`)) throw new ImageRejected(`文生图被厂商内容审核拦截：${detail}`)
      throw new Error(`文生图 ${detail}`)
    }
    const item = p.image(body)
    const tDone = Date.now()
    let buf: Buffer
    if (item?.b64_json) buf = Buffer.from(item.b64_json, 'base64')
    else if (item?.url) {
      const img = await fetch(item.url, { signal: s })
      if (!img.ok) throw new Error(`文生图下载图片 HTTP ${img.status}`)
      buf = Buffer.from(await img.arrayBuffer())
    } else throw new Error('文生图未返回图片')
    const name = await saveImage(buf)
    return { name, ms: { drawRender: tDone - t0, drawFetch: Date.now() - tDone } }
  } catch (e) {
    if (s.aborted) log.debug(`画画：${signal.aborted ? '调用方中止' : `超过 ${timeoutSec} 秒超时`}，已断开文生图请求（已提交的任务厂商仍可能计费）`)
    throw e
  } finally {
    inflight--
  }
}
