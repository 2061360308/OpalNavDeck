<script lang="ts">
  import { onMount } from 'svelte'
  import { fs, FsConflict } from '../../api/fs'
  import { createEditor, type EditorHandle } from './cm'
  import { settings } from '../../desktop/settings.svelte'
  import { themes } from '../../desktop/themes.svelte'
  import { Save, RotateCcw, TriangleAlert } from '@lucide/svelte'

  let { path, name }: { path: string; name: string } = $props()

  let host: HTMLDivElement | undefined = $state()
  let etag: string | undefined
  let dirty = $state(false)
  let status = $state('已保存')
  let conflict = $state(false)
  let editor: EditorHandle | null = null
  let error = $state('')

  async function save() {
    if (!editor) return
    try {
      const res = await fs.writeText(path, editor.getValue(), etag)
      etag = res.etag
      dirty = false
      conflict = false
      status = '已保存'
    } catch (e) {
      if (e instanceof FsConflict) {
        conflict = true
        status = '文件已被改动'
      } else {
        error = String(e)
      }
    }
  }

  function revert() {
    if (editor && origin !== null) {
      editor.view.dispatch({
        changes: { from: 0, to: editor.view.state.doc.length, insert: origin },
      })
      dirty = false
      conflict = false
      status = '已还原'
    }
  }

  let origin: string | null = null

  $effect(() => {
    editor?.setDark(themes.resolve(settings.theme) === 'dark')
  })

  onMount(() => {
    let disposed = false
    void (async () => {
      const r = await fs.readText(path)
      if (disposed || !host) return
      if (!r) {
        error = '无法读取文件'
        return
      }
      etag = r.etag
      origin = r.text
      editor = createEditor(
        host,
        r.text,
        name,
        themes.resolve(settings.theme) === 'dark',
        () => {
          dirty = true
          status = '未保存'
        },
        () => void save()
      )
    })()
    return () => {
      disposed = true
      editor?.destroy()
    }
  })
</script>

<div class="tv">
  <header class="tv-bar">
    <span class="fn">{name}</span>
    <span class="st" class:warn={conflict}>{status}</span>
    <div class="spacer"></div>
    {#if conflict}<button class="btn" onclick={revert}><RotateCcw size={14} /> 还原</button>{/if}
    <button class="btn primary" onclick={save} disabled={!dirty}><Save size={14} /> 保存</button>
  </header>
  {#if error}
    <div class="err"><TriangleAlert size={15} /> {error}</div>
  {/if}
  <div class="editor" bind:this={host}></div>
</div>

<style>
  .tv {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dt-surface-sunken, #14161d);
    color: var(--dt-fg, #dbe2ee);
  }
  .tv-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--dt-border, rgba(255, 255, 255, 0.08));
    font-size: 13px;
  }
  .fn {
    color: var(--dt-fg, #eaf0fa);
    font-weight: 600;
  }
  .st {
    font-size: 12px;
    color: var(--dt-fg-muted, #7f8a9c);
  }
  .st.warn {
    color: #ffb86b;
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
    cursor: default;
  }
  .err {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--dt-danger, #e04a4a) 18%, transparent);
    color: var(--dt-danger, #ffb3b3);
    font-size: 12px;
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
</style>
