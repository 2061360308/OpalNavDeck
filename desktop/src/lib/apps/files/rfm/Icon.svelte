<script lang="ts">
  let {
    name,
    size = 16,
    ...rest
  }: { name: string; size?: number } & Record<string, unknown> = $props()

  const solid = $derived(name === 'star-solid')
</script>

<svg
  viewBox="0 0 24 24"
  fill={solid ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width={solid ? 1 : 1.8}
  stroke-linecap="round"
  stroke-linejoin="round"
  width={size}
  height={size}
  aria-hidden="true"
  {...rest}
>
  {#if name === 'folder'}
    <path
      d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l1.8 1.8H19.5A1.5 1.5 0 0 1 21 9.3v7.2A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5z"
    />
  {:else if name === 'file'}
    <path
      d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"
    />
    <path d="M14 3.5V9h5.5" />
  {:else if name === 'home'}
    <path d="M4 11.5 12 4.5l8 7" />
    <path d="M6.5 10.5V19h11v-8.5" />
  {:else if name === 'chevron-right'}
    <path d="m9 6 6 6-6 6" />
  {:else if name === 'list'}
    <path d="M8 7h12M8 12h12M8 17h12" />
    <path d="M4 7h.01M4 12h.01M4 17h.01" />
  {:else if name === 'cards'}
    <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z" />
  {:else if name === 'collapse'}
    <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
    <path d="m14 10-4 4m0-4 4 4" />
  {:else if name === 'expand'}
    <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
    <path d="m10 10-4-4m0 0v4m0-4h4M14 14l4 4m0 0v-4m0 4h-4" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  {:else if name === 'upload'}
    <path d="M12 16V5" />
    <path d="m8 9 4-4 4 4" />
    <path d="M5 19h14" />
  {:else if name === 'star' || name === 'star-solid'}
    <path
      d="m12 3.5 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 18.4l.9-5.4L4.2 9.2l5.4-.8z"
    />
  {:else if name === 'more'}
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
  {:else if name === 'download'}
    <path d="M12 4v10" />
    <path d="m8 10 4 4 4-4" />
    <path d="M5 19h14" />
  {:else if name === 'plus'}
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  {:else if name === 'pencil'}
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4L7 21H3v-4z" />
  {:else if name === 'trash'}
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V4h6v3" />
  {:else if name === 'eye'}
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  {:else if name === 'moon'}
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  {:else if name === 'panel-left'}
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9.5 4v16" />
  {:else if name === 'panel-right'}
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M14.5 4v16" />
  {/if}
</svg>
