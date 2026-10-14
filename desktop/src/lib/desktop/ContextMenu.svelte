<script lang="ts">
  import { menus } from './menuStore.svelte'
  import MenuList from './MenuList.svelte'

  let el: HTMLDivElement | undefined = $state()
  let pos = $state({ x: 0, y: 0 })

  // measure the real size and clamp the root menu inside the viewport
  $effect(() => {
    if (!menus.open) return
    const x0 = menus.x
    const y0 = menus.y
    const w = el?.offsetWidth ?? 200
    const h = el?.offsetHeight ?? 200
    pos = {
      x: Math.max(4, Math.min(x0, window.innerWidth - w - 4)),
      y: Math.max(4, Math.min(y0, window.innerHeight - h - 4)),
    }
  })

  function onWindowDown(e: PointerEvent) {
    if (!(e.target as HTMLElement)?.closest?.('.ctxmenu')) menus.close()
  }
</script>

<svelte:window onpointerdown={onWindowDown} onkeydown={(e) => e.key === 'Escape' && menus.close()} />

{#if menus.open}
  <div class="ctxmenu mac" bind:this={el} style="left:{pos.x}px;top:{pos.y}px" role="menu">
    <MenuList items={menus.items} />
  </div>
{/if}

<style>
  /* theme-token backed menu palette (follows color mode + accent + contrast) */
  .mac {
    --mx-bg: var(--dt-menu-bg, #ececec);
    --mx-hover-bg: var(--dt-accent, #0165e1);
    --mx-active-bg: var(--dt-accent, #0165e1);
    --mx-divider: var(--dt-panel-border, #d2d2d2);
    --mx-text: var(--dt-fg, #232323);
    --mx-hover-text: var(--dt-accent-fg, #fff);
    --mx-disabled-text: var(--dt-fg-muted, #bbbbbb);
    --mx-shadow: var(--dt-shadow, rgba(0, 0, 0, 0.2));
    --mx-border: var(--dt-border, #bbbbbb);
    --mx-radius: 10px;
  }

  .ctxmenu {
    position: fixed;
    z-index: 100000;
    min-width: 200px;
    padding: 8px 0;
    border-radius: var(--mx-radius, 10px);
    background-color: var(--mx-bg, #ececec);
    border: 1px solid var(--mx-border, #bbbbbb);
    box-shadow: 0px 5px 7px 1px var(--mx-shadow, rgba(0, 0, 0, 0.1));
    color: var(--mx-text, #232323);
    font-size: 14px;
    user-select: none;
  }
</style>
