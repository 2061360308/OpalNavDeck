<script lang="ts">
  import type { Box } from '../types'
  import { boxes } from '../state/boxes.svelte'
  import { services } from '../state/services.svelte'
  import { recent } from '../state/recent.svelte'
  import { settings } from '../desktop/settings.svelte'
  import IconGlyph from '../IconGlyph.svelte'
  import { stage } from '../stage/stageState.svelte'
  import { guides } from '../desktop/guideStore.svelte'
  import { dragState } from '../desktop/dragState.svelte'
  import { menus } from '../desktop/menuStore.svelte'
  import {
    wallpaperSampler,
    hexToRgb,
    mixRgb,
    isLight,
  } from '../desktop/wallpaperSample.svelte'
  import { pointerDrag } from '../dnd/pointerDrag'
  import { dnd, dragSource, dropItem, dropList } from '../dnd/dnd.svelte'
  import { flip } from 'svelte/animate'
  import {
    ChevronUp,
    ChevronDown,
    LayoutGrid,
    List,
    Lock,
    LockOpen,
    Ellipsis,
  } from '@lucide/svelte'
  import {
    dndzone,
    SHADOW_ITEM_MARKER_PROPERTY_NAME,
    TRIGGERS,
  } from 'svelte-dnd-action'
  import type { Service } from '../types'

  let { box }: { box: Box } = $props()

  let dragging = $state(false)
  let mergeInvalid = $state(false)
  let resizing = $state(false)
  let resizeDir = $state('')
  let dragStart = { x: 0, y: 0 }

  const flipDur =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : 160

  type TabItem = Box & { [SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean }
  let items = $state<TabItem[]>([])
  let dndActive = $state(false)
  let lastPointer = { x: 0, y: 0 }

  const isShadow = (t: TabItem) => !!t[SHADOW_ITEM_MARKER_PROPERTY_NAME]

  // keep the dnd working array in sync with the container's tabs except while dragging
  $effect(() => {
    void box.tabs
    if (dndActive) return
    const ids = box.tabs
    const cur = items.map((i) => i.id)
    if (ids.length !== cur.length || ids.some((id, i) => id !== cur[i])) {
      items = ids.map((id) => boxes.byId(id)).filter((b): b is Box => !!b) as TabItem[]
    }
  })

  // remember the pointer while dragging so a tab dropped outside can be placed there
  $effect(() => {
    if (!dndActive) return
    const onMove = (e: PointerEvent) => {
      lastPointer = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  })

  function onTabsConsider(e: CustomEvent<{ items: TabItem[] }>) {
    dndActive = true
    items = e.detail.items
  }

  function onTabsFinalize(
    e: CustomEvent<{ items: TabItem[]; info: { trigger: string; id: string } }>
  ) {
    const clean = e.detail.items.filter((t) => !isShadow(t))
    items = clean
    dndActive = false
    if (e.detail.info.trigger === TRIGGERS.DROPPED_OUTSIDE_OF_ANY) {
      const tab = boxes.byId(e.detail.info.id)
      const v = stage.toVirtual(lastPointer.x, lastPointer.y)
      boxes.detach(e.detail.info.id, v.x - (tab?.w ?? 200) / 2, v.y - TAB_GRAB_Y)
      return
    }
    boxes.setTabOrder(
      box.id,
      clean.map((t) => t.id)
    )
  }

  const owner = $derived(boxes.activeOf(box))
  const isMergeTarget = $derived(boxes.mergeTargetId === box.id)

  const members = $derived.by(() =>
    boxes
      .memberIds(owner)
      .map((id) => services.byId(id))
      .filter((s): s is Service => !!s)
  )

  function memberDrag(svc: Service) {
    return {
      type: 'icon' as const,
      from: 'box' as const,
      id: svc.id,
      ownerId: owner.id,
      label: { icon: svc.icon, name: svc.name },
    }
  }
  function memberDrop(svc: Service, index: number) {
    return {
      type: 'drop-item' as const,
      listKind: 'box' as const,
      boxId: box.id,
      id: svc.id,
      index: boxes.ownerFor(box.id)?.serviceIds.indexOf(svc.id) ?? index,
    }
  }
  function contentList() {
    return { type: 'drop-list' as const, listKind: 'box' as const, boxId: box.id }
  }

  const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

  const CURSORS: Record<string, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
  }

  const DEFAULT_TEXT_SHADOW = '0 0 1px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 3px rgba(0, 0, 0, 0.55)'
  let textColor = $state<string | null>(null)
  let textShadow = $state(DEFAULT_TEXT_SHADOW)
  // transient (hover) expansion of a collapsed box — does NOT change the real `collapsed` state
  let hoverExpanded = $state(false)
  const collapsedView = $derived(box.collapsed && !hoverExpanded)

  const boxStyle = $derived(
    `left:${box.x}px;top:${box.y}px;z-index:${box.z};` +
      (collapsedView
        ? isVert(box.theme.titlePos)
          ? `width:auto;height:${box.h}px;` // vertical title => collapse width
          : `width:${box.w}px;height:auto;` // horizontal title => collapse height
        : `width:${box.w}px;height:${box.h}px;`) +
      `border:${box.theme.border ? '1px solid rgba(255,255,255,0.12)' : 'none'};` +
      `border-radius:${box.theme.radius ? '10px' : '0'};` +
      `font-size:${box.theme.bigFont ? '15px' : '13px'};` +
      (textColor ? `--box-fg:${textColor};` : '') +
      `--box-text-shadow:${textShadow};` +
      (resizing && resizeDir ? `cursor:${CURSORS[resizeDir]}` : '')
  )

  const bgStyle = $derived(
    `background-color:${box.theme.color};` +
      `background-image:${box.theme.bgImage ? `url("${box.theme.bgImage}")` : 'none'};` +
      `background-size:cover;background-position:center;` +
      `opacity:${Math.min(1, Math.max(0, box.theme.opacity / 100))}`
  )

  $effect(() => {
    void box.x
    void box.y
    void box.w
    void box.h
    void box.theme.color
    void box.theme.opacity
    void box.theme.bgImage
    void stage.scale
    void wallpaperSampler.revision
    const raf = requestAnimationFrame(() => {
      const c = computeTextColor()
      textColor = c?.fg ?? null
      textShadow = c?.shadow ?? DEFAULT_TEXT_SHADOW
    })
    return () => cancelAnimationFrame(raf)
  })

  function computeTextColor(): { fg: string; shadow: string } | null {
    const th = box.theme
    const sw = box.w * stage.scale
    const sh = box.h * stage.scale
    if (sw <= 0 || sh <= 0) return null
    const center = stage.toScreen(box.x + box.w / 2, box.y + box.h / 2)
    const wp = wallpaperSampler.sampleAvg(center.x - sw / 2, center.y - sh / 2, sw, sh)
    const layer = th.bgImage ? wallpaperSampler.sampleImageAvg(th.bgImage, sw, sh) : hexToRgb(th.color)
    const a = Math.min(1, Math.max(0, th.opacity / 100))
    const base = layer && wp ? mixRgb(layer, wp, a) : (layer ?? wp)
    if (!base) return null
    const light = isLight(base)
    return {
      fg: light ? '#000' : '#fff',
      shadow: light
        ? '0 1px 1px rgba(255, 255, 255, 0.9), 0 0 2px rgba(255, 255, 255, 0.7)'
        : '0 0 1px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 3px rgba(0, 0, 0, 0.55)',
    }
  }

  const hasTabs = $derived(box.tabs.length > 0)
  const tpos = $derived(box.theme.titlePos)
  const tabpos = $derived(box.theme.tabPos)
  const showTitle = $derived(box.theme.showTitle)
  const showTabs = $derived(hasTabs && !collapsedView)
  const showTitlebar = $derived(showTitle)

  const contentStyle = $derived(
    `--ico:${owner.iconSize}px;` +
      (textColor ? `--box-fg:${textColor};` : '') +
      `--box-text-shadow:${textShadow};`
  )

  function isVert(p: string) {
    return p === 'left' || p === 'right'
  }

  function bringFront() {
    boxes.bringToFront(box.id)
  }

  let lastTitleDownAt = 0

  /** hover over the title (or its hidden strip) temporarily expands a collapsed box */
  function onHotEnter(e: MouseEvent) {
    if (!settings.boxBehavior.hoverExpand) return
    // don't auto-expand when the pointer is over the titlebar controls
    if ((e.target as HTMLElement)?.closest?.('[data-no-drag]')) return
    if (box.collapsed) hoverExpanded = true
  }
  /** a manual toggle flips the real state (and stops hover-auto from undoing it) */
  function toggleCollapseManual() {
    hoverExpanded = false
    boxes.toggleCollapsed(box.id)
  }
  function onBoxLeave() {
    if (hoverPrevTab !== null) {
      boxes.setActiveTab(box.id, hoverPrevTab)
      hoverPrevTab = null
    }
    hoverExpanded = false
  }

  function onTitleDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    // double-click toggles collapse (works even when locked)
    const now = performance.now()
    if (now - lastTitleDownAt < 320) {
      lastTitleDownAt = 0
      e.preventDefault()
      e.stopPropagation()
      toggleCollapseManual()
      return
    }
    lastTitleDownAt = now
    if (box.locked) return
    e.preventDefault()
    e.stopPropagation()
    bringFront()
    dragStart = { x: box.x, y: box.y }
    let started = false
    pointerDrag(e, {
      onMove: (dx, dy, ev) => {
        if (!started) {
          if (dx * dx + dy * dy < 36) return
          started = true
          dragging = true
          dragState.set(true)
        }
        const v = stage.toVirtual(ev.clientX, ev.clientY)
        const target = boxes.hitTopLevel(v.x, v.y, box.id)
        const ok = !!target && boxes.canMerge(box.id, target)
        boxes.setMergeTarget(ok ? target : null)
        mergeInvalid = !!target && !ok
        boxes.applyMove(box.id, dragStart.x + dx / stage.scale, dragStart.y + dy / stage.scale)
      },
      onEnd: (_dx, _dy, ev) => {
        if (!started) return
        const v = stage.toVirtual(ev.clientX, ev.clientY)
        const target = boxes.hitTopLevel(v.x, v.y, box.id)
        if (target) boxes.merge(box.id, target)
        boxes.setMergeTarget(null)
        mergeInvalid = false
        dragging = false
        dragState.set(false)
        guides.clear()
      },
    })
  }

  function onResizeDown(e: PointerEvent, dir: string) {
    if (box.locked || box.collapsed) return
    e.preventDefault()
    e.stopPropagation()
    bringFront()
    resizing = true
    resizeDir = dir
    const sx = box.x
    const sy = box.y
    const sw = box.w
    const sh = box.h
    pointerDrag(e, {
      onMove: (dx, dy) => {
        const ddx = dx / stage.scale
        const ddy = dy / stage.scale
        let w = sw
        let h = sh
        if (dir.includes('e')) w = sw + ddx
        if (dir.includes('s')) h = sh + ddy
        if (dir.includes('w')) w = sw - ddx
        if (dir.includes('n')) h = sh - ddy
        boxes.resizeRect(
          box.id,
          sx,
          sy,
          sw,
          sh,
          w,
          h,
          dir.includes('w'),
          dir.includes('n')
        )
      },
      onEnd: () => {
        resizing = false
        resizeDir = ''
      },
    })
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return
    e.preventDefault()
    e.stopPropagation()
    boxes.setIconSize(owner.id, owner.iconSize - Math.sign(e.deltaY) * 8)
  }

  const TAB_GRAB_Y = 20

  function onTabClick(tabId: string) {
    hoverPrevTab = null
    boxes.setActiveTab(box.id, tabId)
  }

  let hoverPrevTab: string | null = null
  /** hovering a tab temporarily switches to it (restored on leaving the box) */
  function onTabEnter(tabId: string) {
    if (!settings.boxBehavior.hoverTab) return
    if (owner.id === tabId) return
    if (hoverPrevTab === null) hoverPrevTab = owner.id
    boxes.setActiveTab(box.id, tabId)
  }

  function onContext(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    bringFront()
    menus.show({ target: 'box', x: e.clientX, y: e.clientY, box })
  }

  function openOps(e: MouseEvent) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    menus.show({ target: 'box', x: r.left, y: r.bottom, box })
  }

  function openService(svc: Service) {
    recent.record(svc.id)
    window.open(svc.url, '_blank', 'noopener,noreferrer')
  }
</script>

{#snippet titlebar()}
  <div
    class="titlebar"
    class:vertical={isVert(tpos)}
    role="presentation"
    onpointerdown={onTitleDown}
    onmouseenter={onHotEnter}
  >
    <div class="ops left" data-no-drag>
      <button
        class="op"
        class:on={box.collapsed}
        title={box.collapsed ? '展开' : '折叠'}
        onclick={(e) => {
          e.stopPropagation()
          toggleCollapseManual()
        }}
      >
        {#if box.collapsed}<ChevronUp size={15} />{:else}<ChevronDown size={15} />{/if}
      </button>
      <button
        class="op"
        title={owner.layout === 'icons' ? '切换为列表' : '切换为图标'}
        onclick={(e) => {
          e.stopPropagation()
          boxes.toggleLayout(owner.id)
        }}
      >
        {#if owner.layout === 'icons'}<LayoutGrid size={15} />{:else}<List size={15} />{/if}
      </button>
    </div>
    <span class="btitle">{owner.title}</span>
    <div class="ops right" data-no-drag>
      <button
        class="op"
        class:on={box.locked}
        title={box.locked ? '解锁' : '锁定'}
        onclick={(e) => {
          e.stopPropagation()
          boxes.toggleLocked(box.id)
        }}
      >
        {#if box.locked}<Lock size={15} />{:else}<LockOpen size={15} />{/if}
      </button>
      <button class="op" title="菜单" onclick={openOps}><Ellipsis size={15} /></button>
    </div>
  </div>
{/snippet}

{#snippet tabstrip()}
  <div
    class="tabstrip"
    class:vertical={isVert(tabpos)}
    role="tablist"
    tabindex="-1"
    use:dndzone={{
      items,
      type: 'box-tabs',
      dropFromOthersDisabled: true,
      flipDurationMs: flipDur,
      dragDisabled: box.locked,
    }}
    onconsider={onTabsConsider}
    onfinalize={onTabsFinalize}
  >
    {#each items as t (`${t.id}${isShadow(t) ? '_s' : ''}`)}
      <span class="tabcell" animate:flip={{ duration: flipDur }}>
        {#if isShadow(t)}
          <span class="tab shadow" aria-hidden="true"></span>
        {:else}
          <div
            class="tab"
            class:active={owner.id === t.id}
            data-tab-id={t.id}
            role="tab"
            tabindex={box.locked ? -1 : 0}
            aria-selected={owner.id === t.id}
            title={`${boxes.byId(t.id)?.title ?? t.title}（拖动排序 / 拖出）`}
            onclick={() => onTabClick(t.id)}
            onmouseenter={() => onTabEnter(t.id)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onTabClick(t.id)
              }
            }}
          >
            {boxes.byId(t.id)?.title ?? t.title}
          </div>
        {/if}
      </span>
    {/each}
  </div>
{/snippet}

<div
  class="box"
  class:dragging
  class:merge-invalid={mergeInvalid}
  class:resizing
  class:locked={box.locked}
  class:merge-target={isMergeTarget}
  data-box={box.id}
  role="presentation"
  style={boxStyle}
  oncontextmenu={onContext}
  onpointerdown={bringFront}
  onmouseleave={onBoxLeave}
>
  <div class="box-bg" style={bgStyle}></div>

  {#if tpos === 'top' || (showTabs && tabpos === 'top')}
    <div class="edge top">
      {#if showTitlebar && tpos === 'top'}{@render titlebar()}{/if}
      {#if showTabs && tabpos === 'top'}{@render tabstrip()}{/if}
      {#if !showTitlebar && tpos === 'top' && !(showTabs && tabpos === 'top')}
        <div class="hot-title" role="presentation" onpointerdown={onTitleDown} onmouseenter={onHotEnter}></div>
      {/if}
    </div>
  {/if}

  <div class="mid">
    {#if tpos === 'left' || (showTabs && tabpos === 'left')}
      <div class="edge left">
        {#if showTitlebar && tpos === 'left'}{@render titlebar()}{/if}
        {#if showTabs && tabpos === 'left'}{@render tabstrip()}{/if}
        {#if !showTitlebar && tpos === 'left' && !(showTabs && tabpos === 'left')}
          <div class="hot-title" role="presentation" onpointerdown={onTitleDown} onmouseenter={onHotEnter}></div>
        {/if}
      </div>
    {/if}

    {#if !collapsedView}
      <div class="content-wrap">
        <div
          class="content"
          class:list={owner.layout === 'list'}
          class:icon-only={box.theme.iconOnly}
          class:dnd-end={dnd.endKey === 'box:' + box.id}
          role="list"
          style={contentStyle}
          onwheel={onWheel}
          use:dropList={{ getData: contentList }}
        >
          {#each members as svc, i (svc.id)}
            <div
              class="mi"
              animate:flip={{ duration: flipDur }}
              use:dragSource={{ getData: () => memberDrag(svc), disabled: () => box.locked || owner.kind === 'recent' }}
              use:dropItem={{ getData: () => memberDrop(svc, i) }}
            >
              {#if owner.layout === 'list'}
                <div
                  class="row"
                  data-svc-id={svc.id}
                  role="button"
                  tabindex={box.locked ? -1 : 0}
                  onclick={() => openService(svc)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openService(svc)
                    }
                  }}
                >
                  <span class="ico"><IconGlyph icon={svc.icon} alt={svc.name} /></span>
                  <span class="meta">
                    <span class="name">{svc.name}</span>
                    {#if svc.desc}<span class="desc">{svc.desc}</span>{/if}
                  </span>
                </div>
              {:else}
                <div
                  class="cell"
                  data-svc-id={svc.id}
                  role="button"
                  tabindex={box.locked ? -1 : 0}
                  title={svc.desc ?? svc.name}
                  onclick={() => openService(svc)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openService(svc)
                    }
                  }}
                >
                  <span class="ico"><IconGlyph icon={svc.icon} alt={svc.name} /></span>
                  <span class="name">{svc.name}</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        {#if members.length === 0}
          <div class="empty">
            {owner.kind === 'mapped'
              ? '该分类暂无项目'
              : owner.kind === 'recent'
                ? '暂无最近使用'
                : '从资源导航拖入图标以添加'}
          </div>
        {/if}
      </div>
    {/if}

    {#if tpos === 'right' || (showTabs && tabpos === 'right')}
      <div class="edge right">
        {#if showTabs && tabpos === 'right'}{@render tabstrip()}{/if}
        {#if showTitlebar && tpos === 'right'}{@render titlebar()}{/if}
        {#if !showTitlebar && tpos === 'right' && !(showTabs && tabpos === 'right')}
          <div class="hot-title" role="presentation" onpointerdown={onTitleDown} onmouseenter={onHotEnter}></div>
        {/if}
      </div>
    {/if}
  </div>

  {#if tpos === 'bottom' || (showTabs && tabpos === 'bottom')}
    <div class="edge bottom">
      {#if showTabs && tabpos === 'bottom'}{@render tabstrip()}{/if}
      {#if showTitlebar && tpos === 'bottom'}{@render titlebar()}{/if}
      {#if !showTitlebar && tpos === 'bottom' && !(showTabs && tabpos === 'bottom')}
        <div class="hot-title" role="presentation" onpointerdown={onTitleDown} onmouseenter={onHotEnter}></div>
      {/if}
    </div>
  {/if}

  {#if !box.locked && !box.collapsed}
    {#each RESIZE_DIRS as d (d)}
      <div class="rh rh-{d}" role="presentation" onpointerdown={(e) => onResizeDown(e, d)}></div>
    {/each}
  {/if}
</div>

<style>
  .box {
    position: absolute;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--dt-panel-border, rgba(255, 255, 255, 0.12));
    pointer-events: auto;
    color: var(--dt-fg, #e8ecf4);
    font-size: 13px;
  }
  .box-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    pointer-events: none;
  }
  .box > .edge,
  .box > .mid {
    position: relative;
    z-index: 1;
  }
  /* thin in-flow strip replacing a hidden titlebar (double-click to collapse/expand, drag to move) */
  .hot-title {
    flex: 0 0 auto;
    z-index: 1;
    cursor: default;
  }
  .edge.top > .hot-title,
  .edge.bottom > .hot-title {
    width: 100%;
    height: 8px;
  }
  .edge.left > .hot-title,
  .edge.right > .hot-title {
    width: 8px;
    flex: 1 1 auto;
  }
  .box.dragging {
    cursor: grabbing;
  }
  .box.dragging .titlebar,
  .box.dragging .hot-title {
    cursor: grabbing;
  }
  .box.dragging.merge-invalid,
  .box.dragging.merge-invalid .titlebar,
  .box.dragging.merge-invalid .hot-title {
    cursor: not-allowed;
  }
  .box.resizing {
    cursor: nwse-resize;
  }
  .box.merge-target {
    border-color: #6ea8ff;
    box-shadow: 0 0 0 2px rgba(110, 168, 255, 0.6);
  }
  .edge {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    min-width: 0;
    min-height: 0;
  }
  .mid {
    display: flex;
    flex-direction: row;
    flex: 1 1 auto;
    min-height: 0;
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
    height: 40px;
    padding: 0 8px 0 12px;
    background: transparent;
    border-bottom: 1px solid var(--dt-panel-border, rgba(255, 255, 255, 0.12));
    cursor: default;
    user-select: none;
  }
  .titlebar.vertical {
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    width: 40px;
    height: auto;
    padding: 10px 0;
    border-bottom: none;
  }
  .titlebar.vertical .btitle {
    writing-mode: vertical-rl;
    text-orientation: mixed;
  }
  .titlebar.vertical .ops {
    flex-direction: column;
  }
  .btitle {
    flex: 1;
    font-size: 15px;
    text-align: center;
    color: var(--box-fg, var(--dt-fg, #e8ecf4));
    text-shadow: var(--box-text-shadow, 0 0 1px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 3px rgba(0, 0, 0, 0.55));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ops {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .titlebar:hover .ops,
  .ops:focus-within {
    opacity: 1;
  }
  .op {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--box-fg, var(--dt-fg, #e8ecf4));
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }
  .op:hover {
    background: rgba(127, 127, 127, 0.28);
  }
  .op.on {
    background: rgba(110, 168, 255, 0.35);
  }
  .tabstrip {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
    padding: 6px 8px 0;
    background: var(--dt-box-tab, rgba(0, 0, 0, 0.18));
  }
  .tabcell {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
  }
  .tab {
    flex: 1 1 0;
    min-width: 0;
    padding: 8px 18px;
    border: none;
    border-radius: 8px 8px 0 0;
    background: transparent;
    color: var(--box-fg, #fff);
    text-shadow: var(--box-text-shadow, 0 0 1px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 3px rgba(0, 0, 0, 0.55));
    font-size: 14px;
    text-align: center;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab:active {
    cursor: pointer;
  }
  .tab.shadow {
    background: rgba(127, 127, 127, 0.22);
    box-shadow: inset 0 -2px 0 var(--box-fg, #fff);
    opacity: 0.7;
    pointer-events: none;
  }
  .tab:hover {
    background: transparent;
    color: var(--box-fg, #fff);
    box-shadow: inset 0 -2px 0 var(--box-fg, rgba(255, 255, 255, 0.4));
    opacity: 0.75;
  }
  .tab.active {
    background: transparent;
    color: var(--box-fg, #fff);
    box-shadow: inset 0 -2px 0 var(--box-fg, #fff);
    opacity: 1;
  }
  .tabstrip.vertical {
    flex: 1 1 auto;
    flex-direction: column;
    padding: 8px 0 0 6px;
  }
  .tabstrip.vertical .tab {
    max-width: none;
    max-height: none;
    writing-mode: vertical-rl;
    border-radius: 8px 0 0 8px;
  }
  .tabstrip.vertical .tab:hover {
    box-shadow: inset -2px 0 0 var(--box-fg, rgba(255, 255, 255, 0.4));
  }
  .tabstrip.vertical .tab.active {
    box-shadow: inset -2px 0 0 var(--box-fg, #fff);
  }
  .content-wrap {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
  }
  .mi {
    position: relative;
    display: flex;
    min-width: 0;
  }
  .content.list .mi {
    display: block;
  }
  .content {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 10px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--ico, 64px), 1fr));
    gap: 8px;
    align-content: start;
    color: var(--box-fg, var(--dt-fg, #e8ecf4));
  }
  .content.list {
    display: block;
  }
  /* "仅显示图标" only affects the icons layout, not the list layout */
  .content.icon-only:not(.list) .name,
  .content.icon-only:not(.list) .desc {
    display: none;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1 1 auto;
    padding: 8px 4px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: default;
    overflow: hidden;
  }
  .cell:hover {
    background: rgba(127, 127, 127, 0.2);
  }
  .ico {
    font-size: calc(var(--ico, 64px) * 0.45);
    line-height: 1;
  }
  .ico :global(img) {
    width: calc(var(--ico, 64px) * 0.55);
    height: calc(var(--ico, 64px) * 0.55);
    object-fit: contain;
  }
  .row .ico :global(img) {
    width: calc(var(--ico, 64px) * 0.42);
    height: calc(var(--ico, 64px) * 0.42);
  }
  .cell .name {
    max-width: 100%;
    font-size: calc(var(--ico, 64px) * 0.18);
    text-shadow: var(--box-text-shadow, 0 0 1px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 3px rgba(0, 0, 0, 0.55));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: default;
  }
  .row:hover {
    background: rgba(127, 127, 127, 0.2);
  }
  .row .ico {
    font-size: calc(var(--ico, 64px) * 0.34);
  }
  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .row .name {
    font-size: calc(var(--ico, 64px) * 0.20);
  }
  .desc {
    font-size: 11px;
    color: var(--box-fg, var(--dt-fg-muted, #9aa4b5));
    opacity: 0.8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    text-align: center;
    font-size: 12px;
    color: var(--box-fg, var(--dt-fg-muted, #9aa4b5));
    text-shadow: var(--box-text-shadow, 0 0 1px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8), 0 0 3px rgba(0, 0, 0, 0.55));
    pointer-events: none;
  }
  .rh {
    position: absolute;
    z-index: 5;
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


