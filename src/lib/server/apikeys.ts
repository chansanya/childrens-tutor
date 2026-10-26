/**
 * 第三方 API Key：在控制台创建和吊销，供 /v1/responses、/v1/models 鉴权。
 * 明文只在创建时返回一次，settings.json 中只保存 sha256 哈希与尾号；校验用定时比较，避免时序攻击。
 */
import 'server-only'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { config, saveSettings, type ApiKey } from './config'

const digest = (key: string) => createHash('sha256').update(key).digest()

const save = (apiKeys: ApiKey[]) => saveSettings({ ...config().settings, apiKeys })

export const listKeys = () => (config().settings.apiKeys ?? []).map(({ id, name, hint, createdAt }) => ({ id, name, hint, createdAt }))

export function createKey(name: string) {
  const key = `ctk_${randomBytes(24).toString('base64url')}`
  const rec: ApiKey = { id: randomUUID(), name, hash: digest(key).toString('hex'), hint: key.slice(-4), createdAt: new Date().toISOString() }
  save([...(config().settings.apiKeys ?? []), rec])
  return { key, id: rec.id, name, hint: rec.hint, createdAt: rec.createdAt }
}

export const revokeKey = (id: string) => save((config().settings.apiKeys ?? []).filter(k => k.id !== id))

// 解析 Authorization: Bearer <key>，返回对应的 Key 记录；无效时返回 undefined
export function verifyKey(header: string | null) {
  const key = header?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!key) return
  const d = digest(key)
  return config().settings.apiKeys?.find(k => timingSafeEqual(Buffer.from(k.hash, 'hex'), d))
}
