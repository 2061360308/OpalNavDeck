<script lang="ts">
  import type { WindowState } from '../types'
  import { wm } from '../state/windows.svelte'
  import { pointerDrag } from '../dnd/pointerDrag'
  import { Minus, Square, X, Pin, Settings, Compass, Droplets, Palette } from '@lucide/svelte'

  let { win, children }: { win: WindowState; children?: import('svelte').Snippet } = $props()

  const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

  const frameless = $derived(!!win.frameless)
  const fullscreen = $derived(!!win.fullscreen)

  const winStyle = $derived(
    fullscreen
      ? `left:0;top:0;width:100vw;height:100vh;z-index:${win.z}`
      : `left:${win.x}px;top:${win.y}px;width:${win.w}px;height:${win.h}px;z-index:${win.z}`
  )

  function onTitleDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.preventDefault()
    wm.focus(win.id)
    if (win.maximized) return
    const sx = win.x
    const sy = win.y
    pointerDrag(e, {
      onMove: (dx, dy) => wm.move(win.id, sx + dx, sy + dy),
    })
  }

  function onResize(e: PointerEvent, dir: string) {
    e.preventDefault()
    e.stopPropagation()
    wm.focus(win.id)
    const sx = win.x
    const sy = win.y
    const sw = win.w
    const sh = win.h
    pointerDrag(e, {
      onMove: (dx, dy) => {
        let x = sx
        let y = sy
        let w = sw
        let h = sh
        if (dir.includes('e')) w = sw + dx
        if (dir.includes('s')) h = sh + dy
        if (dir.includes('w')) {
          w = sw - dx
          x = sx + dx
        }
        if (dir.includes('n')) {
          h = sh - dy
          y = sy + dy
        }
        wm.setRect(win.id, x, y, w, h)
      },
    })
  }
</script>

{#if !win.minimized}
  <div
    class="win"
    class:topmost={win.topmost}
    class:fullscreen
    class:maximized={win.maximized}
    class:light={win.light}
    role="dialog"
    aria-label={win.title}
    tabindex="-1"
    style={winStyle}
    onpointerdown={() => wm.focus(win.id)}
  >
    {#if !frameless}
      <div class="titlebar" role="presentation" onpointerdown={onTitleDown}>
        <span class="ticon">
          {#if win.appId === 'settings-center'}
            <Settings size={14} />
          {:else if win.appId === 'personalize'}
            <Palette size={14} />
          {:else if win.appId === 'resources'}
            <Compass size={14} />
          {:else if win.appId === 'rainmeter'}
            <Droplets size={14} />
          {:else}
            {win.icon}
          {/if}
        </span>
        <span class="ttitle">{win.title}</span>
        <div class="btns" data-no-drag>
          <button
            class="pin"
            class:on={win.topmost}
            title="置顶"
            onclick={() => wm.toggleTopmost(win.id)}><Pin size={14} /></button
          >
          <button
            title="最小化"
            disabled={win.noMinimize}
            onclick={() => !win.noMinimize && wm.minimize(win.id)}><Minus size={14} /></button
          >
          <button
            title="最大化"
            disabled={win.noMaximize}
            onclick={() => !win.noMaximize && wm.toggleMaximize(win.id)}><Square size={12} /></button
          >
          <button class="x" title="关闭" onclick={() => wm.close(win.id)}><X size={15} /></button>
        </div>
      </div>
    {/if}
    <div class="content">
      {@render children?.()}
    </div>
    {#if !frameless && !fullscreen}
      {#each dirs as d (d)}
        <div class="rh rh-{d}" role="presentation" onpointerdown={(e) => onResize(e, d)}></div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .win {
    position: absolute;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    overflow: hidden;
    background: var(--dt-window-bg, #1b1e27);
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.12));
    box-shadow: var(--dt-shadow, 0 18px 60px rgba(0, 0, 0, 0.5));
    color: var(--dt-fg, #dfe4ee);
    pointer-events: auto;
  }
  .win.topmost {
    box-shadow: var(--dt-shadow, 0 18px 60px rgba(0, 0, 0, 0.5)), 0 0 0 1px var(--dt-accent, #4f8cff);
  }
  .win.fullscreen {
    border: none;
    border-radius: 0;
  }
  .win.maximized {
    border-radius: 0;
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 6px 0 12px;
    background: var(--dt-titlebar, linear-gradient(#2a2f3d, #22262f));
    color: var(--dt-fg, #dfe4ee);
    font-size: 13px;
    cursor: grab;
    user-select: none;
  }
  .titlebar:active {
    cursor: grabbing;
  }
  .ticon {
    font-size: 14px;
  }
  .ttitle {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btns {
    display: flex;
    gap: 2px;
  }
  .btns button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--dt-fg-muted, #c8cfdc);
    cursor: pointer;
    font-size: 13px;
  }
  .btns button:hover {
    background: var(--dt-hover, rgba(255, 255, 255, 0.1));
    color: var(--dt-fg, #dfe4ee);
  }
  .btns button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .btns button:disabled:hover {
    background: transparent;
  }
  .btns .pin.on {
    background: var(--dt-accent-soft2, rgba(79, 140, 255, 0.3));
    color: var(--dt-accent-fg, #fff);
  }
  .btns .x:hover {
    background: var(--dt-danger, #e04a4a);
    color: #fff;
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    color: var(--dt-fg, #d8dee9);
  }
  .rh {
    position: absolute;
  }
  .rh-n {
    top: -3px;
    left: 8px;
    right: 8px;
    height: 6px;
    cursor: ns-resize;
  }
  .rh-s {
    bottom: -3px;
    left: 8px;
    right: 8px;
    height: 6px;
    cursor: ns-resize;
  }
  .rh-e {
    right: -3px;
    top: 8px;
    bottom: 8px;
    width: 6px;
    cursor: ew-resize;
  }
  .rh-w {
    left: -3px;
    top: 8px;
    bottom: 8px;
    width: 6px;
    cursor: ew-resize;
  }
  .rh-ne {
    top: -3px;
    right: -3px;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
  .rh-nw {
    top: -3px;
    left: -3px;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .rh-se {
    bottom: -3px;
    right: -3px;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .rh-sw {
    bottom: -3px;
    left: -3px;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
</style>
