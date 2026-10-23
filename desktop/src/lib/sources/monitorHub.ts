import { BRIDGE_EVENT } from '@desktop/shared/bridge'
import { broker, type SourceMetrics } from './broker.svelte'
import { sources } from './sources.svelte'

export interface MonitorSourceInfo {
  id: string
  name: string
  baseUrl: string
  enabled: boolean
}

export interface MonitorData extends SourceMetrics {
  slot: string
  source: string
}

export interface MonitorSubscribeResult {
  ok: boolean
  slot: string
  error?: string
}

type Deliver = (event: string, data: unknown) => void

const DEFAULT_SLOT = 'default'

class MonitorHub {
  private sinks = new Map<string, Deliver>()
  private subs = new Map<string, Map<string, () => void>>()

  attach(widgetId: string, deliver: Deliver): void {
    this.sinks.set(widgetId, deliver)
  }

  detach(widgetId: string): void {
    this.sinks.delete(widgetId)
    const slots = this.subs.get(widgetId)
    if (!slots) return
    for (const off of slots.values()) off()
    this.subs.delete(widgetId)
  }

  list(): MonitorSourceInfo[] {
    return sources.list.map((s) => ({
      id: s.id,
      name: s.name,
      baseUrl: s.baseUrl,
      enabled: s.enabled !== false,
    }))
  }

  subscribe(widgetId: string, raw: unknown): MonitorSubscribeResult {
    const p = (raw ?? {}) as Record<string, unknown>
    const source = String(p.source ?? '')
    const slot = String(p.slot ?? DEFAULT_SLOT) || DEFAULT_SLOT
    if (!source) return { ok: false, slot, error: 'source is required' }

    const src = sources.get(source)
    if (!src && sources.loaded) return { ok: false, slot, error: 'unknown source' }
    if (src && src.enabled === false) return { ok: false, slot, error: 'source is disabled' }

    const keys = Array.isArray(p.keys) ? p.keys.map(String).filter(Boolean) : undefined
    const interval = typeof p.interval === 'number' ? p.interval : undefined

    let slots = this.subs.get(widgetId)
    if (!slots) {
      slots = new Map()
      this.subs.set(widgetId, slots)
    }
    slots.get(slot)?.()
    slots.delete(slot)

    const off = broker.subscribe(source, { keys, interval }, (m) => {
      const sink = this.sinks.get(widgetId)
      if (!sink) return
      const data: MonitorData = {
        ...(m ?? { ok: false, ts: Date.now(), plugins: {}, error: 'no data' }),
        slot,
        source,
      }
      sink(BRIDGE_EVENT.monitorData, data)
    })
    slots.set(slot, off)
    return { ok: true, slot }
  }

  unsubscribe(widgetId: string, slot = DEFAULT_SLOT): MonitorSubscribeResult {
    const slots = this.subs.get(widgetId)
    const key = String(slot || DEFAULT_SLOT)
    const off = slots?.get(key)
    if (!off) return { ok: false, slot: key, error: 'not subscribed' }
    off()
    slots?.delete(key)
    if (slots && slots.size === 0) this.subs.delete(widgetId)
    return { ok: true, slot: key }
  }
}

export const monitorHub = new MonitorHub()
