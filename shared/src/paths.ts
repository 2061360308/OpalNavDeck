/** canonical storage-tree layout, shared by server and desktop */
export const PATHS = {
  systemInfo: '/System/system.json',
  desktop: '/System/desktop.json',
  widgets: '/Rainmeter/State/widgets.json',
  boxes: '/Boxes/boxes.json',
  icons: '/Icons',
  assets: '/Icons/.assets',
  order: '/Icons/.order.json',
  data: '/Rainmeter/Data',
  skins: '/Rainmeter/Skins',
  plugins: '/Rainmeter/Plugins',
  personalize: '/Personalize',
  wallpapers: '/Personalize/Wallpapers',
  cursors: '/Personalize/Cursors',
  themes: '/Personalize/Themes',
  /** program-managed auth data (private, hidden, read-only via the fs API) */
  auth: '/System/Auth',
} as const

export type StateName = 'desktop' | 'widgets' | 'boxes'

/** app-managed state files (written directly by the app, bypass the fs guard) */
export const STATE_FILES: Record<StateName, string> = {
  desktop: PATHS.desktop,
  widgets: PATHS.widgets,
  boxes: PATHS.boxes,
}

export const STATE_NAMES: StateName[] = ['desktop', 'widgets', 'boxes']

/** program-managed (read-only, hidden-by-default) directories */
export const READONLY_PREFIXES = ['/Rainmeter/State', '/Boxes', '/System']

/** hidden-by-default directories (may still be readable/writable) */
export const HIDDEN_PREFIXES = ['/Rainmeter/State', '/Boxes', '/System', '/Personalize']

export class PathError extends Error {
  constructor(message = 'invalid path') {
    super(message)
    this.name = 'PathError'
  }
}

/** Normalise a client path to '/a/b' form, rejecting traversal. */
export function normalizePath(input: string): string {
  const raw = (input || '/').replace(/\\/g, '/')
  const parts: string[] = []
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') throw new PathError('path escapes root')
    if (seg.includes('\0')) throw new PathError('invalid path')
    parts.push(seg)
  }
  return '/' + parts.join('/')
}

function under(norm: string, prefix: string): boolean {
  return norm === prefix || norm.startsWith(prefix + '/')
}

export function isReadonlyPath(p: string): boolean {
  let norm: string
  try {
    norm = normalizePath(p)
  } catch {
    return true
  }
  return READONLY_PREFIXES.some((pre) => under(norm, pre))
}

export function isHiddenPath(p: string): boolean {
  let norm: string
  try {
    norm = normalizePath(p)
  } catch {
    return true
  }
  if (norm.split('/').some((s) => s.startsWith('.'))) return true
  return HIDDEN_PREFIXES.some((pre) => under(norm, pre))
}
