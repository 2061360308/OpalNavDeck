import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
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
  if (storageKind(process.env) === 'object') {
    const { S3Provider } = await import('../storage/s3.ts')
    const bucket = process.env.S3_BUCKET
    if (!bucket) throw new Error('STORAGE=object requires S3_BUCKET')
    const common = {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'auto',
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
    }
    const priv = new S3Provider({ ...common, bucket, prefix: process.env.S3_PREFIX ?? '' })
    // PUBLIC_MODE=bucket -> code packages live in a separate public bucket
    if (process.env.PUBLIC_BUCKET) {
      const pub = new S3Provider({
        ...common,
        bucket: process.env.PUBLIC_BUCKET,
        prefix: process.env.PUBLIC_PREFIX ?? process.env.S3_PREFIX ?? '',
      })
      const { OverlayProvider } = await import('../storage/overlay.ts')
      return new OverlayProvider(priv, [
        { prefix: '/Rainmeter/Skins', provider: pub },
        { prefix: '/Rainmeter/Plugins', provider: pub },
      ])
    }
    return priv
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
  console.log(`[OpalNavDeck] server listening on http://localhost:${info.port}`)
  console.log(`[OpalNavDeck] token: ${TOKEN}`)
  console.log(`[OpalNavDeck] storage: ${storageKind(process.env)}`)
  console.log(`[OpalNavDeck] public base: ${assetBase(process.env, `http://localhost:${info.port}`) ?? '(none)'}`)
  console.log(`[OpalNavDeck] public config: ${JSON.stringify(publicConfig(process.env))}`)
  if (existsSync(DIST)) console.log(`[OpalNavDeck] serving static from ${DIST}`)
})

export { app }
