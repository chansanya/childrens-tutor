'use client'
import { motion } from 'motion/react'

const blobs = [
  { color: 'var(--accent)', className: 'left-[-12%] top-[-18%] h-[60vmax] w-[60vmax]', x: [0, 60, -30, 0], y: [0, 40, 80, 0] },
  { color: '#ffd36e', className: 'right-[-18%] top-[10%] h-[48vmax] w-[48vmax]', x: [0, -70, 20, 0], y: [0, 60, -40, 0] },
  { color: '#8fd3ff', className: 'bottom-[-25%] left-[25%] h-[55vmax] w-[55vmax]', x: [0, 50, -60, 0], y: [0, -50, 20, 0] },
]

export default function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-35 blur-[90px] ${b.className}`}
          style={{ background: b.color }}
          animate={{ x: b.x, y: b.y, scale: [1, 1.12, 0.94, 1], borderRadius: ['50%', '42% 58% 55% 45%', '58% 42% 46% 54%', '50%'] }}
          transition={{ duration: 22 + i * 6, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <div className="grain absolute inset-0" />
    </div>
  )
}
