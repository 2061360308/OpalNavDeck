<script lang="ts">
  import type { Widget } from '../types'
  import { stage } from '../stage/stageState.svelte'
  import { widgets } from '../state/widgets.svelte'
  import { menus } from '../desktop/menuStore.svelte'
  import { modifiers } from '../desktop/modifiers.svelte'
  import { guides } from '../desktop/guideStore.svelte'
  import { hover } from '../desktop/hover.svelte'
  import { dragState } from '../desktop/dragState.svelte'
  import { snapMove } from '../desktop/snap'
  import { pointerDrag } from '../dnd/pointerDrag'
  import SandboxWidget from './SandboxWidget.svelte'

  let { widget }: { widget: Widget } = $props()

  const hovered = $derived(hover.id === widget.id)
  let dragging = $state(false)
  let dragStart = { x: 0, y: 0 }

  const clickThrough = $derived(widget.behavior.clickThrough && !modifiers.alt)
  const interactive = $derived(!clickThrough)

  const opacity = $derived.by(() => {
    const base = widget.behavior.opacity
    const h = widget.behavior.hover
    if (h === 'none') return base
    if (hovered) {
      if (h === 'hide' || h === 'fadeout') return 0
      return base
    }
    // not hovered: only "fade in" starts hidden
    if (h === 'fadein') return 0
    return base
  })

  const transition = $derived(
    widget.behavior.hover === 'fadein' || widget.behavior.hover === 'fadeout'
      ? 'opacity 0.28s ease'
      : 'none'
  )

  function bringFront() {
    widgets.bringToFront(widget.id)
  }

  function applyMove(x: number, y: number) {
    let nx = x
    let ny = y
    if (widget.behavior.snap) {
      const candidates = widgets.list
        .filter((w) => w.id !== widget.id)
        .map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }))
      const res = snapMove(
        { x, y, w: widget.w, h: widget.h },
        candidates,
        { w: stage.refW, h: stage.refH },
        8
      )
      nx = res.x
      ny = res.y
      guides.set(res.guides.v, res.guides.h)
    } else {
      guides.clear()
    }
    widgets.move(widget.id, nx, ny)
  }

  function onDragStartBridge() {
    bringFront()
    dragging = true
    dragState.set(true)
    dragStart = { x: widget.x, y: widget.y }
  }

  function onDragMoveBridge(dx: number, dy: number) {
    applyMove(dragStart.x + dx / stage.scale, dragStart.y + dy / stage.scale)
  }

  function onDragEndBridge() {
    dragging = false
    dragState.set(false)
    guides.clear()
  }

  function onHandleDown(e: PointerEvent) {
    if (!widget.behavior.draggable) return
    e.preventDefault()
    e.stopPropagation()
    bringFront()
    dragState.set(true)
    const sx = widget.x
    const sy = widget.y
    pointerDrag(e, {
      onMove: (dx, dy) => applyMove(sx + dx / stage.scale, sy + dy / stage.scale),
      onEnd: () => {
        dragState.set(false)
        guides.clear()
      },
    })
  }

  function onContext(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    menus.show({ target: 'widget', x: e.clientX, y: e.clientY, widget })
  }

  function onContextFromSkin(x: number, y: number) {
    bringFront()
    menus.show({ target: 'widget', x, y, widget })
  }
</script>

<div
  class="widget"
  class:dragging
  data-widget={widget.id}
  role="presentation"
  style="left:{widget.x}px;top:{widget.y}px;width:{widget.w}px;height:{widget.h}px;z-index:{widget.z};opacity:{opacity};pointer-events:{interactive
    ? 'auto'
    : 'none'};transition:{transition};clip-path:{widget.shape ?? 'none'}"
  oncontextmenu={onContext}
>
  <SandboxWidget
    {widget}
    clipPath={widget.shape ?? ''}
    onPointerDown={bringFront}
    onHoverEnter={() => hover.set(widget.id)}
    onHoverLeave={() => hover.clear()}
    onDragStart={onDragStartBridge}
    onDragMove={onDragMoveBridge}
    onDragEnd={onDragEndBridge}
    onContextMenu={onContextFromSkin}
  />

  {#if widget.behavior.dragMode === 'handle' && interactive}
    <div
      class="drag-handle"
      role="presentation"
      title="拖动"
      onpointerdown={onHandleDown}
    ></div>
  {/if}
</div>

<style>
  .widget {
    position: absolute;
    pointer-events: auto;
    box-sizing: border-box;
  }
  .widget.dragging {
    cursor: grabbing;
  }
  .drag-handle {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 18px;
    cursor: grab;
    background: linear-gradient(rgba(0, 0, 0, 0.28), transparent);
  }
  .drag-handle:active {
    cursor: grabbing;
  }
</style>
