<script lang="ts">
  import { flip } from 'svelte/animate'
  import IconGlyph from '../IconGlyph.svelte'
  import { dnd, dragSource, dropItem, dropList } from '../dnd/dnd.svelte'
  import { recent } from '../state/recent.svelte'
  import { editor } from '../state/editor.svelte'
  import { Pencil } from '@lucide/svelte'
  import type { ResourceItem } from './resourceItem'

  let { name, items }: { name: string; items: ResourceItem[] } = $props()

  const flipDur =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : 160

  function dragData(item: ResourceItem) {
    return {
      type: 'icon' as const,
      from: 'res' as const,
      id: item.id,
      cat: name,
      label: { icon: item.icon, name: item.name },
    }
  }
  function dropData(item: ResourceItem, index: number) {
    return {
      type: 'drop-item' as const,
      listKind: 'cat' as const,
      cat: name,
      id: item.id,
      index,
    }
  }
  function listData() {
    return { type: 'drop-list' as const, listKind: 'cat' as const, cat: name }
  }

  function open(item: ResourceItem) {
    recent.record(item.id)
    window.open(item.href, '_blank', 'noopener')
  }
</script>

<section class="cate">
  <h2 id="cat-{name}">{name}</h2>
  <ul
    class="grid"
    class:dnd-end={dnd.endKey === 'cat:' + name}
    data-res-cat={name}
    use:dropList={{ getData: listData }}
  >
    {#each items as item, i (item.id)}
      <li
        class="card"
        data-svc-id={item.id}
        animate:flip={{ duration: flipDur }}
        use:dragSource={{ getData: () => dragData(item) }}
        use:dropItem={{ getData: () => dropData(item, i) }}
      >
        <button
          class="edit"
          title="编辑"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation()
            editor.show(item.id)
          }}><Pencil size={14} /></button
        >
        <span class="card-icon">
          <IconGlyph icon={item.icon} alt={item.name} />
        </span>
        <div class="card-body">
          <h4 class="card-title">
            <a
              href={item.href}
              draggable="false"
              onclick={(e) => {
                e.preventDefault()
                open(item)
              }}>{item.name}</a
            >
          </h4>
          <p class="card-desc">{item.desc}</p>
          {#if item.tags.length}
            <div class="tags">
              {#each item.tags as t (t)}
                <span class="tag">{t}</span>
              {/each}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .cate {
    margin-bottom: 26px;
  }
  .cate h2 {
    font-size: 17px;
    font-weight: 600;
    margin: 0 0 14px;
    color: var(--dt-fg, #eef2f9);
    scroll-margin-top: 20px;
  }
  .grid {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: row;
    gap: 12px;
    padding: 12px 16px;
    cursor: default;
    border-radius: 8px;
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.1));
    background: var(--dt-panel, rgba(255, 255, 255, 0.035));
    overflow: hidden;
    transition:
      transform 0.3s ease-in-out,
      box-shadow 0.3s ease-in-out,
      border-color 0.3s ease-in-out;
  }
  .card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 20px -10px rgba(0, 0, 0, 0.6);
    border-color: var(--dt-accent, rgba(79, 140, 255, 0.5));
  }
  .edit {
    position: absolute;
    top: 6px;
    right: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--dt-border, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    background: var(--dt-input-bg, rgba(0, 0, 0, 0.25));
    color: var(--dt-fg, #eaf0fa);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .card:hover .edit,
  .edit:focus-visible {
    opacity: 1;
  }
  .edit:hover {
    background: var(--dt-hover, rgba(127, 127, 127, 0.3));
  }
  .card-icon {
    position: relative;
    align-self: center;
    width: 64px;
    height: 64px;
    min-width: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 38px;
    line-height: 1;
  }
  .card-icon :global(img) {
    width: 46px;
    height: 46px;
    object-fit: contain;
  }
  .card-body {
    min-width: 0;
    padding: 2px 0 0 4px;
  }
  .card-title {
    display: flex;
    align-items: center;
    margin: 0 0 4px;
    font-size: 15px;
  }
  .card-title a {
    color: var(--dt-fg, #eaf0fa);
    text-decoration: none;
  }
  .card-title a:hover {
    color: var(--dt-accent, #6ea8ff);
  }
  .card-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.66;
    color: var(--dt-fg-muted, #9aa4b5);
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .tag {
    font-size: 11px;
    line-height: 1;
    padding: 3px 7px;
    border-radius: 4px;
    background: var(--dt-accent-soft, rgba(79, 140, 255, 0.16));
    color: var(--dt-accent, #8fbaff);
    white-space: nowrap;
  }
</style>

