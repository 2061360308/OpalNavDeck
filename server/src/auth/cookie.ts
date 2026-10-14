import { createHmac, timingSafeEqual } from 'node:crypto'
import { publicBaseUrl, sessionSecret } from './config.ts'

export const SESSION_COOKIE = 'dt_session'
const TTL_SEC = 60 * 60 * 24 * 14

function sign(body: string): string {
  return createHmac('sha256', sessionSecret()).update(body).digest('base64url')
}

export function issueSession(): string {
  const payload = JSON.stringify({ u: 'owner', iat: Date.now(), exp: Date.now() + TTL_SEC * 1000 })
  const body = Buffer.from(payload).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifySession(value: string | undefined): boolean {
  if (!value) return false
  const i = value.lastIndexOf('.')
  if (i < 0) return false
  const body = value.slice(0, i)
  const sig = value.slice(i + 1)
  const expect = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

export function readCookie(c: any, name: string): string | undefined {
  const raw: string = c.req.header('Cookie') ?? ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}

function attrs(maxAge: number): string {
  const secure = publicBaseUrl().startsWith('https://') ? '; Secure' : ''
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export function hasSession(c: any): boolean {
  return verifySession(readCookie(c, SESSION_COOKIE))
}

export function setSessionCookie(c: any) {
  c.header('Set-Cookie', `${SESSION_COOKIE}=${issueSession()}; ${attrs(TTL_SEC)}`)
}

export function clearSessionCookie(c: any) {
  c.header('Set-Cookie', `${SESSION_COOKIE}=; ${attrs(0)}`)
}
