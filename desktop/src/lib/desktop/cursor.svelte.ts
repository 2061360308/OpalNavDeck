import type { CursorRole, CursorState } from '../types'

export interface CursorRoleDef {
  role: CursorRole
  label: string
  fallback: string
  /** selectors the custom cursor overrides (empty = only the global default) */
  selectors: string
  hint?: string
}

const TEXT_SEL =
  'input:not([type="color"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"], [contenteditable=""], .cm-editor, .jsoneditor, .tv, .jv, .md, .pv, .iv'

export const CURSOR_ROLES: CursorRoleDef[] = [
  { role: 'default', label: '正常选择', fallback: 'default', selectors: '' },
  {
    role: 'pointer',
    label: '链接选择',
    fallback: 'pointer',
    selectors: 'a, button, [role="button"], .item, .card, label[for], summary',
  },
  { role: 'text', label: '文本选择', fallback: 'text', selectors: TEXT_SEL },
  { role: 'move', label: '移动/拖动', fallback: 'grabbing', selectors: '.box.dragging, .box.dragging *' },
  { role: 'help', label: '帮助选择', fallback: 'help', selectors: '[data-cursor-help]', hint: '占位' },
  { role: 'progress', label: '后台运行', fallback: 'progress', selectors: '[data-cursor-progress]', hint: '占位' },
  { role: 'wait', label: '忙', fallback: 'wait', selectors: '[data-cursor-wait]', hint: '占位' },
  { role: 'crosshair', label: '精确选择', fallback: 'crosshair', selectors: '[data-cursor-crosshair]', hint: '占位' },
  { role: 'notAllowed', label: '不可用', fallback: 'not-allowed', selectors: '.merge-invalid, .merge-invalid *' },
  { role: 'ewResize', label: '水平调整', fallback: 'ew-resize', selectors: '[style*="ew-resize"]' },
  { role: 'nsResize', label: '垂直调整', fallback: 'ns-resize', selectors: '[style*="ns-resize"]' },
  { role: 'nwseResize', label: '对角调整 1', fallback: 'nwse-resize', selectors: '[style*="nwse-resize"]' },
  { role: 'neswResize', label: '对角调整 2', fallback: 'nesw-resize', selectors: '[style*="nesw-resize"]' },
]

const STYLE_ID = 'dt-cursor-style'

function rule(selectors: string, url: string, fallback: string): string {
  return `${selectors}{cursor:url("${url}") 0 0, ${fallback} !important;}`
}

/** build the stylesheet that applies a custom cursor theme */
export function cursorCss(state: CursorState): string {
  if (!state?.enabled) return ''
  const out: string[] = []
  const def = state.roles.default
  if (def) out.push(rule('html, body, .desktop, .desktop *', def, 'default'))
  for (const r of CURSOR_ROLES) {
    if (r.role === 'default' || !r.selectors) continue
    const url = state.roles[r.role]
    if (url) out.push(rule(r.selectors, url, r.fallback))
  }
  return out.join('\n')
}

export function applyCursor(state: CursorState) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  const css = cursorCss(state)
  if (!css) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = css
}
