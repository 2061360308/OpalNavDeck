import { PATHS } from '@desktop/shared'
import type { StorageProvider } from '../storage/provider.ts'
import { sha256Hex } from './crypto.ts'

export type Provider = 'alipay' | 'github'

export interface Binding {
  subject: string
  display?: string
  boundAt: number
}

export type Identities = Partial<Record<Provider, Binding>>

export interface Ticket {
  intent: 'login' | 'bind'
  pollKeyHash: string
  status: 'pending' | 'done' | 'error'
  subject?: string
  display?: string
  error?: string
  exp: number
}

/**
 * Auth data persisted through the StorageProvider (works on local disk and on
 * object storage / R2 alike) under a private, hidden prefix.
 *
 *   <AUTH>/users/owner/identities.json
 *   <AUTH>/tickets/<sha256(state)>.json
 */
export interface AuthStore {
  getIdentities(): Promise<Identities>
  setBinding(provider: Provider, b: Binding): Promise<void>
  removeBinding(provider: Provider): Promise<void>
  putTicket(state: string, t: Ticket): Promise<void>
  getTicket(state: string): Promise<Ticket | null>
  delTicket(state: string): Promise<void>
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function createAuthStore(provider: StorageProvider, root = PATHS.auth): AuthStore {
  const userDir = `${root}/users/owner`
  const ticketDir = `${root}/tickets`
  const identitiesPath = `${userDir}/identities.json`

  const readJson = async <T>(path: string): Promise<T | null> => {
    try {
      const r = await provider.read(path)
      return JSON.parse(dec.decode(r.data)) as T
    } catch {
      return null
    }
  }
  const writeJson = async (path: string, obj: unknown): Promise<void> => {
    await provider.write(path, enc.encode(JSON.stringify(obj, null, 2)))
  }
  const del = async (path: string): Promise<void> => {
    try {
      await provider.remove(path, false)
    } catch {
      /* ignore */
    }
  }

  return {
    async getIdentities() {
      return (await readJson<Identities>(identitiesPath)) ?? {}
    },
    async setBinding(p, b) {
      const ids = (await readJson<Identities>(identitiesPath)) ?? {}
      ids[p] = b
      await writeJson(identitiesPath, ids)
    },
    async removeBinding(p) {
      const ids = (await readJson<Identities>(identitiesPath)) ?? {}
      delete ids[p]
      await writeJson(identitiesPath, ids)
    },
    async putTicket(state, t) {
      await writeJson(`${ticketDir}/${await sha256Hex(state)}.json`, t)
    },
    async getTicket(state) {
      return readJson<Ticket>(`${ticketDir}/${await sha256Hex(state)}.json`)
    },
    async delTicket(state) {
      await del(`${ticketDir}/${await sha256Hex(state)}.json`)
    },
  }
}
