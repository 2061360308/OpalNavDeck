import { PATHS } from '@desktop/shared'
import type { StorageProvider } from './provider.ts'

const enc = (s: string) => new TextEncoder().encode(s)

/**
 * Ensure the storage tree's program-managed system info exists. Portable: only
 * touches the injected provider (directories are created lazily on write).
 */
export async function ensureLayout(provider: StorageProvider) {
  if (!(await provider.stat(PATHS.systemInfo))) {
    const info = {
      app: 'desktop-nav',
      version: 1,
      provider: provider.id,
      capabilities: provider.capabilities('').provider,
      installId: Math.random().toString(36).slice(2, 10),
      createdAt: Date.now(),
    }
    await provider.write(PATHS.systemInfo, enc(JSON.stringify(info, null, 2)))
  }
}
