import { publicRoles } from '@/lib/server/config'
import { log } from '@/lib/server/log'

export const dynamic = 'force-dynamic'

export function GET() {
  try {
    return Response.json(publicRoles())
  } catch (e) {
    log.error('角色列表：读取配置失败', e)
    return Response.json({ message: '服务配置有误' }, { status: 500 })
  }
}
