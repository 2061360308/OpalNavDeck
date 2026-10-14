import type { ColorMode, ContrastMode } from '../types'
import type { ThemeDef } from './types'

type ResolvedTheme = 'light' | 'dark'

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '').replace('#', '').trim()
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = parseInt(h, 16)
  if (h.length !== 6 || Number.isNaN(n)) return [110, 168, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function accentVariants(hex: string) {
  const [r, g, b] = hexToRgb(hex)
  const soft = `rgba(${r}, ${g}, ${b}, 0.16)`
  const soft2 = `rgba(${r}, ${g}, ${b}, 0.32)`
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return { accent: hex, soft, soft2, fg: L > 0.55 ? '#0a0d14' : '#ffffff' }
}

/** high-contrast overlay tokens (layered on top of the base palette) */
const HIGH_CONTRAST: Record<string, string> = {
  '--dt-bg': '#000000',
  '--dt-fg': '#ffffff',
  '--dt-fg-muted': '#e6e6e6',
  '--dt-window-bg': '#000000',
  '--dt-surface': '#000000',
  '--dt-surface-sunken': '#000000',
  '--dt-border': '#ffffff',
  '--dt-panel': '#000000',
  '--dt-panel-border': '#ffffff',
  '--dt-titlebar': '#000000',
  '--dt-hover': 'rgba(255, 255, 255, 0.18)',
  '--dt-input-bg': '#000000',
  '--dt-taskbar': '#000000',
  '--dt-menu-bg': '#000000',
  '--dt-box-bg': '#000000',
  '--dt-box-tab': '#000000',
  '--dt-danger': '#ff6b6b',
  '--dt-shadow': '0 0 0 1px #ffffff',
}

class ThemeRegistry {
  list = $state<ThemeDef[]>([])

  register(def: ThemeDef) {
    const i = this.list.findIndex((d) => d.id === def.id)
    if (i >= 0) this.list[i] = def
    else this.list.push(def)
  }

  get(id: string): ThemeDef | undefined {
    return this.list.find((d) => d.id === id)
  }

  /** resolve a color mode to a concrete palette id */
  resolve(mode: ColorMode): ResolvedTheme {
    if (mode === 'system') {
      const mq =
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(prefers-color-scheme: dark)')
          : null
      return mq && !mq.matches ? 'light' : 'dark'
    }
    return mode === 'light' ? 'light' : 'dark'
  }

  apply(mode: ColorMode, accent = '', contrast: ContrastMode = 'normal') {
    const root = document.documentElement
    const resolved = this.resolve(mode)
    const def = this.get(resolved) ?? this.get('dark')
    if (def) {
      for (const [k, v] of Object.entries(def.tokens)) root.style.setProperty(k, v)
    }
    root.dataset.theme = resolved

    if (contrast === 'high') for (const [k, v] of Object.entries(HIGH_CONTRAST)) root.style.setProperty(k, v)

    // effective accent: user's choice, else a high-contrast yellow, else the palette default
    const baseAccent = (def?.tokens['--dt-accent'] as string) ?? '#6ea8ff'
    const effective =
      accent && /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : contrast === 'high' ? '#ffff00' : baseAccent
    const acc = accentVariants(effective)
    root.style.setProperty('--dt-accent', acc.accent)
    root.style.setProperty('--dt-accent-soft', acc.soft)
    root.style.setProperty('--dt-accent-soft2', acc.soft2)
    root.style.setProperty('--dt-accent-fg', acc.fg)
    root.style.setProperty('--dt-ring', `0 0 0 2px ${acc.soft2}`)
    root.style.setProperty('--mx-hover-bg', acc.accent)
    root.style.setProperty('--mx-active-bg', acc.accent)
    root.style.setProperty('--mx-hover-text', acc.fg)

    root.dataset.contrast = contrast
    root.style.colorScheme = resolved
  }
}

export const themes = new ThemeRegistry()

themes.register({
  id: 'dark',
  name: '深色',
  dark: true,
  tokens: {
    '--dt-bg': '#0a0d14',
    '--dt-fg': '#e8ecf4',
    '--dt-fg-muted': '#9aa4b5',
    '--dt-window-bg': '#1b1e27',
    '--dt-surface': '#1b1e27',
    '--dt-surface-sunken': '#14161d',
    '--dt-border': 'rgba(255, 255, 255, 0.12)',
    '--dt-panel': 'rgba(18, 20, 28, 0.55)',
    '--dt-panel-border': 'rgba(255, 255, 255, 0.12)',
    '--dt-titlebar': 'linear-gradient(#2a2f3d, #22262f)',
    '--dt-hover': 'rgba(255, 255, 255, 0.08)',
    '--dt-input-bg': 'rgba(0, 0, 0, 0.25)',
    '--dt-danger': '#e04a4a',
    '--dt-shadow': '0 18px 60px rgba(0, 0, 0, 0.5)',
    '--dt-taskbar': 'rgba(14, 16, 22, 0.85)',
    '--dt-menu-bg': 'rgba(26, 29, 38, 0.98)',
    '--dt-box-bg': 'rgba(18, 20, 28, 0.55)',
    '--dt-box-tab': 'rgba(0, 0, 0, 0.18)',
    '--dt-accent': '#6ea8ff',
  },
})

themes.register({
  id: 'light',
  name: '浅色',
  dark: false,
  tokens: {
    '--dt-bg': '#eef1f6',
    '--dt-fg': '#1c2230',
    '--dt-fg-muted': '#5b6577',
    '--dt-window-bg': '#ffffff',
    '--dt-surface': '#ffffff',
    '--dt-surface-sunken': '#f2f4f8',
    '--dt-border': 'rgba(0, 0, 0, 0.14)',
    '--dt-panel': 'rgba(255, 255, 255, 0.75)',
    '--dt-panel-border': 'rgba(0, 0, 0, 0.12)',
    '--dt-titlebar': 'linear-gradient(#f4f6fa, #e7ebf2)',
    '--dt-hover': 'rgba(0, 0, 0, 0.06)',
    '--dt-input-bg': 'rgba(0, 0, 0, 0.04)',
    '--dt-danger': '#c62828',
    '--dt-shadow': '0 18px 60px rgba(20, 30, 50, 0.25)',
    '--dt-taskbar': 'rgba(240, 243, 249, 0.9)',
    '--dt-menu-bg': 'rgba(255, 255, 255, 0.98)',
    '--dt-box-bg': 'rgba(255, 255, 255, 0.75)',
    '--dt-box-tab': 'rgba(0, 0, 0, 0.06)',
    '--dt-accent': '#2f6fed',
  },
})
