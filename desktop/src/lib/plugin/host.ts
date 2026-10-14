import { fs } from '../api/fs'
import { capabilities, type CapabilityContext } from '../capabilities/registry'
import { PATHS } from '@desktop/shared'
import { rpc } from '../api/rpc'

export interface PluginManifest {
  id: string
  name?: string
  entry?: string
  headless?: boolean
  exposes?: string[]
  permissions?: string[]
}

const LOG_PREFIX = '[plugin]'
const PLUGINS_ROOT = PATHS.plugins

interface Pending {
  resolve: (v: any) => void
  reject: (e: any) => void
}

/**
 * Loads headless plugins (`Rainmeter/Plugins/<id>`) from the public code base
 * in hidden sandbox Web Workers. Plugins can call core capabilities and
 * `expose` new capabilities (namespaced `plugin.<id>.<ns>`) that widgets and
 * other plugins can then call.
 */
class PluginHost {
  manifests: PluginManifest[] = []
  private workers = new Map<string, Worker>()
  private ready = new Map<string, { resolve: () => void; reject: (e: any) => void }>()
  private pending = new Map<string, Map<number, Pending>>()
  private seq = 0

  async load(): Promise<void> {
    try {
      const res = await rpc.api.pkg.list.$get({ query: { kind: 'plugin' } })
      if (!res.ok) return
      const data = (await res.json()) as unknown as { packages?: PluginManifest[] }
      this.manifests = data.packages ?? []
      for (const m of this.manifests) await this.start(m)
    } catch (e) {
      console.warn(LOG_PREFIX, 'load failed', e)
    }
  }

  private async start(m: PluginManifest): Promise<void> {
    const entry = m.entry || 'main.mjs'
    try {
      await fs.ready
      const url = fs.assetUrl(`${PLUGINS_ROOT}/${m.id}/${entry}`)
      if (!url) throw new Error('no public asset base configured for plugins')
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      this.workers.set(m.id, worker)
      this.pending.set(m.id, new Map())
      const ready = new Promise<void>((resolve, reject) => {
        this.ready.set(m.id, { resolve, reject })
      })
      worker.onmessage = (e) => this.onWorker(m, e)
      worker.postMessage({ type: 'init', url })
      await ready
    } catch (e) {
      console.warn(LOG_PREFIX, 'start failed', m.id, e)
    }
  }

  /** invoke a function exposed by a plugin (used by widget forwarding too) */
  call(id: string, fn: string, ...args: unknown[]): Promise<any> {
    const worker = this.workers.get(id)
    const map = this.pending.get(id)
    if (!worker || !map) return Promise.reject(new Error('plugin not loaded: ' + id))
    const cid = ++this.seq
    return new Promise((resolve, reject) => {
      map.set(cid, { resolve, reject })
      worker.postMessage({ type: 'call', id: cid, name: fn, args })
    })
  }

  /** stop a plugin and remove every capability it contributed */
  unload(id: string) {
    this.workers.get(id)?.terminate()
    this.workers.delete(id)
    this.pending.delete(id)
    this.ready.delete(id)
    capabilities.unregisterProvider(id)
  }

  private onWorker(m: PluginManifest, e: MessageEvent) {
    const d = e.data
    if (!d) return
    if (d.type === 'ready') {
      this.ready.get(m.id)?.resolve()
      return
    }
    if (d.type === 'error') {
      this.ready.get(m.id)?.reject(new Error(d.error))
      return
    }
    if (d.type === 'callResult') {
      const p = this.pending.get(m.id)?.get(d.id)
      if (p) {
        this.pending.get(m.id)!.delete(d.id)
        d.error ? p.reject(new Error(d.error)) : p.resolve(d.result)
      }
      return
    }
    if (d.type === 'expose') {
      this.registerExposed(m, d.namespace, d.methods ?? [])
      return
    }
    if (d.type === 'rpc') {
      const ctx: CapabilityContext = { kind: 'plugin', id: m.id, permissions: m.permissions ?? [] }
      void capabilities
        .dispatch(d.method, d.params ?? {}, ctx)
        .then((result) => this.workers.get(m.id)?.postMessage({ type: 'reply', id: d.id, result }))
        .catch((err) =>
          this.workers.get(m.id)?.postMessage({ type: 'reply', id: d.id, error: String(err) })
        )
    }
  }

  private registerExposed(m: PluginManifest, ns: string, methods: string[]) {
    const namespace = `plugin.${m.id}.${ns}`
    const handlers: Record<string, (params: any) => unknown> = {}
    for (const method of methods) {
      handlers[method] = (params) => this.call(m.id, `${ns}.${method}`, params)
    }
    capabilities.register(m.id, namespace, handlers)
  }
}

export const plugins = new PluginHost()
