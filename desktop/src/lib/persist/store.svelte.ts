import { stage } from '../stage/stageState.svelte'
import { services } from '../state/services.svelte'
import { widgets } from '../state/widgets.svelte'
import { boxes } from '../state/boxes.svelte'
import { recent } from '../state/recent.svelte'
import { wm } from '../state/windows.svelte'
import { normalizeWallpaper, settings } from '../desktop/settings.svelte'
import { fs } from '../api/fs'
import { getStateFile, putStateFile } from './api'

const KEY = 'desktop-nav-v1'
const ETAG_PREFIX = 'desktop-nav-etag:'

const STATE_NAMES = ['desktop', 'widgets', 'boxes'] as const

export const sync = $state({
  online: false,
  revision: 0,
  lastSync: 0,
})

const etags: Record<string, string | undefined> = {
  desktop: undefined,
  widgets: undefined,
  boxes: undefined,
}
let ready = $state(false)

function snapDesktop() {
  return {
    refW: stage.refW,
    refH: stage.refH,
    crispMode: stage.crispMode,
    wallpaper: $state.snapshot(settings.wallpaper),
    theme: settings.theme,
    contrast: settings.contrast,
    accent: settings.accent,
    cursor: $state.snapshot(settings.cursor),
    recent: [...recent.ids],
    boxBehavior: $state.snapshot(settings.boxBehavior),
    windows: $state.snapshot(wm.list),
  }
}
function snapWidgets() {
  return { activeTheme: null, widgets: $state.snapshot(widgets.list) }
}
function snapBoxes() {
  return { boxes: $state.snapshot(boxes.list) }
}

function applyDesktop(d: any) {
  if (!d || typeof d !== 'object') return
  stage.refW = d.refW ?? stage.refW
  stage.refH = d.refH ?? stage.refH
  stage.crispMode = d.crispMode ?? stage.crispMode
  if (d.wallpaper && typeof d.wallpaper === 'object') {
    // legacy blobs (no `mode`) must be migrated on their own, before merging
    const stored = d.wallpaper
    settings.wallpaper = normalizeWallpaper(
      stored.mode === undefined ? stored : { ...settings.wallpaper, ...stored }
    )
  }
  if (d.theme === 'light' || d.theme === 'dark' || d.theme === 'system') settings.theme = d.theme
  if (d.contrast === 'high' || d.contrast === 'normal') settings.contrast = d.contrast
  if (typeof d.accent === 'string') settings.accent = d.accent
  if (d.cursor && typeof d.cursor === 'object') {
    settings.cursor = { enabled: !!d.cursor.enabled, roles: { ...(d.cursor.roles ?? {}) } }
  }
  recent.set(d.recent)
  if (d.boxBehavior && typeof d.boxBehavior === 'object') {
    settings.boxBehavior = { ...settings.boxBehavior, ...d.boxBehavior }
  }
  if (Array.isArray(d.windows)) wm.list = d.windows
}
function applyWidgets(d: any) {
  if (d && Array.isArray(d.widgets)) widgets.list = d.widgets
}
function applyBoxes(d: any) {
  if (d && Array.isArray(d.boxes)) boxes.replaceAll(repairBoxes(d.boxes))
}

/** drop dangling parent/tab references so a box tree can never be orphaned */
function repairBoxes(list: any[]): any[] {
  const clean = list.filter((b) => b && typeof b === 'object')
  const ids = new Set(clean.map((b) => b.id))
  for (const b of clean) {
    if (b.parentId && (!ids.has(b.parentId) || b.parentId === b.id)) b.parentId = undefined
    if (b.parentId) {
      b.tabs = []
      b.activeTabId = undefined
    } else {
      b.tabs = [...new Set<string>(b.tabs ?? [])].filter((t) => ids.has(t) && t !== b.id)
      if (b.activeTabId && !b.tabs.includes(b.activeTabId)) b.activeTabId = b.tabs[0]
    }
  }
  for (const parent of clean) {
    for (const tid of parent.tabs ?? []) {
      const child = clean.find((c) => c.id === tid)
      if (child) child.parentId = parent.id
    }
  }
  return clean
}

/** instant local cache read */
export function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const data = JSON.parse(raw)
      applyDesktop(data.desktop)
      applyWidgets(data)
      applyBoxes(data)
    }
  } catch (e) {
    console.warn('[persist] local load failed', e)
  }
  for (const k of ['desktop', 'widgets', 'boxes']) {
    etags[k] = localStorage.getItem(ETAG_PREFIX + k) || undefined
  }
}

export async function init() {
  try {
    await fs.init()
    sync.online = true
    const [d, w, b] = await Promise.all([
      getStateFile('desktop'),
      getStateFile('widgets'),
      getStateFile('boxes'),
    ])
    if (d?.text) {
      applyDesktop(JSON.parse(d.text))
      etags.desktop = d.etag
    }
    if (w?.text) {
      applyWidgets(JSON.parse(w.text))
      etags.widgets = w.etag
    }
    if (b?.text) {
      applyBoxes(JSON.parse(b.text))
      etags.boxes = b.etag
    }
    await services.load()
    if (!d && !w && !b) save()
  } catch (e) {
    console.warn('[persist] backend init failed', e)
    sync.online = false
  } finally {
    ready = true
  }
}

export function save() {
  const combined = {
    version: 5,
    desktop: snapDesktop(),
    widgets: $state.snapshot(widgets.list),
    boxes: $state.snapshot(boxes.list),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(combined))
  } catch (e) {
    console.warn('[persist] local save failed', e)
  }
  void pushRemote()
}

let saving = false
async function pushRemote() {
  if (saving) return
  saving = true
  try {
    await writeObj('desktop', snapDesktop(), 'desktop')
    await writeObj('widgets', snapWidgets(), 'widgets')
    await writeObj('boxes', snapBoxes(), 'boxes')
    sync.online = true
    sync.lastSync = Date.now()
    sync.revision += 1
  } catch (e) {
    console.warn('[persist] save failed', e)
    sync.online = false
  } finally {
    saving = false
  }
}

async function writeObj(name: string, obj: unknown, key: string) {
  const body = JSON.stringify(obj, null, 2)
  try {
    const res = await putStateFile(name, body, etags[key])
    etags[key] = res.etag
    if (res.etag) localStorage.setItem(ETAG_PREFIX + key, res.etag)
  } catch (e) {
    const cur = (e as { etag?: string })?.etag
    if (cur === undefined && !(e instanceof Error && /conflict/.test(e.message))) throw e
    etags[key] = cur
    const res = await putStateFile(name, body, etags[key])
    etags[key] = res.etag
    if (res.etag) localStorage.setItem(ETAG_PREFIX + key, res.etag)
  }
}

export function setupAutosave() {
  let timer: number | undefined
  $effect(() => {
    JSON.stringify(widgets.list)
    JSON.stringify(services.list)
    JSON.stringify(wm.list)
    JSON.stringify(boxes.list)
    JSON.stringify(settings.wallpaper)
    JSON.stringify(settings.cursor)
    JSON.stringify(recent.ids)
    JSON.stringify(settings.boxBehavior)
    void settings.theme
    void settings.contrast
    void settings.accent
    void stage.refW
    void stage.refH
    void stage.crispMode
    if (!ready) return
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(save, 400)
  })
}
