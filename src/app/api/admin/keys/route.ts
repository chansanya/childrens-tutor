import { text } from '@/lib/server/admin'
import { createKey, listKeys, revokeKey } from '@/lib/server/apikeys'

export const dynamic = 'force-dynamic'

// 控制台"API 接入"：列出、创建、吊销第三方 API Key。列表只返回名称与尾号，明文仅在创建时返回一次
export function GET() {
  return Response.json({ keys: listKeys() })
}

export async function POST(req: Request) {
  const name = text((await req.json().catch(() => null))?.name, 30)
  if (!name) return Response.json({ message: '请填写名称，不超过 30 字' }, { status: 400 })
  return Response.json(createKey(name))
}

export function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ message: '缺少 id' }, { status: 400 })
  revokeKey(id)
  return Response.json({ keys: listKeys() })
}
