<script lang="ts">
  import { onMount } from 'svelte'
  import * as pdfjsLib from 'pdfjs-dist'
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
  import { fs } from '../../api/fs'
  import { ZoomIn, ZoomOut } from '@lucide/svelte'

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  let { path, name }: { path: string; name: string } = $props()

  let container: HTMLDivElement | undefined = $state()
  let doc: any = null
  let pages = $state(0)
  let zoom = $state(1)
  let error = $state('')
  let loading = $state(true)

  async function renderAll() {
    if (!container || !doc) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    container.replaceChildren()
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: zoom * dpr })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
      canvas.className = 'page'
      container.appendChild(canvas)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    }
  }

  function setZoom(z: number) {
    zoom = Math.min(4, Math.max(0.4, z))
    void renderAll()
  }

  onMount(() => {
    let disposed = false
    void (async () => {
      const r = await fs.readBlob(path)
      if (disposed) return
      if (!r) {
        error = '无法读取 PDF'
        loading = false
        return
      }
      try {
        const bytes = new Uint8Array(await r.blob.arrayBuffer())
        doc = await pdfjsLib.getDocument({ data: bytes }).promise
        pages = doc.numPages
        loading = false
        await Promise.resolve()
        await renderAll()
      } catch (e) {
        error = 'PDF 解析失败：' + String(e)
        loading = false
      }
    })()
    return () => {
      disposed = true
      doc?.destroy?.()
    }
  })
</script>

<div class="pv">
  <header class="pv-bar">
    <span class="fn">{name}</span>
    {#if pages}<span class="dim">{pages} 页</span>{/if}
    <div class="spacer"></div>
    <button class="btn" onclick={() => setZoom(zoom - 0.2)}><ZoomOut size={14} /></button>
    <span class="zoom">{Math.round(zoom * 100)}%</span>
    <button class="btn" onclick={() => setZoom(zoom + 0.2)}><ZoomIn size={14} /></button>
  </header>
  {#if error}<div class="err">{error}</div>{/if}
  {#if loading}<div class="loading">载入中…</div>{/if}
  <div class="scroll" bind:this={container}></div>
</div>

<style>
  .pv {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dt-surface-sunken, #2a2d34);
    color: var(--dt-fg, #dbe2ee);
  }
  .pv-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--dt-window-bg, #14161d);
    border-bottom: 1px solid var(--dt-border, rgba(255, 255, 255, 0.08));
    font-size: 13px;
  }
  .fn {
    font-weight: 600;
    color: var(--dt-fg, #eaf0fa);
  }
  .dim,
  .zoom {
    color: var(--dt-fg-muted, #9fb0c9);
    font-size: 12px;
  }
  .spacer {
    flex: 1;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 26px;
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: var(--dt-input-bg, rgba(255, 255, 255, 0.05));
    color: var(--dt-fg, #dbe6ff);
    cursor: pointer;
  }
  .btn:hover {
    background: var(--dt-hover, rgba(255, 255, 255, 0.1));
  }
  .err {
    padding: 12px;
    color: var(--dt-danger, #ffb3b3);
  }
  .loading {
    padding: 16px;
    color: var(--dt-fg-muted, #9fb0c9);
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px;
  }
  .scroll :global(canvas.page) {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    background: #fff;
    max-width: 100%;
    height: auto;
  }
</style>
