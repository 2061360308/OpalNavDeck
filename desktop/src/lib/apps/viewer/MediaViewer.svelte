<script lang="ts">
  import { onMount } from 'svelte'
  import 'vidstack/player'
  import 'vidstack/player/layouts/default'
  import 'vidstack/player/styles/default/theme.css'
  import 'vidstack/player/styles/default/layouts/video.css'
  import 'vidstack/player/styles/default/layouts/audio.css'
  import { fs } from '../../api/fs'

  let { path, name }: { path: string; name: string } = $props()

  const AUDIO = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus)$/i
  const isAudio = $derived(AUDIO.test(name))

  let url = $state('')
  let error = $state('')

  onMount(() => {
    let revoke: string | null = null
    let disposed = false
    void (async () => {
      const r = await fs.readBlob(path)
      if (disposed) return
      if (!r) {
        error = '无法读取媒体文件'
        return
      }
      url = URL.createObjectURL(r.blob)
      revoke = url
    })()
    return () => {
      disposed = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  })
</script>

<div class="mv" class:audio={isAudio}>
  {#if error}
    <div class="err">{error}</div>
  {:else if url}
    <media-player title={name} src={url} playsinline>
      <media-provider></media-provider>
      {#if isAudio}
        <media-audio-layout></media-audio-layout>
      {:else}
        <media-video-layout></media-video-layout>
      {/if}
    </media-player>
  {:else}
    <div class="loading">载入中…</div>
  {/if}
</div>

<style>
  .mv {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    background: #000;
    color: var(--dt-fg, #dbe2ee);
  }
  .mv :global(media-player) {
    width: 100%;
    height: 100%;
  }
  .mv.audio :global(media-player) {
    height: auto;
  }
  .err,
  .loading {
    padding: 20px;
    color: var(--dt-fg-muted, #9fb0c9);
  }
</style>
