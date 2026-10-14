import { createApp } from '../app.ts'
import { R2Provider } from '../storage/r2.ts'
import { OverlayProvider } from '../storage/overlay.ts'

/**
 * Cloudflare Workers entry (full app: API + static assets served by the
 * platform's `assets` binding). Object storage is R2:
 *   - private bucket  → data (state, icons, media, auth)
 *   - public bucket   → code packages (/Rainmeter/Skins, /Rainmeter/Plugins)
 * Presigned URLs are produced against R2's S3-compatible endpoint.
 */
interface Env {
  BUCKET: unknown
  PUBLIC_BUCKET?: unknown
  R2_ACCOUNT_ID?: string
  R2_ENDPOINT?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_BUCKET?: string
  R2_PUBLIC_BUCKET?: string
  S3_PREFIX?: string
  PUBLIC_PREFIX?: string
  [key: string]: unknown
}

export default {
  fetch(request: Request, env: Env, ctx: unknown): Response | Promise<Response> {
    const signOpts = {
      accountId: env.R2_ACCOUNT_ID,
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      region: 'auto',
    }

    const priv = new R2Provider(env.BUCKET as any, {
      ...signOpts,
      bucketName: env.R2_BUCKET || 'opalnavdeck',
      prefix: env.S3_PREFIX,
    })

    let provider = priv as import('../storage/provider.ts').StorageProvider
    if (env.PUBLIC_BUCKET) {
      const pub = new R2Provider(env.PUBLIC_BUCKET as any, {
        ...signOpts,
        bucketName: env.R2_PUBLIC_BUCKET || 'opalnavdeck-public',
        prefix: env.PUBLIC_PREFIX ?? env.S3_PREFIX,
      })
      provider = new OverlayProvider(priv, [
        { prefix: '/Rainmeter/Skins', provider: pub },
        { prefix: '/Rainmeter/Plugins', provider: pub },
      ])
    }

    const app = createApp({ provider, env: env as Record<string, string | undefined> })
    return app.fetch(request, env as any, ctx as any)
  },
}
