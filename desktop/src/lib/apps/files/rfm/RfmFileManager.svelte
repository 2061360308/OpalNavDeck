<script lang="ts">
  import { onMount } from 'svelte'
  import type { WindowState } from '../../../types'
  import './theme.css'
  import { RfmController } from './controller.svelte'
  import Sidebar from './Sidebar.svelte'
  import Browser from './Browser.svelte'
  import DetailsPane from './DetailsPane.svelte'
  import { settings } from '../../../desktop/settings.svelte'
  import { themes } from '../../../desktop/themes.svelte'
  import { wm } from '../../../state/windows.svelte'
  import { isPendingPick, pickAccept, resolvePick } from './pick'

  let { win }: { win: WindowState } = $props()

  const ctrl = new RfmController()
  let rootEl: HTMLDivElement | undefined = $state()

  const rfmTheme = $derived(themes.resolve(settings.theme))
  const rfmContrast = $derived(settings.contrast)

  onMount(() => {
    const pickId = win.data?.pickId
    if (isPendingPick(pickId)) {
      ctrl.picking = true
      ctrl.accept = pickAccept(pickId) ?? null
      ctrl.onPick = (node) => {
        resolvePick(pickId, node.id)
        wm.close(win.id)
      }
    }
    void ctrl.init('/')
    if (!rootEl) return
    const update = () => ctrl.setWidth(rootEl?.clientWidth ?? 0)
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(rootEl)
    return () => {
      ro?.disconnect()
      if (isPendingPick(pickId)) resolvePick(pickId, null)
    }
  })
</script>

<div
  class="rfm-root"
  role="application"
  data-theme={rfmTheme}
  data-contrast={rfmContrast}
  aria-label={ctrl.labels.fileManager}
  bind:this={rootEl}
>
  <div class="rfm-live" aria-live="polite" aria-atomic="true"></div>
  <div
    class="rfm-layout"
    data-sidebar={ctrl.showSidebar ? undefined : 'false'}
    data-details={ctrl.showDetails ? undefined : 'false'}
  >
    {#if ctrl.showSidebar}<Sidebar {ctrl} />{/if}
    <Browser {ctrl} />
    {#if ctrl.showDetails}<DetailsPane {ctrl} />{/if}
  </div>

  {#if ctrl.sidebarDrawer}
    <button
      class="rfm-scrim"
      aria-label="Close sidebar"
      onclick={() => (ctrl.sidebarDrawer = false)}
    ></button>
    <div class="rfm-drawer rfm-drawer-left"><Sidebar {ctrl} /></div>
  {/if}

  {#if ctrl.detailsDrawer}
    <button
      class="rfm-scrim"
      aria-label="Close details"
      onclick={() => (ctrl.detailsDrawer = false)}
    ></button>
    <div class="rfm-drawer rfm-drawer-right"><DetailsPane {ctrl} /></div>
  {/if}
</div>

<style>
  .rfm-root {
    position: relative;
  }
  .rfm-layout[data-sidebar="false"][data-details="false"] {
    grid-template-columns: minmax(0, 1fr);
  }
  .rfm-layout[data-sidebar="false"]:not([data-details="false"]) {
    grid-template-columns: minmax(0, 1fr) var(--rfm-details-width);
  }
  .rfm-layout[data-sidebar="false"]:not([data-details="false"]) :global(.rfm-details) {
    border-inline-start: 1px solid var(--rfm-border);
  }

  .rfm-scrim {
    position: absolute;
    inset: 0;
    z-index: 30;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.35);
  }

  .rfm-drawer {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 31;
    width: min(280px, 82%);
    display: flex;
    background: var(--rfm-surface-sunken);
    box-shadow: var(--rfm-shadow);
  }
  .rfm-drawer-left {
    left: 0;
    border-inline-end: 1px solid var(--rfm-border);
  }
  .rfm-drawer-right {
    right: 0;
    border-inline-start: 1px solid var(--rfm-border);
  }
  .rfm-drawer :global(.rfm-sidebar),
  .rfm-drawer :global(.rfm-details) {
    flex: 1;
    height: 100%;
    border: 0;
  }
</style>
