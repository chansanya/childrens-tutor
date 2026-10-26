import { publicRoles } from '@/lib/server/config'
import { verifyKey } from '@/lib/server/apikeys'
import { log } from '@/lib/server/log'

export const dynamic = 'force-dynamic'

// 第三方接口 GET /v1/models：以 OpenAI 格式列出可用角色，id 即调用 /v1/responses 时的 model
export function GET(req: Request) {
  const key = verifyKey(req.headers.get('authorization'))
  if (!key) {
    log.warn('入参审批：拒绝，返回 401 invalid_api_key（查询角色列表）')
    return Response.json({ error: { message: '无效的 API Key', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } }, { status: 401 })
  }
  log.debug(`入参审批：鉴权通过 调用方=${key.name}，查询角色列表`)
  return Response.json({
    object: 'list',
    data: publicRoles().map(r => ({ id: r.id, object: 'model', created: 0, owned_by: 'childrens-tutor', name: r.name })),
  })
}
