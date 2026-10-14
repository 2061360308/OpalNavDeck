<script lang="ts">
  import { onMount } from 'svelte'
  import { stage } from './stageState.svelte'

  let { children } = $props()

  onMount(() => {
    const update = () => stage.setViewport(window.innerWidth, window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  })

  const useZoom = $derived(stage.crispMode === 'zoom')
</script>

<div class="widget-wrap">
  <div
    class="widget-canvas"
    style={useZoom
      ? `width:${stage.refW}px;height:${stage.refH}px;zoom:${stage.scale}`
      : `width:${stage.refW}px;height:${stage.refH}px;transform:scale(${stage.scale})`}
  >
    {@render children?.()}
  </div>
</div>

<style>
  .widget-wrap {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    pointer-events: none;
  }
  .widget-canvas {
    position: relative;
    flex: 0 0 auto;
    transform-origin: center center;
    pointer-events: none;
  }
</style>
