import type { Box, Widget } from '../types'

export interface MenuItem {
  id: string
  label?: string
  icon?: string
  separator?: boolean
  danger?: boolean
  disabled?: boolean
  hidden?: boolean
  checked?: boolean
  submenu?: MenuItem[]
  action?: (ctx: MenuContext) => void
}

export type MenuTarget = 'desktop' | 'widget' | 'box' | 'fs'

export interface FsMenuRef {
  path: string
  name?: string
  type?: 'file' | 'dir'
}

export interface MenuContext {
  target: MenuTarget
  x: number
  y: number
  widget?: Widget
  box?: Box
  fs?: FsMenuRef
}

export interface ThemeDef {
  id: string
  name: string
  dark?: boolean
  tokens: Record<string, string>
}
