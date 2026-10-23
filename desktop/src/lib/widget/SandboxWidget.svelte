<script lang="ts">
  import { onMount } from 'svelte'
  import type { Widget } from '../types'
  import { SkinBridge } from './bridge/host'
  import { loadWidgetHtml } from './loadWidgetHtml'
  import { skins } from '../desktop/skins.svelte'
  import { settings } from '../desktop/settings.svelte'
  import { capabilities } from '../capabilities/registry'
  import { monitorHub } from '../sources/monitorHub'

  interface Props {
    widget: Widget
    clipPath?: string
    onPointerDown?: () => void
    onHoverEnter?: () => void
    onHoverLeave?: () => void
    onDragStart?: () => void
    onDragMove?: (dx: number, dy: number) => void
    onDragEnd?: () => void
    onContextMenu?: (x: number, y: number) => void
  }

  let {
    widget,
    clipPath = '',
    onPointerDown,
    onHoverEnter,
    onHoverLeave,
    onDragStart,
    onDragMove,
    onDragEnd,
    onContextMenu,
  }: Props = $props()

  let iframe: HTMLIFrameElement | undefined = $state()
  let bridge: SkinBridge | undefined
  let doc = $state('')

  const manifest = $derived(skins.get(widget.skin))

  $effect(() => {
    const skinId = widget.skin
    const entry = skins.get(skinId)?.entry ?? 'index.html'
    let cancelled = false
    loadWidgetHtml(skinId, entry)
      .then((html) => {
        if (!cancelled) doc = html
      })
      .catch((e) => console.warn('[skin] load failed:', skinId, e))
    return () => {
      cancelled = true
    }
  })

  function scaleFactor() {
    if (!iframe) return 1
    const r = iframe.getBoundingClientRect()
    return r.width / (iframe.offsetWidth || 1) || 1
  }

  onMount(() => {
    if (!iframe) return
    bridge = new SkinBridge(iframe, widget.id, manifest?.permissions ?? [], {
      onReady: () =>
        bridge?.postInit(
          settings.theme,
          { dragMode: widget.behavior.dragMode, draggable: widget.behavior.draggable },
          capabilities.schema()
        ),
      onPointerDown: () => onPointerDown?.(),
      onHoverEnter: () => onHoverEnter?.(),
      onHoverLeave: () => onHoverLeave?.(),
      onDragStart: () => onDragStart?.(),
      onDragMove: (dx, dy) => onDragMove?.(dx, dy),
      onDragEnd: () => onDragEnd?.(),
      onContextMenu: (cx, cy) => {
        if (!iframe) return
        const r = iframe.getBoundingClientRect()
        const f = scaleFactor()
        onContextMenu?.(r.left + cx * f, r.top + cy * f)
      },
    })
    monitorHub.attach(widget.id, (event, data) => bridge?.postEvent(event, data))
    bridge.attach()
    return () => {
      monitorHub.detach(widget.id)
      bridge?.detach()
    }
  })

  $effect(() => {
    settings.theme
    bridge?.postEvent('theme.changed', { theme: settings.theme })
  })

  $effect(() => {
    widget.behavior.dragMode
    widget.behavior.draggable
    bridge?.postEvent('behavior.changed', {
      dragMode: widget.behavior.dragMode,
      draggable: widget.behavior.draggable,
    })
  })
</script>

<iframe
  bind:this={iframe}
  class="skin"
  title={manifest?.name ?? widget.skin}
  srcdoc={doc}
  sandbox="allow-scripts"
  style="clip-path:{clipPath}"
></iframe>

<style>
  .skin {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: transparent;
    color-scheme: normal;
  }
</style>
