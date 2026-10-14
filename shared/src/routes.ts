/**
 * Public (non-RPC) URL builders. RPC endpoints (/api/*) are consumed via the
 * typed Hono client, so only asset/redirect URLs live here.
 */

export const MEDIA_KINDS = ['wallpapers', 'cursors', 'themes'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

/** public URL for an icon asset stored under /Icons/.assets */
export function iconAssetUrl(name: string | undefined | null): string {
  return name ? `/icons/assets/${name}` : ''
}

/** public URL for a personalization media file */
export function mediaUrl(kind: MediaKind | string, file: string): string {
  return `/media/${kind}/${encodeURIComponent(file)}`
}

/** public URL for a plugin package asset */
export function pluginAssetUrl(id: string, file: string): string {
  return `/plugins/${id}/${file}`
}

/** public entry base for a skin/widget package */
export function skinAssetBase(id: string): string {
  return `/skins/${encodeURIComponent(id)}/`
}

/** parse a /media/<kind>/<file> URL back into its parts */
export function parseMediaUrl(url: string): { kind: string; file: string } | null {
  const m = url.match(/^\/media\/(wallpapers|cursors|themes)\/(.+)$/)
  return m ? { kind: m[1], file: decodeURIComponent(m[2]) } : null
}

/** auth endpoints that are hit via full-page navigation (redirects / QR) */
export const AUTH_URLS = {
  githubStart: (intent: 'login' | 'bind' = 'login') => `/api/auth/github/start?intent=${intent}`,
  alipayQr: (intent: 'login' | 'bind' = 'login') => `/api/auth/alipay/qr?intent=${intent}`,
  alipayPoll: (state: string, pollKey: string) =>
    `/api/auth/alipay/qr/poll?state=${encodeURIComponent(state)}&pollKey=${encodeURIComponent(pollKey)}`,
} as const
