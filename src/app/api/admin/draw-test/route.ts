import { parseImageApi } from '@/lib/server/admin'
import { generateApi, ImageRejected } from '@/lib/server/draw/api'
import { log } from '@/lib/server/log'

export const dynamic = 'force-dynamic'

const PROMPT = { zh: '一只坐在草地上看蝴蝶的小猫，儿童绘本插画风格，色彩明亮', en: "a kitten sitting on the grass watching a butterfly, children's picture book illustration, bright colors" }

// 控制台"试画一张"：用表单中的文生图配置（Key 留空时沿用已保存的）实际出一张图，会产生费用
export async function POST(req: Request) {
  const api = parseImageApi(await req.json().catch(() => null))
  if (api.error || !api.value) return Response.json({ message: api.error ?? '请填写接口地址、模型和 API Key' }, { status: 400 })
  try {
    const r = await generateApi(api.value, PROMPT[api.value.lang], 120, AbortSignal.timeout(120000))
    return Response.json({ image: `/api/images/${r.name}`, ms: r.ms.drawRender + r.ms.drawFetch })
  } catch (e) {
    log.warn('控制台：试画失败', e)
    return Response.json({ message: e instanceof ImageRejected ? '被厂商内容审核拦截' : `试画失败：${(e as Error).message}` }, { status: 502 })
  }
}
