<script lang="ts">
  import { onMount } from 'svelte'
  import { JSONEditor, type Content } from 'svelte-jsoneditor'
  import 'svelte-jsoneditor/themes/jse-theme-dark.css'
  import { fs, FsConflict } from '../../api/fs'
  import { settings } from '../../desktop/settings.svelte'
  import { themes } from '../../desktop/themes.svelte'
  import { Save } from '@lucide/svelte'

  let { path, name }: { path: string; name: string } = $props()

  let content = $state<Content>({ text: '' })
  let etag: string | undefined
  let dirty = $state(false)
  let error = $state('')
  let loading = $state(true)

  const dark = $derived(themes.resolve(settings.theme) === 'dark')

  function textOf(c: Content): string {
    if ('text' in c && typeof c.text === 'string') return c.text
    if ('json' in c) return JSON.stringify(c.json, null, 2)
    return ''
  }

  async function save() {
    try {
      const res = await fs.writeText(path, textOf(content), etag)
      etag = res.etag
      dirty = false
      error = ''
    } catch (e) {
      error = e instanceof FsConflict ? '文件已被改动，请重新载入' : String(e)
    }
  }

  onMount(() => {
    void (async () => {
      const r = await fs.readText(path)
      loading = false
      if (!r) {
        error = '无法读取文件'
        return
      }
      etag = r.etag
      content = { text: r.text }
    })()
  })
</script>

<div class="jv">
  <header class="jv-bar">
    <span class="fn">{name}</span>
    <div class="spacer"></div>
    <button class="btn primary" onclick={save} disabled={!dirty}><Save size={14} /> 保存</button>
  </header>
  {#if error}<div class="err">{error}</div>{/if}
  {#if loading}
    <div class="loading">载入中…</div>
  {:else}
    <div class:jse-theme-dark={dark}>
      <JSONEditor bind:content onChange={() => (dirty = true)} />
    </div>
  {/if}
</div>

<style>
  .jv {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dt-surface-sunken, #14161d);
    color: var(--dt-fg, #dbe2ee);
  }
  .jv-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--dt-border, rgba(255, 255, 255, 0.08));
    font-size: 13px;
  }
  .fn {
    font-weight: 600;
    color: var(--dt-fg, #eaf0fa);
  }
  .spacer {
    flex: 1;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: var(--dt-accent-soft, rgba(79, 140, 255, 0.22));
    color: var(--dt-fg, #dbe6ff);
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover {
    background: var(--dt-accent-soft2, rgba(79, 140, 255, 0.32));
  }
  .btn:disabled {
    opacity: 0.45;
  }
  .err {
    padding: 8px 12px;
    background: color-mix(in srgb, var(--dt-danger, #e04a4a) 18%, transparent);
    color: var(--dt-danger, #ffb3b3);
    font-size: 12px;
  }
  .loading {
    padding: 20px;
    color: var(--dt-fg-muted, #7f8a9c);
  }
  .jv > :global(div:last-child),
  .jse-theme-dark {
    flex: 1;
    min-height: 0;
  }
  .jv :global(.jse-theme-dark) {
    height: 100%;
  }
</style>
