<script lang="ts">
  import { sources, type Source } from '../../sources/sources.svelte'
  import { broker, type SourceMetrics } from '../../sources/broker.svelte'

  let name = $state('')
  let baseUrl = $state('')
  let token = $state('')
  let busy = $state(false)
  let message = $state('')
  let status = $state<Record<string, { ok: boolean; error?: string; text: string }>>({})
  let preview = $state<Record<string, SourceMetrics | undefined>>({})
  let editing = $state<string | null>(null)
  let draftName = $state('')
  let draftUrl = $state('')
  let draftToken = $state('')

  $effect(() => {
    const offs: (() => void)[] = []
    for (const s of sources.list) {
      if (s.enabled === false) {
        delete preview[s.id]
        continue
      }
      offs.push(
        broker.subscribe(s.id, { interval: 5000 }, (m) => {
          preview[s.id] = m
        })
      )
    }
    return () => offs.forEach((off) => off())
  })

  function num(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }

  function fmtBytes(v: unknown): string {
    const n = num(v)
    if (n <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
    return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }

  function fmtRate(v: unknown): string {
    return `${fmtBytes(v)}/s`
  }

  function fmtPct(v: unknown): string {
    return `${num(v).toFixed(1)}%`
  }

  function fmtUptime(v: unknown): string {
    const s = Math.max(0, Math.floor(num(v)))
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (d > 0) return `${d}天${h}时`
    if (h > 0) return `${h}时${m}分`
    return `${m}分`
  }

  function sys(id: string): Record<string, any> | undefined {
    return preview[id]?.plugins?.system as Record<string, any> | undefined
  }

  function portCount(id: string): number {
    return num(preview[id]?.plugins?.ports?.count)
  }

  function netRates(id: string): { rx: number; tx: number } {
    const net = sys(id)?.['net']
    let rx = 0
    let tx = 0
    if (net && typeof net === 'object') {
      for (const iface of Object.values(net) as Record<string, unknown>[]) {
        rx += num(iface?.rxRate)
        tx += num(iface?.txRate)
      }
    }
    return { rx, tx }
  }

  function pctText(id: string, v: unknown): string {
    return preview[id] ? fmtPct(v) : '--'
  }

  function diskText(id: string): string {
    if (!preview[id]) return '--'
    const disks = sys(id)?.['disks']
    if (!Array.isArray(disks) || disks.length === 0) return '--'
    return fmtPct(Math.max(...disks.map((d) => num(d?.usedPercent))))
  }

  function netText(id: string): string {
    if (!preview[id]) return '--'
    const { rx, tx } = netRates(id)
    return `↓${fmtRate(rx)} ↑${fmtRate(tx)}`
  }

  function countText(id: string): string {
    return preview[id] ? String(portCount(id)) : '--'
  }

  function uptimeText(id: string): string {
    return preview[id] ? fmtUptime(sys(id)?.['uptime']) : '--'
  }

  function updatedAt(id: string): string {
    const m = preview[id]
    if (!m) return '等待数据…'
    if (!m.ok) return m.error === 'disabled' ? '已停用' : `离线 · ${m.error ?? '请求失败'}`
    return `更新于 ${new Date(m.ts).toLocaleTimeString()}`
  }

  async function add(e: SubmitEvent) {
    e.preventDefault()
    if (busy) return
    busy = true
    message = ''
    const s = await sources.add(name.trim() || baseUrl.trim(), baseUrl.trim(), token)
    busy = false
    if (s) {
      name = ''
      baseUrl = ''
      token = ''
      message = '已添加'
      broker.refresh(s.id)
    } else {
      message = '添加失败：请检查地址与令牌'
    }
  }

  async function test(id: string) {
    status = { ...status, [id]: { ok: false, text: '测试中…' } }
    const r = await sources.test(id)
    const text = r.ok ? `在线 · ${(r.info as any)?.name ?? ''}` : `离线 · ${r.error ?? '失败'}`
    status = { ...status, [id]: { ok: r.ok, error: r.error, text } }
  }

  function startEdit(s: Source) {
    editing = s.id
    draftName = s.name
    draftUrl = s.baseUrl
    draftToken = ''
  }

  async function saveEdit(id: string) {
    const u = draftUrl.trim()
    if (!draftName.trim() || !/^https?:\/\//i.test(u)) {
      message = '请输入有效的名称和 http(s) 地址'
      return
    }
    await sources.update(id, {
      name: draftName.trim(),
      baseUrl: u,
      token: draftToken ? draftToken : undefined,
    })
    editing = null
    message = '已保存'
    broker.invalidate(id)
    broker.refresh(id)
  }

  async function toggle(s: Source) {
    const next = s.enabled === false
    await sources.update(s.id, { enabled: next })
    broker.invalidate(s.id)
    if (next) broker.refresh(s.id)
  }

  async function remove(s: Source) {
    if (!window.confirm(`删除监控源「${s.name}」？`)) return
    await sources.remove(s.id)
    broker.invalidate(s.id)
    delete preview[s.id]
    delete status[s.id]
  }
</script>

<div class="src">
  <section class="add">
    <h3>添加监控源</h3>
    <form onsubmit={add}>
      <input placeholder="名称（可选）" bind:value={name} />
      <input placeholder="地址，如 http://10.0.0.5:9797" bind:value={baseUrl} required />
      <input placeholder="令牌（agent token）" bind:value={token} type="password" />
      <button class="btn primary" type="submit" disabled={busy || !baseUrl}>添加</button>
    </form>
    {#if message}<div class="tip">{message}</div>{/if}
  </section>

  <section class="list">
    <h3>监控源</h3>
    {#if sources.list.length === 0}
      <div class="tip">暂无监控源。</div>
    {/if}
    {#each sources.list as s (s.id)}
      <div class="row">
        <div class="meta">
          {#if editing === s.id}
            <div class="edit">
              <input placeholder="名称" bind:value={draftName} />
              <input placeholder="地址" bind:value={draftUrl} />
              <input placeholder="新令牌（留空不修改）" bind:value={draftToken} type="password" />
              <div class="edit-acts">
                <button class="btn primary" onclick={() => saveEdit(s.id)}>保存</button>
                <button class="btn" onclick={() => (editing = null)}>取消</button>
              </div>
            </div>
          {:else}
            <div class="name">
              {s.name}
              {#if s.enabled === false}<span class="badge">已停用</span>{/if}
            </div>
            <div class="url">{s.baseUrl}</div>
            {#if s.enabled !== false}
              <div class="metrics">
                <div class="metric">
                  <span>CPU</span><b>{pctText(s.id, sys(s.id)?.['cpu.total'])}</b>
                </div>
                <div class="metric">
                  <span>内存</span><b>{pctText(s.id, sys(s.id)?.['mem.usedPercent'])}</b>
                </div>
                <div class="metric">
                  <span>磁盘</span><b>{diskText(s.id)}</b>
                </div>
                <div class="metric">
                  <span>网络</span><b>{netText(s.id)}</b>
                </div>
                <div class="metric">
                  <span>端口</span><b>{countText(s.id)}</b>
                </div>
                <div class="metric">
                  <span>运行</span><b>{uptimeText(s.id)}</b>
                </div>
              </div>
              <div class="stamp" class:offline={preview[s.id] && !preview[s.id]?.ok}>
                {updatedAt(s.id)}
              </div>
            {/if}
            {#if status[s.id]}
              <div class="probe" class:ok={status[s.id].ok}>{status[s.id].text}</div>
            {/if}
          {/if}
        </div>
        {#if editing !== s.id}
          <div class="acts">
            <button class="btn" onclick={() => toggle(s)}>{s.enabled === false ? '启用' : '停用'}</button>
            <button class="btn" onclick={() => test(s.id)}>测试</button>
            <button class="btn" onclick={() => startEdit(s)}>编辑</button>
            <button class="btn danger" onclick={() => remove(s)}>删除</button>
          </div>
        {/if}
      </div>
    {/each}
  </section>
</div>

<style>
  .src {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-height: 100%;
    padding: 20px 24px;
    background: var(--dt-window-bg, #23262e);
    color: var(--dt-fg, #e6e9f0);
    font-size: 13px;
    box-sizing: border-box;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--dt-fg-muted, #9aa4b5);
    font-weight: 600;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  input {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.14));
    border-radius: 6px;
    background: var(--dt-input-bg, rgba(255, 255, 255, 0.05));
    color: var(--dt-fg, #fff);
    font: inherit;
    flex: 1 1 200px;
    min-width: 120px;
    box-sizing: border-box;
  }
  .btn {
    height: 32px;
    padding: 0 14px;
    border: 1px solid var(--dt-border, transparent);
    border-radius: 6px;
    background: var(--dt-accent-soft, #3a3f4a);
    color: var(--dt-fg, #fff);
    cursor: pointer;
  }
  .btn.primary {
    background: var(--dt-accent, #4f8cff);
  }
  .btn.danger:hover {
    background: #e04a4a;
  }
  .list .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--dt-border, rgba(255, 255, 255, 0.08));
  }
  .meta {
    min-width: 0;
    flex: 1;
  }
  .name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .badge {
    font-size: 11px;
    font-weight: 400;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--dt-fg-muted, #9aa4b5);
  }
  .url {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(120px, 1fr));
    gap: 6px 16px;
    margin-top: 10px;
  }
  .metric {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .metric span {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
    flex: 0 0 auto;
  }
  .metric b {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stamp {
    margin-top: 8px;
    font-size: 12px;
    color: var(--dt-fg-muted, #9aa4b5);
  }
  .stamp.offline {
    color: #ff9c6e;
  }
  .probe {
    margin-top: 6px;
    font-size: 12px;
    color: #ff8080;
  }
  .probe.ok {
    color: #6ee7a8;
  }
  .acts {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
    padding-top: 2px;
  }
  .edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 520px;
  }
  .edit input {
    flex: 1 1 auto;
  }
  .edit-acts {
    display: flex;
    gap: 8px;
  }
  .tip {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
  }
</style>
