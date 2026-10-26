import { config, saveSettings } from '@/lib/server/config'
import { isLogLevel, log, logLevel, LOG_LEVELS, setLogLevel } from '@/lib/server/log'

export const dynamic = 'force-dynamic'

// 控制台"审计"页：查看与调整日志级别，保存后立即生效，无需重启
export function GET() {
  config() // 确保已按 settings.json 设置过级别
  return Response.json({ level: logLevel(), levels: LOG_LEVELS, env: process.env.LOG_LEVEL ?? null })
}

export async function PUT(req: Request) {
  const level = (await req.json().catch(() => null))?.level
  if (!isLogLevel(level)) return Response.json({ message: `日志级别只能是 ${LOG_LEVELS.join(' / ')}` }, { status: 400 })
  saveSettings({ ...config().settings, logLevel: level })
  setLogLevel(level)
  log.info(`控制台：日志级别已调整为 ${level}`)
  return Response.json({ level: logLevel() })
}
