import type { CrispMode } from '../types'

class StageState {
  refW = $state(1920)
  refH = $state(1080)
  vw = $state(0)
  vh = $state(0)
  crispMode = $state<CrispMode>('transform')

  rawScale = $derived(
    this.vw > 0 && this.vh > 0 ? Math.min(this.vw / this.refW, this.vh / this.refH) : 1
  )

  scale = $derived.by(() => {
    if (this.crispMode === 'integer') {
      return Math.max(1, Math.floor(this.rawScale))
    }
    return this.rawScale
  })

  canvasW = $derived(this.refW * this.scale)
  canvasH = $derived(this.refH * this.scale)
  canvasLeft = $derived((this.vw - this.canvasW) / 2)
  canvasTop = $derived((this.vh - this.canvasH) / 2)

  setViewport(w: number, h: number) {
    this.vw = w
    this.vh = h
  }

  toVirtual(clientX: number, clientY: number) {
    return {
      x: (clientX - this.canvasLeft) / this.scale,
      y: (clientY - this.canvasTop) / this.scale,
    }
  }

  toScreen(vx: number, vy: number) {
    return {
      x: vx * this.scale + this.canvasLeft,
      y: vy * this.scale + this.canvasTop,
    }
  }
}

export const stage = new StageState()
