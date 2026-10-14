import type { SkinManifest } from '../types'
import { rpc } from '../api/rpc'

/** Skins are code packages enumerated by the backend (`/api/pkg/list`). */
class SkinsState {
  list = $state<SkinManifest[]>([])

  async load() {
    try {
      const res = await rpc.api.pkg.list.$get({ query: { kind: 'skin' } })
      if (!res.ok) return
      const data = (await res.json()) as unknown as { packages?: SkinManifest[] }
      this.list = Array.isArray(data.packages) ? data.packages : []
    } catch {
      /* offline: keep whatever we had */
    }
  }

  get(id: string): SkinManifest | undefined {
    return this.list.find((s) => s.id === id)
  }
}

export const skins = new SkinsState()
