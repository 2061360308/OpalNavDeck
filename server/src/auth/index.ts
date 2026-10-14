import type { Hono } from 'hono'
import {
  alipayConfigured,
  authEnabled,
  authUsername,
  githubConfigured,
  publicBaseUrl,
  verifyLogin,
} from './config.ts'
import { clearSessionCookie, hasSession, setSessionCookie } from './cookie.ts'
import { readIdentities, removeBinding } from './identities.ts'
import type { Provider } from './identities.ts'
import { alipayCallback, alipayPoll, alipayQr } from './alipay.ts'
import { githubCallback, githubStart } from './github.ts'

function providerState() {
  const ids = readIdentities()
  return {
    github: { configured: githubConfigured(), bound: !!ids.github },
    alipay: { configured: alipayConfigured(), bound: !!ids.alipay },
  }
}

function sameOrigin(c: any): boolean {
  const base = publicBaseUrl()
  if (!base) return true
  const origin = c.req.header('Origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(base).origin
  } catch {
    return false
  }
}

export function registerAuth(app: Hono) {
  app.get('/api/auth/config', (c) => c.json({ enabled: authEnabled(), providers: providerState() }))

  app.get('/api/auth/me', (c) => {
    if (!authEnabled()) return c.json({ enabled: false, authenticated: true })
    const authenticated = hasSession(c)
    const providers = providerState()
    if (!authenticated) return c.json({ enabled: true, authenticated: false, providers })
    return c.json({
      enabled: true,
      authenticated: true,
      username: authUsername(),
      providers,
      bindings: readIdentities(),
    })
  })

  app.post('/api/auth/login', async (c) => {
    if (!authEnabled()) return c.json({ ok: true })
    if (!sameOrigin(c)) return c.json({ error: 'bad origin' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string }
    if (!verifyLogin(String(body.username ?? ''), String(body.password ?? ''))) {
      return c.json({ error: 'invalid credentials' }, 401)
    }
    setSessionCookie(c)
    return c.json({ ok: true })
  })

  app.post('/api/auth/logout', (c) => {
    clearSessionCookie(c)
    return c.json({ ok: true })
  })

  app.post('/api/auth/unbind', async (c) => {
    if (authEnabled() && !hasSession(c)) return c.json({ error: 'unauthorized' }, 401)
    if (!sameOrigin(c)) return c.json({ error: 'bad origin' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { provider?: string }
    const provider = body.provider as Provider
    if (provider !== 'github' && provider !== 'alipay') return c.json({ error: 'bad provider' }, 400)
    removeBinding(provider)
    return c.json({ ok: true })
  })

  app.get('/api/auth/github/start', githubStart)
  app.get('/api/auth/github/callback', githubCallback)
  app.get('/api/auth/alipay/qr', alipayQr)
  app.get('/api/auth/alipay/qr/poll', alipayPoll)
  app.get('/api/auth/alipay/callback', alipayCallback)
}
