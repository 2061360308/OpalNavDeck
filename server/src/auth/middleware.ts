import { authEnabled, staticTokenOk } from './config.ts'
import { hasSession } from './cookie.ts'

/** authorize an /api/* request: session cookie (auth mode) or legacy static token */
export function apiAuthorized(c: any): boolean {
  if (!authEnabled()) return staticTokenOk(c.req.header('Authorization'))
  if (hasSession(c)) return true
  if (process.env.ALLOW_STATIC_FOR_API === '1' && staticTokenOk(c.req.header('Authorization'))) return true
  return false
}
