import { menus } from './menuStore.svelte'
import { widgets } from '../state/widgets.svelte'
import { boxes } from '../state/boxes.svelte'
import { services } from '../state/services.svelte'
import { toast } from '../state/toast.svelte'
import { editor } from '../state/editor.svelte'
import { settings } from './settings.svelte'
import { stage } from '../stage/stageState.svelte'
import { wm } from '../state/windows.svelte'
import type { MenuContext, MenuItem } from './types'
import type { HoverMode } from '../types'
import { openAccount, openResources, openSources } from '../apps/apps'

function opacityItems(widgetId: string): MenuItem[] {
  const w = widgets.byId(widgetId)
  // 菜单里是「透明度」：100% = 全透明(opacity 0)，0% = 不透明(opacity 1)
  const transparency = w ? Math.round((1 - w.behavior.opacity) * 100) : 0
  return Array.from({ length: 11 }, (_, i) => i * 10).map((p) => ({
    id: `op-${p}`,
    label: `${p}%`,
    checked: transparency === p,
    action: () => widgets.setBehavior(widgetId, { opacity: 1 - p / 100 }),
  }))
}

const HOVER_ITEMS: { value: HoverMode; label: string }[] = [
  { value: 'none', label: '无动作' },
  { value: 'hide', label: '隐藏' },
  { value: 'fadein', label: '淡入' },
  { value: 'fadeout', label: '淡出' },
]

function openRainmeter() {
  wm.open({
    title: 'Rainmeter 管理器',
    icon: '💧',
    appId: 'rainmeter',
    w: 920,
    h: 620,
    light: true,
  })
}

function openSettingsCenter() {
  wm.open({
    title: '主题设置',
    icon: '⚙️',
    appId: 'settings-center',
    w: 780,
    h: 580,
  })
}

function openFiles() {
  wm.open({ title: '文件管理', icon: '📁', appId: 'files', w: 840, h: 580 })
}

/** virtual-desktop point under the context menu (new boxes spawn there) */
function spawnAt(ctx: MenuContext): [number, number] {
  const v = stage.toVirtual(ctx.x, ctx.y)
  return [Math.round(v.x), Math.round(v.y)]
}

/** unique service categories (same grouping rule as the resources window) */
function categories(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of services.list) {
    const g = s.group?.trim() || '未分类'
    if (!seen.has(g)) {
      seen.add(g)
      out.push(g)
    }
  }
  return out
}

function openPersonalize() {
  wm.open({
    title: '个性化',
    icon: '🎨',
    appId: 'personalize',
    w: 860,
    h: 600,
  })
}

export function installDefaultMenus() {
  menus.register('widget', (ctx: MenuContext) => {
    const w = ctx.widget
    if (!w) return []
    const id = w.id
    return [
      {
        id: 'settings',
        label: '设置',
        submenu: [
          { id: 'opacity', label: '透明', submenu: opacityItems(id) },
          {
            id: 'hover',
            label: '悬停',
            submenu: HOVER_ITEMS.map((h) => ({
              id: `hover-${h.value}`,
              label: h.label,
              checked: w.behavior.hover === h.value,
              action: () => widgets.setBehavior(id, { hover: h.value }),
            })),
          },
          {
            id: 'clickThrough',
            label: '点击穿透',
            checked: w.behavior.clickThrough,
            action: () => widgets.setBehavior(id, { clickThrough: !w.behavior.clickThrough }),
          },
          {
            id: 'draggable',
            label: '允许拖动',
            checked: w.behavior.draggable,
            action: () => widgets.setBehavior(id, { draggable: !w.behavior.draggable }),
          },
          {
            id: 'stayInBounds',
            label: '屏幕以内',
            checked: w.behavior.stayInBounds,
            action: () => widgets.setBehavior(id, { stayInBounds: !w.behavior.stayInBounds }),
          },
          {
            id: 'snap',
            label: '边缘吸附',
            checked: w.behavior.snap,
            action: () => widgets.setBehavior(id, { snap: !w.behavior.snap }),
          },
        ],
      },
      { id: 'manage', label: '管理皮肤', disabled: true },
      { id: 'rainmeter', label: 'Rainmeter', action: () => openRainmeter() },
      { id: 'close', label: '关闭皮肤', danger: true, action: () => widgets.remove(id) },
    ]
  })

  menus.register('box', (ctx: MenuContext) => {
    const root = ctx.box
    if (!root) return []
    const owner = boxes.activeOf(root)
    const id = owner.id
    return [
      {
        id: 'rename',
        label: '重命名',
        action: () => {
          const next = window.prompt('盒子名称', owner.title)
          if (next !== null) boxes.setTitle(id, next)
        },
      },
      { id: 'sep1', separator: true },
      {
        id: 'layout',
        label: '布局',
        submenu: [
          {
            id: 'icons',
            label: '图标',
            checked: owner.layout === 'icons',
            action: () => boxes.setLayout(id, 'icons'),
          },
          {
            id: 'list',
            label: '列表',
            checked: owner.layout === 'list',
            action: () => boxes.setLayout(id, 'list'),
          },
        ],
      },
      {
        id: 'collapse',
        label: '折叠',
        checked: root.collapsed,
        action: () => boxes.toggleCollapsed(root.id),
      },
      {
        id: 'lock',
        label: '锁定',
        checked: root.locked,
        action: () => boxes.toggleLocked(root.id),
      },
      {
        id: 'unstack',
        label: '取消堆叠',
        hidden: root.tabs.length === 0,
        submenu: [
          { id: 'unstack-current', label: '当前盒子', action: () => boxes.detach(id) },
          {
            id: 'unstack-all',
            label: '全部盒子',
            action: () => {
              for (const t of [...root.tabs]) boxes.detach(t)
            },
          },
        ],
      },
      {
        id: 'settings-center',
        label: '主题设置',
        action: () => openSettingsCenter(),
      },
      { id: 'sep2', separator: true },
      {
        id: 'close',
        label: '解散盒子',
        danger: true,
        action: () => boxes.remove(root.id),
      },
    ]
  })

  menus.register('desktop', () => [
    {
      id: 'resources',
      label: '资源导航',
      action: () => openResources(),
    },
    { id: 'files', label: '文件管理', action: () => openFiles() },
    { id: 'sources', label: '监控源', action: () => openSources() },
    { id: 'account', label: '账号与安全', action: () => openAccount() },
    { id: 'sep', separator: true },
    {
      id: 'kudai',
      label: '酷呆桌面',
      submenu: [
        { id: 'new-item', label: '新建项目', action: () => editor.show() },
        { id: 'add-box', label: '添加盒子', action: (ctx) => boxes.add(...spawnAt(ctx)) },
        {
          id: 'add-mapped',
          label: '创建映射盒子',
          hidden: categories().length === 0,
          submenu: categories().map((g) => ({
            id: `map-${g}`,
            label: g,
            action: (ctx) => boxes.addMapped(g, ...spawnAt(ctx)),
          })),
        },
        {
          id: 'add-recent',
          label: '开启最近盒子',
          action: (ctx) => {
            if (boxes.findRecent()) {
              toast.show('您想要的盒子已经存在了')
              return
            }
            boxes.addRecent(...spawnAt(ctx))
          },
        },
        { id: 'sep-opt', separator: true },
        {
          id: 'opt-hover-tab',
          label: '自动切换',
          checked: settings.boxBehavior.hoverTab,
          action: () => {
            settings.boxBehavior.hoverTab = !settings.boxBehavior.hoverTab
          },
        },
        {
          id: 'opt-hover-expand',
          label: '自动展开',
          checked: settings.boxBehavior.hoverExpand,
          action: () => {
            settings.boxBehavior.hoverExpand = !settings.boxBehavior.hoverExpand
          },
        },
        {
          id: 'opt-dblclick',
          label: '双击隐藏盒子',
          checked: settings.boxBehavior.dblclickHide,
          action: () => {
            settings.boxBehavior.dblclickHide = !settings.boxBehavior.dblclickHide
          },
        },
        { id: 'sep-theme', separator: true },
        { id: 'settings-center', label: '主题设置', action: () => openSettingsCenter() },
      ],
    },
    { id: 'rainmeter', label: 'Rainmeter', action: () => openRainmeter() },
    { id: 'sep-personalize', separator: true },
    { id: 'personalize', label: '个性化', action: () => openPersonalize() },
  ])
}
