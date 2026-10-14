<script lang="ts">
  import type { RfmNode } from './types'
  import type { RfmController } from './controller.svelte'
  import { getExtension } from './types'
  import { formatBytes } from './formatBytes'
  import IconFrame from './IconFrame.svelte'
  import NodeIcon from './NodeIcon.svelte'

  let { item, ctrl }: { item: RfmNode; ctrl: RfmController } = $props()

  const isFolder = $derived(item.kind === 'folder')
  const isSelected = $derived(ctrl.selectedId === item.id)
  const iconSize = $derived(ctrl.view === 'cards' ? 28 : 16)
</script>

<div class="rfm-row">
  <div
    role="option"
    tabindex="-1"
    aria-selected={isSelected}
    aria-label={item.name}
    data-view={ctrl.view}
    data-kind={item.kind}
    data-focused={isSelected || undefined}
    class="rfm-item"
    onclick={() => ctrl.select(item)}
    ondblclick={() => ctrl.activate(item)}
    onkeydown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        ctrl.activate(item)
      } else if (e.key === ' ') {
        e.preventDefault()
        ctrl.select(item)
      }
    }}
  >
    <IconFrame size={iconSize}>
      <NodeIcon node={item} size={iconSize} />
    </IconFrame>
    <span class="rfm-item-name" title={item.name}>
      <span class="rfm-item-label" data-view={ctrl.view}>{item.name}</span>
      {#if item.path}<span class="rfm-item-path">{item.path}</span>{/if}
    </span>
    {#if ctrl.view === 'list'}
      <span class="rfm-item-meta">
        {isFolder
          ? ctrl.labels.itemsCount(item.children?.length ?? 0)
          : formatBytes(item.size) || getExtension(item).toUpperCase()}
      </span>
    {/if}
    <span class="rfm-more" data-view={ctrl.view}></span>
  </div>
</div>
