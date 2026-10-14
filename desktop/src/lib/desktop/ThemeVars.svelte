<script lang="ts">
  import { settings } from './settings.svelte'
  import { themes } from './themes.svelte'
  import { applyCursor } from './cursor.svelte'
  import { modifiers } from './modifiers.svelte'
  import { shortcuts } from './shortcuts.svelte'
  import { hover } from './hover.svelte'

  $effect(() => {
    themes.apply(settings.theme, settings.accent, settings.contrast)
  })

  // re-apply when the OS light/dark preference changes (only matters for 'system')
  $effect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (settings.theme === 'system') themes.apply(settings.theme, settings.accent, settings.contrast)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  })

  $effect(() => {
    applyCursor($state.snapshot(settings.cursor) as typeof settings.cursor)
  })

  $effect(() => modifiers.install())

  $effect(() => shortcuts.install())

  // while the pointer is over the parent document it cannot be over a sandboxed
  // skin iframe, so any pointermove means no skin is hovered.
  $effect(() => {
    const onMove = () => hover.clear()
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  })
</script>
