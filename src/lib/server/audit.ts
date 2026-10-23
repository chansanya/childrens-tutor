import 'server-only'
import { randomUUID } from 'crypto'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { DATA_DIR } from './config'

export const LOG_DIR = join(DATA_DIR, 'logs')

export type Audit = ReturnType<typeof startAudit>

/**
 * 审计记录：每次对话结束写一行 JSON，用来分析每个审查环节花了多长时间、最终走了哪条路径。
 *   - 一份打印到服务日志（前缀 [audit]），一份追加到数据卷 logs/audit-YYYY-MM.jsonl（重新部署后仍保留）
 *   - 不记录对话原文，只记录字数、角色、模型、意图、审查结论和各阶段耗时
 *
 * 用法见 chat/route.ts：startAudit → time(阶段, Promise) / set(字段) / ms(耗时) → finish(路径)
 */
export function startAudit(meta: Record<string, unknown>) {
  const t0 = Date.now()
  const rec: Record<string, unknown> = { ts: new Date(t0).toISOString(), id: randomUUID(), ...meta }
  const ms: Record<string, number> = {}
  let done = false

  return {
    // 从调用时刻开始计时，Promise 成功结束时记录；并行的阶段各自独立计时。
    // 只记录成功完成的阶段：被意图审查中止的那次生成不计入
    time<T>(stage: string, p: Promise<T>) {
      const s = Date.now()
      return p.then(v => ((ms[stage] = Date.now() - s), v))
    },
    set: (fields: Record<string, unknown>) => void Object.assign(rec, fields),
    ms: (fields: Record<string, number>) => void Object.assign(ms, fields),
    // 只写一次；写文件失败只打日志，不影响对话
    finish(path: string) {
      if (done) return
      done = true
      const line = JSON.stringify({ ...rec, path, ms: { ...ms, total: Date.now() - t0 } })
      console.log(`[audit] ${line}`)
      mkdir(LOG_DIR, { recursive: true })
        .then(() => appendFile(join(LOG_DIR, `audit-${(rec.ts as string).slice(0, 7)}.jsonl`), `${line}\n`))
        .catch(e => console.error('[audit]', e))
    },
  }
}
