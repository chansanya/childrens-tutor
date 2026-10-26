/**
 * 服务端日志：按级别输出可读的单行文本，同一次请求的每一行都带相同的请求编号，便于在日志中串起一次完整的处理过程。
 *
 * 级别（由低到高）：debug < info < warn < error。默认 info；排查问题时调到 debug，可以看到每个阶段的细节。
 *   - debug：每个阶段一行（入参审批、注入检查、意图分析、生成、输出审查、画画各步骤），可能包含问题的前 40 个字
 *   - info：每次对话结束一行摘要（路径、审查结论、各阶段耗时）
 *   - warn / error：异常与降级
 * 级别来源：控制台"审计"页 > 环境变量 LOG_LEVEL > 默认 info；控制台修改后立即生效。
 */
import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export const isLogLevel = (v: unknown): v is LogLevel => LOG_LEVELS.includes(v as LogLevel)

let current: LogLevel = isLogLevel(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : 'info'
export const setLogLevel = (v: unknown) => {
  current = isLogLevel(v) ? v : isLogLevel(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : 'info'
}
export const logLevel = () => current

// 请求上下文：在路由入口用 withRequest 包裹，之后的所有日志自动带上请求编号
const ctx = new AsyncLocalStorage<string>()
export const withRequest = <T>(id: string, fn: () => T) => ctx.run(id, fn)

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
function stamp() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function write(level: LogLevel, msg: string, err?: unknown) {
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(current)) return
  const id = ctx.getStore()
  const line = `${stamp()} ${level.toUpperCase().padEnd(5)} ${id ? `[${id}] ` : ''}${msg}`
  const detail = err instanceof Error ? `：${err.message}` : err === undefined ? '' : `：${String(err)}`
  if (level === 'error') console.error(line + detail)
  else if (level === 'warn') console.warn(line + detail)
  else console.log(line + detail)
}

export const log = {
  debug: (msg: string) => write('debug', msg),
  info: (msg: string) => write('info', msg),
  warn: (msg: string, err?: unknown) => write('warn', msg, err),
  error: (msg: string, err?: unknown) => write('error', msg, err),
}

// 日志里的常用格式
export const sec = (ms?: number) => (ms === undefined ? '-' : `${(ms / 1000).toFixed(2)}s`)
export const brief = (s: string, n = 40) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}
export const shortId = () => crypto.randomUUID().slice(0, 8)
