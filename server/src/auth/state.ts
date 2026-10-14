import { b64urlDecode, b64urlEncode, hmac, randomHex, timingEqual } from './crypto.ts'
import { sessionSecret, type Env } from './config.ts'

export interface StatePayload {
  provider: 'github' | 'alipay'
  intent: 'login' | 'bind'
  nonce: string
  exp: number
}

export async function signState(
  env: Env,
  input: { provider: 'github' | 'alipay'; intent: 'login' | 'bind'; ttlMs?: number }
): Promise<string> {
  const payload: StatePayload = {
    provider: input.provider,
    intent: input.intent,
    nonce: randomHex(12),
    exp: Date.now() + (input.ttlMs ?? 10 * 60 * 1000),
  }
  const body = b64urlEncode(JSON.stringify(payload))
  const sig = await hmac(sessionSecret(env), body)
  return `${body}.${sig}`
}

export async function verifyState(env: Env, state: string | undefined): Promise<StatePayload | null> {
  if (!state) return null
  const i = state.lastIndexOf('.')
  if (i < 0) return null
  const body = state.slice(0, i)
  const sig = state.slice(i + 1)
  const expect = await hmac(sessionSecret(env), body)
  if (!timingEqual(new TextEncoder().encode(sig), new TextEncoder().encode(expect))) return null
  try {
    const p = JSON.parse(b64urlDecode(body)) as StatePayload
    if (typeof p.exp !== 'number' || p.exp < Date.now()) return null
    return p
  } catch {
    return null
  }
}
