import { publicRoles } from '@/lib/server/config'
import { log } from '@/lib/server/log'
import App from '@/components/App'

export const dynamic = 'force-dynamic'

export default function Page() {
  let roles
  try {
    roles = publicRoles()
  } catch (e) {
    log.error('首页：读取配置失败', e)
    return (
      <main className="grid h-full place-items-center p-6 text-center">
        <div>
          <h1 className="font-display text-4xl">服务还没准备好</h1>
          <p className="mt-3 text-muted">请检查 .env 与 config/roles.json 配置。</p>
        </div>
      </main>
    )
  }
  return <App roles={roles} />
}
