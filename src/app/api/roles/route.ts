import { publicRoles } from '@/lib/server/config'

export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return Response.json(publicRoles())
  } catch (e) {
    console.error('[roles]', e)
    return Response.json({ message: '服务配置有误' }, { status: 500 })
  }
}
