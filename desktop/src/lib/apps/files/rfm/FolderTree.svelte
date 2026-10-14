<script lang="ts">
  import type { RfmNode } from './types'
  import type { RfmController } from './controller.svelte'
  import Icon from './Icon.svelte'
  import IconFrame from './IconFrame.svelte'
  import NodeIcon from './NodeIcon.svelte'
  import Self from './FolderTree.svelte'

  let {
    folders,
    ctrl,
    depth = 0,
  }: { folders: RfmNode[]; ctrl: RfmController; depth?: number } = $props()
</script>

{#each folders as node (node.id)}
  {@const isFolder = node.kind === 'folder'}
  {@const hasChildren = isFolder && (node.children?.length ?? 0) > 0}
  {@const isExpanded = ctrl.expanded.has(node.id)}
  {@const isActive = isFolder && ctrl.path === node.id}
  <div>
    <div
      role="treeitem"
      aria-selected={isActive}
      aria-label={node.name}
      tabindex="0"
      data-kind={node.kind}
      class="rfm-tree-row"
      style="padding-inline-start:{6 + depth * 12}px"
      onclick={() => (isFolder ? ctrl.open(node.id) : ctrl.select(node))}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (isFolder) ctrl.open(node.id)
          else ctrl.select(node)
        }
      }}
      ondblclick={() => {
        if (!isFolder) ctrl.activate(node)
      }}
    >
      <button
        type="button"
        class="rfm-tree-chevron"
        aria-label={isExpanded ? ctrl.labels.collapseFolder : ctrl.labels.expandFolder}
        aria-expanded={hasChildren ? isExpanded : undefined}
        disabled={!hasChildren}
        onclick={(e) => {
          e.stopPropagation()
          if (hasChildren) ctrl.toggleExpanded(node.id)
        }}
      >
        <Icon name="chevron-right" size={14} />
      </button>
      <IconFrame size={16}>
        <NodeIcon node={node} size={16} />
      </IconFrame>
      <span class="rfm-item-name" title={node.name}>{node.name}</span>
    </div>
    {#if hasChildren && isExpanded}
      <div><Self folders={node.children ?? []} {ctrl} depth={depth + 1} /></div>
    {/if}
  </div>
{/each}
