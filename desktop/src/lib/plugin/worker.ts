/// <reference lib="webworker" />
/* Hidden sandbox Web Worker that runs headless plugins (`Rainmeter/Plugins/<id>`). */
const fns: Record<string, (...a: any[]) => any> = {}
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
let seq = 0

function rpc(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ;(self as any).postMessage({ type: 'rpc', id, method, params })
  })
}

const api = {
  /**
   * Publish functions under a namespace. The host exposes them to every
   * widget (and plugin) as `desk.plugin.<id>.<namespace>.<method>`.
   */
  expose: (namespace: string, methods: Record<string, (...a: any[]) => any>) => {
    const names: string[] = []
    for (const [name, fn] of Object.entries(methods || {})) {
      fns[`${namespace}.${name}`] = fn
      names.push(name)
    }
    ;(self as any).postMessage({ type: 'expose', namespace, methods: names })
  },
  /** invoke any capability by fully-qualified key, e.g. `net.fetch` */
  call: (key: string, params?: any) => rpc(key, params ?? {}),
  storage: {
    get: (k: string) => rpc('storage.get', { key: k }),
    set: (k: string, v: any) => rpc('storage.set', { key: k, value: v }),
    remove: (k: string) => rpc('storage.remove', { key: k }),
  },
  net: {
    fetch: (url: string, init?: any) => rpc('net.fetch', { url, init }),
  },
  nav: {
    list: () => rpc('nav.list', {}),
    open: (id: string) => rpc('nav.open', { id }),
  },
  drive: {
    list: (path: string) => rpc('drive.list', { path }),
    read: (path: string) => rpc('drive.read', { path }),
    write: (path: string, value: string) => rpc('drive.write', { path, value }),
    mkdir: (path: string) => rpc('drive.mkdir', { path }),
    move: (from: string, to: string) => rpc('drive.move', { from, to }),
    remove: (path: string) => rpc('drive.remove', { path }),
  },
  log: (...args: any[]) => {
    void rpc('log.write', { args })
  },
}

;(self as any).onmessage = async (e: MessageEvent) => {
  const d = e.data
  if (d.type === 'init') {
    try {
      const mod = await import(/* @vite-ignore */ d.url)
      const setup = mod.default ?? mod.setup
      if (setup) await setup(api)
      ;(self as any).postMessage({ type: 'ready' })
    } catch (err) {
      ;(self as any).postMessage({ type: 'error', error: String(err) })
    }
  } else if (d.type === 'reply') {
    const p = pending.get(d.id)
    if (p) {
      pending.delete(d.id)
      d.error ? p.reject(new Error(d.error)) : p.resolve(d.result)
    }
  } else if (d.type === 'call') {
    const fn = fns[d.name]
    if (!fn) {
      ;(self as any).postMessage({ type: 'callResult', id: d.id, error: 'unknown function ' + d.name })
      return
    }
    try {
      const r = await fn(...(d.args ?? []))
      ;(self as any).postMessage({ type: 'callResult', id: d.id, result: r })
    } catch (err) {
      ;(self as any).postMessage({ type: 'callResult', id: d.id, error: String(err) })
    }
  }
}
