// 处理路径、意图、审查结论的中文含义；服务端日志与控制台共用，保证两边说法一致

// 处理路径：即审计记录与第三方接口 metadata 中的 path
export const PATH_LABEL: Record<string, string> = {
  answer: '正常回答',
  rewrite: '代写后改写',
  fallback: '固定引导话术',
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
  aborted: '已中止',
}

// 审计记录中各阶段的耗时
export const STAGE_LABEL: Record<string, string> = {
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

export const INTENT_LABEL: Record<string, string> = {
  normal: '正常',
  bypass: '绕过规则',
  unsafe: '不安全',
  draw: '想画画',
}

export const VERDICT_LABEL: Record<string, string> = {
  pass: '通过',
  homework: '代写',
  unsafe: '不安全',
  error: '审查故障',
}

// 代码加中文，例如 refusal（绕过拒绝）
export const withLabel = (map: Record<string, string>, code?: string) => (code ? `${code}（${map[code] ?? '未知'}）` : '-')
