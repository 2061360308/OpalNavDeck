import { githubConfigured, publicBaseUrl } from './config.ts'
import { hasSession, setSessionCookie } from './cookie.ts'
import { signState, verifyState } from './state.ts'
import type { AuthContext } from './context.ts'

function redirectUri(ctx: AuthContext): string {
  return `${publicBaseUrl(ctx.env)}/api/auth/github/callback`
}

export async function githubStart(c: any, ctx: AuthContext) {
  const { env } = ctx
  if (!githubConfigured(env)) return c.json({ error: 'github not configured' }, 400)
  const intent = c.req.query('intent') === 'bind' ? 'bind' : 'login'
  if (intent === 'bind' && !(await hasSession(c, env))) return c.json({ error: 'unauthorized' }, 401)
  const state = await signState(env, { provider: 'github', intent })
  const url =
    'https://github.com/login/oauth/authorize' +
    `?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID || '')}` +
    `&redirect_uri=${encodeURIComponent(redirectUri(ctx))}` +
    `&scope=${encodeURIComponent('read:user user:email')}` +
    `&allow_signup=false` +
    `&state=${encodeURIComponent(state)}`
  return c.redirect(url)
}

export async function githubCallback(c: any, ctx: AuthContext) {
  const { env, store } = ctx
  const code = c.req.query('code')
  const payload = await verifyState(env, c.req.query('state'))
  if (!payload || payload.provider !== 'github' || !code) return c.redirect('/?auth_error=state')

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(ctx),
    }),
  })
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string }
  const access = tokenJson.access_token
  if (!access) return c.redirect('/?auth_error=token')

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OpalNavDeck',
    },
  })
  const user = (await userRes.json().catch(() => ({}))) as { id?: number; login?: string; name?: string }
  if (!user.id) return c.redirect('/?auth_error=user')
  const subject = String(user.id)
  const display = user.login || user.name || subject

  if (payload.intent === 'login') {
    const ids = await store.getIdentities()
    if (ids.github?.subject !== subject) return c.redirect('/?auth_error=unbound')
    await setSessionCookie(c, env)
    return c.redirect('/')
  }

  await store.setBinding('github', { subject, display, boundAt: Date.now() })
  return c.redirect('/?bind=github')
}
