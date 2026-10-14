import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { PATHS } from '@desktop/shared'
import {
  HIDDEN_PREFIXES,
  READONLY_PREFIXES,
  isReadonlyPath,
  normalizePath,
  PathError,
  PreconditionFailed,
  type StorageProvider,
} from './storage/provider.ts'
import { assetBase, publicConfig, storageKind } from './storage/factory.ts'
import { registerAuth } from './auth/index.ts'
import { createAuthStore } from './auth/store.ts'
import { apiAuthorized } from './auth/middleware.ts'
import { registerSources } from './sources.ts'

export interface AppDeps {
  provider: StorageProvider
  env: Record<string, string | undefined>
}

/* ---------- helpers ---------- */

function q(c: { req: { query: (k: string) => string | undefined } }, key: string): string {
  return c.req.query(key) ?? '/'
}

function readonlyBlock(c: any, ...paths: string[]) {
  for (const p of paths) {
    if (isReadonlyPath(p)) return c.json({ error: 'read-only', path: p }, 403)
  }
  return null
}

function fsError(c: any, e: unknown) {
  if (e instanceof PreconditionFailed) {
    c.header('ETag', e.currentEtag ?? '')
    return c.json({ error: 'precondition failed', etag: e.currentEtag ?? null }, 412)
  }
  if (e instanceof PathError) return c.json({ error: e.message }, 400)
  const code = (e as any)?.code
  if (code === 'ENOENT') return c.json({ error: 'not found' }, 404)
  console.error('[fs]', e)
  return c.json({ error: String(e) }, 500)
}

function isBlockedHost(host: string, env: Record<string, string | undefined>): boolean {
  if (env.NET_PROXY_ALLOW_PRIVATE === '1') return false
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 10 || a === 127) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

const ID_RE = /^[a-zA-Z0-9_-]+$/
const ASSET_RE = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,6}$/

const STATE_FILES: Record<string, string> = {
  desktop: PATHS.desktop,
  widgets: PATHS.widgets,
  boxes: PATHS.boxes,
}

const MEDIA_DIRS: Record<string, string> = {
  wallpapers: PATHS.wallpapers,
  cursors: PATHS.cursors,
  themes: PATHS.themes,
}

function kindOf(v: unknown): 'skin' | 'plugin' {
  return String(v ?? '') === 'plugin' ? 'plugin' : 'skin'
}
function packageBase(kind: 'skin' | 'plugin'): string {
  return kind === 'skin' ? PATHS.skins : PATHS.plugins
}

/**
 * Portable Hono app: only Web-standard APIs + the injected storage provider.
 * Platform-specific concerns (static files, WebDAV, local-disk init) live in
 * `platform/*`. Routes are built as a single chain so `AppType` carries the
 * full RPC schema.
 */
export function createApp(deps: AppDeps) {
  const { provider, env } = deps
  const store = createAuthStore(provider)

  /** object mode: redirect to a presigned URL (no bytes through the server) */
  const serveStored = async (c: any, path: string, cache: string): Promise<Response> => {
    if (storageKind(env) === 'object' && provider.sign) {
      try {
        const { url } = await provider.sign({ op: 'get', path })
        return c.redirect(url, 302)
      } catch {
        /* fall through to proxying */
      }
    }
    const r = await provider.read(path)
    return c.body(r.data as unknown as ArrayBuffer, 200, { 'Content-Type': r.mime, 'Cache-Control': cache })
  }

  const listManifests = async (subdir: string, manifest: string): Promise<unknown[]> => {
    const out: unknown[] = []
    try {
      for (const e of await provider.list(subdir)) {
        if (e.type !== 'dir') continue
        try {
          const r = await provider.read(`${subdir}/${e.name}/${manifest}`)
          out.push(JSON.parse(new TextDecoder().decode(r.data)))
        } catch {
          /* skip malformed */
        }
      }
    } catch {
      /* dir missing */
    }
    return out
  }

  const listPackages = async (kind: 'skin' | 'plugin'): Promise<unknown[]> => {
    const base = packageBase(kind)
    const manifest = kind === 'skin' ? 'widget.json' : 'plugin.json'
    const out: unknown[] = []
    try {
      for (const e of await provider.list(base)) {
        if (e.type !== 'dir') continue
        try {
          const r = await provider.read(`${base}/${e.name}/${manifest}`)
          const doc = JSON.parse(new TextDecoder().decode(r.data))
          out.push({ ...doc, id: e.name })
        } catch {
          /* skip malformed */
        }
      }
    } catch {
      /* dir missing */
    }
    return out
  }

  const sendAsset = async (c: any, base: string, id: string, file: string): Promise<Response> => {
    if (!ID_RE.test(id) || file.includes('..') || file.includes('/')) return c.notFound()
    try {
      const r = await provider.read(`${base}/${id}/${file}`)
      return c.body(r.data as unknown as ArrayBuffer, 200, { 'Content-Type': r.mime })
    } catch {
      return c.notFound()
    }
  }

  const app = new Hono()
    .use('/api/*', cors())
    // auth guard first: applies to the /api routes below; /api/auth/* is public
    .use('/api/*', async (c, next) => {
      if (c.req.path.startsWith('/api/auth/')) return next()
      if (!(await apiAuthorized(c, env))) return c.json({ error: 'unauthorized' }, 401)
      await next()
    })
    .get('/api/health', (c) => c.json({ ok: true }))

    /* ---------- app state (bypasses the read-only fs guard) ---------- */
    .get('/api/state/:name', async (c) => {
      const file = STATE_FILES[c.req.param('name')]
      if (!file) return c.notFound()
      try {
        const r = await provider.read(file)
        if (r.etag) c.header('ETag', r.etag)
        c.header('Content-Type', 'application/json; charset=utf-8')
        return c.body(r.data as unknown as ArrayBuffer, 200)
      } catch {
        return c.json({ error: 'not found' }, 404)
      }
    })
    .put('/api/state/:name', async (c) => {
      const file = STATE_FILES[c.req.param('name')]
      if (!file) return c.notFound()
      try {
        const buf = new Uint8Array(await c.req.arrayBuffer())
        const res = await provider.write(file, buf, c.req.header('If-Match'))
        c.header('ETag', res.etag)
        return c.json(res)
      } catch (e) {
        return fsError(c, e)
      }
    })

    /* ---------- storage capabilities ---------- */
    .get('/api/storage/info', (c) => {
      const origin = new URL(c.req.url).origin
      const pub =
        storageKind(env) === 'local'
          ? ({ enabled: true, mode: 'prefix', root: '/', baseUrl: `${origin}/public` } as const)
          : publicConfig(env)
      return c.json({
        ...provider.capabilities(origin),
        provider: storageKind(env),
        hidden: HIDDEN_PREFIXES,
        readonly: READONLY_PREFIXES,
        public: pub,
        assetBase: assetBase(env, origin),
      })
    })
    .get('/api/storage/public/check', async (c) => {
      if (storageKind(env) === 'local') {
        return c.json({ ok: true, guidance: 'local serves /public from the storage root.' })
      }
      if (!provider.checkPublic) {
        return c.json({ ok: false, guidance: 'provider cannot validate public access.' })
      }
      try {
        return c.json(await provider.checkPublic(publicConfig(env)))
      } catch (e) {
        return c.json({ ok: false, guidance: String(e) })
      }
    })

    /* ---------- network proxy ---------- */
    .post('/api/net/proxy', async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { url?: string; init?: RequestInit }
      const raw = String(body.url ?? '')
      let target: URL
      try {
        target = new URL(raw)
      } catch {
        return c.json({ ok: false, error: 'bad url' })
      }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return c.json({ ok: false, error: 'unsupported protocol' })
      }
      if (isBlockedHost(target.hostname, env)) {
        return c.json({ ok: false, error: 'blocked host' })
      }
      const init = body.init ?? {}
      const method = (init.method ?? 'GET').toUpperCase()
      const headers = new Headers((init.headers as Record<string, string>) ?? {})
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 15000)
      try {
        const res = await fetch(target, {
          method,
          headers,
          body:
            method === 'GET' || method === 'HEAD' ? undefined : (init.body as BodyInit | undefined),
          signal: ac.signal,
        })
        const text = await res.text()
        return c.json({
          ok: res.ok,
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          text,
        })
      } catch (e) {
        return c.json({ ok: false, error: String(e) })
      } finally {
        clearTimeout(timer)
      }
    })

    /* ---------- unified file API ---------- */
    .get('/api/fs/list', async (c) => {
      try {
        return c.json({ entries: await provider.list(q(c, 'path')) })
      } catch (e) {
        return fsError(c, e)
      }
    })
    .get('/api/fs/stat', async (c) => {
      try {
        const st = await provider.stat(q(c, 'path'))
        if (!st) return c.json({ error: 'not found' }, 404)
        return c.json(st)
      } catch (e) {
        return fsError(c, e)
      }
    })
    .get('/api/fs/read', async (c) => {
      try {
        const r = await provider.read(q(c, 'path'))
        c.header('Content-Type', r.mime)
        if (r.etag) c.header('ETag', r.etag)
        return c.body(r.data as unknown as ArrayBuffer, 200)
      } catch (e) {
        return fsError(c, e)
      }
    })
    .put('/api/fs/write', async (c) => {
      try {
        const path = q(c, 'path')
        const blocked = readonlyBlock(c, path)
        if (blocked) return blocked
        const buf = new Uint8Array(await c.req.arrayBuffer())
        const res = await provider.write(path, buf, c.req.header('If-Match'))
        c.header('ETag', res.etag)
        return c.json(res)
      } catch (e) {
        return fsError(c, e)
      }
    })
    .post('/api/fs/mkdir', async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as { path?: string }
        const blocked = readonlyBlock(c, body.path ?? '/')
        if (blocked) return blocked
        await provider.mkdir(body.path ?? '/')
        return c.json({ ok: true })
      } catch (e) {
        return fsError(c, e)
      }
    })
    .put('/api/fs/move', async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string }
        if (!body.from || !body.to) return c.json({ error: 'from/to required' }, 400)
        const blocked = readonlyBlock(c, body.from, body.to)
        if (blocked) return blocked
        await provider.move(normalizePath(body.from), normalizePath(body.to))
        return c.json({ ok: true })
      } catch (e) {
        return fsError(c, e)
      }
    })
    .post('/api/fs/sign', async (c) => {
      if (!provider.sign) return c.json({ error: 'direct transfer not supported' }, 501)
      const body = (await c.req.json().catch(() => ({}))) as any
      if (!body?.op || !body?.path) return c.json({ error: 'op/path required' }, 400)
      if (body.op === 'put' || body.op === 'delete') {
        const blocked = readonlyBlock(c, body.path)
        if (blocked) return blocked
      }
      try {
        body.path = normalizePath(body.path)
        return c.json(await provider.sign(body))
      } catch (e) {
        return fsError(c, e)
      }
    })
    .post('/api/fs/mpu', async (c) => {
      if (!provider.multipart) return c.json({ error: 'multipart not supported' }, 501)
      const body = (await c.req.json().catch(() => ({}))) as any
      if (!body?.action || !body?.path) return c.json({ error: 'action/path required' }, 400)
      if (body.action !== 'part') {
        const blocked = readonlyBlock(c, body.path)
        if (blocked) return blocked
      }
      try {
        body.path = normalizePath(body.path)
        return c.json(await provider.multipart(body))
      } catch (e) {
        return fsError(c, e)
      }
    })
    .delete('/api/fs', async (c) => {
      try {
        const blocked = readonlyBlock(c, q(c, 'path'))
        if (blocked) return blocked
        await provider.remove(q(c, 'path'), c.req.query('recursive') === '1')
        return c.json({ ok: true })
      } catch (e) {
        return fsError(c, e)
      }
    })

    /* ---------- icons: NDJSON stream + public asset files ---------- */
    .get('/api/icons', (c) => {
      const stream = new ReadableStream({
        async start(controller) {
          const encode = (s: string) => new TextEncoder().encode(s)
          try {
            const entries = await provider.list(PATHS.icons)
            for (const e of entries) {
              if (
                e.type !== 'file' ||
                e.name.startsWith('.') ||
                !e.name.toLowerCase().endsWith('.json')
              )
                continue
              const id = e.name.slice(0, -5)
              try {
                const r = await provider.read(`${PATHS.icons}/${e.name}`)
                const doc = JSON.parse(new TextDecoder().decode(r.data))
                controller.enqueue(encode(JSON.stringify({ ...doc, id }) + '\n'))
              } catch {
                /* skip malformed */
              }
            }
          } catch {
            /* dir missing */
          }
          controller.close()
        },
      })
      return c.body(stream, 200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      })
    })
    .get('/icons/assets/:file', async (c) => {
      const file = c.req.param('file')
      if (!ASSET_RE.test(file)) return c.notFound()
      try {
        return await serveStored(c, `${PATHS.assets}/${file}`, 'public, max-age=31536000, immutable')
      } catch {
        return c.notFound()
      }
    })

    /* ---------- personalization media ---------- */
    .get('/media/:kind/:file', async (c) => {
      const dir = MEDIA_DIRS[c.req.param('kind')]
      const file = c.req.param('file')
      if (!dir || !file || file.includes('..') || file.includes('/') || file.includes('\\'))
        return c.notFound()
      try {
        return await serveStored(c, `${dir}/${file}`, 'public, max-age=86400')
      } catch {
        return c.notFound()
      }
    })

    /* ---------- public code base (widgets/plugins), served from storage ---------- */
    .use('/public/*', cors())
    .get('/public/*', async (c) => {
      const rel = c.req.path.replace(/^\/public/, '') || '/'
      try {
        return await serveStored(c, decodeURIComponent(rel), 'no-cache')
      } catch {
        return c.notFound()
      }
    })

    /* ---------- plugins + packages ---------- */
    .get('/api/plugins', async (c) =>
      c.json({ plugins: await listManifests(PATHS.plugins, 'plugin.json') })
    )
    .get('/plugins/:id/:file', (c) =>
      sendAsset(c, PATHS.plugins, c.req.param('id'), c.req.param('file'))
    )
    .get('/api/pkg/list', async (c) => {
      const kind = kindOf(c.req.query('kind'))
      return c.json({ kind, packages: await listPackages(kind) })
    })
    .post('/api/pkg/install', async (c) => {
      const body = (await c.req.parseBody({ all: true })) as Record<string, unknown>
      const kind = kindOf(body.kind)
      const id = String(body.id ?? '')
      if (!ID_RE.test(id)) return c.json({ error: 'invalid id' }, 400)
      const base = packageBase(kind)
      let count = 0
      for (const [key, value] of Object.entries(body)) {
        if (key === 'kind' || key === 'id') continue
        const files = Array.isArray(value) ? value : [value]
        for (const f of files) {
          if (!(f instanceof File)) continue
          const rel = key.replace(/\\/g, '/')
          const path = normalizePath(`${base}/${id}/${rel}`)
          const buf = new Uint8Array(await f.arrayBuffer())
          await provider.write(path, buf)
          count++
        }
      }
      return c.json({ ok: true, kind, id, files: count })
    })
    .delete('/api/pkg', async (c) => {
      const kind = kindOf(c.req.query('kind'))
      const id = c.req.query('id') ?? ''
      if (!ID_RE.test(id)) return c.json({ error: 'invalid id' }, 400)
      await provider.remove(`${packageBase(kind)}/${id}`, true)
      return c.json({ ok: true })
    })

  registerSources(app, { provider, env })
  registerAuth(app, { env, store })
  return app
}

export type AppType = ReturnType<typeof createApp>
