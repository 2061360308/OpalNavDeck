import type { WindowState } from '../types'
import { uid } from './widgets.svelte'

class WindowManager {
  list = $state<WindowState[]>([])
  activeId = $state<string | null>(null)
  private topZ = 100

  private nextZ(): number {
    this.topZ += 1
    return this.topZ
  }

  /** highest non-minimized window (used to pick a new active window) */
  private topVisible(): string | null {
    let best: WindowState | null = null
    for (const w of this.list) {
      if (w.minimized) continue
      if (!best || w.z > best.z) best = w
    }
    return best?.id ?? null
  }

  /** mark the desktop (no window) as the active scene */
  blur() {
    this.activeId = null
  }

  open(opts: Partial<WindowState> & { title: string }): WindowState {
    const existing = opts.appId ? this.list.find((w) => w.appId === opts.appId) : undefined
    if (existing) {
      existing.minimized = false
      this.focus(existing.id)
      return existing
    }
    const w: WindowState = {
      id: uid('win'),
      title: opts.title,
      icon: opts.icon ?? '⚙️',
      x: opts.x ?? 160,
      y: opts.y ?? 120,
      w: opts.w ?? 520,
      h: opts.h ?? 360,
      minW: opts.minW ?? 260,
      minH: opts.minH ?? 160,
      z: this.nextZ(),
      minimized: false,
      maximized: false,
      topmost: false,
      frameless: opts.frameless ?? false,
      fullscreen: opts.fullscreen ?? false,
      light: opts.light ?? false,
      noMinimize: opts.noMinimize ?? false,
      noMaximize: opts.noMaximize ?? false,
      appId: opts.appId ?? uid('app'),
      data: opts.data,
    }
    if (opts.maximized) {
      w.prevRect = { x: w.x, y: w.y, w: w.w, h: w.h }
      w.x = 0
      w.y = 0
      w.w = window.innerWidth
      w.h = window.innerHeight
      w.maximized = true
    }
    this.list.push(w)
    this.activeId = w.id
    return w
  }

  close(id: string) {
    const wasActive = this.activeId === id
    this.list = this.list.filter((w) => w.id !== id)
    if (wasActive) this.activeId = this.topVisible()
  }

  focus(id: string) {
    const w = this.list.find((x) => x.id === id)
    if (!w) return
    this.activeId = id
    if (w.topmost) return
    w.z = this.nextZ()
  }

  minimize(id: string) {
    const w = this.list.find((x) => x.id === id)
    if (!w) return
    w.minimized = true
    if (this.activeId === id) this.activeId = this.topVisible()
  }

  restore(id: string) {
    const w = this.list.find((x) => x.id === id)
    if (!w) return
    w.minimized = false
    this.activeId = id
  }

  toggleMaximize(id: string) {
    const w = this.list.find((x) => x.id === id)
    if (!w) return
    if (w.maximized) {
      if (w.prevRect) {
        w.x = w.prevRect.x
        w.y = w.prevRect.y
        w.w = w.prevRect.w
        w.h = w.prevRect.h
      }
      w.maximized = false
    } else {
      w.prevRect = { x: w.x, y: w.y, w: w.w, h: w.h }
      w.x = 0
      w.y = 0
      w.w = window.innerWidth
      w.h = window.innerHeight
      w.maximized = true
    }
  }

  toggleTopmost(id: string) {
    const w = this.list.find((x) => x.id === id)
    if (!w) return
    w.topmost = !w.topmost
    if (w.topmost) {
      w.z = 100000 + this.nextZ()
    } else {
      w.z = this.nextZ()
    }
  }

  move(id: string, x: number, y: number) {
    const w = this.list.find((x) => x.id === id)
    if (!w || w.maximized) return
    w.x = x
    w.y = y
  }

  resize(id: string, w2: number, h2: number) {
    const w = this.list.find((x) => x.id === id)
    if (!w || w.maximized) return
    w.w = Math.max(w.minW, w2)
    w.h = Math.max(w.minH, h2)
  }

  setRect(id: string, x: number, y: number, w2: number, h2: number) {
    const w = this.list.find((v) => v.id === id)
    if (!w || w.maximized) return
    w.x = x
    w.y = y
    w.w = Math.max(w.minW, w2)
    w.h = Math.max(w.minH, h2)
  }
}

export const wm = new WindowManager()
