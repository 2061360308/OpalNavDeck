import type { Hono } from 'hono'
import type { StorageProvider } from './storage/provider.ts'

/**
 * Monitoring sources (agent endpoints) + the batch/control proxy.
 *
 * The browser only talks to this backend (same-origin, session auth); the
 * backend holds each agent's token and proxies to it over HTTP. This avoids
 * mixed-content (agents are plain HTTP) and keeps agent tokens out of the browser.
 */

const SOURCES_FILE = '/System/sources.json'
const MAX_BATCH = 50
const AGENT_TIMEOUT_MS = 8000

export interface Source {
  id: string
  name: string
  baseUrl: string
  token: string
  enabled?: boolean
}

export interface SourceDeps {
  provider: StorageProvider
  env: Record<string, string | undefined>
}

const enc = (s: string) => new TextEncoder().encode(s)
const dec = new TextDecoder()

async function readSources(provider: StorageProvider): Promise<Source[]> {
  try {
    const r = await provider.read(SOURCES_FILE)
    const parsed = JSON.parse(dec.decode(r.data))
    return Array.isArray(parsed) ? (parsed as Source[]) : []
  } catch {
    return []
  }
}

async function writeSources(provider: StorageProvider, list: Source[]): Promise<void> {
  await provider.write(SOURCES_FILE, enc(JSON.stringify(list, null, 2)))
}

/** strip the token before returning a source to the browser */
function publicSource(s: Source) {
  const { token: _token, ...rest } = s
  return { ...rest, hasToken: !!s.token }
}

interface AgentResult {
  ok: boolean
  status?: number
  json?: any
  error?: string
}

async function callAgent(
  baseUrl: string,
  token: string,
  path: string,
  init?: { method?: string; body?: string; contentType?: string }
): Promise<AgentResult> {
  const base = baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (init?.contentType) headers['Content-Type'] = init.contentType
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), AGENT_TIMEOUT_MS)
  try {
    const res = await fetch(base + path, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
      signal: ac.signal,
    })
    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      /* non-JSON */
    }
    return { ok: res.ok, status: res.status, json, error: res.ok ? undefined : `status ${res.status}` }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    clearTimeout(timer)
  }
}

function newId(): string {
  return 'src-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

export function registerSources(app: Hono, deps: SourceDeps): void {
  const { provider } = deps

  const find = async (id: string): Promise<Source | undefined> => (await readSources(provider)).find((s) => s.id === id)

  /* ---------- CRUD ---------- */
  app.get('/api/sources', async (c) => {
    const list = await readSources(provider)
    return c.json({ sources: list.map(publicSource) })
  })

  app.post('/api/sources', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<Source>
    const baseUrl = String(body.baseUrl ?? '').trim()
    if (!/^https?:\/\//i.test(baseUrl)) return c.json({ error: 'baseUrl must be http(s)' }, 400)
    const list = await readSources(provider)
    const src: Source = {
      id: newId(),
      name: String(body.name ?? baseUrl).trim() || baseUrl,
      baseUrl: baseUrl.replace(/\/$/, ''),
      token: String(body.token ?? ''),
      enabled: body.enabled !== false,
    }
    list.push(src)
    await writeSources(provider, list)
    return c.json({ source: publicSource(src) })
  })

  app.put('/api/sources/:id', async (c) => {
    const id = c.req.param('id')
    const body = (await c.req.json().catch(() => ({}))) as Partial<Source>
    const list = await readSources(provider)
    const src = list.find((s) => s.id === id)
    if (!src) return c.json({ error: 'not found' }, 404)
    if (body.name !== undefined) src.name = String(body.name)
    if (body.baseUrl !== undefined) src.baseUrl = String(body.baseUrl).replace(/\/$/, '')
    if (body.token) src.token = String(body.token)
    if (body.enabled !== undefined) src.enabled = !!body.enabled
    await writeSources(provider, list)
    return c.json({ source: publicSource(src) })
  })

  app.delete('/api/sources/:id', async (c) => {
    const id = c.req.param('id')
    const list = await readSources(provider)
    const next = list.filter((s) => s.id !== id)
    await writeSources(provider, next)
    return c.json({ ok: true })
  })

  /* ---------- connectivity test ---------- */
  app.get('/api/sources/:id/test', async (c) => {
    const src = await find(c.req.param('id'))
    if (!src) return c.json({ error: 'not found' }, 404)
    const r = await callAgent(src.baseUrl, src.token, '/v1/info')
    if (!r.ok) return c.json({ ok: false, error: r.error }, 200)
    return c.json({ ok: true, info: r.json })
  })

  /* ---------- batch metrics ---------- */
  app.get('/api/sources/metrics', async (c) => {
    const list = await readSources(provider)
    const idsParam = c.req.query('ids')
    const ids = idsParam
      ? idsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : list.map((s) => s.id)
    if (ids.length > MAX_BATCH) {
      return c.json({ error: 'too many ids', max: MAX_BATCH }, 400)
    }
    const byId = new Map(list.map((s) => [s.id, s]))
    const entries = await Promise.all(
      ids.map(async (id): Promise<[string, any]> => {
        const src = byId.get(id)
        if (!src) return [id, { ok: false, error: 'unknown source' }]
        const r = await callAgent(src.baseUrl, src.token, '/v1/metrics')
        if (!r.ok) return [id, { ok: false, error: r.error }]
        return [id, { ok: true, ts: r.json?.ts ?? Date.now(), plugins: r.json?.plugins ?? {} }]
      })
    )
    return c.json({ ts: Date.now(), sources: Object.fromEntries(entries) })
  })

  /* ---------- events ---------- */
  app.get('/api/sources/:id/events', async (c) => {
    const src = await find(c.req.param('id'))
    if (!src) return c.json({ error: 'not found' }, 404)
    const since = c.req.query('since') ?? '0'
    const r = await callAgent(src.baseUrl, src.token, `/v1/events?since=${encodeURIComponent(since)}`)
    if (!r.ok) return c.json({ ok: false, error: r.error }, 200)
    return c.json(r.json)
  })

  /* ---------- control plane (manifest only) ---------- */
  app.get('/api/sources/:id/plugins', async (c) => {
    const src = await find(c.req.param('id'))
    if (!src) return c.json({ error: 'not found' }, 404)
    const r = await callAgent(src.baseUrl, src.token, '/v1/plugins')
    if (!r.ok) return c.json({ ok: false, error: r.error }, 200)
    return c.json(r.json)
  })

  app.post('/api/sources/:id/plugins', async (c) => {
    const src = await find(c.req.param('id'))
    if (!src) return c.json({ error: 'not found' }, 404)
    const body = await c.req.text()
    const r = await callAgent(src.baseUrl, src.token, '/v1/plugins', {
      method: 'POST',
      body,
      contentType: 'application/json',
    })
    return c.json(r.json ?? { ok: r.ok, error: r.error }, r.ok ? 200 : 502)
  })

  app.post('/api/sources/:id/plugins/:pid/enable', (c) => pluginToggle(c, true))
  app.post('/api/sources/:id/plugins/:pid/disable', (c) => pluginToggle(c, false))

  async function pluginToggle(c: any, on: boolean) {
    const src = await find(c.req.param('id'))
    if (!src) return c.json({ error: 'not found' }, 404)
    const pid = c.req.param('pid')
    const r = await callAgent(src.baseUrl, src.token, `/v1/plugins/${encodeURIComponent(pid)}/${on ? 'enable' : 'disable'}`, {
      method: 'POST',
    })
    return c.json(r.json ?? { ok: r.ok, error: r.error }, r.ok ? 200 : 502)
  }

  app.delete('/api/sources/:id/plugins/:pid', async (c) => {
    const src = await find(c.req.param('id'))
    if (!src) return c.json({ error: 'not found' }, 404)
    const pid = c.req.param('pid')
    const r = await callAgent(src.baseUrl, src.token, `/v1/plugins/${encodeURIComponent(pid)}`, { method: 'DELETE' })
    return c.json(r.json ?? { ok: r.ok, error: r.error }, r.ok ? 200 : 502)
  })
}
