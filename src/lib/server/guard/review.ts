/**
 * 输出侧的守护：主模型回答生成完、下发给孩子之前的最后一道关卡（见 chat/route.ts ④）。
 *
 * 前面几层引导（硬规则、引导模式、守则提醒）都只是"要求"模型守规矩，模型仍可能被绕过；
 * 这里换一个模型、只问一个简单问题："这段回答能不能给孩子看？"，以此真正执行规则。
 *
 * 结论：
 *   pass     → 原样下发
 *   homework → 替孩子写了成品或给了答案，路由会按严格引导重写并再审
 *   unsafe   → 换成安全提示话术
 *   error    → 审查失败且处于严格模式，不放行
 */
import 'server-only'
import type { Msg } from '../llm'
import { config } from '../config'
import { judge, transcript } from './judge'

export type Verdict = 'pass' | 'homework' | 'unsafe' | 'error'

// 明确列出"允许"的范围（科普、举例、娱乐故事），减少误判；同时要求拿不准时按违规处理
const SYSTEM = `你是儿童 AI 学伴的输出审查员。结合对话，判断【待审回答】能否展示给孩子：
homework：替孩子完成了作业或作品——作文、日记、诗歌、交作业用的故事、造句、读后感等的全文、片段、开头或范文；或直接给出作业题、练习题的答案或完整解题过程。
unsafe：含有暴力、色情、自残、危险行为、违法或打听隐私等不适合儿童的内容。
pass：知识科普、概念解释、与作业无关的简短举例、娱乐性小故事、启发式提问和思路提示。
拿不准时按违规处理。只输出一个单词：pass、homework 或 unsafe。`

// 输入为最近 3 条对话加待审回答：要结合孩子的问题，才能判断"举的例子"是不是作业本身。
// 严格模式（GUARD_STRICT，默认开启）下审查失败返回 error，不放行
export const review = async (messages: Msg[], answer: string, signal: AbortSignal): Promise<Verdict> =>
  (await judge(SYSTEM, `${transcript(messages.slice(-3))}\n\n【待审回答】\n${answer}`, ['pass', 'homework', 'unsafe'] as const, signal)) ??
  (config().guardStrict ? 'error' : 'pass')
