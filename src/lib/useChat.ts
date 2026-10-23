'use client'
import { useCallback, useRef, useState } from 'react'
import { uid, useSessions, type ChatMsg } from '@/store/sessions'

export type Phase = 'idle' | 'thinking' | 'reviewing' | 'drawing'

const NETWORK = '网络开小差了，再试一次吧。'

export function useChat() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [typingId, setTypingId] = useState<string | null>(null)
  const ctrl = useRef<{ abort: AbortController; sid: string; mid: string } | null>(null)

  const run = useCallback(async (sid: string) => {
    const { sessions, push, patch } = useSessions.getState()
    const s = sessions.find(x => x.id === sid)
    if (!s) return
    const history = s.messages.filter(m => m.status !== 'error').map(({ role, content }) => ({ role, content }))
    const mid = uid()
    const set = (p: Partial<ChatMsg>) => patch(sid, mid, () => p)
    push(sid, { id: mid, role: 'assistant', content: '', status: 'thinking' })
    const abort = new AbortController()
    ctrl.current = { abort, sid, mid }
    setPhase('thinking')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: s.roleId, messages: history }),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) return set({ content: (await res.json().catch(() => null))?.message ?? NETWORK, status: 'error' })

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += value
        const frames = buf.split('\n\n')
        buf = frames.pop()!
        for (const f of frames) {
          const event = f.match(/^event: (.+)$/m)?.[1]
          const data = JSON.parse(f.match(/^data: (.*)$/m)?.[1] ?? '{}')
          if (event === 'reviewing') {
            setPhase('reviewing')
            set({ status: 'reviewing' })
          } else if (event === 'drawing') {
            setPhase('drawing')
            set({ status: 'drawing', draw: data })
          } else if (event === 'answer') {
            setTypingId(mid)
            set({ content: data.text, image: data.image, draw: undefined, status: data.guided ? 'guided' : 'done' })
          } else if (event === 'error') set({ content: data.message, draw: undefined, status: 'error' })
        }
      }
      patch(sid, mid, m =>
        m.status === 'thinking' || m.status === 'reviewing' || m.status === 'drawing' ? { content: '回答中断了，再试一次吧。', draw: undefined, status: 'error' } : {},
      )
    } catch {
      if (!abort.signal.aborted) set({ content: NETWORK, status: 'error' })
    } finally {
      ctrl.current = null
      setPhase('idle')
    }
  }, [])

  const send = useCallback(
    (sid: string, text: string) => {
      useSessions.getState().push(sid, { id: uid(), role: 'user', content: text })
      return run(sid)
    },
    [run],
  )

  const regenerate = useCallback(
    (sid: string) => {
      useSessions.getState().dropTail(sid)
      return run(sid)
    },
    [run],
  )

  const stop = useCallback(() => {
    const c = ctrl.current
    if (!c) return
    c.abort.abort()
    useSessions.getState().patch(c.sid, c.mid, () => ({ content: '已停止回答。', draw: undefined, status: 'error' }))
  }, [])

  return { phase, typingId, send, regenerate, stop }
}
