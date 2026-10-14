<script lang="ts">
  import type { WallpaperFit } from '../types'
  import { settings } from './settings.svelte'
  import { stage } from '../stage/stageState.svelte'
  import { wallpaperSampler } from './wallpaperSample.svelte'
  import { spotlight } from './spotlight.svelte'

  const wp = $derived(settings.wallpaper)

  let slideIndex = $state(0)
  let focusIndex = $state(0)
  let videoEl: HTMLVideoElement | undefined = $state()

  // ---- slideshow rotation ----
  $effect(() => {
    if (wp.mode !== 'slideshow') return
    const imgs = wp.slideshow.images
    if (imgs.length <= 1) return
    slideIndex = 0
    const iv = Math.max(1, wp.slideshow.intervalSec) * 1000
    const t = setInterval(() => {
      const n = wp.slideshow.images.length
      if (n <= 1) return
      slideIndex =
        wp.slideshow.order === 'random'
          ? Math.floor(Math.random() * n)
          : (slideIndex + 1) % n
    }, iv)
    return () => clearInterval(t)
  })

  // ---- windows spotlight rotation ----
  $effect(() => {
    if (wp.mode !== 'focus') return
    void spotlight.load()
    const iv = Math.max(10, wp.focus.intervalSec) * 1000
    const t = setInterval(() => {
      focusIndex += 1
    }, iv)
    const reload = setInterval(() => void spotlight.load(true), 6 * 60 * 60 * 1000)
    return () => {
      clearInterval(t)
      clearInterval(reload)
    }
  })

  const effImage = $derived.by(() => {
    if (wp.mode === 'image') return wp.image
    if (wp.mode === 'slideshow') {
      const imgs = wp.slideshow.images
      if (!imgs.length) return ''
      return imgs[((slideIndex % imgs.length) + imgs.length) % imgs.length]
    }
    if (wp.mode === 'focus') return spotlight.pick(stage.vw, stage.vh, focusIndex)
    return ''
  })

  // keep the <video> playback rate in sync with settings
  $effect(() => {
    const el = videoEl
    if (!el) return
    void wp.video.speed
    el.playbackRate = Math.min(4, Math.max(0.1, wp.video.speed || 1))
  })

  $effect(() => {
    const eff = effImage
    const mode = wp.mode
    const color = wp.color
    const fit = wp.fit
    const viewW = stage.vw
    const viewH = stage.vh
    wallpaperSampler.sync({ mode, color, image: eff, fit }, viewW, viewH)
  })

  function bgStyle(fit: WallpaperFit | undefined): string {
    const url = effImage
    if (!url) return 'background:#05060a'
    const f = fit ?? 'cover'
    if (f === 'tile') return `background-image:url("${url}");background-repeat:repeat;background-size:auto`
    if (f === 'center')
      return `background-image:url("${url}");background-repeat:no-repeat;background-position:center;background-size:auto`
    const size = f === 'contain' ? 'contain' : f === 'stretch' ? '100% 100%' : 'cover'
    return `background-image:url("${url}");background-repeat:no-repeat;background-position:center;background-size:${size}`
  }

  const objectFit = $derived(wp.fit === 'contain' ? 'contain' : wp.fit === 'stretch' ? 'fill' : 'cover')

  const caption = $derived.by(() => {
    if (wp.mode !== 'focus' || !spotlight.list.length) return null
    const it = spotlight.list[((focusIndex % spotlight.list.length) + spotlight.list.length) % spotlight.list.length]
    return it ?? null
  })
</script>

<div class="wallpaper">
  {#if wp.mode === 'solid'}
    <div class="fill" style="background:{wp.color}"></div>
  {:else if wp.mode === 'video'}
    {#if wp.video.src}
      <video
        bind:this={videoEl}
        class="fill media"
        src={wp.video.src}
        style="object-fit:{objectFit}"
        autoplay
        loop={wp.video.loop}
        muted={wp.video.muted}
        playsinline
      ></video>
    {:else}
      <div class="fill placeholder">未选择视频</div>
    {/if}
  {:else if wp.mode === 'slideshow' || wp.mode === 'focus'}
    {#if effImage}
      <div class="fill" style={bgStyle(wp.fit)}></div>
    {:else}
      <div class="fill placeholder">{wp.mode === 'slideshow' ? '未添加图片' : spotlight.loading ? '正在获取聚焦图片…' : 'Windows 聚焦'}</div>
    {/if}
  {:else}
    {#if wp.image}
      <div class="fill" style={bgStyle(wp.fit)}></div>
    {:else}
      <div class="fill placeholder">未选择图片</div>
    {/if}
  {/if}

  {#if wp.mode === 'focus' && caption}
    <div class="spotlight-caption">
      <div class="sc-title">{caption.title}</div>
      <div class="sc-copy">{caption.copyright}</div>
    </div>
  {/if}
</div>

<style>
  .wallpaper {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #05060a;
  }
  .fill {
    position: absolute;
    inset: 0;
  }
  .media {
    width: 100%;
    height: 100%;
    display: block;
  }
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.35);
    font-size: 14px;
  }
  .spotlight-caption {
    position: absolute;
    right: 16px;
    bottom: 16px;
    max-width: 320px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.45);
    color: #eef2f9;
    pointer-events: none;
    text-align: right;
  }
  .sc-title {
    font-size: 13px;
    font-weight: 600;
  }
  .sc-copy {
    font-size: 11px;
    opacity: 0.75;
    margin-top: 2px;
  }
</style>
