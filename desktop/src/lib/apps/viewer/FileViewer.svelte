<script lang="ts">
  import type { Component } from 'svelte'
  import type { WindowState } from '../../types'
  import { pickKind, loadViewer } from './viewerRegistry'

  let { win }: { win: WindowState } = $props()

  const path = $derived(String(win.data?.path ?? ''))
  const name = $derived(String(win.data?.name ?? path.split('/').pop() ?? ''))
  const kind = $derived(pickKind(name))

  let Comp = $state<Component<{ path: string; name: string }> | null>(null)
  let error = $state('')

  $effect(() => {
    if (!kind) {
      error = '没有可用的查看器，请下载后打开'
      return
    }
    let alive = true
    loadViewer(kind)
      .then((m) => {
        if (alive) Comp = m.default
      })
      .catch((e) => {
        error = '载入查看器失败：' + String(e)
      })
    return () => {
      alive = false
    }
  })
</script>

<div class="viewer-app">
  {#if Comp}
    <Comp {path} {name} />
  {:else if error}
    <div class="msg">{error}</div>
  {:else}
    <div class="msg">载入中…</div>
  {/if}
</div>

<style>
  .viewer-app {
    height: 100%;
    min-height: 0;
  }
  .msg {
    padding: 24px;
    color: var(--dt-fg-muted, #9fb0c9);
    font-size: 13px;
  }
</style>
