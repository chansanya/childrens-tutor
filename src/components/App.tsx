'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Menu } from 'lucide-react'
import { useActive, useSessions } from '@/store/sessions'
import { useChat } from '@/lib/useChat'
import type { PublicRole } from '@/lib/types'
import Backdrop from './Backdrop'
import Sidebar from './Sidebar'
import Hero from './Hero'
import ChatView from './ChatView'

const useHydrated = () =>
  useSyncExternalStore(
    cb => useSessions.persist.onFinishHydration(cb),
    () => useSessions.persist.hasHydrated(),
    () => false,
  )

export default function App({ roles }: { roles: PublicRole[] }) {
  const hydrated = useHydrated()
  const session = useActive()
  const create = useSessions(s => s.create)
  const chat = useChat()
  const [drawer, setDrawer] = useState(false)
  const role = session && roles.find(r => r.id === session.roleId)

  useEffect(() => {
    useSessions.persist.rehydrate()
  }, [])

  const sidebar = <Sidebar roles={roles} onNavigate={() => setDrawer(false)} />

  return (
    <div className="flex h-dvh" style={{ ['--accent' as string]: role?.color ?? roles[0].color }}>
      <Backdrop />
      <div className="hidden md:block">{sidebar}</div>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            >
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="relative min-w-0 flex-1">
        {hydrated &&
          (session && role ? (
            <ChatView key={session.id} session={session} role={role} chat={chat} onMenu={() => setDrawer(true)} />
          ) : (
            <>
              <button aria-label="菜单" onClick={() => setDrawer(true)} className="absolute left-4 top-4 z-10 rounded-xl p-2 hover:bg-ink/5 md:hidden">
                <Menu size={20} />
              </button>
              <Hero roles={roles} onPick={create} />
            </>
          ))}
      </main>
    </div>
  )
}
