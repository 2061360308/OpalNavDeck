import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** login gating is only active when explicitly enabled */
export function authEnabled(): boolean {
  return process.env.AUTH_ENABLED === '1'
}

export function authUsername(): string {
  return process.env.AUTH_USERNAME || 'admin'
}

export function authDir(): string {
  return process.env.AUTH_DIR || join(here, '..', '..', 'data', 'auth')
}

export function sessionSecret(): string {
  return process.env.SESSION_SECRET || 'dev-session-secret-change-me'
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

const SCRYPT_KEYLEN = 64

function scryptHash(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEYLEN)
}

/** `scrypt$<saltB64>$<hashB64>` — used for AUTH_PASSWORD_HASH */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const h = scryptHash(password, salt)
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`
}

function eq(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

function verifyPassword(password: string): boolean {
  const hash = process.env.AUTH_PASSWORD_HASH
  if (hash) {
    const [algo, saltB64, hashB64] = hash.split('$')
    if (algo === 'scrypt' && saltB64 && hashB64) {
      const salt = Buffer.from(saltB64, 'base64')
      const expect = Buffer.from(hashB64, 'base64')
      return eq(scryptHash(password, salt), expect)
    }
    return false
  }
  const plain = process.env.AUTH_PASSWORD ?? ''
  return eq(Buffer.from(plain), Buffer.from(password))
}

export function verifyLogin(username: string, password: string): boolean {
  const okUser = eq(Buffer.from(authUsername()), Buffer.from(username))
  const okPass = verifyPassword(password)
  return okUser && okPass
}

/** legacy static token: `Bearer <token>` or Basic with the token as password */
export function staticTokenOk(header: string | undefined): boolean {
  if (!header) return false
  const token = process.env.DESKTOP_TOKEN ?? 'dev-token'
  if (header === `Bearer ${token}`) return true
  const m = header.match(/^Basic\s+(.+)$/i)
  if (m) {
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8')
      const pass = decoded.slice(decoded.indexOf(':') + 1)
      return pass === token
    } catch {
      return false
    }
  }
  return false
}

export function githubConfigured(): boolean {
  return !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET
}

export function alipayConfigured(): boolean {
  return !!process.env.ALIPAY_APP_ID && !!process.env.ALIPAY_PRIVATE_KEY
}
