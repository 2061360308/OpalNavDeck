<script lang="ts">
  import { onDestroy } from 'svelte'
  import { auth } from '../../auth/session.svelte'

  let qr = $state('')
  let qrState = $state('')
  let qrPollKey = $state('')
  let qrError = $state('')
  let timer: ReturnType<typeof setInterval> | undefined

  function stopPoll() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  function bindGithub() {
    location.href = '/api/auth/github/start?intent=bind'
  }

  async function bindAlipay() {
    qrError = ''
    stopPoll()
    const res = await fetch('/api/auth/alipay/qr?intent=bind')
    if (!res.ok) {
      qrError = '支付宝绑定不可用'
      return
    }
    const d = (await res.json()) as { authUrl: string; state: string; pollKey: string }
    qrState = d.state
    qrPollKey = d.pollKey
    const mod = (await import('qrcode')) as any
    const QRCode = mod.default ?? mod
    qr = await QRCode.toDataURL(d.authUrl, { width: 180, margin: 1 })
    timer = setInterval(poll, 1500)
  }

  async function poll() {
    try {
      const res = await fetch(
        `/api/auth/alipay/qr/poll?state=${encodeURIComponent(qrState)}&pollKey=${encodeURIComponent(qrPollKey)}`
      )
      const d = (await res.json()) as { status: string; error?: string }
      if (d.status === 'done') {
        stopPoll()
        qr = ''
        await auth.init()
      } else if (d.status === 'expired' || d.status === 'error') {
        stopPoll()
        qr = ''
        qrError = d.status === 'expired' ? '二维码已过期，请重试' : d.error || '绑定失败'
      }
    } catch {
      /* keep polling */
    }
  }

  async function unbind(provider: 'github' | 'alipay') {
    await auth.unbind(provider)
  }

  onDestroy(stopPoll)
</script>

<div class="acct">
  <section class="block">
    <div class="row">
      <div class="label">用户名</div>
      <div class="value">{auth.username || '—'}</div>
    </div>
    <div class="tip">修改密码：更新服务器环境变量 <code>AUTH_PASSWORD</code>（或 <code>AUTH_PASSWORD_HASH</code>）后重启。</div>
    <button class="btn" onclick={() => auth.logout()}>退出登录</button>
  </section>

  <section class="block">
    <h3>登录方式</h3>

    <div class="row">
      <div class="label">GitHub</div>
      {#if auth.providers.github.bound}
        <div class="value">{auth.bindings.github?.display ?? '已绑定'}</div>
        <button class="btn danger" onclick={() => unbind('github')}>解绑</button>
      {:else}
        <button class="btn" disabled={!auth.providers.github.configured} onclick={bindGithub}>
          {auth.providers.github.configured ? '绑定' : '未配置'}
        </button>
      {/if}
    </div>

    <div class="row">
      <div class="label">支付宝</div>
      {#if auth.providers.alipay.bound}
        <div class="value">{auth.bindings.alipay?.display ?? '已绑定'}</div>
        <button class="btn danger" onclick={() => unbind('alipay')}>解绑</button>
      {:else}
        <button class="btn" disabled={!auth.providers.alipay.configured} onclick={bindAlipay}>
          {auth.providers.alipay.configured ? '绑定' : '未配置'}
        </button>
      {/if}
    </div>

    {#if qr}
      <div class="qr">
        <img src={qr} alt="支付宝绑定二维码" />
        <div class="tip">请用支付宝扫码并确认授权</div>
      </div>
    {/if}
    {#if qrError}<div class="err">{qrError}</div>{/if}

    <div class="tip">绑定后即可在登录页使用对应方式登录。</div>
  </section>
</div>

<style>
  .acct {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 100%;
    padding: 20px 24px;
    background: var(--dt-window-bg, #23262e);
    color: var(--dt-fg, #e6e9f0);
    font-size: 13px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 13px;
    color: var(--dt-fg-muted, #9aa4b5);
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: 120px;
    color: #cfd5e2;
    flex: 0 0 auto;
  }
  .value {
    flex: 1;
    color: var(--dt-fg, #e6e9f0);
  }
  .btn {
    height: 30px;
    padding: 0 14px;
    border: 1px solid var(--dt-border, transparent);
    border-radius: 6px;
    background: var(--dt-accent-soft, #3a3f4a);
    color: var(--dt-fg, #fff);
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--dt-accent-soft2, #474d5a);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.danger:hover {
    background: #e04a4a;
  }
  .tip {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
  }
  code {
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
  }
  .qr {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .qr img {
    width: 180px;
    height: 180px;
    border-radius: 8px;
    background: #fff;
    padding: 6px;
  }
  .err {
    color: #ff8080;
    font-size: 12px;
  }
</style>
