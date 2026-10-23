'use client'
import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowUp, Square } from 'lucide-react'
import type { Phase } from '@/lib/useChat'

const MAX = 500

export default function Composer({ phase, onSend, onStop }: { phase: Phase; onSend: (t: string) => void; onStop: () => void }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const ready = phase === 'idle' && text.trim().length > 0

  const submit = () => {
    if (!ready) return
    onSend(text.trim())
    setText('')
    if (ref.current) ref.current.style.height = ''
  }

  return (
    <div className="px-4 pb-5 sm:px-8">
      <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-[28px] border border-line bg-card/90 p-2.5 pl-5 shadow-[0_20px_50px_-28px_rgb(31_27_45/0.55)] backdrop-blur-xl transition-colors focus-within:border-accent/60">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          maxLength={MAX}
          placeholder="问我任何你好奇的事……"
          onChange={e => {
            setText(e.target.value)
            e.target.style.height = ''
            e.target.style.height = `${Math.min(e.target.scrollHeight, 132)}px`
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          className="scroll-soft max-h-[132px] flex-1 resize-none bg-transparent py-2.5 text-base outline-none placeholder:text-muted/70"
        />
        {text.length > MAX * 0.8 && (
          <span className="pb-3 text-xs text-muted">
            {text.length}/{MAX}
          </span>
        )}
        {phase === 'idle' ? (
          <motion.button
            whileTap={{ scale: 0.88 }}
            aria-label="发送"
            disabled={!ready}
            onClick={submit}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-white transition-opacity disabled:opacity-35"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </motion.button>
        ) : (
          <motion.button whileTap={{ scale: 0.88 }} aria-label="停止" onClick={onStop} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-paper">
            <Square size={15} fill="currentColor" />
          </motion.button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted/80">AI 也会犯错，重要的事记得问问爸爸妈妈和老师</p>
    </div>
  )
}
