/**
 * 画画流程编排：意图审查判为 draw 后进入这里（见 chat/route.ts ③-draw）。
 *
 * 画画同样遵循"先审后放"，孩子看到的图片必须经过两道审查：
 *   - 输入侧：意图审查已经排除了 unsafe、bypass 和交作业用的画
 *   - 提示词侧：改写出的绘画提示词再由审查模型复核一次，不安全就不提交给 ComfyUI
 *
 * 步骤：繁忙检查 → 改写提示词 → 提示词安全复核 → 提交 ComfyUI 并轮询 → 下发图片。
 * 返回值是审计路径：draw / draw_busy / draw_failed / draw_unsafe / guard_error。
 */
import 'server-only'
import type { Msg } from '../llm'
import type { Audit } from '../audit'
import { activeTemplate, config } from '../config'
import { GUARD_DOWN, UNSAFE_REPLY } from '../guard/policy'
import { generate, queue, type DrawStage } from './comfy'
import { buildDrawPrompt, reviewDrawPrompt } from './prompt'

const BUSY = '小画家正忙着给别的小朋友画画，等一会儿再来找我吧！'
const FAILED = '哎呀，这次没画出来，我们换个想法再试一次吧！'

type Send = (event: string, data?: object) => void

// 孩子中止时向上抛出，由路由统一记为 aborted
export async function drawReply(messages: Msg[], signal: AbortSignal, audit: Audit, send: Send): Promise<string> {
  const cfg = config().draw
  const tpl = activeTemplate(cfg) // 控制台"绘画"中选中的工作流模板
  const reply = (path: string, text: string) => {
    send('answer', { text })
    return path
  }
  const fail = (e: unknown) => {
    if (signal.aborted) throw e
    console.error('[draw]', e)
    return reply('draw_failed', FAILED)
  }
  audit.set({ drawTemplate: tpl.id })

  // 1. 繁忙检查：ComfyUI 队列已满就直接告知，避免孩子长时间干等
  try {
    const q = await queue(cfg, AbortSignal.any([signal, AbortSignal.timeout(5000)]))
    if (q.queue_running.length + q.queue_pending.length >= cfg.maxQueue) return reply('draw_busy', BUSY)
  } catch (e) {
    return fail(e)
  }

  // 2. 改写提示词：把孩子的口语整理成适合儿童、语言与模板匹配的绘画提示词，并生成一句给孩子的回复
  send('drawing', { stage: 'prompt' })
  const p = await audit.time('drawPrompt', buildDrawPrompt(messages, tpl.lang, signal))
  if (!p) return reply('draw_failed', FAILED)

  // 3. 提示词安全复核：不安全就不画；审查故障时按严格模式不放行
  const v = await audit.time('drawReview', reviewDrawPrompt(p.prompt, signal))
  if (v === 'unsafe') return reply('draw_unsafe', UNSAFE_REPLY)
  if (v === 'error') {
    send('error', { message: GUARD_DOWN })
    return 'guard_error'
  }

  // 4. 提交 ComfyUI 并轮询，进度通过 drawing 事件推给前端（排队位置、渲染中）
  try {
    const r = await generate(cfg, tpl, p.prompt, signal, (s: DrawStage) => send('drawing', s))
    audit.ms(r.ms)
    // 5. 下发回复和图片地址；图片由 /api/images/[name] 提供
    send('answer', { text: p.reply, image: `/api/images/${r.name}` })
    return 'draw'
  } catch (e) {
    return fail(e)
  }
}
