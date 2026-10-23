'use client'
import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { Menu, ShieldCheck } from 'lucide-react'
import type { Session } from '@/store/sessions'
import type { PublicRole } from '@/lib/types'
import type { useChat } from '@/lib/useChat'
import Message, { Avatar } from './Message'
import Composer from './Composer'

interface Props {
  session: Session
  role: PublicRole
  chat: ReturnType<typeof useChat>
  onMenu: () => void
}

export default function ChatView({ session, role, chat, onMenu }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // 跟随内容高度变化（含打字机效果）自动滚到底
  useEffect(() => {
    const el = scroller.current!
    const ro = new ResizeObserver(() => stick.current && el.scrollTo({ top: el.scrollHeight }))
    ro.observe(content.current!)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-paper/60 px-4 py-3 backdrop-blur-xl sm:px-8">
        <button aria-label="菜单" onClick={onMenu} className="rounded-xl p-2 hover:bg-ink/5 md:hidden">
          <Menu size={20} />
        </button>
        <Avatar role={role} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl leading-tight">{role.name}</div>
          <div className="truncate text-xs text-muted">{role.tagline}</div>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 sm:flex">
          <ShieldCheck size={14} />
          守护模式
        </span>
      </header>

      <div
        ref={scroller}
        onScroll={e => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="scroll-soft flex-1 overflow-y-auto"
      >
        <div ref={content} className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className="mb-4 self-center text-center"
          >
            <p className="text-balance font-display text-[clamp(28px,5vw,44px)] leading-tight">{role.greeting}</p>
          </motion.div>
          {session.messages.map((m, i) => (
            <Message
              key={m.id}
              msg={m}
              role={role}
              typing={m.id === chat.typingId}
              canRegenerate={chat.phase === 'idle' && i === session.messages.length - 1}
              onRegenerate={() => chat.regenerate(session.id)}
            />
          ))}
        </div>
      </div>

      <Composer
        phase={chat.phase}
        onSend={t => {
          stick.current = true
          chat.send(session.id, t)
        }}
        onStop={chat.stop}
      />
    </div>
  )
}
