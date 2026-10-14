import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { sessionSecret } from './config.ts'
import type { Provider } from './identities.ts'

export interface StatePayload {
  provider: Provider
  intent: 'login' | 'bind'
  nonce: string
  exp: number
}

const used = new Set<string>()

export function signState(input: { provider: Provider; intent: 'login' | 'bind'; ttlMs?: number }): string {
  const payload: StatePayload = {
    provider: input.provider,
    intent: input.intent,
    nonce: randomBytes(12).toString('hex'),
    exp: Date.now() + (input.ttlMs ?? 10 * 60 * 1000),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', sessionSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** verifies signature + expiry and consumes the nonce (single use) */
export function verifyState(state: string | undefined): StatePayload | null {
  if (!state) return null
  const i = state.lastIndexOf('.')
  if (i < 0) return null
  const body = state.slice(0, i)
  const sig = state.slice(i + 1)
  const expect = createHmac('sha256', sessionSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload
    if (typeof p.exp !== 'number' || p.exp < Date.now()) return null
    if (used.has(p.nonce)) return null
    used.add(p.nonce)
    if (used.size > 1000) used.clear()
    return p
  } catch {
    return null
  }
}
