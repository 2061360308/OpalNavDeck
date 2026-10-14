<script lang="ts">
  let { size = 16 }: { size?: number } = $props()
</script>

<svg width={size} height={size} fill="none" viewBox="0 0 40 40" aria-hidden="true">
  <path
    fill="#E8B931"
    d="M4 11.5C4 9.567 5.567 8 7.5 8H16l2.4 2.4c.375.375.883.6 1.414.6H32.5C34.433 11 36 12.567 36 14.5V15H4v-3.5Z"
  />
  <path
    fill="#F5C84C"
    d="M4 15h32v16.5c0 1.933-1.567 3.5-3.5 3.5h-25C5.567 35 4 33.433 4 31.5V15Z"
  />
</svg>
