<script lang="ts">
  import { onMount } from 'svelte'
  import PhotoSwipe from 'photoswipe'
  import 'photoswipe/style.css'
  import { fs } from '../../api/fs'
  import { Maximize2 } from '@lucide/svelte'

  let { path, name }: { path: string; name: string } = $props()

  let url = $state('')
  let dims = $state<{ w: number; h: number }>({ w: 0, h: 0 })
  let error = $state('')

  function openLightbox() {
    if (!url) return
    const pswp = new PhotoSwipe({
      dataSource: [{ src: url, width: dims.w || 1600, height: dims.h || 1000, alt: name }],
      index: 0,
      showHideAnimationType: 'fade',
      bgOpacity: 0.92,
    })
    pswp.init()
  }

  onMount(() => {
    let revoke: string | null = null
    let disposed = false
    void (async () => {
      const r = await fs.readBlob(path)
      if (disposed) return
      if (!r) {
        error = '无法读取图片'
        return
      }
      url = URL.createObjectURL(r.blob)
      revoke = url
      const img = new Image()
      img.onload = () => {
        dims = { w: img.naturalWidth, h: img.naturalHeight }
      }
      img.src = url
    })()
    return () => {
      disposed = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  })
</script>

<div class="iv">
  <header class="iv-bar">
    <span class="fn">{name}</span>
    {#if dims.w}<span class="dim">{dims.w} × {dims.h}</span>{/if}
    <div class="spacer"></div>
    <button class="btn" onclick={openLightbox}><Maximize2 size={14} /> 查看大图</button>
  </header>
  {#if error}
    <div class="err">{error}</div>
  {:else}
    <div class="stage" role="presentation" onclick={openLightbox}>
      {#if url}<img src={url} alt={name} />{/if}
    </div>
  {/if}
</div>

<style>
  .iv {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--dt-window-bg, #0f1116);
    color: var(--dt-fg, #dbe2ee);
  }
  .iv-bar {
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
  .dim {
    color: var(--dt-fg-muted, #7f8a9c);
    font-size: 12px;
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
  .err {
    padding: 20px;
    color: var(--dt-danger, #ffb3b3);
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 16px;
    cursor: zoom-in;
    background: repeating-conic-gradient(var(--dt-border, #1a1d24) 0% 25%, var(--dt-surface-sunken, #14161d) 0% 50%) 50% / 24px 24px;
  }
  .stage img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
  }
</style>
