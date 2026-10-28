/**
 * 控制台提交内容的校验：模型连接、角色、绘画配置。所有写入 settings.json 的数据都先经过这里。
 *
 * 安全要点：API Key 与协议、地址绑定。修改协议或地址时必须重新填写 Key，
 * 已保存的 Key 永远不会被发往新地址，防止有人借控制台把 Key 转发到自己的服务器。
 */
import 'server-only'
import { isIconName } from '../icons'
import { config, isImageProvider, isProvider, parseExtra, type DrawConfig, type Endpoint, type ImageApi, type Role } from './config'
import type { DrawTemplate, Workflow } from './draw/workflow'

export type Target = 'main' | 'guard'
export const isTarget = (v: unknown): v is Target => v === 'main' || v === 'guard'
const LABEL: Record<Target, string> = { main: '对话模型', guard: '审查模型' }

type Result<T> = { value: T; error?: undefined } | { value?: undefined; error: string }
type Input = Record<string, unknown> | null | undefined

export const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined)

export function parseConnection(input: Input, target: Target): Result<Pick<Endpoint, 'provider' | 'baseURL' | 'apiKey'>> {
  const label = LABEL[target]
  const provider = input?.provider
  const baseURL = text(input?.baseURL, 500)
  if (!isProvider(provider)) return { error: `${label}的协议不正确` }
  if (baseURL && !/^https?:\/\//.test(baseURL)) return { error: `${label}的地址需要以 http:// 或 https:// 开头` }
  let apiKey = text(input?.apiKey, 500)
  // Key 与协议、地址绑定：二者有变化时必须重新填写，已保存的 Key 不会被发往新地址
  if (!apiKey) {
    const current = config()[target]
    if (!current || provider !== current.provider || baseURL !== current.baseURL) return { error: `请填写${label}的 API Key` }
    apiKey = current.apiKey
  }
  return { value: { provider, baseURL, apiKey } }
}

const ROLE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const MAX_ROLES = 20

// 统一字段顺序与格式，便于与默认角色比较
export function parseRoles(input: unknown): Result<Role[]> {
  if (!Array.isArray(input) || !input.length) return { error: '至少需要保留一个角色' }
  if (input.length > MAX_ROLES) return { error: `角色最多 ${MAX_ROLES} 个` }
  const roles: Role[] = []
  for (const r of input as Input[]) {
    const name = text(r?.name, 20)
    if (!name) return { error: '角色名称不能为空，且不超过 20 字' }
    const id = r?.id
    if (typeof id !== 'string' || !ROLE_ID.test(id)) return { error: `「${name}」的标识不正确` }
    if (roles.some(x => x.id === id)) return { error: `角色标识重复：${id}` }
    if (!isIconName(r?.icon)) return { error: `「${name}」的图标不正确` }
    if (typeof r?.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(r.color)) return { error: `「${name}」的颜色需为 #RRGGBB` }
    const tagline = typeof r?.tagline === 'string' ? r.tagline.trim() : ''
    if (tagline.length > 40) return { error: `「${name}」的简介不能超过 40 字` }
    const greeting = text(r?.greeting, 80)
    if (!greeting) return { error: `「${name}」的问候语不能为空，且不超过 80 字` }
    const persona = text(r?.persona, 4000)
    if (!persona) return { error: `「${name}」的人设不能为空` }
    const model = text(r?.model, 200)
    roles.push({ id, name, tagline, icon: r.icon, color: r.color.toLowerCase(), greeting, persona, ...(model && { model }) })
  }
  return { value: roles }
}

export function parseEndpoint(input: Input, target: Target): Result<Endpoint> {
  const conn = parseConnection(input, target)
  if (conn.error) return { error: conn.error }
  const label = LABEL[target]
  const model = text(input?.model, 200)
  if (!model) return { error: `请填写${label}的模型名` }
  try {
    return { value: { ...conn.value!, model, extra: parseExtra(text(input?.extra, 2000), '额外参数') } }
  } catch {
    return { error: `${label}的额外参数必须是 JSON 对象，例如 {"enable_thinking": false}` }
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// 接受对象或 JSON 字符串；每个节点都必须带 inputs
function parseWorkflow(v: unknown): Workflow | undefined {
  let w = v
  if (typeof v === 'string') {
    try {
      w = JSON.parse(v)
    } catch {
      return
    }
  }
  if (isObject(w) && Object.values(w).length && Object.values(w).every(n => isObject(n) && isObject(n.inputs))) return w as Workflow
}

const hasField = (wf: Workflow, node: string, field: string) => Object.hasOwn(wf[node]?.inputs ?? {}, field)

// 云端文生图连接。全部留空视为未配置；Key 同样与协议、地址绑定，二者变化时必须重新填写
export function parseImageApi(input: Input): Result<ImageApi | undefined> {
  const baseURL = text(input?.baseURL, 500)
  const model = text(input?.model, 200)
  let apiKey = text(input?.apiKey, 500)
  if (!baseURL && !model && !apiKey) return { value: undefined }
  const provider = input?.provider
  if (!isImageProvider(provider)) return { error: '文生图的协议不正确' }
  if (!baseURL || !/^https?:\/\//.test(baseURL)) return { error: '文生图接口地址需要以 http:// 或 https:// 开头' }
  if (!model) return { error: '请填写文生图模型名' }
  if (!apiKey) {
    const current = config().draw.api
    if (!current || provider !== current.provider || baseURL !== current.baseURL) return { error: '请填写文生图的 API Key' }
    apiKey = current.apiKey
  }
  const size = text(input?.size, 20)
  if (input?.lang !== 'en' && input?.lang !== 'zh') return { error: '文生图的提示词语言不正确' }
  const style = typeof input?.style === 'string' ? input.style.trim().slice(0, 500) : ''
  try {
    // 控制台提交的是 JSON 文本；.env 预设（与默认值比较时）已是对象
    const extra = isObject(input?.extra) ? input.extra : parseExtra(text(input?.extra, 2000), '额外参数')
    return { value: { provider, baseURL, apiKey, model, ...(size && { size }), lang: input.lang, style, ...(extra && { extra }) } }
  } catch {
    return { error: '文生图的额外参数必须是 JSON 对象，例如 {"prompt_extend": false}' }
  }
}

export function parseDraw(raw: unknown): Result<DrawConfig> {
  const input = raw as Input
  const url = text(input?.url, 500) ?? ''
  const enabled = input?.enabled === true
  const mode = input?.mode === 'api' ? 'api' : 'comfy'
  const api = parseImageApi(input?.api as Input)
  if (api.error) return { error: api.error }
  if (enabled && mode === 'comfy' && !url) return { error: '启用绘画需要填写 ComfyUI 地址' }
  if (enabled && mode === 'api' && !api.value) return { error: '使用云端文生图需要填写接口地址、模型和 API Key' }
  if (url && !/^https?:\/\//.test(url)) return { error: 'ComfyUI 地址需要以 http:// 或 https:// 开头' }
  const timeoutSec = Number(input?.timeoutSec)
  const maxQueue = Number(input?.maxQueue)
  if (!Number.isInteger(timeoutSec) || timeoutSec < 30 || timeoutSec > 900) return { error: '画画超时需为 30–900 秒的整数' }
  if (!Number.isInteger(maxQueue) || maxQueue < 1 || maxQueue > 20) return { error: '最大排队数需为 1–20 的整数' }

  const list = input?.templates
  if (!Array.isArray(list) || !list.length) return { error: '至少需要一个绘画模板' }
  if (list.length > 10) return { error: '绘画模板最多 10 个' }
  const templates: DrawTemplate[] = []
  for (const t of list as Input[]) {
    const name = text(t?.name, 30)
    if (!name) return { error: '模板名称不能为空，且不超过 30 字' }
    const id = t?.id
    if (typeof id !== 'string' || !ROLE_ID.test(id) || templates.some(x => x.id === id)) return { error: `「${name}」的模板标识不正确或重复` }
    if (t?.lang !== 'en' && t?.lang !== 'zh') return { error: `「${name}」的提示词语言不正确` }
    const workflow = parseWorkflow(t?.workflow)
    if (!workflow) return { error: `「${name}」的工作流不是合法的 ComfyUI API 格式 JSON` }
    const promptNode = text(t?.promptNode, 40) ?? ''
    const promptField = text(t?.promptField, 60) ?? ''
    if (!hasField(workflow, promptNode, promptField)) return { error: `「${name}」的工作流中找不到提示词节点 ${promptNode} 的 ${promptField} 字段` }
    const seedNode = text(t?.seedNode, 40)
    const seedField = text(t?.seedField, 60) ?? 'seed'
    if (seedNode && !hasField(workflow, seedNode, seedField)) return { error: `「${name}」的工作流中找不到种子节点 ${seedNode} 的 ${seedField} 字段` }
    const style = typeof t?.style === 'string' ? t.style.trim().slice(0, 500) : ''
    templates.push({ id, name, lang: t.lang, style, workflow, promptNode, promptField, ...(seedNode && { seedNode, seedField }) })
  }
  const active = templates.find(t => t.id === input?.active)?.id ?? templates[0].id
  return { value: { enabled, mode, ...(api.value && { api: api.value }), url, active, timeoutSec, maxQueue, templates } }
}
