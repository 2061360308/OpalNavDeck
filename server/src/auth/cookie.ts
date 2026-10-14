import { b64urlDecode, b64urlEncode, hmac, timingEqual } from './crypto.ts'
import { publicBaseUrl, sessionSecret, type Env } from './config.ts'

export const SESSION_COOKIE = 'dt_session'
const TTL_SEC = 60 * 60 * 24 * 14

export async function issueSession(env: Env): Promise<string> {
  const payload = JSON.stringify({ u: 'owner', iat: Date.now(), exp: Date.now() + TTL_SEC * 1000 })
  const body = b64urlEncode(payload)
  const sig = await hmac(sessionSecret(env), body)
  return `${body}.${sig}`
}

export async function verifySession(env: Env, value: string | undefined): Promise<boolean> {
  if (!value) return false
  const i = value.lastIndexOf('.')
  if (i < 0) return false
  const body = value.slice(0, i)
  const sig = value.slice(i + 1)
  const expect = await hmac(sessionSecret(env), body)
  if (!timingEqual(new TextEncoder().encode(sig), new TextEncoder().encode(expect))) return false
  try {
    const p = JSON.parse(b64urlDecode(body)) as { exp?: number }
    return typeof p.exp === 'number' && p.exp > Date.now()
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

function attrs(env: Env, maxAge: number): string {
  const secure = publicBaseUrl(env).startsWith('https://') ? '; Secure' : ''
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export async function hasSession(c: any, env: Env): Promise<boolean> {
  return verifySession(env, readCookie(c, SESSION_COOKIE))
}

export async function setSessionCookie(c: any, env: Env) {
  c.header('Set-Cookie', `${SESSION_COOKIE}=${await issueSession(env)}; ${attrs(env, TTL_SEC)}`)
}

export function clearSessionCookie(c: any, env: Env) {
  c.header('Set-Cookie', `${SESSION_COOKIE}=; ${attrs(env, 0)}`)
}
