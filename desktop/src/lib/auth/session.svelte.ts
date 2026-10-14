import { setAuthMode } from '../persist/api'

export interface ProviderInfo {
  configured: boolean
  bound: boolean
}

export interface AuthProviders {
  github: ProviderInfo
  alipay: ProviderInfo
}

export type Binding = { subject: string; display?: string; boundAt: number }

interface MeResponse {
  enabled?: boolean
  authenticated?: boolean
  username?: string
  providers?: AuthProviders
  bindings?: Partial<Record<'github' | 'alipay', Binding>>
}

class Auth {
  ready = $state(false)
  enabled = $state(false)
  authenticated = $state(true)
  username = $state('')
  providers = $state<AuthProviders>({
    github: { configured: false, bound: false },
    alipay: { configured: false, bound: false },
  })
  bindings = $state<Partial<Record<'github' | 'alipay', Binding>>>({})
  error = $state('')

  async init(): Promise<void> {
    try {
      const res = await fetch('/api/auth/me', { headers: {} })
      const d = (await res.json()) as MeResponse
      this.enabled = !!d.enabled
      this.authenticated = d.enabled ? !!d.authenticated : true
      this.username = d.username ?? ''
      if (d.providers) this.providers = d.providers
      this.bindings = d.bindings ?? {}
    } catch {
      this.enabled = false
      this.authenticated = true
    }
    setAuthMode(this.enabled)
    this.ready = true
  }

  async login(username: string, password: string): Promise<boolean> {
    this.error = ''
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      this.error = res.status === 401 ? '用户名或密码错误' : '登录失败'
      return false
    }
    await this.init()
    return this.authenticated
  }

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' })
    this.authenticated = false
    location.reload()
  }

  async unbind(provider: 'github' | 'alipay'): Promise<void> {
    await fetch('/api/auth/unbind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    })
    await this.init()
  }
}

export const auth = new Auth()
