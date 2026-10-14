import type { Service } from '../types'
import { fs } from '../api/fs'
import { authHeaders } from '../persist/api'
import { PATHS } from '@desktop/shared'

const ICONS_DIR = PATHS.icons
const ASSETS_DIR = PATHS.assets
const ORDER_FILE = PATHS.order

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
}

/** filenames: keep Chinese/spaces, drop what the OS forbids */
export function sanitizeIconName(input: string): string {
  let s = String(input ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/[. ]+$/, '')
  if (!s) s = 'icon'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) s = '_' + s
  while (new TextEncoder().encode(s).length > 200) s = s.slice(0, -1)
  return s
}

function normalize(raw: any, id: string): Service {
  // icons are asset file names; tolerate legacy { kind, value } shape
  let icon = ''
  if (raw?.icon && typeof raw.icon === 'object') icon = String(raw.icon.value ?? '')
  else if (typeof raw?.icon === 'string') icon = raw.icon
  return {
    id,
    name: String(raw?.name ?? id),
    url: String(raw?.url ?? ''),
    group: raw?.group ? String(raw.group) : undefined,
    icon,
    desc: raw?.desc ? String(raw.desc) : undefined,
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String) : undefined,
  }
}

/** Icons are file-backed: `Icons/<name>.json` (the file name is the id). */
class ServicesState {
  list = $state<Service[]>([])
  loaded = $state(false)
  /** id -> order (persisted in /Icons/.order.json) */
  orders: Record<string, number> = {}

  byId(id: string): Service | undefined {
    return this.list.find((s) => s.id === id)
  }

  /** stream the whole collection from the NDJSON endpoint */
  async load() {
    try {
      const res = await fetch('/api/icons', { headers: authHeaders() })
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const acc: Service[] = []
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          try {
            const doc = JSON.parse(line)
            const id = String(doc.id ?? doc.name ?? '')
            if (id) acc.push(normalize(doc, id))
          } catch {
            /* skip malformed line */
          }
        }
      }
      await this.loadOrder()
      this.list = acc.map((s) => ({ ...s, order: this.orders[s.id] }))
      this.loaded = true
    } catch (e) {
      console.warn('[icons] load failed', e)
    }
  }

  private async loadOrder() {
    try {
      const r = await fs.readText(ORDER_FILE)
      const m = r?.text ? JSON.parse(r.text) : {}
      this.orders = m && typeof m === 'object' && !Array.isArray(m) ? m : {}
    } catch {
      this.orders = {}
    }
  }

  /** ids of a group in display order (used for category drag-reorder) */
  categoryIds(group: string): string[] {
    return this.list
      .map((s, i) => ({ s, i }))
      .filter((x) => (x.s.group?.trim() || '未分类') === group)
      .sort((a, b) => (a.s.order ?? Number.MAX_SAFE_INTEGER) - (b.s.order ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
      .map((x) => x.s.id)
  }

  /** persist the new display order for a group's icons */
  async setCategoryOrder(ids: string[]) {
    ids.forEach((id, i) => {
      this.orders[id] = i
    })
    this.list = this.list.map((s) => (this.orders[s.id] !== undefined ? { ...s, order: this.orders[s.id] } : s))
    try {
      await fs.writeText(ORDER_FILE, JSON.stringify(this.orders, null, 2) + '\n')
    } catch (e) {
      console.warn('[icons] order save failed', e)
    }
  }

  private unique(base: string): string {
    const taken = new Set(this.list.map((s) => s.id.toLowerCase()))
    let name = base
    let n = 1
    while (taken.has(name.toLowerCase())) {
      n += 1
      name = `${base} (${n})`
    }
    return name
  }

  async writeIcon(s: Service) {
    const doc = {
      name: s.name,
      url: s.url,
      group: s.group ?? '',
      tags: s.tags ?? [],
      desc: s.desc ?? '',
      icon: s.icon,
    }
    await fs.writeText(`${ICONS_DIR}/${s.id}.json`, JSON.stringify(doc, null, 2) + '\n')
  }

  /** store an image under /Icons/.assets (content-hashed) and return its file name */
  async putAsset(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-1', buf)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const ext = EXT[blob.type] ?? 'png'
    const file = `${hash}.${ext}`
    await fs.writeBlob(`${ASSETS_DIR}/${file}`, blob)
    return file
  }

  async add(input: Omit<Service, 'id'> & { id?: string }): Promise<Service> {
    const id = this.unique(sanitizeIconName(input.id || input.name))
    const s: Service = { ...input, id }
    this.list = [...this.list, s]
    await this.writeIcon(s)
    return s
  }

  async update(id: string, patch: Partial<Service>) {
    const i = this.list.findIndex((s) => s.id === id)
    if (i < 0) return
    const next = { ...this.list[i], ...patch, id }
    this.list = this.list.map((s) => (s.id === id ? next : s))
    await this.writeIcon(next)
  }

  async remove(id: string) {
    this.list = this.list.filter((s) => s.id !== id)
    if (this.orders[id] !== undefined) {
      delete this.orders[id]
      try {
        await fs.writeText(ORDER_FILE, JSON.stringify(this.orders, null, 2) + '\n')
      } catch {
        /* ignore */
      }
    }
    await fs.remove(`${ICONS_DIR}/${id}.json`)
  }
}

export const services = new ServicesState()
