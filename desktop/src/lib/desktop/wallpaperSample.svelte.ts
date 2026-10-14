import type { WallpaperFit, WallpaperMode } from '../types'

export interface SamplerSpec {
  mode: WallpaperMode
  color: string
  image: string
  fit: WallpaperFit
}

export interface RGB {
  r: number
  g: number
  b: number
}

/** render scale for the offscreen sampling canvas */
const SCALE = 0.25

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

export function hexToRgb(hex: string): RGB {
  let h = (hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  if (h.length !== 6 || Number.isNaN(n)) return { r: 31, g: 34, b: 41 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** alpha-composite `layer` over `base` (alpha 0..1) */
export function mixRgb(layer: RGB, base: RGB, alpha: number): RGB {
  return {
    r: layer.r * alpha + base.r * (1 - alpha),
    g: layer.g * alpha + base.g * (1 - alpha),
    b: layer.b * alpha + base.b * (1 - alpha),
  }
}

/** WCAG relative luminance → is the color light? */
export function isLight(c: RGB): boolean {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  return L > 0.5
}

class WallpaperSampler {
  /** bumped whenever the cached render / an image finishes loading */
  revision = $state(0)

  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private key = ''
  private viewW = 0
  private viewH = 0

  private images = new Map<string, HTMLImageElement | null>()

  private getImage(src: string): HTMLImageElement | null {
    if (this.images.has(src)) return this.images.get(src) ?? null
    this.images.set(src, null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.images.set(src, img)
      this.revision++
    }
    img.onerror = () => {
      this.images.set(src, null)
    }
    img.src = src
    return null
  }

  private ensureCanvas(w: number, h: number): CanvasRenderingContext2D | null {
    const cw = Math.max(1, Math.round(w * SCALE))
    const ch = Math.max(1, Math.round(h * SCALE))
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    }
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw
      this.canvas.height = ch
    }
    return this.ctx
  }

  /** (re)render the cached wallpaper; cheap + idempotent per signature */
  sync(spec: SamplerSpec, viewW: number, viewH: number) {
    if (viewW <= 0 || viewH <= 0) return
    this.viewW = viewW
    this.viewH = viewH
    const key = `${spec.mode}|${spec.image}|${spec.fit}|${spec.color}|${viewW}x${viewH}`
    if (key === this.key) return
    this.key = key
    const ctx = this.ensureCanvas(viewW, viewH)
    if (!ctx || !this.canvas) return
    const cw = this.canvas.width
    const ch = this.canvas.height

    if (spec.mode === 'video') {
      ctx.fillStyle = '#05060a'
      ctx.fillRect(0, 0, cw, ch)
      this.revision++
      return
    }
    if (spec.mode === 'solid') {
      ctx.fillStyle = spec.color || '#0c0f16'
      ctx.fillRect(0, 0, cw, ch)
      this.revision++
      return
    }
    if (spec.image) {
      const img = this.getImage(spec.image)
      if (img) {
        this.drawImage(ctx, img, spec.fit ?? 'cover', cw, ch)
        this.revision++
      }
      return
    }
    this.drawGradient(ctx, cw, ch)
    this.revision++
  }

  private drawGradient(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const lin = ctx.createLinearGradient(0, 0, cw, ch)
    lin.addColorStop(0, '#0c0f16')
    lin.addColorStop(0.45, '#131826')
    lin.addColorStop(1, '#0a0d14')
    ctx.fillStyle = lin
    ctx.fillRect(0, 0, cw, ch)
    const sx = cw / this.viewW
    const sy = ch / this.viewH
    const radial = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      color: string,
      a: number
    ) => {
      ctx.save()
      ctx.translate(cx * cw, cy * ch)
      ctx.scale(rx * sx, ry * sy)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      g.addColorStop(0, `rgba(${color}, ${a})`)
      g.addColorStop(0.6, `rgba(${color}, 0)`)
      g.addColorStop(1, `rgba(${color}, 0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.rect(-1, -1, 2, 2)
      ctx.fill()
      ctx.restore()
    }
    radial(0.15, 0.1, 1200, 700, '79, 140, 255', 0.28)
    radial(0.85, 0.85, 1000, 600, '168, 85, 247', 0.25)
  }

  private drawImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    fit: string,
    cw: number,
    ch: number
  ) {
    ctx.clearRect(0, 0, cw, ch)
    const iw = img.naturalWidth || 1
    const ih = img.naturalHeight || 1
    if (fit === 'tile') {
      const dw = iw * SCALE
      const dh = ih * SCALE
      for (let y = 0; y < ch; y += dh) for (let x = 0; x < cw; x += dw) ctx.drawImage(img, x, y, dw, dh)
      return
    }
    if (fit === 'center') {
      const dw = iw * SCALE
      const dh = ih * SCALE
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
      return
    }
    let dw = cw
    let dh = ch
    if (fit !== 'stretch') {
      const s = fit === 'contain' ? Math.min(cw / iw, ch / ih) : Math.max(cw / iw, ch / ih)
      dw = iw * s
      dh = ih * s
    }
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
  }

  private avgRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): RGB | null {
    const cw = ctx.canvas.width
    const ch = ctx.canvas.height
    const x0 = clamp(Math.floor(x), 0, cw - 1)
    const y0 = clamp(Math.floor(y), 0, ch - 1)
    const x1 = clamp(Math.ceil(x + w), x0 + 1, cw)
    const y1 = clamp(Math.ceil(y + h), y0 + 1, ch)
    try {
      const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
      let r = 0
      let g = 0
      let b = 0
      const n = d.length / 4
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]
        g += d[i + 1]
        b += d[i + 2]
      }
      return { r: r / n, g: g / n, b: b / n }
    } catch {
      return null
    }
  }

  /** average wallpaper color over a screen-space rect */
  sampleAvg(sx: number, sy: number, w: number, h: number): RGB | null {
    if (w <= 0 || h <= 0) return null
    if (!this.ctx) return null
    return this.avgRegion(this.ctx, sx * SCALE, sy * SCALE, w * SCALE, h * SCALE)
  }

  /** average color of a box background image as painted with `cover` into w×h */
  sampleImageAvg(src: string, w: number, h: number): RGB | null {
    const img = this.getImage(src)
    if (!img || w <= 0 || h <= 0) return null
    const tw = 32
    const th = Math.max(1, Math.round((32 * h) / w))
    const c = document.createElement('canvas')
    c.width = tw
    c.height = th
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    const iw = img.naturalWidth || 1
    const ih = img.naturalHeight || 1
    const s = Math.max(tw / iw, th / ih)
    const dw = iw * s
    const dh = ih * s
    ctx.drawImage(img, (tw - dw) / 2, (th - dh) / 2, dw, dh)
    return this.avgRegion(ctx, 0, 0, tw, th)
  }
}

export const wallpaperSampler = new WallpaperSampler()
