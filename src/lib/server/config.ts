/**
 * 配置中心：合并三处来源，优先级由高到低：
 *   1. 控制台保存的 settings.json（CONFIG_DIR 下）
 *   2. .env 环境变量
 *   3. 代码内置默认值（守护硬规则、绘画模板）与 roles.json
 *
 * 引导与审查链路依赖这里的：main（对话模型）、guard（审查模型）、hardRules（守护硬规则）、
 * roles（角色人设）、guardStrict（审查失败是否放行）、draw（绘画配置）。
 * 结果缓存在内存中，控制台保存后通过 saveSettings 清空缓存，立即生效。
 */
import 'server-only'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PublicRole } from '../types'
import { DEFAULT_HARD_RULES } from './guard/rules'
import { DEFAULT_TEMPLATES, STYLE_EN, STYLE_ZH, type DrawTemplate } from './draw/workflow'
import { log, setLogLevel, type LogLevel } from './log'

export const PROVIDERS = ['openai-responses', 'anthropic'] as const
export type Provider = (typeof PROVIDERS)[number]
export const isProvider = (v: unknown): v is Provider => PROVIDERS.includes(v as Provider)

export interface Role extends PublicRole {
  persona: string
  model?: string
}

export interface Endpoint {
  provider: Provider
  apiKey: string
  baseURL?: string
  model: string
  // 原样合并进请求体的厂商私有参数，如阿里云关闭思考 {"enable_thinking": false}
  extra?: Record<string, unknown>
}

// 控制页保存的覆盖项，优先级高于 .env 与 roles.json
export interface Settings {
  hardRules?: string
  // 完整角色列表，存在时整体覆盖 roles.json
  roles?: Role[]
  // 旧版只覆盖人设，仅读取兼容
  personas?: Record<string, string>
  main?: Endpoint
  guard?: Endpoint
  draw?: DrawConfig
  // 第三方调用 /v1/responses 的 API Key，只存哈希
  apiKeys?: ApiKey[]
  // 日志级别，覆盖环境变量 LOG_LEVEL；在控制台"审计"页调整
  logLevel?: LogLevel
}

export interface ApiKey {
  id: string
  name: string
  hash: string // sha256，明文只在创建时返回一次
  hint: string // 尾号，便于识别
  createdAt: string
}

// comfy：自建 ComfyUI；api：OpenAI 兼容的 /images/generations 云端接口。二选一
export type DrawMode = 'comfy' | 'api'

// openai-images：OpenAI 兼容的 /images/generations；dashscope：阿里云百炼原生 multimodal-generation（如 z-image-turbo）
export const IMAGE_PROVIDERS = ['openai-images', 'dashscope'] as const
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number]
export const isImageProvider = (v: unknown): v is ImageProvider => IMAGE_PROVIDERS.includes(v as ImageProvider)

export interface ImageApi {
  provider: ImageProvider
  baseURL: string
  apiKey: string
  model: string
  // 宽x高；dashscope 协议发送时自动换成 宽*高
  size?: string
  // 提示词语言；云端模型多数中文效果好
  lang: 'en' | 'zh'
  style: string
  // 厂商私有参数：openai-images 合并进请求体，dashscope 合并进 parameters。如 {"prompt_extend": false, "watermark": false}
  extra?: Record<string, unknown>
}

export interface DrawConfig {
  enabled: boolean
  mode: DrawMode
  api?: ImageApi
  // 以下 url、active、templates 为 ComfyUI 配置
  url: string
  // 当前使用的模板 id
  active: string
  timeoutSec: number
  maxQueue: number
  templates: DrawTemplate[]
}

// .env 预设的云端文生图。三项连接任一存在即要求填齐，避免配了一半静默失效
function envImageApi(): ImageApi | undefined {
  if (!['IMAGE_BASE_URL', 'IMAGE_API_KEY', 'IMAGE_MODEL'].some(k => env(k, false))) return undefined
  const provider = env('IMAGE_PROVIDER', false) ?? 'openai-images'
  if (!isImageProvider(provider)) throw new Error(`IMAGE_PROVIDER 只能是 ${IMAGE_PROVIDERS.join(' / ')}`)
  const baseURL = env('IMAGE_BASE_URL')!
  if (!/^https?:\/\//.test(baseURL)) throw new Error('IMAGE_BASE_URL 需要以 http:// 或 https:// 开头')
  const lang = env('IMAGE_LANG', false) ?? 'zh'
  if (lang !== 'zh' && lang !== 'en') throw new Error('IMAGE_LANG 只能是 zh / en')
  const size = env('IMAGE_SIZE', false)
  const extra = parseExtra(env('IMAGE_EXTRA_BODY', false), 'IMAGE_EXTRA_BODY')
  const style = env('IMAGE_STYLE', false) ?? (lang === 'zh' ? STYLE_ZH : STYLE_EN)
  return { provider, baseURL, apiKey: env('IMAGE_API_KEY')!, model: env('IMAGE_MODEL')!, ...(size && { size }), lang, style, ...(extra && { extra }) }
}

// 出图方式未指定时：只配了一种就用那一种，都配了用 ComfyUI；选中的那种配好了才默认启用
export const defaultDraw = (): DrawConfig => {
  const url = env('COMFY_URL', false) ?? ''
  const api = envImageApi()
  const mode = env('DRAW_MODE', false) ?? (!url && api ? 'api' : 'comfy')
  if (mode !== 'comfy' && mode !== 'api') throw new Error('DRAW_MODE 只能是 comfy / api')
  return {
    enabled: mode === 'api' ? !!api : !!url,
    mode,
    ...(api && { api }),
    url,
    active: DEFAULT_TEMPLATES[0].id,
    timeoutSec: 180,
    maxQueue: 3,
    templates: DEFAULT_TEMPLATES,
  }
}

export const activeTemplate = (d: DrawConfig) => d.templates.find(t => t.id === d.active) ?? d.templates[0]

// 部署时可指向挂载卷，使控制页的修改、日志与图片在重新部署后保留
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
const CONFIG_DIR = process.env.CONFIG_DIR || join(process.cwd(), 'config')
const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json')

function env(name: string, required = true) {
  const v = process.env[name]?.trim()
  if (required && !v) throw new Error(`缺少环境变量 ${name}`)
  return v || undefined
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`${file} 解析失败：${(e as Error).message}`)
  }
}

export function parseExtra(raw: string | undefined, name: string) {
  if (!raw) return undefined
  let v
  try {
    v = JSON.parse(raw)
  } catch (e) {
    throw new Error(`${name} 不是合法的 JSON：${(e as Error).message}`)
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${name} 必须是 JSON 对象`)
  return v as Record<string, unknown>
}

// Chat Completions 已弃用：旧配置视为未配置，保证控制台仍可打开并重新配置
function deprecated(provider: unknown, where: string) {
  if (provider !== 'openai') return false
  log.warn(`配置：${where} 的 openai（Chat Completions）已弃用，请改为 openai-responses，当前按未配置处理`)
  return true
}

const usable = (ep: Endpoint | undefined, where: string) => (ep && deprecated(ep.provider, where) ? undefined : ep)

// 对话模型未在 .env 配置时返回 undefined，允许先启动再到控制页配置
function endpoint(prefix: '' | 'GUARD_'): Endpoint | undefined {
  const provider = env(`${prefix}PROVIDER`, prefix === 'GUARD_')
  if (provider === undefined || deprecated(provider, `${prefix}PROVIDER`)) return undefined
  if (!isProvider(provider)) throw new Error(`${prefix}PROVIDER 只能是 ${PROVIDERS.join(' / ')}`)
  return {
    provider,
    apiKey: env(`${prefix}API_KEY`)!,
    baseURL: env(`${prefix}BASE_URL`, false),
    model: env(`${prefix}MODEL`)!,
    extra: parseExtra(env(`${prefix}EXTRA_BODY`, false), `${prefix}EXTRA_BODY`),
  }
}

// 读取并合并全部配置。旧的 openai（Chat Completions）配置视为未配置，控制台仍可打开并重新配置
function load() {
  const settings: Settings = existsSync(SETTINGS_FILE) ? readJson(SETTINGS_FILE) : {}
  setLogLevel(settings.logLevel)
  const envMain = endpoint('')
  // 任一 GUARD_ 连接项存在即视为独立厂商，不继承主配置，避免把一家的 Key 发到另一家
  const separate = ['GUARD_PROVIDER', 'GUARD_API_KEY', 'GUARD_BASE_URL'].some(k => env(k, false))
  const envGuard = separate
    ? endpoint('GUARD_')
    : envMain && {
        ...envMain,
        model: env('GUARD_MODEL', false) ?? envMain.model,
        extra: parseExtra(env('GUARD_EXTRA_BODY', false), 'GUARD_EXTRA_BODY') ?? envMain.extra,
      }
  const baseRoles = readJson<Role[]>(join(CONFIG_DIR, 'roles.json'))
  if (!baseRoles.length) throw new Error('roles.json 至少需要一个角色')
  return {
    envMain,
    envGuard,
    main: usable(settings.main, '控制台对话模型') ?? envMain,
    guard: usable(settings.guard, '控制台审查模型') ?? envGuard,
    // 旧配置没有 mode，按 ComfyUI 处理；控制台没存云端连接时沿用 .env 预设
    draw: settings.draw ? { ...settings.draw, mode: settings.draw.mode ?? 'comfy', api: settings.draw.api ?? envImageApi() } : defaultDraw(),
    guardStrict: env('GUARD_STRICT', false) !== 'false',
    hardRules: settings.hardRules ?? DEFAULT_HARD_RULES,
    baseRoles,
    roles: settings.roles ?? baseRoles.map(r => ({ ...r, persona: settings.personas?.[r.id] ?? r.persona })),
    settings,
  }
}

let cached: ReturnType<typeof load> | undefined
export const config = () => (cached ??= load())

export function saveSettings(s: Settings) {
  writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2))
  cached = undefined
}

// 服务端用的完整角色，包含 persona 与专属模型
export const findRole = (id: unknown) => config().roles.find(r => r.id === id)

// 下发给孩子端的角色：不含 persona 与 model，人设和模型选择只留在服务端

export const publicRoles = (): PublicRole[] =>
  config().roles.map(({ id, name, tagline, icon, color, greeting }) => ({ id, name, tagline, icon, color, greeting }))
