<script lang="ts">
  import type { MenuItem } from './types'
  import { menus } from './menuStore.svelte'
  import Self from './MenuList.svelte'
  import { Check, ChevronRight } from '@lucide/svelte'

  let { items }: { items: MenuItem[] } = $props()

  let openId = $state<string | null>(null)
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let switchTimer: ReturnType<typeof setTimeout> | undefined

  const SWITCH_DELAY = 180
  const CLOSE_DELAY = 250

  function clearTimers() {
    if (closeTimer) clearTimeout(closeTimer)
    if (switchTimer) clearTimeout(switchTimer)
  }

  function onItemEnter(id: string) {
    if (openId === id) {
      clearTimers()
      return
    }
    if (openId === null) {
      clearTimers()
      openId = id
      return
    }
    // another submenu is open -> defer switching so a diagonal pass-by keeps it open
    clearTimers()
    switchTimer = setTimeout(() => {
      openId = id
    }, SWITCH_DELAY)
  }

  function onItemLeave(id: string) {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (openId === id) openId = null
    }, CLOSE_DELAY)
  }

  let subEl: HTMLDivElement | undefined = $state()
  let subStyle = $state('')
  let flip = $state(false)

  // measure the open flyout and flip it left / clamp it up when it would overflow
  $effect(() => {
    if (!openId || !subEl) return
    const item = subEl.parentElement
    if (!item) return
    const r = item.getBoundingClientRect()
    const sw = subEl.offsetWidth
    const sh = subEl.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 4

    const openLeft = r.right + gap + sw > vw - 4 && r.left - gap - sw >= 4
    let top = -6
    if (r.top + top + sh > vh - 4) top -= r.top + top + sh - (vh - 4)
    if (r.top + top < 4) top = 4 - r.top

    flip = openLeft
    subStyle =
      (openLeft
        ? `right:100%;left:auto;margin-left:0;margin-right:${gap}px;`
        : `left:100%;right:auto;margin-left:${gap}px;margin-right:0;`) + `top:${top}px;`
  })
</script>

<div class="menu-list">
  {#each items as item (item.id)}
    {#if item.separator}
      <div class="sep"></div>
    {:else if item.submenu}
      <div
        class="item sub"
        class:disabled={item.disabled}
        class:open={openId === item.id}
        role="menuitem"
        tabindex="0"
        aria-haspopup="true"
        onmouseenter={() => onItemEnter(item.id)}
        onmouseleave={() => onItemLeave(item.id)}
      >
        <span class="ic">{#if item.checked}<Check size={14} />{:else}{item.icon ?? ''}{/if}</span>
        <span class="lb">{item.label}</span>
        <span class="arrow"><ChevronRight size={14} /></span>
        {#if openId === item.id}
          <div
            class="submenu"
            class:flip
            bind:this={subEl}
            style={subStyle}
            role="menu"
            tabindex="-1"
            onmouseenter={clearTimers}
          >
            <Self items={item.submenu} />
          </div>
        {/if}
      </div>
    {:else}
      <button
        class="item"
        class:disabled={item.disabled}
        class:danger={item.danger}
        role="menuitem"
        onclick={() => menus.run(item)}
      >
        <span class="ic">{#if item.checked}<Check size={14} />{:else}{item.icon ?? ''}{/if}</span>
        <span class="lb">{item.label}</span>
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu-list {
    position: relative;
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 12px);
    margin: 0 6px;
    padding: 3px 6px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: default;
    white-space: nowrap;
  }
  .item:hover:not(.disabled),
  .item.open:not(.disabled) {
    background-color: var(--mx-hover-bg, #0165e1);
    color: var(--mx-hover-text, #fff);
  }
  .item:hover:not(.disabled) > .ic,
  .item.open:not(.disabled) > .ic {
    color: var(--mx-hover-text, #fff);
  }
  .item.danger:hover:not(.disabled) {
    background-color: var(--dt-danger, #e04a4a);
    color: #fff;
  }
  .item.disabled {
    color: var(--mx-disabled-text, #bbbbbb);
    cursor: not-allowed;
  }
  .item.disabled:hover {
    background: transparent;
  }
  .item.open {
    z-index: 2;
  }
  .ic {
    width: 16px;
    flex: 0 0 auto;
    text-align: center;
    color: var(--mx-text, currentColor);
  }
  .lb {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .arrow {
    opacity: 0.7;
    font-size: 15px;
    line-height: 1;
  }
  .sep {
    display: block;
    padding: 5px 0;
    margin: 0 12px;
  }
  .sep::after {
    display: block;
    content: '';
    height: 1px;
    background-color: var(--mx-divider, #d2d2d2);
  }
  .submenu {
    position: absolute;
    left: 100%;
    top: -6px;
    margin-left: 4px;
    min-width: 150px;
    padding: 8px 0;
    border-radius: var(--mx-radius, 10px);
    background-color: var(--mx-bg, #ececec);
    border: 1px solid var(--mx-border, #bbbbbb);
    box-shadow: 0px 5px 7px 1px var(--mx-shadow, rgba(0, 0, 0, 0.1));
    color: var(--mx-text, #232323);
  }
  /* invisible hover bridge so the pointer never crosses a dead gap */
  .submenu::before {
    content: '';
    position: absolute;
    left: -16px;
    top: 0;
    bottom: 0;
    width: 16px;
  }
  /* flipped flyout: bridge on the right, arrow points left */
  .submenu.flip::before {
    left: auto;
    right: -16px;
  }
</style>
