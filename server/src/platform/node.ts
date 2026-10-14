import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, type AppDeps } from '../app.ts'
import { assetBase, publicConfig, storageKind } from '../storage/factory.ts'
import { ensureLayout } from '../storage/layout.ts'
import { registerWebdav } from '../storage/webdav.ts'
import type { LocalProvider } from '../storage/local.ts'
import type { StorageProvider } from '../storage/provider.ts'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const DIST = join(ROOT, '..', 'desktop', 'dist')

function storageRoot(): string {
  return process.env.DESKTOP_FS_ROOT || join(ROOT, 'data', 'desktop-fs')
}

/** Node provider factory: heavy deps are imported only for the selected mode */
async function createNodeProvider(): Promise<StorageProvider> {
  if (storageKind() === 'object') {
    const { S3Provider } = await import('../storage/s3.ts')
    const bucket = process.env.S3_BUCKET
    if (!bucket) throw new Error('STORAGE=object requires S3_BUCKET')
    return new S3Provider({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'auto',
      bucket,
      prefix: process.env.S3_PREFIX ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
    })
  }
  const { LocalProvider } = await import('../storage/local.ts')
  return new LocalProvider(storageRoot())
}

const provider = await createNodeProvider()
const deps: AppDeps = { provider, env: process.env }
const app = createApp(deps)

/* ---------- WebDAV (local provider only) ---------- */
if (provider.id === 'local') {
  registerWebdav(app, provider as LocalProvider)
}

/* ---------- local public code base (unauthenticated static) ---------- */
if (storageKind() === 'local') {
  app.use('/public/*', cors())
  app.get('/public/*', async (c) => {
    const rel = c.req.path.replace(/^\/public/, '') || '/'
    try {
      const r = await provider.read(decodeURIComponent(rel))
      return c.body(r.data as unknown as ArrayBuffer, 200, {
        'Content-Type': r.mime,
        'Cache-Control': 'no-cache',
      })
    } catch {
      return c.notFound()
    }
  })
}

/* ---------- static desktop app ---------- */
if (existsSync(DIST)) {
  app.use('/*', serveStatic({ root: DIST }))
  app.get('*', serveStatic({ path: join(DIST, 'index.html') }))
}

try {
  await ensureLayout(provider)
} catch (e) {
  console.warn('[storage] layout error:', String(e))
}

const TOKEN = process.env.DESKTOP_TOKEN ?? 'dev-token'
const PORT = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[desktop-nav] server listening on http://localhost:${info.port}`)
  console.log(`[desktop-nav] token: ${TOKEN}`)
  console.log(`[desktop-nav] storage: ${storageKind()}`)
  console.log(`[desktop-nav] public base: ${assetBase(`http://localhost:${info.port}`) ?? '(none)'}`)
  console.log(`[desktop-nav] public config: ${JSON.stringify(publicConfig())}`)
  if (existsSync(DIST)) console.log(`[desktop-nav] serving static from ${DIST}`)
})

export { app }
