'use client'
import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Check, MessageCircle, Plus, Settings2, Sparkles, Trash2, X } from 'lucide-react'
import { useSessions } from '@/store/sessions'
import type { PublicRole } from '@/lib/types'

export default function Sidebar({ roles, onNavigate }: { roles: PublicRole[]; onNavigate: () => void }) {
  const { sessions, activeId, select, remove } = useSessions()
  const [confirm, setConfirm] = useState<string | null>(null)
  const color = (id: string) => roles.find(r => r.id === id)?.color ?? 'var(--accent)'
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <aside className="flex h-full w-72 flex-col border-r border-line bg-card/70 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-5 pb-4 pt-6">
        <span className="grid h-10 w-10 rotate-[-6deg] place-items-center rounded-xl bg-ink text-paper">
          <Sparkles size={20} />
        </span>
        <span className="font-display text-2xl">小问号学伴</span>
        <Link
          href="/admin"
          aria-label="控制台"
          title="控制台"
          className="ml-auto rounded-xl p-2 text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <Settings2 size={18} />
        </Link>
      </div>

      <button
        onClick={() => (select(null), onNavigate())}
        className="mx-4 flex items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-paper transition-transform hover:-translate-y-0.5 active:scale-95"
      >
        <Plus size={18} />
        新的对话
      </button>

      <nav className="scroll-soft mt-5 flex-1 overflow-y-auto px-3 pb-4">
        {!sorted.length && (
          <p className="flex flex-col items-center gap-2 py-10 text-sm text-muted">
            <MessageCircle size={22} />
            还没有对话
          </p>
        )}
        <AnimatePresence initial={false}>
          {sorted.map(s => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className={`group relative mb-1 flex items-center rounded-xl transition-colors ${
                s.id === activeId ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.04]'
              }`}
            >
              <button onClick={() => (select(s.id), onNavigate())} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(s.roleId) }} />
                <span className="truncate text-[15px]">{s.title}</span>
              </button>
              {confirm === s.id ? (
                <span className="flex shrink-0 gap-1 pr-2">
                  <button
                    aria-label="确认删除"
                    onClick={() => (remove(s.id), setConfirm(null))}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"
                  >
                    <Check size={16} />
                  </button>
                  <button aria-label="取消" onClick={() => setConfirm(null)} className="rounded-lg p-1.5 text-muted hover:bg-ink/5">
                    <X size={16} />
                  </button>
                </span>
              ) : (
                <button
                  aria-label="删除对话"
                  onClick={() => setConfirm(s.id)}
                  className="mr-2 shrink-0 rounded-lg p-1.5 text-muted transition-opacity hover:bg-ink/5 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </nav>
    </aside>
  )
}
