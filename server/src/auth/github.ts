import { githubClientId, githubMode, publicBaseUrl } from './config.ts'
import { hasSession, setSessionCookie } from './cookie.ts'
import { randomHex, sha256Hex } from './crypto.ts'
import { signState, verifyState } from './state.ts'
import type { AuthContext } from './context.ts'

const SCOPE = 'read:user user:email'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

function redirectUri(ctx: AuthContext): string {
  return `${publicBaseUrl(ctx.env)}/api/auth/github/callback`
}

async function fetchGithubUser(access: string): Promise<{ subject: string; display: string } | null> {
  const res = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${access}`, Accept: 'application/vnd.github+json', 'User-Agent': 'OpalNavDeck' },
  })
  const user = (await res.json().catch(() => ({}))) as { id?: number; login?: string; name?: string }
  if (!user.id) return null
  const subject = String(user.id)
  return { subject, display: user.login || user.name || subject }
}

/* -------------------- web (redirect) flow: custom client_id + secret -------------------- */

export async function githubStart(c: any, ctx: AuthContext) {
  const { env } = ctx
  if (githubMode(env) !== 'web') return c.json({ error: 'github web flow not enabled' }, 400)
  const intent = c.req.query('intent') === 'bind' ? 'bind' : 'login'
  if (intent === 'bind' && !(await hasSession(c, env))) return c.json({ error: 'unauthorized' }, 401)
  const state = await signState(env, { provider: 'github', intent })
  const url =
    'https://github.com/login/oauth/authorize' +
    `?client_id=${encodeURIComponent(githubClientId(env))}` +
    `&redirect_uri=${encodeURIComponent(redirectUri(ctx))}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&allow_signup=false` +
    `&state=${encodeURIComponent(state)}`
  return c.redirect(url)
}

export async function githubCallback(c: any, ctx: AuthContext) {
  const { env, store } = ctx
  const code = c.req.query('code')
  const payload = await verifyState(env, c.req.query('state'))
  if (!payload || payload.provider !== 'github' || !code) return c.redirect('/?auth_error=state')

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: githubClientId(env),
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(ctx),
    }),
  })
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string }
  if (!tokenJson.access_token) return c.redirect('/?auth_error=token')
  const me = await fetchGithubUser(tokenJson.access_token)
  if (!me) return c.redirect('/?auth_error=user')

  if (payload.intent === 'login') {
    const ids = await store.getIdentities()
    if (ids.github?.subject !== me.subject) return c.redirect('/?auth_error=unbound')
    await setSessionCookie(c, env)
    return c.redirect('/')
  }

  await store.setBinding('github', { subject: me.subject, display: me.display, boundAt: Date.now() })
  return c.redirect('/?bind=github')
}

/* -------------------- device flow: built-in public client_id (no secret) -------------------- */

export async function githubDeviceStart(c: any, ctx: AuthContext) {
  const { env, store } = ctx
  const intent = c.req.query('intent') === 'bind' ? 'bind' : 'login'
  if (intent === 'bind' && !(await hasSession(c, env))) return c.json({ error: 'unauthorized' }, 401)

  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: githubClientId(env), scope: SCOPE }),
  })
  const d = (await res.json().catch(() => ({}))) as {
    device_code?: string
    user_code?: string
    verification_uri?: string
    expires_in?: number
    interval?: number
    error?: string
    error_description?: string
  }
  if (!d.device_code || !d.user_code) {
    return c.json({ error: 'device code request failed', detail: d.error_description || d.error || null }, 502)
  }

  const state = await signState(env, { provider: 'github', intent })
  const pollKey = randomHex(16)
  const expiresIn = Number(d.expires_in) || 900
  await store.putTicket(state, {
    intent,
    pollKeyHash: await sha256Hex(pollKey),
    status: 'pending',
    exp: Date.now() + Math.min(expiresIn, 15 * 60) * 1000,
    deviceCode: String(d.device_code),
    interval: Number(d.interval) || 5,
  })
  return c.json({
    state,
    pollKey,
    userCode: String(d.user_code),
    verificationUri: String(d.verification_uri || 'https://github.com/login/device'),
    interval: Number(d.interval) || 5,
    expiresIn,
  })
}

export async function githubDevicePoll(c: any, ctx: AuthContext) {
  const { env, store } = ctx
  const state = c.req.query('state') || ''
  const pollKey = c.req.query('pollKey') || ''
  const t = await store.getTicket(state)
  if (!t || !t.deviceCode) return c.json({ status: 'expired' })
  if ((await sha256Hex(pollKey)) !== t.pollKeyHash) return c.json({ error: 'forbidden' }, 403)

  if (t.status === 'done') {
    await store.delTicket(state)
    if (t.intent === 'login') await setSessionCookie(c, env)
    return c.json({ status: 'done' })
  }
  if (t.status === 'error') {
    const error = t.error
    await store.delTicket(state)
    return c.json({ status: 'error', error })
  }
  if (Date.now() > t.exp) {
    await store.delTicket(state)
    return c.json({ status: 'expired' })
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: githubClientId(env),
      device_code: t.deviceCode,
      grant_type: DEVICE_GRANT,
    }),
  })
  const d = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; interval?: number }
  const access = d.access_token
  if (!access) {
    const err = String(d.error || '')
    if (err === 'authorization_pending') return c.json({ status: 'pending', interval: t.interval || 5 })
    if (err === 'slow_down') {
      t.interval = (t.interval || 5) + 5
      await store.putTicket(state, t)
      return c.json({ status: 'pending', interval: t.interval })
    }
    t.status = 'error'
    t.error = err || 'authorization failed'
    await store.putTicket(state, t)
    return c.json({ status: 'error', error: t.error })
  }

  const me = await fetchGithubUser(access)
  if (!me) {
    t.status = 'error'
    t.error = 'user fetch failed'
    await store.putTicket(state, t)
    return c.json({ status: 'error', error: t.error })
  }

  if (t.intent === 'bind') {
    await store.setBinding('github', { subject: me.subject, display: me.display, boundAt: Date.now() })
    await store.delTicket(state)
    return c.json({ status: 'done' })
  }

  const ids = await store.getIdentities()
  if (ids.github?.subject !== me.subject) {
    await store.delTicket(state)
    return c.json({ status: 'error', error: 'unbound' })
  }
  await store.delTicket(state)
  await setSessionCookie(c, env)
  return c.json({ status: 'done' })
}
