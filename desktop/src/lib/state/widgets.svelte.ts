import type { Widget, WidgetBehavior } from '../types'
import { makeBehavior } from '../desktop/behavior'
import { skins } from '../desktop/skins.svelte'
import { stage } from '../stage/stageState.svelte'

let seq = 0
export function uid(prefix = 'w'): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

class WidgetsState {
  list = $state<Widget[]>([])
  private topZ = 10

  byId(id: string): Widget | undefined {
    return this.list.find((w) => w.id === id)
  }

  add(skinId: string, x: number, y: number): Widget {
    const man = skins.get(skinId)
    const size = man?.size ?? { w: 320, h: 200 }
    this.topZ += 1
    const w: Widget = {
      id: uid('skin'),
      skin: skinId,
      x,
      y,
      w: size.w,
      h: size.h,
      z: this.topZ,
      config: {},
      behavior: makeBehavior(man?.behavior),
    }
    this.list.push(w)
    this.clamp(w)
    return w
  }

  remove(id: string) {
    this.list = this.list.filter((w) => w.id !== id)
  }

  bringToFront(id: string) {
    const w = this.byId(id)
    if (!w) return
    this.topZ += 1
    w.z = this.topZ
  }

  move(id: string, x: number, y: number) {
    const w = this.byId(id)
    if (!w) return
    w.x = x
    w.y = y
    this.clamp(w)
  }

  resize(id: string, w2: number, h2: number) {
    const widget = this.byId(id)
    if (!widget) return
    widget.w = Math.max(80, w2)
    widget.h = Math.max(60, h2)
    this.clamp(widget)
  }

  setBehavior(id: string, patch: Partial<WidgetBehavior>) {
    const w = this.byId(id)
    if (!w) return
    w.behavior = { ...w.behavior, ...patch }
  }

  scaleAll(fx: number, fy: number) {
    for (const w of this.list) {
      w.x *= fx
      w.y *= fy
      w.w *= fx
      w.h *= fy
    }
  }

  private clamp(w: Widget) {
    if (!w.behavior.stayInBounds) return
    const maxX = Math.max(0, stage.refW - w.w)
    const maxY = Math.max(0, stage.refH - w.h)
    w.x = Math.min(Math.max(0, w.x), maxX)
    w.y = Math.min(Math.max(0, w.y), maxY)
  }
}

export const widgets = new WidgetsState()
