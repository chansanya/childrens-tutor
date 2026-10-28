/**
 * ComfyUI 客户端：提交工作流、轮询进度、取消任务、下载图片。
 *
 * 用到的 ComfyUI 接口：
 *   POST /prompt         提交工作流，返回 prompt_id
 *   GET  /history/{id}   完成后返回输出图片信息；未完成时返回 {}
 *   GET  /queue          正在运行与等待中的任务，用于计算排队位置
 *   GET  /view           下载图片
 *   POST /queue {delete} 删除排队中的任务；POST /interrupt 中断正在渲染的任务
 *   GET  /system_stats   控制台"测试连接"
 */
import 'server-only'
import { randomUUID } from 'crypto'
import type { DrawConfig } from '../config'
import type { DrawTemplate } from './workflow'
import { saveImage } from './image'
import { log } from '../log'

type Item = [number, string, ...unknown[]]
interface Queue {
  queue_running: Item[]
  queue_pending: Item[]
}
interface Image {
  filename: string
  subfolder: string
  type: string
}
interface History {
  status?: { status_str?: string }
  outputs: Record<string, { images?: Image[] }>
}

export type DrawStage = { stage: 'queued'; ahead: number } | { stage: 'rendering' }

type Conn = Pick<DrawConfig, 'url'>

const base = (cfg: Conn) => cfg.url.replace(/\/+$/, '')

async function api<T>(cfg: Conn, path: string, signal: AbortSignal, body?: object): Promise<T> {
  const r = await fetch(base(cfg) + path, {
    method: body ? 'POST' : 'GET',
    headers: body && { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
    signal,
  })
  if (!r.ok) throw new Error(`ComfyUI ${path} HTTP ${r.status}`)
  const text = await r.text()
  return (text ? JSON.parse(text) : {}) as T
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true })
  })

export const queue = (cfg: Conn, signal: AbortSignal) => api<Queue>(cfg, '/queue', signal)
export const systemStats = (cfg: Conn) => api<Record<string, unknown>>(cfg, '/system_stats', AbortSignal.timeout(8000))

// 排队中的删除；正在渲染且是自己的任务才中断，避免误伤其他孩子的任务
async function cancel(cfg: Conn, id: string) {
  const signal = AbortSignal.timeout(5000)
  const q = await queue(cfg, signal)
  if (q.queue_pending.some(i => i[1] === id)) await api(cfg, '/queue', signal, { delete: [id] })
  else if (q.queue_running.some(i => i[1] === id)) await api(cfg, '/interrupt', signal, { prompt_id: id })
}

// 出图主流程。超时与孩子中止共用一个信号；中止时会清理 ComfyUI 上的任务
export async function generate(cfg: DrawConfig, tpl: DrawTemplate, prompt: string, signal: AbortSignal, onStage: (s: DrawStage) => void) {
  // 1. 复制模板工作流：提示词追加风格后缀统一画风，种子随机，保证每次画得不一样
  const wf = structuredClone(tpl.workflow)
  wf[tpl.promptNode].inputs[tpl.promptField] = [prompt, tpl.style].filter(Boolean).join(tpl.lang === 'zh' ? '，' : ', ')
  if (tpl.seedNode) wf[tpl.seedNode].inputs[tpl.seedField || 'seed'] = Math.floor(Math.random() * 2 ** 32)

  // 2. 提交任务
  const s = AbortSignal.any([signal, AbortSignal.timeout(cfg.timeoutSec * 1000)])
  const { prompt_id: id } = await api<{ prompt_id: string }>(cfg, '/prompt', s, { prompt: wf, client_id: randomUUID() })
  log.debug(`画画：已提交 ComfyUI，任务 ${id}，超时 ${cfg.timeoutSec} 秒`)
  const t0 = Date.now()
  let tRun = 0
  let last = ''

  // 3. 每秒轮询：完成就下载保存；未完成就推送排队位置或渲染状态
  try {
    for (;;) {
      const done = (await api<Record<string, History>>(cfg, `/history/${id}`, s))[id]
      if (done) {
        // 4. 下载第一张输出图，以随机文件名存入数据卷，并返回排队、渲染、下载三段耗时
        if (done.status?.status_str === 'error') throw new Error('ComfyUI 渲染失败')
        const img = Object.values(done.outputs).flatMap(o => o.images ?? [])[0]
        if (!img) throw new Error('ComfyUI 未返回图片')
        const tDone = Date.now()
        const r = await fetch(`${base(cfg)}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type })}`, { signal: s })
        if (!r.ok) throw new Error(`ComfyUI /view HTTP ${r.status}`)
        const name = await saveImage(Buffer.from(await r.arrayBuffer()))
        return { name, ms: { drawQueue: (tRun || tDone) - t0, drawRender: tRun ? tDone - tRun : 0, drawFetch: Date.now() - tDone } }
      }

      // 排队位置 = 正在运行的任务数 + 自己在等待队列中的序号（按提交顺序）
      const q = await queue(cfg, s)
      let stage: DrawStage
      if (q.queue_running.some(i => i[1] === id)) {
        tRun ||= Date.now()
        stage = { stage: 'rendering' }
      } else {
        const pending = [...q.queue_pending].sort((a, b) => a[0] - b[0])
        stage = { stage: 'queued', ahead: q.queue_running.length + Math.max(0, pending.findIndex(i => i[1] === id)) }
      }
      // 状态变化时才推送，避免每秒刷屏
      const key = JSON.stringify(stage)
      if (key !== last) {
        last = key
        onStage(stage)
      }
      await sleep(1000, s)
    }
  } catch (e) {
    // 超时或孩子中止：清理 ComfyUI 上的任务，避免占着显卡继续画
    if (s.aborted) {
      log.debug(`画画：${signal.aborted ? '调用方中止' : `超过 ${cfg.timeoutSec} 秒超时`}，取消 ComfyUI 任务 ${id}`)
      await cancel(cfg, id).catch(err => log.warn(`画画：取消 ComfyUI 任务 ${id} 失败`, err))
    }
    throw e
  }
}
