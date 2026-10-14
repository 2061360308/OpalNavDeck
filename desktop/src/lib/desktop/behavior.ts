import type { WidgetBehavior } from '../types'

export const DEFAULT_BEHAVIOR: WidgetBehavior = {
  opacity: 1,
  hover: 'none',
  clickThrough: false,
  draggable: true,
  dragMode: 'always',
  stayInBounds: true,
  snap: true,
}

export function makeBehavior(p?: Partial<WidgetBehavior>): WidgetBehavior {
  return { ...DEFAULT_BEHAVIOR, ...(p ?? {}) }
}

export const HOVER_MODES: { value: WidgetBehavior['hover']; label: string }[] = [
  { value: 'none', label: '无动作' },
  { value: 'hide', label: '隐藏' },
  { value: 'fadein', label: '淡入' },
  { value: 'fadeout', label: '淡出' },
]
