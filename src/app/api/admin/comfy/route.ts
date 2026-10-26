import { text } from '@/lib/server/admin'
import { log } from '@/lib/server/log'
import { systemStats } from '@/lib/server/draw/comfy'

export const dynamic = 'force-dynamic'

interface Stats {
  system?: { comfyui_version?: string }
  devices?: { name?: string; vram_total?: number; vram_free?: number }[]
}

// 控制台"测试连接"：返回 ComfyUI 版本与显卡信息
export async function POST(req: Request) {
  const url = text((await req.json().catch(() => null))?.url, 500)
  if (!url || !/^https?:\/\//.test(url)) return Response.json({ message: '请填写以 http:// 或 https:// 开头的 ComfyUI 地址' }, { status: 400 })
  try {
    const s = (await systemStats({ url })) as Stats
    return Response.json({
      version: s.system?.comfyui_version ?? '',
      devices: (s.devices ?? []).map(d => ({ name: d.name ?? '', vramTotal: d.vram_total ?? 0, vramFree: d.vram_free ?? 0 })),
    })
  } catch (e) {
    log.warn('控制台：测试 ComfyUI 连接失败', e)
    return Response.json({ message: `连接失败：${(e as Error).message}` }, { status: 502 })
  }
}
