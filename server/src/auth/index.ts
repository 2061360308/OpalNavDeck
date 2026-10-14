import type { Hono } from 'hono'
import { alipayConfigured, authEnabled, authUsername, githubConfigured, publicBaseUrl, verifyLogin, hashPassword } from './config.ts'
import { clearSessionCookie, hasSession, setSessionCookie } from './cookie.ts'
import type { Provider } from './store.ts'
import { alipayCallback, alipayPoll, alipayQr } from './alipay.ts'
import { githubCallback, githubStart } from './github.ts'
import type { AuthContext } from './context.ts'

export { hashPassword }

function sameOrigin(c: any, env: AuthContext['env']): boolean {
  const base = publicBaseUrl(env)
  if (!base) return true
  const origin = c.req.header('Origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(base).origin
  } catch {
    return false
  }
}

export function registerAuth(app: Hono, ctx: AuthContext) {
  const { env, store } = ctx

  const providerState = async () => {
    const ids = await store.getIdentities()
    return {
      github: { configured: githubConfigured(env), bound: !!ids.github },
      alipay: { configured: alipayConfigured(env), bound: !!ids.alipay },
    }
  }

  app.get('/api/auth/config', async (c) => c.json({ enabled: authEnabled(env), providers: await providerState() }))

  app.get('/api/auth/me', async (c) => {
    if (!authEnabled(env)) return c.json({ enabled: false, authenticated: true })
    const authenticated = await hasSession(c, env)
    const providers = await providerState()
    if (!authenticated) return c.json({ enabled: true, authenticated: false, providers })
    return c.json({
      enabled: true,
      authenticated: true,
      username: authUsername(env),
      providers,
      bindings: await store.getIdentities(),
    })
  })

  app.post('/api/auth/login', async (c) => {
    if (!authEnabled(env)) return c.json({ ok: true })
    if (!sameOrigin(c, env)) return c.json({ error: 'bad origin' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string }
    if (!(await verifyLogin(env, String(body.username ?? ''), String(body.password ?? '')))) {
      return c.json({ error: 'invalid credentials' }, 401)
    }
    await setSessionCookie(c, env)
    return c.json({ ok: true })
  })

  app.post('/api/auth/logout', (c) => {
    clearSessionCookie(c, env)
    return c.json({ ok: true })
  })

  app.post('/api/auth/unbind', async (c) => {
    if (authEnabled(env) && !(await hasSession(c, env))) return c.json({ error: 'unauthorized' }, 401)
    if (!sameOrigin(c, env)) return c.json({ error: 'bad origin' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { provider?: string }
    const provider = body.provider as Provider
    if (provider !== 'github' && provider !== 'alipay') return c.json({ error: 'bad provider' }, 400)
    await store.removeBinding(provider)
    return c.json({ ok: true })
  })

  app.get('/api/auth/github/start', (c) => githubStart(c, ctx))
  app.get('/api/auth/github/callback', (c) => githubCallback(c, ctx))
  app.get('/api/auth/alipay/qr', (c) => alipayQr(c, ctx))
  app.get('/api/auth/alipay/qr/poll', (c) => alipayPoll(c, ctx))
  app.get('/api/auth/alipay/callback', (c) => alipayCallback(c, ctx))
}
