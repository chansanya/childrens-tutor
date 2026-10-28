import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'
import { IMAGE_DIR } from '@/lib/server/draw/image'

export const dynamic = 'force-dynamic'

const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/
const TYPE = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const m = name.match(NAME)
  if (!m) return new Response(null, { status: 404 })
  const file = join(IMAGE_DIR, name)
  const s = await stat(file).catch(() => null)
  if (!s) return new Response(null, { status: 404 })
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'Content-Type': TYPE[m[1] as keyof typeof TYPE],
      'Content-Length': String(s.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
