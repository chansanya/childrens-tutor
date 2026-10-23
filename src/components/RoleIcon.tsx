'use client'
import {
  Bot,
  BookOpen,
  Brain,
  Calculator,
  Cat,
  Dog,
  FlaskConical,
  Globe,
  Heart,
  Leaf,
  Lightbulb,
  Palette,
  Puzzle,
  Rocket,
  Sparkles,
  Star,
  Telescope,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { isIconName, type IconName } from '@/lib/icons'

// 静态映射：动态加载全部 Lucide 图标会让首次编译慢到 20 秒以上
const ICONS: Record<IconName, LucideIcon> = {
  sparkles: Sparkles,
  telescope: Telescope,
  'book-open': BookOpen,
  puzzle: Puzzle,
  rocket: Rocket,
  brain: Brain,
  lightbulb: Lightbulb,
  calculator: Calculator,
  'flask-conical': FlaskConical,
  globe: Globe,
  leaf: Leaf,
  palette: Palette,
  star: Star,
  heart: Heart,
  cat: Cat,
  dog: Dog,
  bot: Bot,
}

export default function RoleIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = isIconName(name) ? ICONS[name] : Sparkles
  return <Icon {...props} />
}
