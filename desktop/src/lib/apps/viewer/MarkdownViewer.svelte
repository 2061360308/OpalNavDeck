<script lang="ts">
  import { onMount } from 'svelte'
  import { marked } from 'marked'
  import DOMPurify from 'dompurify'
  import { fs, FsConflict } from '../../api/fs'
  import { createEditor, type EditorHandle } from './cm'
  import { settings } from '../../desktop/settings.svelte'
  import { themes } from '../../desktop/themes.svelte'
  import { Save, Eye, Code } from '@lucide/svelte'

  let { path, name }: { path: string; name: string } = $props()

  let host: HTMLDivElement | undefined = $state()
  let html = $state('')
  let source = $state(false)
  let text = $state('')
  let etag: string | undefined
  let editor: EditorHandle | null = null
  let dirty = $state(false)
  let error = $state('')
  let loading = $state(true)

  $effect(() => {
    editor?.setDark(themes.resolve(settings.theme) === 'dark')
  })

  function render(md: string) {
    html = DOMPurify.sanitize(marked.parse(md, { async: false }) as string)
  }

  async function save() {
    const value = editor ? editor.getValue() : text
    try {
      const res = await fs.writeText(path, value, etag)
      etag = res.etag
      dirty = false
      text = value
      render(value)
    } catch (e) {
      error = e instanceof FsConflict ? '文件已被改动，请重新载入' : String(e)
    }
  }

  async function toggleSource() {
    if (source) {
      text = editor?.getValue() ?? text
      editor?.destroy()
      editor = null
      source = false
      render(text)
    } else {
      source = true
      await Promise.resolve()
      if (host) {
        editor = createEditor(
          host,
          text,
          name,
          themes.resolve(settings.theme) === 'dark',
          () => {
            dirty = true
          },
          () => void save()
        )
      }
    }
  }

  onMount(() => {
    let disposed = false
    void (async () => {
      const r = await fs.readText(path)
      if (disposed) return
      loading = false
      if (!r) {
        error = '无法读取文件'
        return
      }
      etag = r.etag
      text = r.text
      render(text)
    })()
    return () => {
      disposed = true
      editor?.destroy()
    }
  })
</script>

<div class="md">
  <header class="md-bar">
    <span class="fn">{name}</span>
    <div class="spacer"></div>
    <button class="btn" onclick={toggleSource}>
      {#if source}<Eye size={14} /> 预览{:else}<Code size={14} /> 源码{/if}
    </button>
    {#if source}<button class="btn primary" onclick={save} disabled={!dirty}><Save size={14} /> 保存</button>{/if}
  </header>
  {#if error}<div class="err">{error}</div>{/if}
  {#if loading}
    <div class="loading">载入中…</div>
  {:else if source}
    <div class="editor" bind:this={host}></div>
  {:else}
    <article class="preview">{@html html}</article>
  {/if}
</div>

<style>
  .md {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dt-surface-sunken, #14161d);
    color: var(--dt-fg, #dbe2ee);
  }
  .md-bar {
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
    background: var(--dt-input-bg, rgba(255, 255, 255, 0.05));
    color: var(--dt-fg, #dbe6ff);
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover {
    background: var(--dt-hover, rgba(255, 255, 255, 0.1));
  }
  .btn.primary {
    background: var(--dt-accent-soft, rgba(79, 140, 255, 0.22));
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
  .editor {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .editor :global(.cm-editor) {
    height: 100%;
    font-size: 13px;
  }
  .preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 20px 26px 60px;
    line-height: 1.75;
    color: var(--dt-fg, #dbe2ee);
  }
  .preview :global(h1),
  .preview :global(h2),
  .preview :global(h3) {
    color: var(--dt-fg, #eef2f9);
    margin: 1.2em 0 0.5em;
  }
  .preview :global(a) {
    color: var(--dt-accent, #6ea8ff);
  }
  .preview :global(code) {
    background: var(--dt-input-bg, rgba(255, 255, 255, 0.08));
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12.5px;
  }
  .preview :global(pre) {
    background: var(--dt-window-bg, rgba(0, 0, 0, 0.35));
    padding: 12px 14px;
    border-radius: 8px;
    overflow: auto;
  }
  .preview :global(pre code) {
    background: transparent;
    padding: 0;
  }
  .preview :global(blockquote) {
    margin: 0.8em 0;
    padding: 4px 14px;
    border-left: 3px solid var(--dt-accent, rgba(110, 168, 255, 0.6));
    color: var(--dt-fg-muted, #9fb0c9);
  }
  .preview :global(table) {
    border-collapse: collapse;
  }
  .preview :global(th),
  .preview :global(td) {
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.14));
    padding: 5px 10px;
  }
  .preview :global(img) {
    max-width: 100%;
  }
</style>
