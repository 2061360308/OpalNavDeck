import type { SkinManifest } from '../types'
import { rpc } from '../api/rpc'
import { authHeaders } from '../persist/api'

export interface PackageFile {
  path: string
  file: File
}

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

  async install(id: string, files: PackageFile[]): Promise<boolean> {
    if (!id || files.length === 0) return false
    const body = new FormData()
    body.append('kind', 'skin')
    body.append('id', id)
    for (const f of files) body.append(f.path, f.file, f.path)
    try {
      const res = await fetch('/api/pkg/install', {
        method: 'POST',
        headers: authHeaders(),
        body,
      })
      if (!res.ok) return false
      await this.load()
      return true
    } catch {
      return false
    }
  }

  async removePackage(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/pkg?kind=skin&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) return false
      await this.load()
      return true
    } catch {
      return false
    }
  }
}

export const skins = new SkinsState()
