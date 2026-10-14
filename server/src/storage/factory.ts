import type { PublicConfig } from './provider.ts'

export type StorageKind = 'local' | 'object'
export type Env = Record<string, string | undefined>

/** pure env-based helpers (no Node imports) — safe for any platform entry */

export function storageKind(env: Env): StorageKind {
  const v = env.STORAGE
  return v === 'object' || v === 's3' || v === 'r2' ? 'object' : 'local'
}

/** public-read configuration for code packages (widgets/plugins) */
export function publicConfig(env: Env): PublicConfig {
  const mode = env.PUBLIC_MODE === 'bucket' ? 'bucket' : 'prefix'
  const baseUrl = env.PUBLIC_BASE
  return {
    enabled: !!baseUrl,
    mode,
    root: env.PUBLIC_PREFIX || '/',
    bucket: env.PUBLIC_BUCKET,
    baseUrl,
  }
}

/**
 * Compute the stable public base URL for code packages (widgets/plugins).
 * Prefers an explicit PUBLIC_BASE; otherwise falls back to the app's own
 * `/public/*` route (served from the storage provider by both platforms).
 */
export function assetBase(env: Env, origin: string): string {
  const base = env.PUBLIC_BASE
  if (base) return base.replace(/\/$/, '')
  return `${origin.replace(/\/$/, '')}/public`
}
