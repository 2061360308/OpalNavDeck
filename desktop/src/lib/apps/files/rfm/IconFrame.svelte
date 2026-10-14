<script lang="ts">
  let { size = 16, children }: { size?: number; children?: import('svelte').Snippet } = $props()
</script>

<span class="rfm-glyph" style="width:{size}px;height:{size}px">{@render children?.()}</span>
