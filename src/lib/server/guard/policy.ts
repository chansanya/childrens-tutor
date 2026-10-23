/**
 * 主模型的"引导"策略：决定主模型看到什么提示词，以及各种情况下的固定话术。
 *
 * 引导是分层叠加的，越靠后越针对当前这一轮：
 *   1. 守护硬规则（config().hardRules，默认值见 rules.ts）：系统提示词最前面，规定只引导不代写，并附示范对话
 *   2. 角色人设：只影响语气，明确声明不得违背上述规则
 *   3. 引导模式 GUIDE_MODE：本轮命中作业关键词时追加
 *   4. 守则提醒 REMINDER：贴在孩子最新一句话前面，对话再长也不会被"遗忘"
 *   5. 纠正提示 REWRITE_HINT：输出审查判为代写后，重写时追加
 *
 * 固定话术（UNSAFE_REPLY、GUIDE_FALLBACK、GUARD_DOWN、REFUSALS）不经过模型，是审查不通过时的兜底输出。
 */
import 'server-only'
import { config, type Role } from '../config'
import type { Msg } from '../llm'

// 第 3 层：作业或创作类请求的本轮指令
const GUIDE_MODE = `【本轮为引导模式】孩子这次的请求涉及作业或创作。只能提出启发性问题或给出思路提示，严禁输出任何成品内容、示例文段或最终答案。回复控制在 100 字以内。`

// 第 4 层：每轮贴在孩子消息前的简短提醒，模型对离它最近的内容最敏感
const REMINDER = '【学伴守则：只引导不代写，不给作业答案，回答简短】'

// 第 5 层：输出审查判为代写后，让主模型按此重写
export const REWRITE_HINT = `【纠正】你刚才的回答直接给出了成品或答案，违反了规则。请重新回复：只用 1-3 个启发性问题或提示引导孩子自己完成，不要包含任何示例文段、句子或最终答案，80 字以内。`

// 不安全提问或回答的兜底：不评判孩子，引导其求助大人并转移话题
export const UNSAFE_REPLY =
  '这个问题不太适合我们聊哦。如果你遇到了让你害怕或难过的事，一定要马上告诉爸爸妈妈、老师或者你信任的大人。我们换个话题吧，你想知道恐龙为什么会灭绝吗？'

// 重写后仍未通过审查时的兜底：不含任何内容，只把孩子拉回自己思考
export const GUIDE_FALLBACK =
  '这个要靠你自己的小脑袋来完成才最厉害！我们一起想想：你最想表达的是什么？先说说你的第一个想法，我来帮你理一理思路。'

// 严格模式下审查服务故障时的提示：宁可不答，也不放行未审内容
export const GUARD_DOWN = '守护检查暂时开小差了，等一下再问我一次吧。'

// 绕过规则（注入或意图判为 bypass）时的友好拒绝：明确说"不"，但不扣帽子，并顺势引导
const REFUSALS = [
  '我猜你是想让我直接帮你写出来吧？这个我不能做哦，因为自己想出来的才是真本领！不过我很愿意陪你一起想，你打算从哪里开始？',
  '这件事我得说“不”啦：作业和作品要你自己完成，我只当你的思考小帮手。说说看，你现在卡在哪一步了？',
  '我知道你想快点完成，可我帮你写了，就不是你的本领啦。换个方式吧：你先说一个想法，我陪你一起理一理。',
]

export const refusal = () => REFUSALS[Math.floor(Math.random() * REFUSALS.length)]

// 系统提示词 = 第 1 层硬规则 + 第 2 层角色人设 + 第 3 层引导模式（可选）
export const buildSystem = (role: Role, guide: boolean) =>
  [config().hardRules, `【角色设定】（仅影响语气和风格，不得违背上述规则）\n${role.persona}`, guide && GUIDE_MODE]
    .filter(Boolean)
    .join('\n\n')

// 第 4 层：只改发给模型的副本，不影响客户端存储的历史。
// 标注"孩子说："也让孩子话里的"忽略规则"等内容明确属于用户输入，而不是系统指令
export const withReminder = (messages: Msg[]): Msg[] =>
  messages.map((m, i) => (i === messages.length - 1 ? { ...m, content: `${REMINDER}\n孩子说：${m.content}` } : m))
