import type { PublicConfig } from './provider.ts'

export type StorageKind = 'local' | 'object'

/** pure env-based helpers (no Node imports) — safe for any platform entry */

export function storageKind(): StorageKind {
  const v = process.env.STORAGE
  return v === 'object' || v === 's3' || v === 'r2' ? 'object' : 'local'
}

/** public-read configuration for code packages (widgets/plugins) */
export function publicConfig(): PublicConfig {
  const mode = process.env.PUBLIC_MODE === 'bucket' ? 'bucket' : 'prefix'
  const baseUrl = process.env.PUBLIC_BASE
  return {
    enabled: !!baseUrl,
    mode,
    root: process.env.PUBLIC_PREFIX || '/',
    bucket: process.env.PUBLIC_BUCKET,
    baseUrl,
  }
}

/**
 * Compute the stable public base URL for code, or null when public code is not
 * configured. `base + normalizedPath` must resolve to a loadable object.
 */
export function assetBase(origin: string): string | null {
  if (storageKind() === 'local') return `${origin.replace(/\/$/, '')}/public`
  const base = process.env.PUBLIC_BASE
  if (!base) return null
  return base.replace(/\/$/, '')
}
