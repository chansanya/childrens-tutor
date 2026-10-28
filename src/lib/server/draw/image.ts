/**
 * 生成的图片统一以随机文件名存入数据卷，由 /api/images/[name] 提供。
 * 云端接口返回的临时链接也先下载到这里：孩子的浏览器不直连外部域名，链接过期后历史图片仍可查看。
 */
import 'server-only'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { DATA_DIR } from '../config'

export const IMAGE_DIR = join(DATA_DIR, 'images')

// 按文件头识别格式，只接受 /api/images 支持的三种
function ext(b: Buffer) {
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg'
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
}

export async function saveImage(buf: Buffer) {
  const e = ext(buf)
  if (!e) throw new Error('图片格式不是 png、jpg 或 webp')
  const name = `${randomUUID()}.${e}`
  await mkdir(IMAGE_DIR, { recursive: true })
  await writeFile(join(IMAGE_DIR, name), buf)
  return name
}
