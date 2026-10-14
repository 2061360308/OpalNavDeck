<script lang="ts">
  import type { RfmController } from './controller.svelte'
  import { getExtension } from './types'
  import { formatBytes } from './formatBytes'
  import IconFrame from './IconFrame.svelte'
  import NodeIcon from './NodeIcon.svelte'
  import Icon from './Icon.svelte'

  let { ctrl }: { ctrl: RfmController } = $props()

  const node = $derived(ctrl.selectedNode)
  const isFolder = $derived(node?.kind === 'folder')
  const ext = $derived(node ? getExtension(node) : '')
</script>

<aside class="rfm-details">
  {#if !node}
    <div class="rfm-details-empty">
      <IconFrame size={40}>
        <NodeIcon node={{ id: 'empty', name: '', kind: 'folder' }} size={40} />
      </IconFrame>
      <p>{ctrl.labels.detailsEmpty}</p>
    </div>
  {:else}
    <div class="rfm-details-body">
      <div class="rfm-preview-stage">
        <IconFrame size={40}>
          <NodeIcon {node} size={40} />
        </IconFrame>
        <span class="rfm-item-meta">
          {isFolder ? ctrl.labels.itemsCount(node.children?.length ?? 0) : (ext || ctrl.labels.file).toUpperCase()}
        </span>
      </div>
      <div>
        <h3 class="rfm-details-title">{node.name}</h3>
        <dl class="rfm-details-dl">
          <div class="rfm-details-row">
            <dt>{ctrl.labels.type}</dt>
            <dd>{isFolder ? ctrl.labels.folder : (ext || ctrl.labels.file).toUpperCase()}</dd>
          </div>
          {#if isFolder}
            <div class="rfm-details-row">
              <dt>{ctrl.labels.items}</dt>
              <dd>{node.children?.length ?? 0}</dd>
            </div>
          {:else if formatBytes(node.size)}
            <div class="rfm-details-row">
              <dt>{ctrl.labels.size}</dt>
              <dd>{formatBytes(node.size)}</dd>
            </div>
          {/if}
        </dl>
        <div class="rfm-details-actions">
          {#if isFolder}
            <button
              type="button"
              class="rfm-button rfm-button-secondary"
              onclick={() => ctrl.togglePin(node.id)}
            >
              <Icon name={ctrl.isPinned(node.id) ? 'star-solid' : 'star'} size={16} class="rfm-star" />
              {ctrl.isPinned(node.id) ? ctrl.labels.unpin : ctrl.labels.pin}
            </button>
          {:else}
            {#if ctrl.canView(node)}
              <button type="button" class="rfm-button rfm-button-primary" onclick={() => ctrl.activate(node)}>
                {ctrl.labels.view}
              </button>
            {/if}
            <button type="button" class="rfm-button rfm-button-secondary" onclick={() => ctrl.download(node)}>
              <Icon name="download" size={16} />
              {ctrl.labels.download}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</aside>
