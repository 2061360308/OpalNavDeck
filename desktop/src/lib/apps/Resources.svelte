<script lang="ts">
  import type { WindowState } from '../types'
  import { services } from '../state/services.svelte'
  import { wm } from '../state/windows.svelte'
  import ResourceCategory from './ResourceCategory.svelte'
  import { editor } from '../state/editor.svelte'
  import type { ResourceItem } from './resourceItem'

  let { win }: { win: WindowState } = $props()

  type Cat = { name: string; items: ResourceItem[] }

  const cats = $derived.by<Cat[]>(() => {
    const map = new Map<string, { item: ResourceItem; order: number; idx: number }[]>()
    let idx = 0
    for (const s of services.list) {
      const group = s.group?.trim() || '未分类'
      const arr = map.get(group) ?? []
      arr.push({
        item: {
          id: s.id,
          name: s.name,
          desc: s.desc ?? '',
          href: s.url,
          icon: s.icon,
          tags: s.tags ?? [],
        },
        order: s.order ?? Number.MAX_SAFE_INTEGER,
        idx: idx++,
      })
      map.set(group, arr)
    }
    return [...map.entries()].map(([name, arr]) => ({
      name,
      items: arr
        .sort((a, b) => a.order - b.order || a.idx - b.idx)
        .map((x) => x.item),
    }))
  })

  let active = $state<string>('')
  let mainEl: HTMLElement | undefined = $state()

  function scrollTo(name: string) {
    active = name
    mainEl?.querySelector<HTMLElement>(`#cat-${CSS.escape(name)}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function onScroll() {
    if (!mainEl) return
    const top = mainEl.getBoundingClientRect().top
    let current = cats[0]?.name ?? ''
    for (const c of cats) {
      const el = mainEl.querySelector<HTMLElement>(`#cat-${CSS.escape(c.name)}`)
      if (el && el.getBoundingClientRect().top - top <= 80) current = c.name
    }
    active = current
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && wm.close(win.id)} />

<div class="resources">
  <aside class="sidebar">
    <button class="new-btn" onclick={() => editor.show()}>＋ 新建项目</button>
    <div class="sidebar-title">分类</div>
    <ul class="sidebar-list">
      {#each cats as c (c.name)}
        <li>
          <button class="sidebar-link" class:active={active === c.name} onclick={() => scrollTo(c.name)}
            >{c.name}</button
          >
        </li>
      {/each}
    </ul>
    <button class="close-btn" onclick={() => wm.close(win.id)}>关闭</button>
  </aside>

  <main class="main" bind:this={mainEl} onscroll={onScroll}>
    {#each cats as c (c.name)}
      <ResourceCategory name={c.name} items={c.items} />
    {/each}
  </main>
</div>

<style>
  .resources {
    display: flex;
    height: 100%;
    background: var(--dt-window-bg, #101219);
    color: var(--dt-fg, #dbe2ee);
  }
  .sidebar {
    flex: 0 0 220px;
    width: 220px;
    display: flex;
    flex-direction: column;
    padding: 22px 16px;
    border-right: 1px solid var(--dt-border, rgba(255, 255, 255, 0.08));
    overflow-y: auto;
  }
  .sidebar-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dt-fg-muted, #7f8a9c);
    margin-bottom: 14px;
  }
  .sidebar-list {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
  }
  .sidebar-list li {
    margin-top: 10px;
  }
  .sidebar-link {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--dt-fg-muted, #b9c3d4);
    font-size: 13px;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
  }
  .sidebar-link:hover {
    background: var(--dt-hover, rgba(255, 255, 255, 0.06));
    color: var(--dt-fg, #e8ecf4);
  }
  .sidebar-link.active {
    color: var(--dt-accent, #6ea8ff);
    background: var(--dt-accent-soft, rgba(79, 140, 255, 0.14));
  }
  .new-btn {
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 16px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--dt-accent-soft, rgba(79, 140, 255, 0.16));
    color: var(--dt-fg, #dbe2ee);
    font-size: 13px;
    cursor: pointer;
  }
  .new-btn:hover {
    background: var(--dt-accent-soft2, rgba(79, 140, 255, 0.32));
  }
  .close-btn {
    margin-top: 16px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.12));
    background: var(--dt-input-bg, rgba(255, 255, 255, 0.05));
    color: var(--dt-fg, #c7d0de);
    cursor: pointer;
  }
  .close-btn:hover {
    background: var(--dt-danger, #e04a4a);
    color: #fff;
  }
  .main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 26px 34px 72px;
    scroll-behavior: smooth;
  }
</style>
