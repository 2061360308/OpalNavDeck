import type { HoverMode } from '../../types'

export interface RmTheme {
  id: string
  name: string
}

export interface SavedTheme {
  id: string
  name: string
  empty: boolean
  excludeUnused: boolean
  wallpaper: boolean
}

class RainmeterStore {
  themes = $state<RmTheme[]>([{ id: 'illustro', name: 'illustro' }])
  activeThemeId = $state('illustro')
  selectedWidgetId = $state('')
  expanded = $state<Record<string, boolean>>({})
  savedThemes = $state<SavedTheme[]>([
    {
      id: 'st-illustro',
      name: 'illustro default',
      empty: false,
      excludeUnused: false,
      wallpaper: false,
    },
  ])
  selectedSavedId = $state('st-illustro')

  get activeTheme(): RmTheme {
    return this.themes.find((t) => t.id === this.activeThemeId) ?? this.themes[0]
  }

  isExpanded(id: string): boolean {
    return this.expanded[id] !== false
  }

  toggle(id: string) {
    this.expanded[id] = !this.isExpanded(id)
  }

  selectWidget(id: string) {
    this.selectedWidgetId = id
  }

  addTheme() {
    const n = this.themes.length + 1
    this.themes.push({ id: `theme-${n}`, name: `新建主题 ${n}` })
    this.activeThemeId = `theme-${n}`
  }

  saveTheme(name: string, opts: { empty: boolean; excludeUnused: boolean; wallpaper: boolean }) {
    const id = `st-${Date.now().toString(36)}`
    this.savedThemes.push({ id, name: name || '未命名主题', ...opts })
    this.selectedSavedId = id
  }

  deleteSaved(id: string) {
    this.savedThemes = this.savedThemes.filter((t) => t.id !== id)
    if (this.selectedSavedId === id) this.selectedSavedId = this.savedThemes[0]?.id ?? ''
  }

  get selectedSaved(): SavedTheme | undefined {
    return this.savedThemes.find((t) => t.id === this.selectedSavedId)
  }
}

export const rm = new RainmeterStore()

export const POSITIONS = ['正常', '顶部', '底部', '左侧', '右侧', '居中']
export const MONITORS = ['主显示器', '显示器 1', '显示器 2']
export const TRANSPARENCY = Array.from({ length: 11 }, (_, i) => i * 10)

export const HOVER_LABEL: Record<HoverMode, string> = {
  none: '无动作',
  hide: '隐藏',
  fadein: '淡入',
  fadeout: '淡出',
}

export function hoverModeFromLabel(label: string): HoverMode {
  const found = (Object.keys(HOVER_LABEL) as HoverMode[]).find((k) => HOVER_LABEL[k] === label)
  return found ?? 'none'
}
