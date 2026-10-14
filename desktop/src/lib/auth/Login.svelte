<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    GalleryVerticalEnd,
    Wallet,
    Copy,
    Check,
    ExternalLink,
    ArrowLeft,
  } from '@lucide/svelte'
  import { auth } from './session.svelte'
  import { AUTH_URLS } from '@desktop/shared'
  import DesktopOverlay from '../desktop/DesktopOverlay.svelte'
  import WallpaperHost from '../desktop/WallpaperHost.svelte'

  type View = 'form' | 'github' | 'alipay'

  let view = $state<View>('form')

  let username = $state('')
  let password = $state('')
  let busy = $state(false)

  // GitHub device flow
  let ghCode = $state('')
  let ghVerifyUri = $state('https://github.com/login/device')
  let ghState = $state('')
  let ghPollKey = $state('')
  let ghError = $state('')
  let ghCopied = $state(false)
  let ghTimer: ReturnType<typeof setTimeout> | undefined

  // Alipay QR
  let qr = $state('')
  let qrState = $state('')
  let qrPollKey = $state('')
  let qrError = $state('')
  let timer: ReturnType<typeof setInterval> | undefined

  const urlError = new URLSearchParams(location.search).get('auth_error')
  const notice = $state(
    urlError === 'unbound'
      ? '该账号尚未绑定，请先用密码登录后在「账号与安全」中绑定。'
      : urlError
        ? '第三方登录失败，请重试。'
        : ''
  )

  const githubBound = $derived(auth.providers.github.bound)
  const alipayBound = $derived(auth.providers.alipay.bound)
  const hasProviders = $derived(githubBound || alipayBound)

  function stopTimers() {
    if (timer) clearInterval(timer)
    timer = undefined
    if (ghTimer) clearTimeout(ghTimer)
    ghTimer = undefined
  }

  function backToForm() {
    stopTimers()
    view = 'form'
    ghCode = ''
    ghError = ''
    qr = ''
    qrError = ''
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (busy) return
    busy = true
    await auth.login(username.trim(), password)
    busy = false
  }

  /* ---- GitHub: web = plain redirect; device = switch to code view ---- */
  function onGithub() {
    if (auth.providers.github.mode === 'web') {
      location.href = AUTH_URLS.githubStart('login')
      return
    }
    void startGithubDevice()
  }

  async function startGithubDevice() {
    stopTimers()
    view = 'github'
    ghError = ''
    ghCopied = false
    try {
      const res = await fetch(AUTH_URLS.githubDeviceStart('login'))
      if (!res.ok) {
        ghError = 'GitHub 登录暂不可用'
        return
      }
      const d = (await res.json()) as {
        state: string
        pollKey: string
        userCode: string
        verificationUri: string
        interval: number
      }
      ghState = d.state
      ghPollKey = d.pollKey
      ghCode = d.userCode
      ghVerifyUri = d.verificationUri
      scheduleGhPoll(Math.max(2, d.interval || 5))
    } catch (e) {
      ghError = String(e)
    }
  }

  function scheduleGhPoll(sec: number) {
    if (ghTimer) clearTimeout(ghTimer)
    ghTimer = setTimeout(() => void ghPoll(), sec * 1000)
  }

  async function ghPoll() {
    try {
      const res = await fetch(AUTH_URLS.githubDevicePoll(ghState, ghPollKey))
      const d = (await res.json()) as { status: string; error?: string; interval?: number }
      if (d.status === 'done') {
        stopTimers()
        await auth.init()
      } else if (d.status === 'pending') {
        scheduleGhPoll(Math.max(2, d.interval || 5))
      } else {
        stopTimers()
        ghError = d.status === 'expired' ? '验证码已过期，请返回重试' : d.error || '授权失败'
      }
    } catch {
      scheduleGhPoll(5)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(ghCode)
      ghCopied = true
      setTimeout(() => (ghCopied = false), 1500)
    } catch {
      /* ignore */
    }
  }

  /* ---- Alipay QR ---- */
  async function onAlipay() {
    stopTimers()
    view = 'alipay'
    qrError = ''
    try {
      const res = await fetch(AUTH_URLS.alipayQr('login'))
      if (!res.ok) {
        qrError = '支付宝登录不可用'
        return
      }
      const d = (await res.json()) as { authUrl: string; state: string; pollKey: string }
      qrState = d.state
      qrPollKey = d.pollKey
      const mod = (await import('qrcode')) as any
      const QRCode = mod.default ?? mod
      qr = await QRCode.toDataURL(d.authUrl, { width: 200, margin: 1 })
      timer = setInterval(pollAlipay, 1500)
    } catch (e) {
      qrError = String(e)
    }
  }

  async function pollAlipay() {
    try {
      const res = await fetch(AUTH_URLS.alipayPoll(qrState, qrPollKey))
      const d = (await res.json()) as { status: string; error?: string }
      if (d.status === 'done') {
        stopTimers()
        await auth.init()
      } else if (d.status === 'expired' || d.status === 'error') {
        stopTimers()
        qrError = d.status === 'expired' ? '二维码已过期，请返回重试' : d.error || '授权失败'
      }
    } catch {
      /* keep polling */
    }
  }

  onDestroy(stopTimers)
</script>

<div class="login">
  <WallpaperHost caption={false} />
  <DesktopOverlay full />
  <div class="wrap">
    <div class="brand">
      <span class="logo"><GalleryVerticalEnd size={16} /></span>
      <span>OpalNavDeck</span>
    </div>

    <div class="card">
      <div class="card-header">
        {#if view === 'form'}
          <div class="card-title">欢迎回来</div>
          {#if hasProviders}<div class="card-desc">使用 GitHub 或支付宝登录</div>{/if}
        {:else if view === 'github'}
          <div class="card-title">使用 GitHub 登录</div>
          <div class="card-desc">在 GitHub 输入下面的代码以完成登录</div>
        {:else}
          <div class="card-title">使用支付宝登录</div>
          <div class="card-desc">请用支付宝扫码并确认授权</div>
        {/if}
      </div>

      <div class="card-content">
        {#if view === 'form'}
          <form onsubmit={submit}>
            <div class="field-group">
              {#if hasProviders}
                <div class="field">
                  {#if githubBound}
                    <button class="btn outline" type="button" onclick={onGithub}>
                      <svg class="gh" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.417-1.282.76-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.298-.54-1.497.105-3.121 0 0 1.005-.316 3.3 1.209a11.5 11.5 0 0 1 3-.398c1.02.006 2.04.136 3 .398 2.28-1.525 3.285-1.209 3.285-1.209.645 1.624.24 2.823.12 3.121.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.17 0 1.567-.015 2.832-.015 3.217 0 .315.21.69.825.567A12.01 12.01 0 0 0 24 12.292C24 5.78 18.63.5 12 .5z"
                        />
                      </svg>
                      使用 GitHub 登录
                    </button>
                  {/if}
                  {#if alipayBound}
                    <button class="btn outline" type="button" onclick={onAlipay}>
                      <Wallet size={16} />
                      使用支付宝登录
                    </button>
                  {/if}
                </div>
                <div class="separator"><span>或继续使用</span></div>
              {/if}

              <div class="field">
                <label class="label" for="username">用户名</label>
                <input class="input" id="username" bind:value={username} autocomplete="username" />
              </div>

              <div class="field">
                <div class="label-row">
                  <label class="label" for="password">密码</label>
                </div>
                <input
                  class="input"
                  id="password"
                  type="password"
                  bind:value={password}
                  autocomplete="current-password"
                />
              </div>

              <div class="field">
                <button class="btn default" type="submit" disabled={busy || !username || !password}>
                  {busy ? '登录中…' : '登录'}
                </button>
              </div>
            </div>
          </form>
          {#if auth.error}<div class="desc error">{auth.error}</div>{/if}
          {#if notice}<div class="desc notice">{notice}</div>{/if}
        {:else if view === 'github'}
          <div class="field-group">
            {#if ghError}
              <div class="desc error">{ghError}</div>
              <div class="field">
                <button class="btn outline" type="button" onclick={backToForm}>
                  <ArrowLeft size={16} /> 返回
                </button>
              </div>
            {:else}
              <div class="codebox">
                <span class="code">{ghCode || '········'}</span>
                <button class="iconbtn" type="button" onclick={copyCode} title="复制" aria-label="复制">
                  {#if ghCopied}<Check size={16} />{:else}<Copy size={16} />{/if}
                </button>
              </div>
              <div class="field">
                <a class="btn default" href={ghVerifyUri} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} /> 打开 GitHub 授权页
                </a>
              </div>
              <div class="field">
                <button class="btn outline" type="button" onclick={backToForm}>
                  <ArrowLeft size={16} /> 返回
                </button>
              </div>
              <div class="desc">页面会自动检测授权状态，完成后即进入桌面。</div>
            {/if}
          </div>
        {:else}
          <div class="field-group">
            {#if qrError}
              <div class="desc error">{qrError}</div>
            {:else if qr}
              <div class="qr"><img src={qr} alt="支付宝登录二维码" /></div>
            {/if}
            <div class="field">
              <button class="btn outline" type="button" onclick={backToForm}>
                <ArrowLeft size={16} /> 返回
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .login {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 24px;
    background: transparent;
    color: #09090b;
  }
  .wrap {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    width: 100%;
    max-width: 384px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    align-self: center;
    font-weight: 500;
    font-size: 14px;
    color: inherit;
    text-decoration: none;
  }
  .logo {
    display: flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: #18181b;
    color: #fafafa;
  }

  .card {
    border: 1px solid #e4e4e7;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  .card-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 24px;
    text-align: center;
  }
  .card-title {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
  }
  .card-desc {
    color: #71717a;
    font-size: 14px;
  }
  .card-content {
    padding: 0 24px 24px;
  }

  .field-group {
    display: grid;
    gap: 24px;
  }
  .field {
    display: grid;
    gap: 8px;
  }
  .label {
    font-size: 14px;
    font-weight: 500;
  }
  .label-row {
    display: flex;
    align-items: center;
  }
  .input {
    height: 36px;
    padding: 0 12px;
    border: 1px solid #e4e4e7;
    border-radius: 6px;
    background: #fff;
    color: #09090b;
    font-size: 14px;
  }
  .input::placeholder {
    color: #a1a1aa;
  }
  .input:focus {
    outline: none;
    border-color: #a1a1aa;
    box-shadow: 0 0 0 3px rgba(24, 24, 27, 0.08);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 36px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
  }
  .btn.default {
    background: #18181b;
    color: #fafafa;
  }
  .btn.default:hover {
    background: #27272a;
  }
  .btn.default:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.outline {
    border-color: #e4e4e7;
    background: #fff;
  }
  .btn.outline:hover {
    background: #f4f4f5;
  }

  .separator {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    font-size: 14px;
    color: #71717a;
  }
  .separator::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: 1px solid #e4e4e7;
  }
  .separator span {
    position: relative;
    padding: 0 8px;
    background: #fff;
  }

  .codebox {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid #e4e4e7;
    border-radius: 8px;
    background: #f4f4f5;
  }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 26px;
    letter-spacing: 4px;
    font-weight: 700;
  }
  .iconbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid #e4e4e7;
    border-radius: 6px;
    background: #fff;
    color: #3f3f46;
    cursor: pointer;
  }
  .iconbtn:hover {
    background: #fafafa;
  }

  .qr {
    display: flex;
    justify-content: center;
  }
  .qr img {
    width: 200px;
    height: 200px;
    padding: 6px;
    border: 1px solid #e4e4e7;
    border-radius: 8px;
    background: #fff;
  }

  .desc {
    color: #71717a;
    font-size: 14px;
    text-align: center;
  }
  .desc.error {
    color: #dc2626;
  }
  .desc.notice {
    color: #854d0e;
  }

  @media (max-width: 640px) {
    .login {
      padding: 16px;
    }
  }
</style>
