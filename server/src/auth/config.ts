import { hashPassword as pbkdf2Hash, verifyPassword, timingEqual } from './crypto.ts'

export type Env = Record<string, string | undefined>

export function authEnabled(env: Env): boolean {
  return env.AUTH_ENABLED === '1'
}

export function authUsername(env: Env): string {
  return env.AUTH_USERNAME || 'admin'
}

export function sessionSecret(env: Env): string {
  return env.SESSION_SECRET || 'dev-session-secret-change-me'
}

export function publicBaseUrl(env: Env): string {
  return (env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

export function authDirPath(env: Env): string {
  return env.AUTH_DIR || '/DesktopAuth'
}

export async function verifyLogin(env: Env, username: string, password: string): Promise<boolean> {
  const okUser = timingEqual(new TextEncoder().encode(authUsername(env)), new TextEncoder().encode(username))
  let okPass = false
  if (env.AUTH_PASSWORD_HASH) {
    okPass = await verifyPassword(password, env.AUTH_PASSWORD_HASH)
  } else {
    const plain = env.AUTH_PASSWORD ?? ''
    okPass = timingEqual(new TextEncoder().encode(plain), new TextEncoder().encode(password))
  }
  return okUser && okPass
}

/** generate a `pbkdf2$…` hash string (used by the CLI snippet / docs) */
export async function hashPassword(password: string): Promise<string> {
  return pbkdf2Hash(password)
}

export function staticTokenOk(env: Env, header: string | undefined): boolean {
  if (!header) return false
  const token = env.DESKTOP_TOKEN ?? 'dev-token'
  if (header === `Bearer ${token}`) return true
  const m = header.match(/^Basic\s+(.+)$/i)
  if (m) {
    try {
      const decoded = atob(m[1])
      const pass = decoded.slice(decoded.indexOf(':') + 1)
      return pass === token
    } catch {
      return false
    }
  }
  return false
}

export function githubConfigured(env: Env): boolean {
  return !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET
}

export function alipayConfigured(env: Env): boolean {
  return !!env.ALIPAY_APP_ID && !!env.ALIPAY_PRIVATE_KEY
}
