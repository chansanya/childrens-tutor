/**
 * 审查模型的统一调用入口：意图审查、输出审查、画画提示词复核都通过 judge 完成。
 *
 * 设计要点：
 *   - 只让审查模型输出一个单词，并把 max_tokens 压到 10：既快，又杜绝"审查员长篇大论"
 *   - 6 秒超时；必须是非推理模型，或通过 extra 关闭思考，否则 token 会耗在思考上而给不出结论
 *   - 失败时返回 undefined，由调用方决定放行（意图审查）还是拦截（输出审查的严格模式）
 */
import 'server-only'
import { complete, type Msg } from '../llm'
import { config } from '../config'

// words 的顺序即优先级：模型输出里同时出现多个候选词时，取排在最前的
export async function judge<T extends string>(system: string, input: string, words: readonly T[], signal: AbortSignal) {
  try {
    const ep = config().guard
    if (!ep) throw new Error('审查模型未配置')
    const raw = await complete({
      ep,
      system,
      messages: [{ role: 'user', content: input }],
      maxTokens: 10,
      signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
    })
    const v = words.find(w => raw.toLowerCase().includes(w))
    if (!v) console.error('[guard] unparseable:', raw)
    return v
  } catch (e) {
    // 孩子中止时向上抛，让整条链路停下；其他错误（超时、网络、模型报错）只记录日志
    if (signal.aborted) throw e
    console.error('[guard]', e)
  }
}

// 把对话整理成"孩子：… / 助手：…"的纯文本，作为审查模型的输入（审查模型不需要多轮消息结构）
export const transcript = (messages: Msg[]) =>
  messages.map(m => `${m.role === 'user' ? '孩子' : '助手'}：${m.content}`).join('\n')
