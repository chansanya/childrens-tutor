// 角色可选图标，客户端渲染与服务端校验共用
export const ICON_NAMES = [
  'sparkles',
  'telescope',
  'book-open',
  'puzzle',
  'rocket',
  'brain',
  'lightbulb',
  'calculator',
  'flask-conical',
  'globe',
  'leaf',
  'palette',
  'star',
  'heart',
  'cat',
  'dog',
  'bot',
] as const

export type IconName = (typeof ICON_NAMES)[number]
export const isIconName = (v: unknown): v is IconName => ICON_NAMES.includes(v as IconName)
