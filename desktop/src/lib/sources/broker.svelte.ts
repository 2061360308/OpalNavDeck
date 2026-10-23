import { authHeaders } from '../persist/api'

/**
 * DataBroker aggregates widget subscriptions and, at the finest requested
 * interval, issues ONE batched request to the desktop backend (which fans out
 * to the agents). Results are pushed to subscribers. Polling pauses when the tab
 * is hidden and after a period of inactivity; on resume the cache is rendered
 * immediately and a refresh follows.
 */

const MAX_BATCH = 50
const FLOOR_MS = 1000
const DEFAULT_MS = 5000
const IDLE_MS = 5 * 60 * 1000
const IDLE_RECHECK_MS = 30 * 1000

export interface SourceMetrics {
  ok: boolean
  ts: number
  plugins: Record<string, Record<string, unknown>>
  error?: string
}

export type Listener = (m: SourceMetrics | undefined) => void

interface Sub {
  source: string
  keys?: string[]
  interval: number
  listener: Listener
}

function pickMetrics(m: SourceMetrics, keys?: string[]): SourceMetrics {
  if (!keys?.length) return m
  const plugins: Record<string, Record<string, unknown>> = {}
  for (const raw of keys) {
    const key = String(raw)
    const dot = key.indexOf('.')
    const pid = dot > 0 ? key.slice(0, dot) : ''
    const out = dot > 0 ? key.slice(dot + 1) : key
    if (!pid) {
      for (const [p, vals] of Object.entries(m.plugins)) {
        if (out in vals) (plugins[p] ??= {})[out] = vals[out]
      }
      continue
    }
    const vals = m.plugins[pid]
    if (!vals) continue
    if (out === '*') {
      plugins[pid] = { ...vals }
      continue
    }
    if (out in vals) (plugins[pid] ??= {})[out] = vals[out]
  }
  return { ...m, plugins }
}

class DataBroker {
  private subs = new Set<Sub>()
  private cache = new Map<string, SourceMetrics>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private interval = 0
  private lastActivity = Date.now()
  private started = false

  /** Subscribe to a source; returns an unsubscribe function. */
  subscribe(source: string, opts: { keys?: string[]; interval?: number }, listener: Listener): () => void {
    const sub: Sub = {
      source,
      keys: opts.keys,
      interval: Math.max(FLOOR_MS, opts.interval ?? DEFAULT_MS),
      listener,
    }
    this.subs.add(sub)
    this.start()
    const cached = this.cache.get(source)
    if (cached) listener(pickMetrics(cached, sub.keys))
    this.recompute()
    return () => {
      this.subs.delete(sub)
      this.recompute()
    }
  }

  /** Latest cached metrics for a source (may be stale/undefined). */
  get(source: string): SourceMetrics | undefined {
    return this.cache.get(source)
  }

  invalidate(source: string): void {
    this.cache.delete(source)
  }

  refresh(source: string): void {
    if (document.hidden) return
    void this.fetchChunk([source])
  }

  private start() {
    if (this.started) return
    this.started = true
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('pointerdown', this.onActivity, true)
    window.addEventListener('keydown', this.onActivity, true)
    this.onVisibility()
  }

  private onActivity = () => {
    this.lastActivity = Date.now()
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.clearTimer()
    } else {
      this.lastActivity = Date.now()
      this.recompute(true)
    }
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }

  private idle(): boolean {
    return Date.now() - this.lastActivity > IDLE_MS
  }

  private recompute(force = false) {
    if (document.hidden || this.subs.size === 0) {
      this.clearTimer()
      return
    }
    const min = Math.min(...[...this.subs].map((s) => s.interval))
    if (!force && this.timer && min === this.interval) return
    this.interval = min
    this.clearTimer()
    this.timer = setTimeout(() => void this.tick(), min)
  }

  private async tick() {
    this.timer = undefined
    if (document.hidden) return
    if (this.idle()) {
      this.timer = setTimeout(() => void this.tick(), IDLE_RECHECK_MS)
      return
    }
    const ids = [...new Set([...this.subs].map((s) => s.source))]
    for (let i = 0; i < ids.length; i += MAX_BATCH) {
      void this.fetchChunk(ids.slice(i, i + MAX_BATCH))
    }
    this.recompute()
  }

  private async fetchChunk(ids: string[]) {
    if (!ids.length) return
    try {
      const query = ids.map(encodeURIComponent).join(',')
      const res = await fetch(`/api/sources/metrics?ids=${query}`, { headers: authHeaders() })
      if (!res.ok) {
        this.fail(ids, `status ${res.status}`)
        return
      }
      const data = (await res.json()) as { sources?: Record<string, Partial<SourceMetrics>> }
      const got = new Set<string>()
      for (const [id, raw] of Object.entries(data.sources ?? {})) {
        got.add(id)
        const m: SourceMetrics = {
          ok: raw?.ok === true,
          ts: typeof raw?.ts === 'number' ? raw.ts : Date.now(),
          plugins: raw?.plugins ?? {},
          error: raw?.error,
        }
        this.cache.set(id, m)
        this.notify(id, m)
      }
      for (const id of ids) {
        if (!got.has(id)) this.fail([id], 'no response')
      }
    } catch (e) {
      this.fail(ids, String(e))
    }
  }

  private fail(ids: string[], error: string) {
    const ts = Date.now()
    for (const id of ids) {
      const prev = this.cache.get(id)
      const m: SourceMetrics = { ok: false, ts, plugins: prev?.plugins ?? {}, error }
      this.cache.set(id, m)
      this.notify(id, m)
    }
  }

  private notify(source: string, m: SourceMetrics) {
    for (const sub of this.subs) {
      if (sub.source === source) sub.listener(pickMetrics(m, sub.keys))
    }
  }
}

export const broker = new DataBroker()
