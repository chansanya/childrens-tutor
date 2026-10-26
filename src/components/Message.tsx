'use client'
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import Markdown from 'react-markdown'
import { Check, Copy, Download, Lightbulb, Paintbrush, RotateCcw, ShieldCheck } from 'lucide-react'
import type { ChatMsg, DrawStage } from '@/store/sessions'
import type { PublicRole } from '@/lib/types'
import { copyText } from '@/lib/clipboard'
import RoleIcon from './RoleIcon'

function Thinking() {
  return (
    <span className="flex h-6 items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-accent"
          animate={{ y: [0, -7, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  )
}

function Canvas({ draw }: { draw?: DrawStage }) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSec(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const text =
    draw?.stage === 'rendering' ? '正在画画' : draw?.stage === 'queued' ? (draw.ahead ? `排队中，前面还有 ${draw.ahead} 幅画` : '马上开始画') : '正在构思画面'

  return (
    <div className="relative aspect-square w-64 max-w-full overflow-hidden rounded-2xl border border-line bg-paper sm:w-72">
      <motion.div
        className="absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,color-mix(in_oklab,var(--accent)_22%,transparent)_50%,transparent_70%)]"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-2 text-sm text-muted">
          <motion.span animate={{ rotate: [-10, 10, -10] }} transition={{ duration: 1.6, repeat: Infinity }}>
            <Paintbrush size={28} className="text-accent" />
          </motion.span>
          {text}
          <span className="text-xs tabular-nums">{sec}s</span>
        </div>
      </div>
    </div>
  )
}

// 回答已通过审查，打字机仅为视觉效果，总时长不超过约 0.9s
function useTypewriter(text: string, on: boolean) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!on) return
    const per = Math.min(16, 900 / text.length)
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const next = Math.min(text.length, Math.floor((t - start) / per))
      setN(next)
      if (next < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, on])
  return on ? text.slice(0, n) : text
}

export function Avatar({ role }: { role: PublicRole }) {
  return (
    <span className="grid h-9 w-9 shrink-0 rotate-[-4deg] place-items-center rounded-xl bg-accent text-white">
      <RoleIcon name={role.icon} size={18} strokeWidth={2.2} />
    </span>
  )
}

interface Props {
  msg: ChatMsg
  role: PublicRole
  typing: boolean
  canRegenerate: boolean
  onRegenerate: () => void
}

export default function Message({ msg, role, typing, canRegenerate, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false)
  const shown = useTypewriter(msg.content, typing)

  if (msg.role === 'user')
    return (
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="ml-auto max-w-[82%] origin-bottom-right whitespace-pre-wrap break-words rounded-[22px] rounded-br-md bg-ink px-5 py-3 text-[15.5px] leading-relaxed text-paper"
      >
        {msg.content}
      </motion.div>
    )

  const pending = msg.status === 'thinking' || msg.status === 'reviewing' || msg.status === 'drawing'
  const copy = async () => {
    await copyText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="flex max-w-[88%] gap-3"
    >
      <Avatar role={role} />
      <div className="min-w-0">
        <div
          className={`rounded-[22px] rounded-tl-md border px-5 py-3.5 text-[15.5px] leading-relaxed shadow-[0_10px_30px_-20px_rgb(31_27_45/0.5)] ${
            msg.status === 'error' ? 'border-dashed border-ink/20 bg-card/60 text-muted' : 'border-line bg-card'
          }`}
        >
          {msg.status === 'guided' && (
            <span className="mb-2 flex items-center gap-1.5 text-xs text-accent">
              <Lightbulb size={14} />
              一起动脑筋
            </span>
          )}
          {msg.status === 'drawing' ? (
            <Canvas draw={msg.draw} />
          ) : pending ? (
            <Thinking />
          ) : (
            <div className="prose-kid break-words">
              <Markdown>{shown}</Markdown>
            </div>
          )}
          {msg.image && (
            <a href={msg.image} target="_blank" rel="noreferrer" className="mt-3 block w-64 max-w-full overflow-hidden rounded-2xl border border-line sm:w-80">
              {/* eslint-disable-next-line @next/next/no-img-element -- 图片来自本站 /api/images，无需 next/image 优化 */}
              <img src={msg.image} alt={msg.content} className="block w-full" />
            </a>
          )}
        </div>

        <div className="mt-1.5 flex h-7 items-center gap-1 text-muted">
          {pending ? (
            <span className="flex items-center gap-1.5 text-xs">
              {msg.status === 'reviewing' && (
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
                  <ShieldCheck size={14} className="text-emerald-600" />
                </motion.span>
              )}
              {msg.status === 'reviewing' ? '守护检查中' : msg.status === 'drawing' ? '画画中' : '正在想'}
            </span>
          ) : (
            <>
              {msg.status !== 'error' && (
                <button aria-label="复制" onClick={copy} className="rounded-lg p-1.5 transition-colors hover:bg-ink/5 hover:text-ink">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              )}
              {msg.image && (
                <a href={msg.image} download aria-label="保存图片" className="rounded-lg p-1.5 transition-colors hover:bg-ink/5 hover:text-ink">
                  <Download size={15} />
                </a>
              )}
              {canRegenerate && (
                <button onClick={onRegenerate} className="flex items-center gap-1 rounded-lg p-1.5 text-xs transition-colors hover:bg-ink/5 hover:text-ink">
                  <RotateCcw size={15} />
                  重新回答
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
