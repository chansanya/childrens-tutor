'use client'
import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import type { PublicRole } from '@/lib/types'
import RoleIcon from './RoleIcon'

const LINES: { text: string; outline: number[] }[] = [
  { text: '今天', outline: [1] },
  { text: '想问点', outline: [] },
  { text: '什么？', outline: [0] },
]

function Char({ ch, outline, px, py, tilt }: { ch: string; outline: boolean; px: MotionValue<number>; py: MotionValue<number>; tilt: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const push = (axis: 'x' | 'y') => ([x, y]: number[]) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return 0
    const dx = r.left + r.width / 2 - x
    const dy = r.top + r.height / 2 - y
    const d = Math.hypot(dx, dy)
    const f = Math.max(0, 1 - d / 220) * 46
    return d ? ((axis === 'x' ? dx : dy) / d) * f : 0
  }
  const x = useSpring(useTransform([px, py], push('x')), { stiffness: 180, damping: 14 })
  const y = useSpring(useTransform([px, py], push('y')), { stiffness: 180, damping: 14 })
  return (
    <span ref={ref} className="inline-block">
      <motion.span style={{ x, y, rotate: tilt }} className={`inline-block ${outline ? 'text-outline' : ''}`}>
        {ch}
      </motion.span>
    </span>
  )
}

function RoleCard({ role, index, onPick }: { role: PublicRole; index: number; onPick: () => void }) {
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const rotateX = useSpring(rx, { stiffness: 200, damping: 16 })
  const rotateY = useSpring(ry, { stiffness: 200, damping: 16 })
  return (
    <motion.button
      initial={{ opacity: 0, y: 40, rotate: index % 2 ? 4 : -4 }}
      animate={{ opacity: 1, y: 0, rotate: [-3, 2.5, -1.5][index % 3] }}
      transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.35 + index * 0.08 }}
      whileHover={{ rotate: 0, y: -8, scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      onPointerMove={e => {
        const r = e.currentTarget.getBoundingClientRect()
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 18)
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 18)
      }}
      onPointerLeave={() => (rx.set(0), ry.set(0))}
      onClick={onPick}
      style={{ rotateX, rotateY, transformPerspective: 800, ['--c' as string]: role.color }}
      className="group relative flex w-full flex-col overflow-hidden rounded-[28px] border border-line bg-card p-5 text-left shadow-[0_18px_40px_-24px_rgb(31_27_45/0.45)] sm:w-60"
    >
      <span className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[var(--c)] opacity-15 transition-transform duration-500 group-hover:scale-[2.6]" />
      <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-[var(--c)] text-white">
        <RoleIcon name={role.icon} size={24} strokeWidth={2.2} />
      </span>
      <span className="relative mt-6 font-display text-2xl">{role.name}</span>
      <span className="relative mt-1 text-sm leading-relaxed text-muted">{role.tagline}</span>
      <ArrowUpRight className="absolute right-5 top-5 text-[var(--c)] opacity-0 transition-all group-hover:opacity-100" size={22} />
    </motion.button>
  )
}

export default function Hero({ roles, onPick }: { roles: PublicRole[]; onPick: (id: string) => void }) {
  const px = useMotionValue(-1e4)
  const py = useMotionValue(-1e4)
  return (
    <div
      className="scroll-soft flex h-full flex-col overflow-y-auto px-6 pb-10 pt-16 sm:px-12 md:pt-20"
      onPointerMove={e => (px.set(e.clientX), py.set(e.clientY))}
      onPointerLeave={() => (px.set(-1e4), py.set(-1e4))}
    >
      <p className="flex items-center gap-2 text-sm tracking-[0.3em] text-muted">
        <span className="h-px w-10 bg-ink/30" />
        CURIOSITY LAB
      </p>
      <h1 className="mt-6 select-none font-display leading-[0.92] text-[clamp(56px,min(13vw,15vh),184px)]">
        {LINES.map((l, li) => (
          <motion.span
            key={li}
            className="block"
            style={{ paddingLeft: `${[0, 0.9, 0.35][li]}em` }}
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 90, damping: 15, delay: li * 0.1 }}
          >
            {[...l.text].map((ch, ci) => (
              <Char key={ci} ch={ch} outline={l.outline.includes(ci)} px={px} py={py} tilt={[-4, 3, -2, 5, -3][(li * 3 + ci) % 5]} />
            ))}
          </motion.span>
        ))}
      </h1>
      <p className="mt-8 max-w-md text-muted">选一位学伴出发。他们会认真回答你的好奇，但作业和作文，要靠你自己的小脑袋哦。</p>
      <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:flex-wrap">
        {roles.map((r, i) => (
          <RoleCard key={r.id} role={r} index={i} onPick={() => onPick(r.id)} />
        ))}
      </div>
    </div>
  )
}
