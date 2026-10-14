import { authEnabled, staticTokenOk, type Env } from './config.ts'
import { hasSession } from './cookie.ts'

/** authorize an /api/* request: session cookie (auth mode) or legacy static token */
export async function apiAuthorized(c: any, env: Env): Promise<boolean> {
  if (!authEnabled(env)) return staticTokenOk(env, c.req.header('Authorization'))
  if (await hasSession(c, env)) return true
  if (env.ALLOW_STATIC_FOR_API === '1' && staticTokenOk(env, c.req.header('Authorization'))) return true
  return false
}
