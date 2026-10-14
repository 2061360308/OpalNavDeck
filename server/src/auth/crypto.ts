// Cross-runtime crypto helpers built on WebCrypto (Node ≥18 and Cloudflare Workers).

const enc = new TextEncoder()
// normalize typed-array generics to BufferSource across TS lib versions
const bs = (u: ArrayBufferView): BufferSource => u as unknown as BufferSource

export function timingEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i]
  return out === 0
}

export function randomHex(bytes = 16): string {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function b64decode(s: string): Uint8Array {
  const raw = atob(s)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlEncode(s: string): string {
  return b64url(enc.encode(s))
}

export function b64urlDecode(s: string): string {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return new TextDecoder().decode(b64decode(s.replace(/-/g, '+').replace(/_/g, '/') + pad))
}

export async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    bs(enc.encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, bs(enc.encode(data)))
  return b64url(new Uint8Array(sig))
}

export async function sha256Hex(data: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bs(enc.encode(data)))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

const PBKDF2_ITER = 210_000

/** `pbkdf2$<iter>$<saltB64>$<hashB64>` (works on Node and Workers) */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const key = await crypto.subtle.importKey('raw', bs(enc.encode(password)), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: bs(salt), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key,
    256
  )
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts[0] !== 'pbkdf2') return false
  const iter = Number(parts[1])
  if (!iter || !parts[2] || !parts[3]) return false
  const salt = b64decode(parts[2])
  const expect = b64decode(parts[3])
  const key = await crypto.subtle.importKey('raw', bs(enc.encode(password)), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: bs(salt), iterations: iter, hash: 'SHA-256' },
    key,
    expect.length * 8
  )
  return timingEqual(new Uint8Array(bits), expect)
}

/** RSA2 (SHA-256) sign for Alipay, PKCS#8 base64 private key → base64 signature */
export async function rsaSignSha256(privateKeyBase64: string, content: string): Promise<string> {
  const der = b64decode(privateKeyBase64.replace(/\s+/g, ''))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    bs(der),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, bs(enc.encode(content)))
  return b64(new Uint8Array(sig))
}
