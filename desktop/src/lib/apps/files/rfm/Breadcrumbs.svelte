<script lang="ts">
  import Icon from './Icon.svelte'
  import type { RfmController } from './controller.svelte'

  let { ctrl }: { ctrl: RfmController } = $props()
</script>

<nav class="rfm-breadcrumbs" aria-label="Breadcrumb">
  <button type="button" class="rfm-crumb" data-current={ctrl.path === '/' || undefined} onclick={() => ctrl.open('/')}
    >{ctrl.rootLabel}</button
  >
  {#each ctrl.breadcrumbs as folder (folder.id)}
    <span class="rfm-crumb-group">
      <Icon name="chevron-right" size={14} />
      <button
        type="button"
        class="rfm-crumb"
        data-current={ctrl.path === folder.id || undefined}
        onclick={() => ctrl.open(folder.id)}>{folder.name}</button
      >
    </span>
  {/each}
</nav>
