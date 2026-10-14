import type { BoxBehavior, ColorMode, ContrastMode, CursorState, WallpaperState } from '../types'

export const MAX_RECENT = 12

export const DEFAULT_WALLPAPER: WallpaperState = {
  mode: 'image',
  color: '#0c0f16',
  fit: 'cover',
  image: '/wallpapers/wallhaven-qrpllq.webp',
  recent: ['/wallpapers/wallhaven-qrpllq.webp'],
  video: { src: '', loop: true, speed: 1, muted: true },
  slideshow: { images: [], intervalSec: 600, order: 'sequential' },
  focus: { intervalSec: 600 },
}

export const DEFAULT_CURSOR: CursorState = { enabled: false, roles: {} }

/** old default asset path -> current one (keeps existing installs working) */
const LEGACY_WALLPAPER_URLS: Record<string, string> = {
  '/wallpapers/wallhaven-qrpllq.jpg': '/wallpapers/wallhaven-qrpllq.webp',
}

function migrateUrl(u: string): string {
  return LEGACY_WALLPAPER_URLS[u] ?? u
}

function migrateWallpaper(w: WallpaperState): WallpaperState {
  w.image = migrateUrl(w.image)
  w.recent = w.recent.map(migrateUrl)
  w.slideshow.images = w.slideshow.images.map(migrateUrl)
  return w
}

/** migrate a persisted (possibly legacy) wallpaper blob into the current shape */
export function normalizeWallpaper(raw: any): WallpaperState {
  const base: WallpaperState = JSON.parse(JSON.stringify(DEFAULT_WALLPAPER))
  if (!raw || typeof raw !== 'object') return base
  // legacy shape: { id, src, fit, options } -> mode
  if (raw.mode === undefined && raw.id !== undefined) {
    const id = String(raw.id)
    if (id === 'solid') base.mode = 'solid'
    else if (id === 'image') base.mode = 'image'
    else base.mode = 'image'
    base.color = String(raw.options?.color ?? base.color)
    if (raw.src) {
      base.image = String(raw.src)
      base.recent = [base.image, ...base.recent.filter((r) => r !== base.image)].slice(0, MAX_RECENT)
    }
    if (raw.fit) base.fit = raw.fit
    return migrateWallpaper(base)
  }
  const mode = raw.mode
  if (mode === 'solid' || mode === 'image' || mode === 'video' || mode === 'slideshow' || mode === 'focus')
    base.mode = mode
  if (typeof raw.color === 'string') base.color = raw.color
  if (raw.fit) base.fit = raw.fit
  if (typeof raw.image === 'string') base.image = raw.image
  if (Array.isArray(raw.recent)) base.recent = raw.recent.filter((r: unknown) => typeof r === 'string').slice(0, MAX_RECENT)
  if (raw.video && typeof raw.video === 'object') base.video = { ...base.video, ...raw.video }
  if (raw.slideshow && typeof raw.slideshow === 'object') {
    base.slideshow = { ...base.slideshow, ...raw.slideshow }
    if (!Array.isArray(base.slideshow.images)) base.slideshow.images = []
  }
  if (raw.focus && typeof raw.focus === 'object') base.focus = { ...base.focus, ...raw.focus }
  return migrateWallpaper(base)
}

class DesktopSettings {
  wallpaper = $state<WallpaperState>(normalizeWallpaper(DEFAULT_WALLPAPER))
  theme = $state<ColorMode>('dark')
  contrast = $state<ContrastMode>('normal')
  accent = $state('')
  cursor = $state<CursorState>({ ...DEFAULT_CURSOR, roles: {} })
  boxBehavior = $state<BoxBehavior>({ hoverTab: false, hoverExpand: false, dblclickHide: true })

  /** push a picture to the front of the recent list (dedup + cap) */
  pushRecent(url: string) {
    if (!url) return
    this.wallpaper.recent = [url, ...this.wallpaper.recent.filter((r) => r !== url)].slice(0, MAX_RECENT)
  }
}

export const settings = new DesktopSettings()
