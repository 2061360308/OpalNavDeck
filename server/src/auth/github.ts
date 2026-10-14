import { githubConfigured, publicBaseUrl } from './config.ts'
import { hasSession, setSessionCookie } from './cookie.ts'
import { readIdentities, setBinding } from './identities.ts'
import { signState, verifyState } from './state.ts'

function cfg() {
  return {
    id: process.env.GITHUB_CLIENT_ID || '',
    secret: process.env.GITHUB_CLIENT_SECRET || '',
  }
}

function redirectUri(): string {
  return `${publicBaseUrl()}/api/auth/github/callback`
}

export function githubStart(c: any) {
  if (!githubConfigured()) return c.json({ error: 'github not configured' }, 400)
  const intent = c.req.query('intent') === 'bind' ? 'bind' : 'login'
  if (intent === 'bind' && !hasSession(c)) return c.json({ error: 'unauthorized' }, 401)
  const state = signState({ provider: 'github', intent })
  const url =
    'https://github.com/login/oauth/authorize' +
    `?client_id=${encodeURIComponent(cfg().id)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri())}` +
    `&scope=${encodeURIComponent('read:user user:email')}` +
    `&allow_signup=false` +
    `&state=${encodeURIComponent(state)}`
  return c.redirect(url)
}

export async function githubCallback(c: any) {
  const code = c.req.query('code')
  const payload = verifyState(c.req.query('state'))
  if (!payload || payload.provider !== 'github' || !code) return c.redirect('/?auth_error=state')

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: cfg().id, client_secret: cfg().secret, code, redirect_uri: redirectUri() }),
  })
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string }
  const access = tokenJson.access_token
  if (!access) return c.redirect('/?auth_error=token')

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'desktop-nav',
    },
  })
  const user = (await userRes.json().catch(() => ({}))) as { id?: number; login?: string; name?: string }
  if (!user.id) return c.redirect('/?auth_error=user')
  const subject = String(user.id)
  const display = user.login || user.name || subject

  if (payload.intent === 'login') {
    const ids = readIdentities()
    if (ids.github?.subject !== subject) return c.redirect('/?auth_error=unbound')
    setSessionCookie(c)
    return c.redirect('/')
  }

  setBinding('github', { subject, display, boundAt: Date.now() })
  return c.redirect('/?bind=github')
}
