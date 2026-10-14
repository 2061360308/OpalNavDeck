<script lang="ts">
  import { guides } from './guideStore.svelte'
  import { stage } from '../stage/stageState.svelte'
</script>

<div class="guides">
  {#each guides.v as x, i (i)}
    <div class="v" style="left:{x}px;height:{stage.refH}px"></div>
  {/each}
  {#each guides.h as y, i (i)}
    <div class="h" style="top:{y}px;width:{stage.refW}px"></div>
  {/each}
</div>

<style>
  .guides {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .v,
  .h {
    position: absolute;
    background: var(--dt-accent, #ff4d6d);
    opacity: 0.9;
  }
  .v {
    top: 0;
    width: 1px;
  }
  .h {
    left: 0;
    height: 1px;
  }
</style>
