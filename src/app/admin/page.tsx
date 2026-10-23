import type { Metadata } from 'next'
import Admin from '@/components/Admin'

export const metadata: Metadata = { title: '控制台 · 小问号学伴' }

export default function AdminPage() {
  return <Admin />
}
