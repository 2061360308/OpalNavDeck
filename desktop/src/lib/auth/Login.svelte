<script lang="ts">
  import { onDestroy } from 'svelte'
  import { auth } from './session.svelte'
  import { AUTH_URLS } from '@desktop/shared'

  let username = $state('')
  let password = $state('')
  let busy = $state(false)

  let qr = $state('')
  let qrState = $state('')
  let qrPollKey = $state('')
  let qrError = $state('')
  let timer: ReturnType<typeof setInterval> | undefined

  // GitHub device flow
  let ghCode = $state('')
  let ghVerifyUri = $state('https://github.com/login/device')
  let ghState = $state('')
  let ghPollKey = $state('')
  let ghError = $state('')
  let ghBusy = $state(false)
  let ghTimer: ReturnType<typeof setTimeout> | undefined

  const urlError = new URLSearchParams(location.search).get('auth_error')
  const notice = $state(
    urlError === 'unbound'
      ? '该账号尚未绑定，请先用密码登录后在「账号与安全」中绑定。'
      : urlError
        ? '第三方登录失败，请重试。'
        : ''
  )

  function stopPoll() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (busy) return
    busy = true
    await auth.login(username.trim(), password)
    busy = false
  }

  function githubLogin() {
    if (auth.providers.github.mode === 'web') {
      location.href = AUTH_URLS.githubStart('login')
    } else {
      void startGithubDevice('login')
    }
  }

  function stopGh() {
    if (ghTimer) clearTimeout(ghTimer)
    ghTimer = undefined
  }

  async function startGithubDevice(intent: 'login' | 'bind') {
    ghError = ''
    stopGh()
    ghBusy = true
    try {
      const res = await fetch(AUTH_URLS.githubDeviceStart(intent))
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
    } finally {
      ghBusy = false
    }
  }

  function scheduleGhPoll(sec: number) {
    stopGh()
    ghTimer = setTimeout(() => void ghPoll(), sec * 1000)
  }

  async function ghPoll() {
    try {
      const res = await fetch(AUTH_URLS.githubDevicePoll(ghState, ghPollKey))
      const d = (await res.json()) as { status: string; error?: string; interval?: number }
      if (d.status === 'done') {
        stopGh()
        await auth.init()
      } else if (d.status === 'pending') {
        scheduleGhPoll(Math.max(2, d.interval || 5))
      } else if (d.status === 'expired') {
        stopGh()
        ghCode = ''
        ghError = '验证码已过期，请重试'
      } else {
        stopGh()
        ghCode = ''
        ghError = d.error === 'unbound' ? '该账号尚未绑定，请先用密码登录后绑定' : d.error || '授权失败'
      }
    } catch {
      scheduleGhPoll(5)
    }
  }

  async function alipayLogin() {
    qrError = ''
    stopPoll()
    try {
      const res = await fetch('/api/auth/alipay/qr?intent=login')
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
      timer = setInterval(poll, 1500)
    } catch (e) {
      qrError = String(e)
    }
  }

  async function poll() {
    try {
      const res = await fetch(
        `/api/auth/alipay/qr/poll?state=${encodeURIComponent(qrState)}&pollKey=${encodeURIComponent(qrPollKey)}`
      )
      const d = (await res.json()) as { status: string; error?: string }
      if (d.status === 'done') {
        stopPoll()
        await auth.init()
      } else if (d.status === 'expired' || d.status === 'error') {
        stopPoll()
        qrError = d.status === 'expired' ? '二维码已过期，请重试' : d.error || '授权失败'
      }
    } catch {
      /* keep polling */
    }
  }

  onDestroy(() => {
    stopPoll()
    stopGh()
  })
</script>

<div class="login">
  <div class="card">
    <div class="brand">桌面登录</div>

    <form onsubmit={submit}>
      <label class="fld">
        <span>用户名</span>
        <input bind:value={username} autocomplete="username" />
      </label>
      <label class="fld">
        <span>密码</span>
        <input type="password" bind:value={password} autocomplete="current-password" />
      </label>
      {#if auth.error}<div class="err">{auth.error}</div>{/if}
      <button class="primary" type="submit" disabled={busy || !username || !password}>
        {busy ? '登录中…' : '登录'}
      </button>
    </form>

    {#if notice}<div class="notice">{notice}</div>{/if}

    {#if auth.providers.github.bound || auth.providers.alipay.bound}
      <div class="sep"><span>其他登录方式</span></div>
      <div class="providers">
        {#if auth.providers.github.bound}
          <button class="oauth" onclick={githubLogin}>
            <span>GitHub 登录</span>
          </button>
        {/if}
        {#if auth.providers.alipay.bound}
          <button class="oauth" onclick={alipayLogin}>支付宝扫码登录</button>
        {/if}
      </div>
    {/if}

    {#if qr || qrError}
      <div class="qrdlg">
        {#if qrError}
          <div class="err">{qrError}</div>
        {:else}
          <img src={qr} alt="支付宝登录二维码" />
          <div class="hint">请用支付宝扫码并确认授权</div>
        {/if}
      </div>
    {/if}

    {#if ghCode || ghError}
      <div class="qrdlg">
        {#if ghError}
          <div class="err">{ghError}</div>
        {:else}
          <div class="devcode">{ghCode}</div>
          <div class="hint">
            在
            <a href={ghVerifyUri} target="_blank" rel="noopener noreferrer">GitHub 设备授权页</a>
            输入上面的代码以完成登录
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .login {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: grid;
    place-items: center;
    background:
      radial-gradient(1200px 600px at 50% -10%, rgba(79, 140, 255, 0.18), transparent),
      var(--dt-bg, #0a0d14);
    color: var(--dt-fg, #e8ecf4);
  }
  .card {
    width: 340px;
    padding: 26px 24px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(20, 24, 32, 0.9);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
  }
  .brand {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 18px;
    text-align: center;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .fld {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: #9aa4b5;
  }
  .fld input {
    height: 36px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-size: 14px;
  }
  .fld input:focus {
    outline: 1px solid #4f8cff;
    border-color: #4f8cff;
  }
  .primary {
    height: 38px;
    margin-top: 4px;
    border: none;
    border-radius: 8px;
    background: #4f8cff;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .err {
    color: #ff8080;
    font-size: 12px;
  }
  .notice {
    margin-top: 12px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255, 180, 0, 0.12);
    color: #ffce7a;
    font-size: 12px;
  }
  .sep {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 0 12px;
    color: #6b7688;
    font-size: 11px;
  }
  .sep::before,
  .sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }
  .providers {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .oauth {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 36px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #e8ecf4;
    font-size: 13px;
    cursor: pointer;
  }
  .oauth:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .qrdlg {
    margin-top: 16px;
    text-align: center;
  }
  .qrdlg img {
    width: 200px;
    height: 200px;
    border-radius: 10px;
    background: #fff;
    padding: 6px;
  }
  .hint {
    margin-top: 8px;
    color: #9aa4b5;
    font-size: 12px;
  }
  .devcode {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 26px;
    letter-spacing: 4px;
    font-weight: 700;
    color: #fff;
    padding: 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
  }
  .hint a {
    color: #6ea8ff;
  }
</style>
