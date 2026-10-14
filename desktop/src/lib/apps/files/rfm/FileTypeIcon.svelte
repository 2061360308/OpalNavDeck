<script lang="ts">
  import { familyFor, chipLabelColor } from './fileFamilies'

  let { extension, size = 16 }: { extension?: string; size?: number } = $props()

  const family = $derived(familyFor(extension))
  const fontSize = $derived(family.label.length > 3 ? 4.4 : 5.2)
  const showLabel = $derived(size >= 28)
</script>

<svg width={size} height={size} fill="none" viewBox="0 0 40 40" aria-hidden="true">
  <path
    stroke="var(--rfm-icon-outline, currentColor)"
    stroke-width="1.5"
    d="M7.75 4A3.25 3.25 0 0 1 11 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 35 39.25H11A3.25 3.25 0 0 1 7.75 36z"
  />
  <path stroke="var(--rfm-icon-outline, currentColor)" stroke-width="1.5" d="M27 .5V8a4 4 0 0 0 4 4h7.5" />
  <rect width="33" height="16" x="1" y="18" fill={family.accent} rx="2" />
  {#if showLabel}
    <text
      x="17.5"
      y="28.2"
      fill={chipLabelColor(family.accent)}
      font-family="Arial, sans-serif"
      font-size={fontSize}
      font-weight="700"
      text-anchor="middle"
      >{family.label}</text
    >
  {/if}
</svg>
