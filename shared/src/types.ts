export type CrispMode = 'transform' | 'zoom' | 'integer'

export interface Service {
  id: string
  name: string
  url: string
  /** file name under /Icons/.assets (the only icon form) */
  icon: string
  desc?: string
  tags?: string[]
  group?: string
  /** display order within its group (persisted in /Icons/.order.json) */
  order?: number
}

export type HoverMode = 'none' | 'hide' | 'fadein' | 'fadeout'
export type DragMode = 'always' | 'handle' | 'alt'

export interface WidgetBehavior {
  /** 0..1 */
  opacity: number
  hover: HoverMode
  clickThrough: boolean
  draggable: boolean
  dragMode: DragMode
  stayInBounds: boolean
  snap: boolean
}

export interface Widget {
  id: string
  /** skin id */
  skin: string
  x: number
  y: number
  w: number
  h: number
  z: number
  config: Record<string, unknown>
  behavior: WidgetBehavior
  /** clip-path reported by the skin bridge (irregular hit-area) */
  shape?: string
}

export interface SkinStyleDef {
  id: string
  name?: string
  /** entry document for this style (defaults to the package entry) */
  entry?: string
}

export interface SkinManifest {
  id: string
  name: string
  icon?: string
  size?: { w: number; h: number }
  apiVersion?: string
  permissions?: string[]
  /** entry document inside the package (defaults to index.html) */
  entry?: string
  /** dev-only source URL (e.g. a local vite server) overriding the public base */
  dev?: string
  behavior?: Partial<WidgetBehavior>
  author?: string
  version?: string
  license?: string
  description?: string
  styles?: SkinStyleDef[]
}

export type BoxLayout = 'icons' | 'list'
export type BoxTitlePos = 'top' | 'bottom' | 'left' | 'right'
export type BoxTabPos = 'top' | 'bottom' | 'left' | 'right'

export interface BoxTheme {
  color: string
  opacity: number
  bgImage: string
  bgImagePath: string
  titlePos: BoxTitlePos
  tabPos: BoxTabPos
  border: boolean
  radius: boolean
  showTitle: boolean
  bigFont: boolean
  iconOnly: boolean
}

export type BoxKind = 'normal' | 'mapped' | 'recent'

export interface Box {
  id: string
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  serviceIds: string[]
  layout: BoxLayout
  iconSize: number
  theme: BoxTheme
  collapsed: boolean
  locked: boolean
  kind?: BoxKind
  mapGroup?: string
  parentId?: string
  tabs: string[]
  activeTabId?: string
}

export type WallpaperFit = 'cover' | 'contain' | 'tile' | 'center' | 'stretch'

export type WallpaperMode = 'solid' | 'image' | 'video' | 'slideshow' | 'focus'
export type SlideshowOrder = 'sequential' | 'random'

export interface WallpaperState {
  mode: WallpaperMode
  color: string
  fit: WallpaperFit
  image: string
  recent: string[]
  video: { src: string; loop: boolean; speed: number; muted: boolean }
  slideshow: { images: string[]; intervalSec: number; order: SlideshowOrder }
  focus: { intervalSec: number }
}

export type CursorRole =
  | 'default'
  | 'pointer'
  | 'text'
  | 'move'
  | 'help'
  | 'progress'
  | 'notAllowed'
  | 'crosshair'
  | 'ewResize'
  | 'nsResize'
  | 'nwseResize'
  | 'neswResize'
  | 'wait'

export interface CursorState {
  enabled: boolean
  roles: Partial<Record<CursorRole, string>>
}

export type ColorMode = 'light' | 'dark' | 'system'
export type ContrastMode = 'normal' | 'high'

export interface WindowState {
  id: string
  title: string
  icon: string
  x: number
  y: number
  w: number
  h: number
  minW: number
  minH: number
  z: number
  minimized: boolean
  maximized: boolean
  topmost: boolean
  frameless?: boolean
  fullscreen?: boolean
  light?: boolean
  noMinimize?: boolean
  noMaximize?: boolean
  prevRect?: { x: number; y: number; w: number; h: number }
  appId: string
  data?: Record<string, unknown>
}

export interface BoxBehavior {
  hoverTab: boolean
  hoverExpand: boolean
  dblclickHide: boolean
}

export interface DesktopConfig {
  refW: number
  refH: number
  crispMode: CrispMode
  wallpaper: WallpaperState
  theme: ColorMode
  contrast: ContrastMode
  accent: string
  cursor: CursorState
  recent: string[]
  boxBehavior: BoxBehavior
}

export interface PersistedState {
  version: number
  desktop: DesktopConfig
  widgets: Widget[]
  services: Service[]
  windows: WindowState[]
  boxes: Box[]
}
