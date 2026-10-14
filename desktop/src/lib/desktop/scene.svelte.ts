import { wm } from '../state/windows.svelte'
import { menus } from './menuStore.svelte'

/** true when the desktop background (no active window, no open context menu) owns the scene */
class Scene {
  desktopActive = $derived(wm.activeId === null && !menus.open)
}

export const scene = new Scene()
