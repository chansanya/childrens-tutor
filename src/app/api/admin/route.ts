import { config, defaultDraw, saveSettings, type Endpoint, type Settings } from '@/lib/server/config'
import { parseDraw, parseEndpoint, parseRoles, text, type Target } from '@/lib/server/admin'
import { DEFAULT_HARD_RULES } from '@/lib/server/guard/rules'
import { DEFAULT_TEMPLATES } from '@/lib/server/draw/workflow'

export const dynamic = 'force-dynamic'

const bad = (message: string) => Response.json({ message }, { status: 400 })

// Key 只写不读，仅返回尾号
const view = (ep?: Endpoint) =>
  ep && {
    provider: ep.provider,
    baseURL: ep.baseURL ?? '',
    model: ep.model,
    extra: ep.extra ? JSON.stringify(ep.extra) : '',
    keyHint: `••••${ep.apiKey.slice(-4)}`,
  }

export function GET() {
  try {
    const c = config()
    const endpoints = (t: Target, env: Endpoint | undefined) => ({ current: view(c[t]) ?? null, env: view(env) ?? null, fromEnv: !c.settings[t] })
    return Response.json({
      hardRules: c.hardRules,
      defaultHardRules: DEFAULT_HARD_RULES,
      roles: c.roles,
      defaultRoles: c.baseRoles,
      main: endpoints('main', c.envMain),
      guard: endpoints('guard', c.envGuard),
      draw: c.draw,
      defaultTemplates: DEFAULT_TEMPLATES,
    })
  } catch (e) {
    console.error('[admin]', e)
    return Response.json({ message: `服务配置有误：${(e as Error).message}` }, { status: 500 })
  }
}

// 整体覆盖：与默认值相同的项不落盘；main / guard 为 null 表示使用 .env
export async function PUT(req: Request) {
  const b = await req.json().catch(() => null)
  if (!b) return bad('请求格式不正确')
  const c = config()
  const next: Settings = {}

  const rules = text(b.hardRules, 20000)
  if (!rules) return bad('硬规则不能为空')
  if (rules !== DEFAULT_HARD_RULES) next.hardRules = rules

  const roles = parseRoles(b.roles)
  if (roles.error) return bad(roles.error)
  if (JSON.stringify(roles.value) !== JSON.stringify(parseRoles(c.baseRoles).value)) next.roles = roles.value

  for (const t of ['main', 'guard'] as const) {
    if (!b[t]) continue
    const ep = parseEndpoint(b[t], t)
    if (ep.error) return bad(ep.error)
    next[t] = ep.value
  }

  const draw = parseDraw(b.draw)
  if (draw.error) return bad(draw.error)
  if (JSON.stringify(draw.value) !== JSON.stringify(parseDraw(defaultDraw()).value)) next.draw = draw.value

  saveSettings(next)
  return GET()
}
