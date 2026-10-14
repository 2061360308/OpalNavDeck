<script lang="ts">
  import type { RfmNode } from './types'
  import { getExtension } from './types'
  import FileTypeIcon from './FileTypeIcon.svelte'
  import FolderTypeIcon from './FolderTypeIcon.svelte'

  let { node, size = 16 }: { node: RfmNode; size?: number } = $props()
</script>

{#if node.kind === 'folder'}
  <FolderTypeIcon {size} />
{:else}
  <FileTypeIcon extension={getExtension(node)} {size} />
{/if}
