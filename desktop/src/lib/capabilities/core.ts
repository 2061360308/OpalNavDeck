/**
 * Core capabilities, implemented by the host desktop app.
 *
 * Widgets/plugins never call the backend HTTP API directly; they call these
 * capabilities through the bridge/worker RPC, and the host decides how to
 * reach storage (signed URL / proxy), the network (server-side proxy) and
 * navigation (local state).
 */

import { capabilities, type CapabilityContext } from './registry'
import { fs } from '../api/fs'
import { services } from '../state/services.svelte'
import { recent } from '../state/recent.svelte'
import { widgets } from '../state/widgets.svelte'
import { authHeaders } from '../persist/api'
import { PATHS } from '@desktop/shared'

/** per-instance private data root */
const DATA_ROOT = PATHS.data

/** map a caller-relative path into its own sandbox data directory */
function dataPath(ctx: CapabilityContext, p: unknown): string {
  const rel = String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .join('/')
  return `${DATA_ROOT}/${ctx.id}/${rel}`
}

function storageKey(ctx: CapabilityContext, k: unknown): string {
  return `${ctx.kind}:${ctx.id}:${String(k ?? '')}`
}

async function netProxy(p: any): Promise<unknown> {
  try {
    const res = await fetch('/api/net/proxy', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: String(p?.url ?? ''), init: p?.init ?? {} }),
    })
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() }
    return await res.json()
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** register every built-in capability namespace */
export function registerCoreCapabilities(): void {
  capabilities.register('core', 'drive', {
    list: (p, ctx) => fs.list(dataPath(ctx, p?.path)),
    stat: (p, ctx) => fs.stat(dataPath(ctx, p?.path)),
    read: (p, ctx) =>
      fs.readText(dataPath(ctx, p?.path)).then((r) => (r ? r.text : null)),
    write: (p, ctx) => fs.writeText(dataPath(ctx, p?.path), String(p?.value ?? '')),
    mkdir: (p, ctx) => fs.mkdir(dataPath(ctx, p?.path)),
    move: (p, ctx) => fs.move(dataPath(ctx, p?.from), dataPath(ctx, p?.to)),
    remove: (p, ctx) => fs.remove(dataPath(ctx, p?.path)),
  })

  capabilities.register('core', 'net', {
    fetch: (p) => netProxy(p),
  })

  capabilities.register('core', 'nav', {
    list: () =>
      services.list.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        group: s.group ?? '',
        icon: s.icon,
        desc: s.desc ?? '',
        tags: s.tags ?? [],
      })),
    open: (p) => {
      const svc = services.byId(String(p?.id ?? ''))
      if (!svc) return false
      recent.record(svc.id)
      window.open(svc.url, '_blank', 'noopener,noreferrer')
      return true
    },
  })

  capabilities.register('core', 'ui', {
    openUrl: (p) => {
      window.open(String(p?.url ?? ''), '_blank', 'noopener')
      return true
    },
    setShape: (p, ctx) => {
      const w = widgets.byId(ctx.id)
      if (w) w.shape = String(p?.clipPath ?? '') || undefined
      return true
    },
    setTitle: () => true,
    resize: () => true,
  })

  capabilities.register('core', 'settings', {
    get: (_p, ctx) => ({ ...(widgets.byId(ctx.id)?.config ?? {}) }),
    set: (p, ctx) => {
      const w = widgets.byId(ctx.id)
      if (w) w.config = (p?.value ?? {}) as Record<string, unknown>
      return true
    },
  })

  capabilities.register('core', 'storage', {
    get: (p, ctx) => localStorage.getItem(storageKey(ctx, p?.key)),
    set: (p, ctx) => {
      localStorage.setItem(storageKey(ctx, p?.key), String(p?.value ?? ''))
      return true
    },
    remove: (p, ctx) => {
      localStorage.removeItem(storageKey(ctx, p?.key))
      return true
    },
  })

  capabilities.register('core', 'log', {
    write: (p, ctx) => {
      const args = Array.isArray(p?.args) ? p.args : []
      console.log(`[${ctx.kind}:${ctx.id}]`, ...args)
      return true
    },
  })
}
