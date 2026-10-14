const TOKEN_KEY = 'desktop-nav-token'
const DEFAULT_TOKEN = 'dev-token'

/** when login is enabled the SPA auths /api via HttpOnly cookie instead of the static token */
let cookieSession = false

export function setAuthMode(enabled: boolean) {
  cookieSession = enabled
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? DEFAULT_TOKEN
}

export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}

/** headers for /api/* — omits the static token while login (cookie) is in use */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  if (cookieSession) return { ...(extra ?? {}) }
  return { Authorization: `Bearer ${getToken()}`, ...(extra ?? {}) }
}

/** headers for endpoints that always authenticate with the static token (e.g. /dav) */
export function serviceHeaders(extra?: Record<string, string>): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, ...(extra ?? {}) }
}

/** app state files (System/desktop.json, Rainmeter/State/widgets.json, Boxes/boxes.json) */
export async function getStateFile(
  name: string
): Promise<{ text: string; etag?: string } | null> {
  const res = await fetch(`/api/state/${name}`, { headers: authHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('state read failed')
  return { text: await res.text(), etag: res.headers.get('ETag') ?? undefined }
}

export async function putStateFile(
  name: string,
  body: string,
  etag?: string
): Promise<{ etag: string }> {
  const res = await fetch(`/api/state/${name}`, {
    method: 'PUT',
    headers: authHeaders(etag ? { 'If-Match': etag } : {}),
    body,
  })
  if (res.status === 412) {
    const err = new Error('state conflict') as Error & { etag?: string }
    err.etag = res.headers.get('ETag') ?? undefined
    throw err
  }
  if (!res.ok) throw new Error('state write failed')
  return { etag: res.headers.get('ETag') ?? '' }
}
