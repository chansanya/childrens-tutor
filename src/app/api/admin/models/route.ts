import { isTarget, parseConnection } from '@/lib/server/admin'
import { listModels } from '@/lib/server/llm'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = await req.json().catch(() => null)
  if (!isTarget(b?.target)) return Response.json({ message: '请求格式不正确' }, { status: 400 })
  const conn = parseConnection(b, b.target)
  if (conn.error) return Response.json({ message: conn.error }, { status: 400 })
  try {
    return Response.json({ models: await listModels(conn.value!) })
  } catch (e) {
    console.error('[admin/models]', e)
    return Response.json({ message: `加载失败：${(e as Error).message}` }, { status: 502 })
  }
}
