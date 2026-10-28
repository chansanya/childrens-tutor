/**
 * 画画的"引导 + 审查"：
 *   - buildDrawPrompt：引导。由审查模型把孩子的话改写成安全、适合儿童的绘画提示词，并写一句给孩子的回复
 *   - reviewDrawPrompt：审查。再判一次提示词能否用于给儿童画画，不通过就不出图
 *
 * 用审查模型而不是主模型：这一步只需要简单改写，审查模型更快，也不受主模型推理耗时影响。
 */
import 'server-only'
import { complete, type Msg } from '../llm'
import { config } from '../config'
import { judge, transcript } from '../guard/judge'
import { brief, log } from '../log'

// 提示词语言由 ComfyUI 模板或云端配置决定：Z-Image 的文本编码器适合中文，H3 适合英文
const LANG = { en: '英文，不超过 60 个单词', zh: '中文，不超过 80 字' }

// 改写时就约束内容：温暖可爱、无文字、无暴力恐怖、无真实人物和品牌
const system = (lang: 'en' | 'zh') => `你是儿童学伴的绘画助手。根据对话，把孩子最后想画的内容整理成绘画指令：
- prompt：${LANG[lang]}。描述画面主体、动作、场景和色彩，温暖可爱、适合儿童；不出现文字、暴力、恐怖、真实人物或品牌。
- reply：中文一句话，活泼地告诉孩子你准备画什么，不超过 30 字，不使用表情符号。
只输出 JSON：{"reply":"…","prompt":"…"}`

const REVIEW = `你是儿童绘画内容审查员。判断下面这段绘画描述是否适合给 6-12 岁儿童看。含暴力、血腥、恐怖、色情、危险行为、真实人物或歧视内容即为 unsafe。
只输出一个单词：pass 或 unsafe。`

// 读最近 5 条消息，理解"再画一只小狗陪它"这类依赖上文的请求；失败返回 undefined，由调用方回"没画出来"
export async function buildDrawPrompt(messages: Msg[], lang: 'en' | 'zh', signal: AbortSignal) {
  try {
    const raw = await complete({
      ep: config().guard!,
      system: system(lang),
      messages: [{ role: 'user', content: transcript(messages.slice(-5)) }],
      maxTokens: 400,
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    })
    const v = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '')
    if (typeof v.reply === 'string' && typeof v.prompt === 'string' && v.prompt.trim()) return { reply: v.reply.trim(), prompt: v.prompt.trim() }
    log.warn(`画画：改写提示词的输出无法解析为 {reply, prompt}，实际为"${brief(raw, 60)}"`)
  } catch (e) {
    if (signal.aborted) throw e
    log.warn('画画：改写提示词失败', e)
  }
}

// 与输出审查一致：严格模式下审查失败返回 error，不放行
export const reviewDrawPrompt = async (prompt: string, signal: AbortSignal) =>
  (await judge(REVIEW, prompt, ['unsafe', 'pass'] as const, signal)) ?? (config().guardStrict ? 'error' : 'pass')
