import { wm } from '../state/windows.svelte'
import { ui } from '../state/ui.svelte'
import { openResources } from '../apps/apps'
import { menus } from './menuStore.svelte'
import { scene } from './scene.svelte'

function isEditable(el: Element | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/** global desktop shortcuts (currently: Space toggles the resource navigation window) */
class Shortcuts {
  install() {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code !== 'Space' && e.key !== ' ') return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (menus.open || ui.addMenuOpen) return

      const res = wm.list.find((w) => w.appId === 'resources')
      const onDesktop = scene.desktopActive
      const onResources = !!res && wm.activeId === res.id
      if (!onDesktop && !onResources) return

      if (isEditable(e.target as Element | null) || isEditable(document.activeElement)) return

      e.preventDefault()

      if (!res) openResources()
      else if (res.minimized) wm.restore(res.id)
      else wm.close(res.id)
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }
}

export const shortcuts = new Shortcuts()
