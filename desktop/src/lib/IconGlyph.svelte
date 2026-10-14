<script lang="ts">
  interface Props {
    icon?: string
    alt?: string
    cls?: string
  }
  let { icon, alt = '', cls = '' }: Props = $props()
</script>

{#if icon}
  <img class={cls} src={'/icons/assets/' + icon} {alt} loading="lazy" draggable="false" />
{/if}
