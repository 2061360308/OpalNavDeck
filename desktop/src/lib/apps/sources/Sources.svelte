<script lang="ts">
  import { sources } from '../../sources/sources.svelte'
  import { broker } from '../../sources/broker.svelte'

  let name = $state('')
  let baseUrl = $state('')
  let token = $state('')
  let busy = $state(false)
  let message = $state('')
  let status = $state<Record<string, { ok: boolean; error?: string; text: string }>>({})

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

  async function remove(id: string) {
    await sources.remove(id)
  }

  const cached = $derived(sources.list.map((s) => ({ id: s.id, m: broker.get(s.id) ?? null })))
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
          <div class="name">{s.name}</div>
          <div class="url">{s.baseUrl}</div>
          {#if status[s.id]}
            <div class="probe" class:ok={status[s.id].ok}>{status[s.id].text}</div>
          {/if}
        </div>
        <div class="acts">
          <button class="btn" onclick={() => test(s.id)}>测试</button>
          <button class="btn danger" onclick={() => remove(s.id)}>删除</button>
        </div>
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
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--dt-border, rgba(255, 255, 255, 0.08));
  }
  .name {
    font-weight: 600;
  }
  .url {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
  }
  .probe {
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
  }
  .tip {
    color: var(--dt-fg-muted, #9aa4b5);
    font-size: 12px;
  }
</style>
