'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronDown,
  KeyRound,
  MessagesSquare,
  Paintbrush,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { ICON_NAMES } from '@/lib/icons'
import RoleIcon from './RoleIcon'

type Provider = 'openai-responses' | 'anthropic'
type Target = 'main' | 'guard'
type Tab = 'models' | 'rules' | 'roles' | 'draw' | 'audit'

interface EpView {
  provider: Provider
  baseURL: string
  model: string
  extra: string
  keyHint: string
}

interface EpData {
  current: EpView | null
  env: EpView | null
  fromEnv: boolean
}

interface EpForm {
  useEnv: boolean
  provider: Provider
  baseURL: string
  model: string
  extra: string
  apiKey: string
}

interface RoleForm {
  id: string
  name: string
  tagline: string
  icon: string
  color: string
  greeting: string
  persona: string
  model: string
}

type RoleData = Omit<RoleForm, 'model'> & { model?: string }

type Lang = 'en' | 'zh'

interface TplData {
  id: string
  name: string
  lang: Lang
  style: string
  workflow: Record<string, { inputs?: Record<string, unknown> }>
  promptNode: string
  promptField: string
  seedNode?: string
  seedField?: string
}

interface DrawData {
  enabled: boolean
  url: string
  active: string
  timeoutSec: number
  maxQueue: number
  templates: TplData[]
}

// 表单中工作流以 JSON 文本编辑，种子节点留空表示不随机
type TplForm = Omit<TplData, 'workflow' | 'seedNode' | 'seedField'> & { workflow: string; seedNode: string; seedField: string }
type DrawForm = Omit<DrawData, 'templates'> & { templates: TplForm[] }

interface Data {
  hardRules: string
  defaultHardRules: string
  roles: RoleData[]
  defaultRoles: RoleData[]
  main: EpData
  guard: EpData
  draw: DrawData
  defaultTemplates: TplData[]
}

interface Form {
  hardRules: string
  roles: RoleForm[]
  main: EpForm
  guard: EpForm
  draw: DrawForm
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic Messages' },
]

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'models', label: '模型配置', icon: Server },
  { id: 'rules', label: '守护规则', icon: ShieldCheck },
  { id: 'roles', label: '角色管理', icon: Users },
  { id: 'draw', label: '绘画', icon: Paintbrush },
  { id: 'audit', label: '审计', icon: Activity },
]

const tplForm = ({ seedNode, seedField, workflow, ...t }: TplData): TplForm => ({
  ...t,
  workflow: JSON.stringify(workflow, null, 2),
  seedNode: seedNode ?? '',
  seedField: seedField ?? 'seed',
})

const drawForm = (d: DrawData): DrawForm => ({ ...d, templates: d.templates.map(tplForm) })

const epForm = (d: EpData): EpForm => {
  const v = d.current ?? d.env
  return {
    useEnv: d.fromEnv && !!d.env,
    provider: PROVIDERS.some(p => p.value === v?.provider) ? v!.provider : 'openai-responses',
    baseURL: v?.baseURL ?? '',
    model: v?.model ?? '',
    extra: v?.extra ?? '',
    apiKey: '',
  }
}

const roleForm = (r: RoleData): RoleForm => ({ ...r, tagline: r.tagline ?? '', model: r.model ?? '' })

const toForm = (d: Data): Form => ({
  hardRules: d.hardRules,
  roles: d.roles.map(roleForm),
  main: epForm(d.main),
  guard: epForm(d.guard),
  draw: drawForm(d.draw),
})

const fmt = (ms?: number) => (ms === undefined ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

const payload = ({ useEnv, provider, baseURL, model, extra, apiKey }: EpForm) => (useEnv ? null : { provider, baseURL, model, extra, apiKey })

const field =
  'w-full rounded-xl border border-line bg-paper/60 px-3.5 py-2.5 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-accent/60'

const label = 'flex flex-col gap-1.5 text-sm text-muted'

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-card/85 p-5 shadow-[0_12px_32px_-28px_rgb(31_27_45/0.5)] sm:p-6 ${className}`}>{children}</div>
}

function GhostButton({ icon: Icon, children, ...props }: { icon: LucideIcon } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon size={14} />
      {children}
    </button>
  )
}

function EndpointPanel({ target, data, value, onChange }: { target: Target; data: EpData; value: EpForm; onChange: (p: Partial<EpForm>) => void }) {
  const [models, setModels] = useState<string[] | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)

  // 点击外部或按 Esc 关闭下拉
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, provider: value.provider, baseURL: value.baseURL, apiKey: value.apiKey }),
      })
      const d = await r.json()
      if (!r.ok) return setError(d.message)
      setModels(d.models)
      setOpen(true)
    } catch {
      setError('加载失败，请检查网络')
    } finally {
      setLoading(false)
    }
  }

  // 已选中列表中的模型时展示全部，便于切换；否则按输入过滤
  const q = value.model.trim().toLowerCase()
  const shown = models && (models.includes(value.model) ? models : models.filter(m => m.toLowerCase().includes(q)))
  const keyHint = data.current?.keyHint

  return (
    <div className="flex flex-col gap-4">
      {!data.current && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert size={16} className="shrink-0" />
          尚未配置，孩子端暂时无法对话
        </p>
      )}
      <Panel>
        <div className="mb-5 inline-flex rounded-xl border border-line bg-paper/60 p-1">
          {[
            { env: true, label: '系统配置' },
            { env: false, label: '自定义' },
          ].map(o => (
            <button
              key={o.label}
              onClick={() => onChange({ useEnv: o.env })}
              disabled={o.env && !data.env}
              title={o.env && !data.env ? '未检测到系统配置' : undefined}
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                value.useEnv === o.env ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {value.useEnv && data.env ? (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            {[
              ['协议', PROVIDERS.find(p => p.value === data.env!.provider)?.label],
              ['地址', data.env.baseURL || '官方默认地址'],
              ['模型', data.env.model],
              ['额外参数', data.env.extra || '无'],
              ['Key', data.env.keyHint],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="break-all font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="grid gap-4">
            <label className={label}>
              协议
              <select value={value.provider} onChange={e => onChange({ provider: e.target.value as Provider })} className={field}>
                {PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              地址
              <input
                value={value.baseURL}
                onChange={e => onChange({ baseURL: e.target.value })}
                placeholder="留空使用官方地址；OpenAI 兼容服务通常需要带 /v1"
                className={`${field} font-mono`}
              />
            </label>
            <label className={label}>
              <span className="flex items-center gap-1.5">
                <KeyRound size={14} />
                API Key
              </span>
              <input
                type="password"
                autoComplete="off"
                value={value.apiKey}
                onChange={e => onChange({ apiKey: e.target.value })}
                placeholder={keyHint ? `已配置 ${keyHint}，留空保持不变；修改协议或地址时必须重新填写` : '请填写 API Key'}
                className={`${field} font-mono`}
              />
            </label>
            <div className={label}>
              模型
              <div ref={box} className="relative flex gap-2">
                <input
                  value={value.model}
                  onChange={e => (onChange({ model: e.target.value }), setOpen(true))}
                  onFocus={() => models && setOpen(true)}
                  placeholder="手动填写，或点右侧加载可用模型"
                  className={`${field} min-w-0 font-mono`}
                />
                <button
                  onClick={load}
                  disabled={loading}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-paper/60 px-3.5 text-ink transition-colors hover:border-accent/60 disabled:opacity-50"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">{loading ? '加载中' : '加载模型'}</span>
                </button>
                {open && shown && (
                  <div className="scroll-soft absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-[0_18px_40px_-16px_rgb(31_27_45/0.35)]">
                    <p className="px-3 py-1.5 text-xs">
                      共 {models!.length} 个{shown.length !== models!.length && `，匹配 ${shown.length} 个`}
                    </p>
                  {shown.map(m => (
                    <button
                      key={m}
                      onClick={() => (onChange({ model: m }), setOpen(false))}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left font-mono text-[13px] transition-colors hover:bg-ink/5 ${
                        m === value.model ? 'bg-accent/10 text-ink' : 'text-ink/80'
                      }`}
                    >
                      <span className="break-all">{m}</span>
                      {m === value.model && <Check size={14} className="shrink-0 text-accent" />}
                    </button>
                  ))}
                    {!shown.length && <p className="px-3 py-2 text-xs">没有匹配的模型，可以直接手动填写</p>}
                  </div>
                )}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <label className={label}>
              额外请求参数（JSON，可选）
              <input
                value={value.extra}
                onChange={e => onChange({ extra: e.target.value })}
                placeholder='厂商私有参数，例如阿里云关闭思考 {"enable_thinking": false}'
                className={`${field} font-mono`}
              />
            </label>
          </div>
        )}
      </Panel>
    </div>
  )
}

function RoleCard(props: { role: RoleForm; open: boolean; canDelete: boolean; onToggle: () => void; onChange: (p: Partial<RoleForm>) => void; onDelete: () => void }) {
  const { role, open, onChange } = props
  const [confirm, setConfirm] = useState(false)

  return (
    <Panel className="!p-0">
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 rotate-[-4deg] place-items-center rounded-xl text-white" style={{ background: role.color }}>
          <RoleIcon name={role.icon} size={19} strokeWidth={2.2} />
        </span>
        <button onClick={props.onToggle} className="min-w-0 flex-1 text-left">
          <div className="truncate font-display text-lg leading-tight">{role.name || '未命名'}</div>
          <div className="truncate text-xs text-muted">{role.tagline || '暂无简介'}</div>
        </button>
        {confirm ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-red-600">
            删除？
            <button aria-label="确认删除角色" onClick={props.onDelete} className="rounded-lg p-1.5 hover:bg-red-500/10">
              <Check size={16} />
            </button>
            <button aria-label="取消" onClick={() => setConfirm(false)} className="rounded-lg p-1.5 text-muted hover:bg-ink/5">
              <X size={16} />
            </button>
          </span>
        ) : (
          <button
            aria-label="删除角色"
            title={props.canDelete ? '删除角色' : '至少保留一个角色'}
            disabled={!props.canDelete}
            onClick={() => setConfirm(true)}
            className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-ink/5 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
          >
            <Trash2 size={16} />
          </button>
        )}
        <button aria-label={open ? '收起' : '编辑'} onClick={props.onToggle} className="shrink-0 rounded-lg p-2 text-muted hover:bg-ink/5 hover:text-ink">
          <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 sm:p-5">
          <label className={label}>
            名称
            <input value={role.name} maxLength={20} onChange={e => onChange({ name: e.target.value })} className={field} />
          </label>
          <label className={label}>
            简介
            <input value={role.tagline} maxLength={40} onChange={e => onChange({ tagline: e.target.value })} placeholder="显示在角色卡片上" className={field} />
          </label>
          <div className={`${label} sm:col-span-2`}>
            图标
            <div className="flex flex-wrap gap-1.5">
              {ICON_NAMES.map(n => (
                <button
                  key={n}
                  aria-label={n}
                  title={n}
                  onClick={() => onChange({ icon: n })}
                  className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors ${
                    role.icon === n ? 'border-transparent text-white' : 'border-line bg-paper/60 text-ink/70 hover:text-ink'
                  }`}
                  style={role.icon === n ? { background: role.color } : undefined}
                >
                  <RoleIcon name={n} size={17} />
                </button>
              ))}
            </div>
          </div>
          <label className={label}>
            主题色
            <span className="flex gap-2">
              <input
                type="color"
                value={role.color}
                onChange={e => onChange({ color: e.target.value })}
                className="h-[46px] w-14 shrink-0 cursor-pointer rounded-xl border border-line bg-paper/60 p-1"
              />
              <input value={role.color} onChange={e => onChange({ color: e.target.value })} className={`${field} min-w-0 font-mono`} />
            </span>
          </label>
          <label className={label}>
            专属模型（可选）
            <input value={role.model} onChange={e => onChange({ model: e.target.value })} placeholder="留空使用对话模型的设置" className={`${field} font-mono`} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            问候语
            <input value={role.greeting} maxLength={80} onChange={e => onChange({ greeting: e.target.value })} className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            人设提示词
            <textarea rows={5} value={role.persona} onChange={e => onChange({ persona: e.target.value })} className={`${field} scroll-soft resize-y`} />
          </label>
        </div>
      )}
    </Panel>
  )
}

function RolesPanel({ roles, onChange }: { roles: RoleForm[]; onChange: (r: RoleForm[]) => void }) {
  const [open, setOpen] = useState<string | null>(null)

  const add = () => {
    let id = ''
    while (!id || roles.some(r => r.id === id)) id = `role-${Math.random().toString(36).slice(2, 8)}`
    onChange([...roles, { id, name: '新学伴', tagline: '', icon: 'sparkles', color: '#ff7a45', greeting: '你好呀！今天想聊点什么？', persona: '', model: '' }])
    setOpen(id)
  }

  return (
    <div className="flex flex-col gap-3">
      {roles.map(r => (
        <RoleCard
          key={r.id}
          role={r}
          open={open === r.id}
          canDelete={roles.length > 1}
          onToggle={() => setOpen(open === r.id ? null : r.id)}
          onChange={p => onChange(roles.map(x => (x.id === r.id ? { ...x, ...p } : x)))}
          onDelete={() => onChange(roles.filter(x => x.id !== r.id))}
        />
      ))}
      <button
        onClick={add}
        disabled={roles.length >= 20}
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/20 py-4 text-sm text-muted transition-colors hover:border-accent/60 hover:text-ink disabled:opacity-40"
      >
        <Plus size={16} />
        新增角色
      </button>
    </div>
  )
}

// 粘贴工作流后自动识别提示词与种子节点；可能误选负向提示词，需人工确认
function detectNodes(json: string): Partial<TplForm> | undefined {
  try {
    const nodes = Object.entries(JSON.parse(json) as Record<string, { inputs?: Record<string, unknown> }>)
    const find = (field: string, type: string) => nodes.find(([, n]) => typeof n.inputs?.[field] === type)
    const p = find('prompt', 'string') ?? find('text', 'string')
    const s = find('seed', 'number') ?? find('noise_seed', 'number')
    return {
      promptNode: p?.[0] ?? '',
      promptField: p ? (typeof p[1].inputs?.prompt === 'string' ? 'prompt' : 'text') : '',
      seedNode: s?.[0] ?? '',
      seedField: s && typeof s[1].inputs?.seed !== 'number' ? 'noise_seed' : 'seed',
    }
  } catch {}
}

function TemplateCard(props: {
  tpl: TplForm
  active: boolean
  open: boolean
  canDelete: boolean
  onUse: () => void
  onToggle: () => void
  onChange: (p: Partial<TplForm>) => void
  onDelete: () => void
}) {
  const { tpl, onChange } = props
  const [confirm, setConfirm] = useState(false)
  const [hint, setHint] = useState('')

  const detect = () => {
    const d = detectNodes(tpl.workflow)
    if (!d) return setHint('工作流不是合法的 JSON')
    onChange(d)
    setHint(d.promptNode ? `已识别：提示词 ${d.promptNode}.${d.promptField}${d.seedNode ? `，种子 ${d.seedNode}.${d.seedField}` : ''}，请确认` : '没有找到提示词节点，请手动填写')
  }

  return (
    <Panel className="!p-0">
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={props.onUse}
          aria-label="使用此模板"
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${props.active ? 'border-accent' : 'border-ink/25 hover:border-ink/50'}`}
        >
          {props.active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
        </button>
        <button onClick={props.onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg leading-tight">{tpl.name || '未命名'}</span>
            {props.active && <span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent">使用中</span>}
          </div>
          <div className="truncate font-mono text-xs text-muted">
            {tpl.lang === 'zh' ? '中文' : '英文'}提示词 · {tpl.promptNode || '?'}.{tpl.promptField || '?'}
          </div>
        </button>
        {confirm ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-red-600">
            删除？
            <button aria-label="确认删除模板" onClick={props.onDelete} className="rounded-lg p-1.5 hover:bg-red-500/10">
              <Check size={16} />
            </button>
            <button aria-label="取消" onClick={() => setConfirm(false)} className="rounded-lg p-1.5 text-muted hover:bg-ink/5">
              <X size={16} />
            </button>
          </span>
        ) : (
          <button
            aria-label="删除模板"
            title={props.canDelete ? '删除模板' : '至少保留一个模板'}
            disabled={!props.canDelete}
            onClick={() => setConfirm(true)}
            className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-ink/5 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
          >
            <Trash2 size={16} />
          </button>
        )}
        <button aria-label={props.open ? '收起' : '编辑'} onClick={props.onToggle} className="shrink-0 rounded-lg p-2 text-muted hover:bg-ink/5 hover:text-ink">
          <ChevronDown size={18} className={`transition-transform ${props.open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {props.open && (
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 sm:p-5">
          <label className={label}>
            名称
            <input value={tpl.name} maxLength={30} onChange={e => onChange({ name: e.target.value })} className={field} />
          </label>
          <label className={label}>
            提示词语言
            <select value={tpl.lang} onChange={e => onChange({ lang: e.target.value as Lang })} className={field}>
              <option value="zh">中文</option>
              <option value="en">英文</option>
            </select>
          </label>
          <label className={`${label} sm:col-span-2`}>
            风格后缀
            <input value={tpl.style} onChange={e => onChange({ style: e.target.value })} placeholder="追加在提示词后，统一画风" className={field} />
          </label>
          <div className={`${label} sm:col-span-2`}>
            <span className="flex items-center justify-between">
              工作流
              <GhostButton icon={ScanSearch} onClick={detect}>
                自动识别节点
              </GhostButton>
            </span>
            <textarea
              rows={12}
              spellCheck={false}
              value={tpl.workflow}
              onChange={e => onChange({ workflow: e.target.value })}
              className={`${field} scroll-soft resize-y font-mono text-xs`}
            />
            {hint && <span className="text-xs">{hint}</span>}
          </div>
          {(
            [
              ['promptNode', '提示词节点 ID'],
              ['promptField', '提示词字段'],
              ['seedNode', '种子节点 ID（可选，每次随机）'],
              ['seedField', '种子字段'],
            ] as const
          ).map(([k, text]) => (
            <label key={k} className={label}>
              {text}
              <input value={tpl[k]} onChange={e => onChange({ [k]: e.target.value })} className={`${field} font-mono`} />
            </label>
          ))}
        </div>
      )}
    </Panel>
  )
}

function DrawPanel({ value, onChange }: { value: DrawForm; onChange: (p: Partial<DrawForm>) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const check = async () => {
    setTesting(true)
    setTest(null)
    try {
      const r = await fetch('/api/admin/comfy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value.url }) })
      const d = await r.json()
      if (!r.ok) return setTest({ ok: false, text: d.message })
      const gpu = (d.devices as { name: string; vramTotal: number; vramFree: number }[])
        .map(g => `${g.name}（空闲 ${(g.vramFree / 2 ** 30).toFixed(1)} / ${(g.vramTotal / 2 ** 30).toFixed(1)} GB）`)
        .join('；')
      setTest({ ok: true, text: `连接成功${d.version ? ` · ComfyUI ${d.version}` : ''}${gpu ? ` · ${gpu}` : ''}` })
    } catch {
      setTest({ ok: false, text: '连接失败，请检查网络' })
    } finally {
      setTesting(false)
    }
  }

  const setTpl = (id: string, p: Partial<TplForm>) => onChange({ templates: value.templates.map(t => (t.id === id ? { ...t, ...p } : t)) })
  const add = () => {
    let id = ''
    while (!id || value.templates.some(t => t.id === id)) id = `tpl-${Math.random().toString(36).slice(2, 8)}`
    onChange({ templates: [...value.templates, { id, name: '新模板', lang: 'zh', style: '', workflow: '', promptNode: '', promptField: '', seedNode: '', seedField: 'seed' }] })
    setOpen(id)
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <label className="mb-5 flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-[15px]">启用绘画</span>
            <span className="text-sm text-muted">关闭后，孩子想画画时只会得到文字回答</span>
          </span>
          <input type="checkbox" checked={value.enabled} onChange={e => onChange({ enabled: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`${label} sm:col-span-2`}>
            ComfyUI 地址
            <div className="flex gap-2">
              <input value={value.url} onChange={e => onChange({ url: e.target.value })} placeholder="http://192.168.1.x:8188" className={`${field} min-w-0 font-mono`} />
              <button
                onClick={check}
                disabled={testing || !value.url}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-paper/60 px-3.5 text-ink transition-colors hover:border-accent/60 disabled:opacity-50"
              >
                <Plug size={15} className={testing ? 'animate-pulse' : ''} />
                <span className="hidden sm:inline">{testing ? '连接中' : '测试连接'}</span>
              </button>
            </div>
            {test && <span className={`text-xs ${test.ok ? 'text-emerald-700' : 'text-red-600'}`}>{test.text}</span>}
          </div>
          <label className={label}>
            单次超时（秒）
            <input type="number" min={30} max={900} value={value.timeoutSec} onChange={e => onChange({ timeoutSec: Number(e.target.value) })} className={field} />
          </label>
          <label className={label}>
            最大排队数（超过则提示稍后再来）
            <input type="number" min={1} max={20} value={value.maxQueue} onChange={e => onChange({ maxQueue: Number(e.target.value) })} className={field} />
          </label>
        </div>
      </Panel>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">绘画模板</h2>
        <p className="-mt-2 text-sm text-muted">点击左侧圆点切换正在使用的模板。</p>
        {value.templates.map(t => (
          <TemplateCard
            key={t.id}
            tpl={t}
            active={value.active === t.id}
            open={open === t.id}
            canDelete={value.templates.length > 1}
            onUse={() => onChange({ active: t.id })}
            onToggle={() => setOpen(open === t.id ? null : t.id)}
            onChange={p => setTpl(t.id, p)}
            onDelete={() => {
              const templates = value.templates.filter(x => x.id !== t.id)
              onChange({ templates, active: value.active === t.id ? templates[0].id : value.active })
            }}
          />
        ))}
        <button
          onClick={add}
          disabled={value.templates.length >= 10}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/20 py-4 text-sm text-muted transition-colors hover:border-accent/60 hover:text-ink disabled:opacity-40"
        >
          <Plus size={16} />
          新增模板
        </button>
      </section>
    </div>
  )
}

const STAGE_LABEL: Record<string, string> = {
  total: '总耗时',
  intent: '意图审查',
  generate: '生成回答',
  review: '输出审查',
  rewrite: '重新生成',
  review2: '二次审查',
  drawPrompt: '改写画画提示词',
  drawReview: '提示词复核',
  drawQueue: '画画排队',
  drawRender: '画画渲染',
  drawFetch: '下载图片',
}

const PATH_LABEL: Record<string, string> = {
  answer: '正常回答',
  rewrite: '代写后重写',
  fallback: '固定引导',
  refusal: '绕过拒绝',
  injection: '注入拦截',
  unsafe_intent: '不安全提问',
  unsafe_output: '不安全回答',
  guard_error: '审查故障',
  draw: '画画成功',
  draw_busy: '画画繁忙',
  draw_failed: '画画失败',
  draw_unsafe: '画画不安全',
  error: '出错',
  aborted: '孩子中止',
}

interface AuditRec {
  ts: string
  id: string
  role: string
  path: string
  ms: Record<string, number>
}

interface AuditData {
  total: number
  stages: { stage: string; count: number; avg: number; p50: number; p95: number }[]
  paths: { path: string; count: number }[]
  recent: AuditRec[]
}

function AuditPanel() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<AuditData | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [confirm, setConfirm] = useState(false)

  const clear = async () => {
    setConfirm(false)
    const r = await fetch('/api/admin/audit', { method: 'DELETE' }).catch(() => null)
    if (!r?.ok) return setError('清除失败，请检查服务是否启动')
    setTick(t => t + 1)
  }

  useEffect(() => {
    fetch(`/api/admin/audit?days=${days}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setError('')
      })
      .catch(() => setError('加载失败，请检查服务是否启动'))
  }, [days, tick])

  const time = (ts: string) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 7, 30].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${days === d ? 'bg-ink text-paper' : 'text-muted hover:bg-ink/5 hover:text-ink'}`}
          >
            近 {d} 天
          </button>
        ))}
        <GhostButton icon={RefreshCw} onClick={() => setTick(t => t + 1)}>
          刷新
        </GhostButton>
        {confirm ? (
          <span className="flex items-center gap-1 text-xs text-red-600">
            清除全部审计日志？
            <button aria-label="确认清除" onClick={clear} className="rounded-lg p-1.5 hover:bg-red-500/10">
              <Check size={16} />
            </button>
            <button aria-label="取消" onClick={() => setConfirm(false)} className="rounded-lg p-1.5 text-muted hover:bg-ink/5">
              <X size={16} />
            </button>
          </span>
        ) : (
          <GhostButton icon={Trash2} onClick={() => setConfirm(true)}>
            清除日志
          </GhostButton>
        )}
        {data && <span className="ml-auto text-sm text-muted">共 {data.total} 次对话</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && !data.total && <Panel className="text-sm text-muted">这段时间还没有对话记录。</Panel>}

      {data && !!data.total && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {data.stages.map(s => (
              <Panel key={s.stage} className="!p-4">
                <div className="text-xs text-muted">{STAGE_LABEL[s.stage] ?? s.stage}</div>
                <div className="mt-1 font-display text-2xl tabular-nums">{fmt(s.p50)}</div>
                <div className="mt-1 text-xs tabular-nums text-muted">
                  P95 {fmt(s.p95)} · 均值 {fmt(s.avg)} · {s.count} 次
                </div>
              </Panel>
            ))}
          </div>

          <Panel>
            <h3 className="mb-3 text-sm text-muted">处理路径</h3>
            <div className="flex h-3 overflow-hidden rounded-full bg-ink/5">
              {data.paths.map((p, i) => (
                <span key={p.path} title={`${PATH_LABEL[p.path] ?? p.path} ${p.count}`} style={{ width: `${(p.count / data.total) * 100}%`, opacity: 1 - i * 0.12 }} className="bg-accent" />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {data.paths.map(p => (
                <span key={p.path} className="tabular-nums">
                  {PATH_LABEL[p.path] ?? p.path} <span className="text-muted">{p.count} · {Math.round((p.count / data.total) * 100)}%</span>
                </span>
              ))}
            </div>
          </Panel>

          <Panel className="!p-0">
            <div className="scroll-soft overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    {['时间', '角色', '路径', '总耗时', '意图', '生成', '审查', '画画'].map(h => (
                      <th key={h} className="px-4 py-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.recent.map(r => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">{time(r.ts)}</td>
                      <td className="px-4 py-2.5">{r.role}</td>
                      <td className="px-4 py-2.5">{PATH_LABEL[r.path] ?? r.path}</td>
                      <td className="px-4 py-2.5 font-medium">{fmt(r.ms.total)}</td>
                      <td className="px-4 py-2.5">{fmt(r.ms.intent)}</td>
                      <td className="px-4 py-2.5">{fmt(r.ms.generate)}</td>
                      <td className="px-4 py-2.5">{fmt(r.ms.review)}</td>
                      <td className="px-4 py-2.5">{r.ms.drawRender === undefined ? '—' : fmt((r.ms.drawQueue ?? 0) + r.ms.drawRender)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

export default function Admin() {
  const [data, setData] = useState<Data | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [tab, setTab] = useState<Tab>('models')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) return setNotice({ ok: false, text: d.message })
        setData(d)
        setForm(toForm(d))
      })
      .catch(() => setNotice({ ok: false, text: '加载失败，请检查服务是否启动' }))
  }, [])

  const base = data && toForm(data)
  const dirtyKey = (k: keyof Form) => !!form && !!base && JSON.stringify(form[k]) !== JSON.stringify(base[k])
  const dirty = (t: Tab) =>
    t === 'models' ? dirtyKey('main') || dirtyKey('guard') : t === 'rules' ? dirtyKey('hardRules') : t === 'audit' ? false : dirtyKey(t)
  const anyDirty = dirtyKey('main') || dirtyKey('guard') || dirtyKey('hardRules') || dirtyKey('roles') || dirtyKey('draw')
  const missing = (t: Tab) =>
    !!data && ((t === 'models' && (!data.main.current || !data.guard.current)) || (t === 'draw' && data.draw.enabled && !data.draw.url))
  const active = TABS.find(t => t.id === tab)!

  const set = (p: Partial<Form>) => form && setForm({ ...form, ...p })
  const setEp = (t: Target) => (p: Partial<EpForm>) => form && set({ [t]: { ...form[t], ...p } })

  const save = async () => {
    if (!form) return
    setSaving(true)
    setNotice(null)
    try {
      const r = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hardRules: form.hardRules, roles: form.roles, main: payload(form.main), guard: payload(form.guard), draw: form.draw }),
      })
      const d = await r.json()
      if (!r.ok) return setNotice({ ok: false, text: d.message })
      setData(d)
      setForm(toForm(d))
      setNotice({ ok: true, text: '已保存，立即生效' })
    } catch {
      setNotice({ ok: false, text: '保存失败，请检查网络' })
    } finally {
      setSaving(false)
    }
  }

  const status =
    notice && !notice.ok
      ? { cls: 'text-red-600', text: notice.text }
      : anyDirty
        ? { cls: 'text-accent', text: '有未保存的修改' }
        : { cls: 'text-emerald-700', text: notice?.text ?? '所有修改都已保存' }

  const marker = (t: Tab) =>
    missing(t) ? (
      <span title="尚未配置" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
    ) : dirty(t) ? (
      <span title="有未保存的修改" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
    ) : null

  const back = (
    <Link href="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink">
      <ArrowLeft size={16} />
      返回学伴
    </Link>
  )

  return (
    <div className="flex h-dvh flex-col bg-paper md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-card/70 md:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <span className="grid h-10 w-10 rotate-[-6deg] place-items-center rounded-xl bg-ink text-paper">
            <Settings2 size={19} />
          </span>
          <div>
            <div className="font-display text-xl leading-tight">控制台</div>
            <div className="text-[11px] tracking-[0.2em] text-muted">CONTROL ROOM</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors ${
                tab === t.id ? 'bg-ink text-paper' : 'text-ink/75 hover:bg-ink/5 hover:text-ink'
              }`}
            >
              <t.icon size={17} />
              <span className="flex-1">{t.label}</span>
              {marker(t.id)}
            </button>
          ))}
        </nav>
        <div className="p-3">{back}</div>
      </aside>

      <header className="shrink-0 border-b border-line bg-card/70 md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="flex items-center gap-2 font-display text-xl">
            <Settings2 size={18} />
            控制台
          </span>
          {back}
        </div>
        <nav className="scroll-soft flex gap-1 overflow-x-auto px-3 py-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                tab === t.id ? 'bg-ink text-paper' : 'text-ink/75 hover:bg-ink/5'
              }`}
            >
              <t.icon size={15} />
              {t.label}
              {marker(t.id)}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 py-6 sm:px-10 md:px-14 md:py-10">
            {!data || !form ? (
              <p className={notice ? 'text-red-600' : 'text-muted'}>{notice?.text ?? '加载中……'}</p>
            ) : (
              <>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="font-display text-3xl sm:text-4xl">{active.label}</h1>
                  </div>
                  {tab === 'rules' && (
                    <GhostButton icon={RotateCcw} onClick={() => set({ hardRules: data.defaultHardRules })} disabled={form.hardRules === data.defaultHardRules}>
                      恢复默认
                    </GhostButton>
                  )}
                  {tab === 'roles' && (
                    <GhostButton
                      icon={RotateCcw}
                      onClick={() => set({ roles: data.defaultRoles.map(roleForm) })}
                      disabled={JSON.stringify(form.roles) === JSON.stringify(data.defaultRoles.map(roleForm))}
                    >
                      恢复默认
                    </GhostButton>
                  )}
                  {tab === 'draw' && (
                    <GhostButton
                      icon={RotateCcw}
                      onClick={() => set({ draw: { ...form.draw, active: data.defaultTemplates[0].id, templates: data.defaultTemplates.map(tplForm) } })}
                      disabled={JSON.stringify(form.draw.templates) === JSON.stringify(data.defaultTemplates.map(tplForm))}
                    >
                      恢复默认模板
                    </GhostButton>
                  )}
                </div>

                {/* 模型配置：桌面端左右分布，移动端上下分布 */}
                <div className={tab === 'models' ? '' : 'hidden'}>
                  <div className="grid gap-8 lg:grid-cols-2">
                    <section>
                      <div className="mb-3">
                        <h2 className="flex items-center gap-2 font-display text-xl">
                          <MessagesSquare size={18} />
                          对话模型
                        </h2>
                        <p className="mt-1 text-sm text-muted">负责回答孩子的问题。单个角色可在角色管理中另行指定模型。</p>
                      </div>
                      <EndpointPanel target="main" data={data.main} value={form.main} onChange={setEp('main')} />
                    </section>
                    <section>
                      <div className="mb-3">
                        <h2 className="flex items-center gap-2 font-display text-xl">
                          <ShieldCheck size={18} />
                          审查模型
                        </h2>
                        <p className="mt-1 text-sm text-muted">负责意图审查和输出审查，务必选快速、非推理模型。</p>
                      </div>
                      <EndpointPanel target="guard" data={data.guard} value={form.guard} onChange={setEp('guard')} />
                    </section>
                  </div>
                </div>
                <div className={tab === 'rules' ? 'max-w-3xl' : 'hidden'}>
                  <Panel>
                    <textarea rows={22} value={form.hardRules} onChange={e => set({ hardRules: e.target.value })} className={`${field} scroll-soft resize-y text-sm`} />
                  </Panel>
                </div>
                <div className={tab === 'roles' ? 'max-w-3xl' : 'hidden'}>
                  <RolesPanel roles={form.roles} onChange={roles => set({ roles })} />
                </div>
                <div className={tab === 'draw' ? 'max-w-3xl' : 'hidden'}>
                  <DrawPanel value={form.draw} onChange={p => set({ draw: { ...form.draw, ...p } })} />
                </div>
                {tab === 'audit' && <AuditPanel />}
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-card/80 backdrop-blur-xl">
          <div className="flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-10 md:px-14">
            <span className={`flex min-w-0 items-center gap-1.5 text-sm ${status.cls}`}>
              {!anyDirty && !(notice && !notice.ok) && <Check size={16} className="shrink-0" />}
              <span className="truncate">{status.text}</span>
            </span>
            <button
              onClick={save}
              disabled={!anyDirty || saving}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-paper transition-transform hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
            >
              <Save size={17} />
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
