import { open, readdir, unlink } from 'fs/promises'
import { log } from '@/lib/server/log'
import { join } from 'path'
import { LOG_DIR } from '@/lib/server/audit'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024
const STAGES = ['total', 'intent', 'generate', 'review', 'rewrite', 'review2', 'drawPrompt', 'drawReview', 'drawQueue', 'drawRender', 'drawFetch']

interface Rec {
  ts: string
  path: string
  ms?: Record<string, number>
}

// 只读文件末尾，避免日志过大时拖慢接口
async function tail(file: string) {
  const fh = await open(file)
  try {
    const { size } = await fh.stat()
    const start = Math.max(0, size - MAX_BYTES)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    const s = buf.toString('utf8')
    return start ? s.slice(s.indexOf('\n') + 1) : s
  } finally {
    await fh.close()
  }
}

const pick = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]

const auditFiles = async () => (await readdir(LOG_DIR).catch(() => [] as string[])).filter(f => /^audit-\d{4}-\d{2}\.jsonl$/.test(f)).sort()

// 清除全部审计日志文件
export async function DELETE() {
  const files = await auditFiles()
  await Promise.all(files.map(f => unlink(join(LOG_DIR, f))))
  log.info(`控制台：已清除 ${files.length} 个审计日志文件`)
  return Response.json({ removed: files.length })
}

export async function GET(req: Request) {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 7))
  const since = Date.now() - days * 864e5
  const files = (await auditFiles()).slice(-4)

  const recs: Rec[] = []
  for (const f of files)
    for (const line of (await tail(join(LOG_DIR, f))).split('\n')) {
      try {
        const r = JSON.parse(line) as Rec
        if (Date.parse(r.ts) >= since) recs.push(r)
      } catch {}
    }

  const stages: Record<string, number[]> = {}
  const paths: Record<string, number> = {}
  for (const r of recs) {
    paths[r.path] = (paths[r.path] ?? 0) + 1
    for (const [k, v] of Object.entries(r.ms ?? {})) (stages[k] ??= []).push(v)
  }

  return Response.json({
    days,
    total: recs.length,
    stages: Object.entries(stages)
      .sort(([a], [b]) => STAGES.indexOf(a) - STAGES.indexOf(b))
      .map(([stage, v]) => {
        v.sort((a, b) => a - b)
        return { stage, count: v.length, avg: Math.round(v.reduce((s, x) => s + x, 0) / v.length), p50: pick(v, 0.5), p95: pick(v, 0.95) }
      }),
    paths: Object.entries(paths)
      .sort((a, b) => b[1] - a[1])
      .map(([path, count]) => ({ path, count })),
    recent: recs.slice(-100).reverse(),
  })
}
