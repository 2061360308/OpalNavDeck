import { alipayConfigured, publicBaseUrl, type Env } from './config.ts'
import { hasSession, setSessionCookie } from './cookie.ts'
import { randomHex, rsaSignSha256, sha256Hex } from './crypto.ts'
import { signState, verifyState } from './state.ts'
import type { AuthStore } from './store.ts'
import type { AuthContext } from './context.ts'

const TICKET_TTL = 10 * 60 * 1000

function cfg(env: Env) {
  return {
    appId: env.ALIPAY_APP_ID || '',
    privateKey: env.ALIPAY_PRIVATE_KEY || '',
    gateway: env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  }
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** sign + POST an Alipay OpenAPI (V2) request; RSA2 via WebCrypto (no node:crypto) */
async function alipayExec(env: Env, method: string, biz: Record<string, string>): Promise<any> {
  const c = cfg(env)
  const params: Record<string, string> = {
    app_id: c.appId,
    method,
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: timestamp(),
    version: '1.0',
    ...biz,
  }
  const content = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const sign = await rsaSignSha256(c.privateKey, content)
  const body = new URLSearchParams({ ...params, sign }).toString()
  const res = await fetch(c.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function exchange(
  env: Env,
  authCode: string
): Promise<{ subject?: string; display?: string; error?: string }> {
  const r = await alipayExec(env, 'alipay.system.oauth.token', {
    grant_type: 'authorization_code',
    code: authCode,
  })
  const ok = r?.alipay_system_oauth_token_response
  if (!ok) {
    const e = r?.error_response
    return { error: e?.sub_msg || e?.msg || 'token exchange failed' }
  }
  const subject: string | undefined = ok.open_id || ok.user_id
  let display: string | undefined
  if (ok.access_token) {
    const info = await alipayExec(env, 'alipay.user.info.share', { auth_token: ok.access_token })
    const ui = info?.alipay_user_info_share_response
    display = ui?.nick_name || ui?.user_name
  }
  return { subject, display }
}

function html(c: any, message: string) {
  return c.html(
    `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>支付宝授权</title></head>` +
      `<body style="font-family:system-ui,sans-serif;padding:48px;text-align:center;color:#222">` +
      `<p style="font-size:16px">${message}</p></body></html>`
  )
}

export async function alipayQr(c: any, ctx: AuthContext) {
  const { env, store } = ctx
  if (!alipayConfigured(env)) return c.json({ error: 'alipay not configured' }, 400)
  const intent = c.req.query('intent') === 'bind' ? 'bind' : 'login'
  if (intent === 'bind' && !(await hasSession(c, env))) return c.json({ error: 'unauthorized' }, 401)
  const state = await signState(env, { provider: 'alipay', intent })
  const pollKey = randomHex(16)
  await store.putTicket(state, {
    intent,
    pollKeyHash: await sha256Hex(pollKey),
    status: 'pending',
    exp: Date.now() + TICKET_TTL,
  })
  const redirect = `${publicBaseUrl(env)}/api/auth/alipay/callback`
  const authUrl =
    'https://openauth.alipay.com/oauth2/publicAppAuthorize.htm' +
    `?app_id=${encodeURIComponent(cfg(env).appId)}` +
    `&scope=auth_user` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&state=${encodeURIComponent(state)}`
  return c.json({ authUrl, state, pollKey })
}

export async function alipayPoll(c: any, ctx: AuthContext) {
  const { env, store } = ctx
  const state = c.req.query('state') || ''
  const pollKey = c.req.query('pollKey') || ''
  const t = await store.getTicket(state)
  if (!t) return c.json({ status: 'expired' })
  if ((await sha256Hex(pollKey)) !== t.pollKeyHash) return c.json({ error: 'forbidden' }, 403)
  if (Date.now() > t.exp) {
    await store.delTicket(state)
    return c.json({ status: 'expired' })
  }
  if (t.status === 'error') {
    const error = t.error
    await store.delTicket(state)
    return c.json({ status: 'error', error })
  }
  if (t.status === 'done') {
    await store.delTicket(state)
    if (t.intent === 'login') await setSessionCookie(c, env)
    return c.json({ status: 'done' })
  }
  return c.json({ status: 'pending' })
}

export async function alipayCallback(c: any, ctx: AuthContext) {
  const { env, store } = ctx
  const state = c.req.query('state') || ''
  const payload = await verifyState(env, state)
  const t = await store.getTicket(state)
  if (!payload || payload.provider !== 'alipay' || !t) return html(c, '授权失败：状态无效或已过期')
  if (c.req.query('error')) {
    t.status = 'error'
    t.error = String(c.req.query('error'))
    await store.putTicket(state, t)
    return html(c, '您取消了授权')
  }
  const code = c.req.query('auth_code')
  if (!code) {
    t.status = 'error'
    t.error = 'missing auth_code'
    await store.putTicket(state, t)
    return html(c, '缺少授权码，请重新扫码')
  }
  try {
    const r = await exchange(env, code)
    if (r.error || !r.subject) {
      t.status = 'error'
      t.error = r.error || 'no subject'
      await store.putTicket(state, t)
      return html(c, `换取令牌失败：${r.error ?? '未知错误'}`)
    }
    t.subject = r.subject
    t.display = r.display
    if (t.intent === 'bind') {
      await store.setBinding('alipay', { subject: r.subject, display: r.display, boundAt: Date.now() })
    }
    t.status = 'done'
    await store.putTicket(state, t)
    return html(c, '授权成功，请返回电脑完成操作。')
  } catch (e) {
    t.status = 'error'
    t.error = String(e)
    await store.putTicket(state, t)
    return html(c, '发生错误，请返回重试')
  }
}
