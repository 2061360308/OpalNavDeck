<script lang="ts">
  import FolderTree from './FolderTree.svelte'
  import Icon from './Icon.svelte'
  import IconFrame from './IconFrame.svelte'
  import type { RfmController } from './controller.svelte'

  let { ctrl }: { ctrl: RfmController } = $props()
</script>

<aside class="rfm-sidebar">
  <div class="rfm-sidebar-scroll">
    <button
      type="button"
      class="rfm-home-row"
      aria-current={ctrl.path === '/' || undefined}
      onclick={() => ctrl.open('/')}
    >
      <span class="rfm-tree-chevron" style="visibility:hidden"></span>
      <IconFrame size={16}><Icon name="home" size={16} /></IconFrame>
      <span class="rfm-item-name">{ctrl.rootLabel}</span>
    </button>
    <div role="tree">
      <FolderTree folders={ctrl.tree} {ctrl} />
    </div>
  </div>
</aside>
