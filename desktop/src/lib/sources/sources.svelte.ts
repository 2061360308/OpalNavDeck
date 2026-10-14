import { authHeaders } from '../persist/api'

export interface Source {
  id: string
  name: string
  baseUrl: string
  enabled?: boolean
  hasToken?: boolean
}

/** Monitoring sources, managed through the desktop backend (/api/sources). */
class SourcesState {
  list = $state<Source[]>([])
  loaded = $state(false)

  async load(): Promise<void> {
    try {
      const res = await fetch('/api/sources', { headers: authHeaders() })
      if (!res.ok) return
      const data = (await res.json()) as { sources?: Source[] }
      this.list = data.sources ?? []
    } catch {
      /* offline */
    } finally {
      this.loaded = true
    }
  }

  get(id: string): Source | undefined {
    return this.list.find((s) => s.id === id)
  }

  async add(name: string, baseUrl: string, token: string): Promise<Source | null> {
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, baseUrl, token }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { source: Source }
    await this.load()
    return data.source
  }

  async update(id: string, patch: Partial<Source> & { token?: string }): Promise<void> {
    await fetch(`/api/sources/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    })
    await this.load()
  }

  async remove(id: string): Promise<void> {
    await fetch(`/api/sources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    await this.load()
  }

  async test(id: string): Promise<{ ok: boolean; error?: string; info?: unknown }> {
    try {
      const res = await fetch(`/api/sources/${encodeURIComponent(id)}/test`, { headers: authHeaders() })
      return (await res.json()) as { ok: boolean; error?: string; info?: unknown }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }
}

export const sources = new SourcesState()
