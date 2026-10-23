import type { Metadata, Viewport } from 'next'
import { ZCOOL_KuaiLe } from 'next/font/google'
import './globals.css'

const zcool = ZCOOL_KuaiLe({ weight: '400', subsets: ['latin'], variable: '--font-zcool', preload: false, display: 'swap' })

export const metadata: Metadata = {
  title: '小问号学伴',
  description: '陪孩子好奇、思考、自己找到答案的 AI 学伴',
}

export const viewport: Viewport = { themeColor: '#f6efe3', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={zcool.variable}>
      <body>{children}</body>
    </html>
  )
}
