import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MsgStatus = 'thinking' | 'reviewing' | 'drawing' | 'done' | 'guided' | 'error'

export type DrawStage = { stage: 'prompt' } | { stage: 'queued'; ahead: number } | { stage: 'rendering' }

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: MsgStatus
  image?: string
  draw?: DrawStage
}

export interface Session {
  id: string
  roleId: string
  title: string
  messages: ChatMsg[]
  updatedAt: number
}

interface State {
  sessions: Session[]
  activeId: string | null
  create: (roleId: string) => void
  remove: (id: string) => void
  select: (id: string | null) => void
  push: (sid: string, msg: ChatMsg) => void
  patch: (sid: string, mid: string, fn: (m: ChatMsg) => Partial<ChatMsg>) => void
  dropTail: (sid: string) => void
}

// crypto.randomUUID 只在 HTTPS 或 localhost 下可用；通过局域网 http 地址访问时，改用 getRandomValues 生成 v4 UUID
export const uid = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  )

const INTERRUPTED = '这条回答被打断了，点“重新回答”再试一次吧。'

export const useSessions = create<State>()(
  persist(
    (set) => {
      const update = (sid: string, fn: (s: Session) => Partial<Session>) =>
        set(st => ({ sessions: st.sessions.map(s => (s.id === sid ? { ...s, ...fn(s), updatedAt: Date.now() } : s)) }))
      return {
        sessions: [],
        activeId: null,
        create: roleId => {
          const s: Session = { id: uid(), roleId, title: '新的对话', messages: [], updatedAt: Date.now() }
          set(st => ({ sessions: [s, ...st.sessions], activeId: s.id }))
        },
        remove: id =>
          set(st => ({ sessions: st.sessions.filter(s => s.id !== id), activeId: st.activeId === id ? null : st.activeId })),
        select: id => set({ activeId: id }),
        push: (sid, msg) =>
          update(sid, s => ({
            messages: [...s.messages, msg],
            title: s.messages.length === 0 && msg.role === 'user' ? msg.content.slice(0, 24) : s.title,
          })),
        patch: (sid, mid, fn) => update(sid, s => ({ messages: s.messages.map(m => (m.id === mid ? { ...m, ...fn(m) } : m)) })),
        dropTail: sid =>
          update(sid, s => {
            const i = s.messages.findLastIndex(m => m.role === 'user')
            return { messages: s.messages.slice(0, i + 1) }
          }),
      }
    },
    {
      name: 'kids-tutor-sessions',
      version: 1,
      skipHydration: true,
      onRehydrateStorage: () => st => {
        st?.sessions.forEach(s =>
          s.messages.forEach(m => {
            if (m.status === 'thinking' || m.status === 'reviewing' || m.status === 'drawing') Object.assign(m, { content: INTERRUPTED, status: 'error', draw: undefined })
          }),
        )
      },
    },
  ),
)

export const useActive = () => useSessions(st => st.sessions.find(s => s.id === st.activeId))
