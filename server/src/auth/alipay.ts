import { createHash, createSign, randomBytes } from 'node:crypto'
import { alipayConfigured, publicBaseUrl } from './config.ts'
import { hasSession, setSessionCookie } from './cookie.ts'
import { setBinding } from './identities.ts'
import { signState, verifyState } from './state.ts'

interface Ticket {
  intent: 'login' | 'bind'
  pollKeyHash: string
  status: 'pending' | 'done' | 'error'
  subject?: string
  display?: string
  error?: string
  exp: number
}

const tickets = new Map<string, Ticket>()
const TICKET_TTL = 10 * 60 * 1000

function cfg() {
  return {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function pem(key: string): string {
  if (key.includes('BEGIN')) return key
  const body = key.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? key
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** sign + POST an Alipay OpenAPI (V2) request; RSA2, no SDK */
async function alipayExec(method: string, biz: Record<string, string>): Promise<any> {
  const c = cfg()
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
  const signer = createSign('RSA-SHA256')
  signer.update(content, 'utf8')
  const sign = signer.sign(pem(c.privateKey), 'base64')
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

async function exchange(authCode: string): Promise<{ subject?: string; display?: string; error?: string }> {
  const r = await alipayExec('alipay.system.oauth.token', {
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
    const info = await alipayExec('alipay.user.info.share', { auth_token: ok.access_token })
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

export function alipayQr(c: any) {
  if (!alipayConfigured()) return c.json({ error: 'alipay not configured' }, 400)
  const intent = c.req.query('intent') === 'bind' ? 'bind' : 'login'
  if (intent === 'bind' && !hasSession(c)) return c.json({ error: 'unauthorized' }, 401)
  const state = signState({ provider: 'alipay', intent })
  const pollKey = randomBytes(16).toString('hex')
  tickets.set(state, { intent, pollKeyHash: sha256(pollKey), status: 'pending', exp: Date.now() + TICKET_TTL })
  const redirect = `${publicBaseUrl()}/api/auth/alipay/callback`
  const authUrl =
    'https://openauth.alipay.com/oauth2/publicAppAuthorize.htm' +
    `?app_id=${encodeURIComponent(cfg().appId)}` +
    `&scope=auth_user` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&state=${encodeURIComponent(state)}`
  return c.json({ authUrl, state, pollKey })
}

export function alipayPoll(c: any) {
  const state = c.req.query('state') || ''
  const pollKey = c.req.query('pollKey') || ''
  const t = tickets.get(state)
  if (!t) return c.json({ status: 'expired' })
  if (sha256(pollKey) !== t.pollKeyHash) return c.json({ error: 'forbidden' }, 403)
  if (Date.now() > t.exp) {
    tickets.delete(state)
    return c.json({ status: 'expired' })
  }
  if (t.status === 'error') {
    const error = t.error
    tickets.delete(state)
    return c.json({ status: 'error', error })
  }
  if (t.status === 'done') {
    tickets.delete(state)
    if (t.intent === 'login') setSessionCookie(c)
    return c.json({ status: 'done' })
  }
  return c.json({ status: 'pending' })
}

export async function alipayCallback(c: any) {
  const state = c.req.query('state') || ''
  const t = tickets.get(state)
  const payload = verifyState(state)
  if (!payload || payload.provider !== 'alipay' || !t) return html(c, '授权失败：状态无效或已过期')
  if (c.req.query('error')) {
    t.status = 'error'
    t.error = String(c.req.query('error'))
    return html(c, '您取消了授权')
  }
  const code = c.req.query('auth_code')
  if (!code) {
    t.status = 'error'
    t.error = 'missing auth_code'
    return html(c, '缺少授权码，请重新扫码')
  }
  try {
    const r = await exchange(code)
    if (r.error || !r.subject) {
      t.status = 'error'
      t.error = r.error || 'no subject'
      return html(c, `换取令牌失败：${r.error ?? '未知错误'}`)
    }
    t.subject = r.subject
    t.display = r.display
    if (t.intent === 'bind') {
      setBinding('alipay', { subject: r.subject, display: r.display, boundAt: Date.now() })
    }
    t.status = 'done'
    return html(c, '授权成功，请返回电脑完成操作。')
  } catch (e) {
    t.status = 'error'
    t.error = String(e)
    return html(c, '发生错误，请返回重试')
  }
}
