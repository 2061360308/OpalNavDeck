import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { reorder } from '@atlaskit/pragmatic-drag-and-drop/reorder'
import { boxes } from '../state/boxes.svelte'
import { services } from '../state/services.svelte'

type SourceKind = 'res' | 'box'
type ListKind = 'cat' | 'box'

export interface DragData {
  type: 'icon'
  from: SourceKind
  id: string
  cat?: string
  ownerId?: string
  label: { icon: string; name: string }
}
export interface ItemData {
  type: 'drop-item'
  listKind: ListKind
  cat?: string
  boxId?: string
  id: string
  index: number
}
export interface ListData {
  type: 'drop-list'
  listKind: ListKind
  cat?: string
  boxId?: string
}

class DndState {
  active = $state(false)
  forbidden = $state(false)
  overTrash = $state(false)
  /** list key (box:<id> / cat:<name>) when the pointer is over the list body (append at end) */
  endKey = $state('')
  icon = $state<string | undefined>(undefined)
  name = $state('')
}
export const dnd = new DndState()

function listKeyOf(d: ItemData | ListData): string {
  return d.listKind === 'box' ? `box:${d.boxId ?? ''}` : `cat:${d.cat ?? ''}`
}

function isBoxUnlocked(boxId: string | undefined): boolean {
  if (!boxId) return false
  const b = boxes.byId(boxId)
  return !!b && !b.locked
}

/** whether a given drop target accepts the current source */
function accepts(source: DragData | undefined, target: ItemData | ListData | { type: string }): boolean {
  if (!source || source.type !== 'icon') return false
  const srcOwner =
    source.from === 'box' && source.ownerId ? boxes.byId(source.ownerId) : undefined
  const srcDerived = srcOwner?.kind === 'mapped' || srcOwner?.kind === 'recent'
  if (target.type === 'drop-trash') return !srcDerived
  const t = target as ItemData | ListData
  if (t.listKind === 'box') {
    if (!isBoxUnlocked(t.boxId)) return false
    const owner = boxes.ownerFor(t.boxId ?? '')
    if (!owner) return false
    // recent boxes accept nothing (no reorder, no drop-in)
    if (owner.kind === 'recent') return false
    // mapped boxes only accept internal reordering (no drop-in, no drag-out)
    if (owner.kind === 'mapped') return source.from === 'box' && source.ownerId === owner.id
    // a mapped/recent member cannot be dragged out to another box
    if (srcDerived && source.ownerId !== owner.id) return false
    return true
  }
  if (t.listKind === 'cat') return source.from === 'res' && source.cat === t.cat
  return false
}

/* -------------------- drop application -------------------- */

function applyDrop(source: DragData, dropTargets: { data: Record<string, unknown> }[]) {
  const datas = dropTargets.map((t) => t.data as unknown as ItemData | ListData | { type: string })
  const valid = datas.filter((d) => accepts(source, d))
  const trash = valid.find((d) => d.type === 'drop-trash')
  if (trash) {
    if (source.from === 'box' && source.ownerId) boxes.removeMember(source.ownerId, source.id)
    else if (source.from === 'res') void services.remove(source.id)
    return
  }
  const item = valid.find((d) => d.type === 'drop-item') as ItemData | undefined
  const list = valid.find((d) => d.type === 'drop-list') as ListData | undefined
  const listKind = item?.listKind ?? list?.listKind
  if (listKind === 'cat') applyCategory(source, item)
  else if (listKind === 'box') applyBox(source, item, list)
}

function applyCategory(source: DragData, item: ItemData | undefined) {
  if (source.from !== 'res' || !source.cat) return
  const cat = source.cat
  const ids = services.categoryIds(cat)
  const from = ids.indexOf(source.id)
  if (from < 0) return
  const edge = item ? extractClosestEdge(item as unknown as Record<PropertyKey, unknown>) : null
  let to = ids.length - 1
  if (item && edge) {
    to = Math.max(0, Math.min(item.index + (edge === 'right' ? 1 : 0), ids.length - 1))
  }
  void services.setCategoryOrder(reorder({ list: ids, startIndex: from, finishIndex: to }))
}

function applyBox(source: DragData, item: ItemData | undefined, list: ListData | undefined) {
  const boxId = item?.boxId ?? list?.boxId
  if (!boxId) return
  const owner = boxes.ownerFor(boxId)
  if (!owner) return
  const ids = boxes.memberIds(owner)
  const edge = item ? extractClosestEdge(item as unknown as Record<PropertyKey, unknown>) : null
  const index = item && edge ? item.index + (edge === 'right' ? 1 : 0) : ids.length

  if (source.from === 'res') {
    boxes.insertMember(owner.id, source.id, index)
    return
  }
  if (source.ownerId === owner.id) {
    const from = ids.indexOf(source.id)
    if (from < 0) return
    const to = Math.max(0, Math.min(index, ids.length - 1))
    boxes.setMembers(owner.id, reorder({ list: [...ids], startIndex: from, finishIndex: to }))
  } else if (source.ownerId) {
    boxes.removeMember(source.ownerId, source.id)
    boxes.insertMember(owner.id, source.id, index)
  }
}

/* -------------------- tab auto-switch while dragging -------------------- */

const HOVER_MS = 300
let tabTimer: number | undefined
let tabKey = ''

function maybeSwitchTab(x: number, y: number) {
  const els = document.elementsFromPoint(x, y) as HTMLElement[]
  let tabEl: HTMLElement | null = null
  for (const el of els) {
    tabEl = el.closest('[data-tab-id]')
    if (tabEl) break
  }
  const boxEl = tabEl?.closest('[data-box]') as HTMLElement | null
  const boxId = boxEl?.getAttribute('data-box') ?? ''
  const tabId = tabEl?.getAttribute('data-tab-id') ?? ''
  const isActive = !!tabEl?.classList.contains('active')
  const key = tabId && boxId && !isActive ? `${boxId}:${tabId}` : ''
  if (key === tabKey) return
  tabKey = key
  if (tabTimer !== undefined) clearTimeout(tabTimer)
  tabTimer = undefined
  if (key) tabTimer = window.setTimeout(() => boxes.setActiveTab(boxId, tabId), HOVER_MS)
}

function resetTab() {
  tabKey = ''
  if (tabTimer !== undefined) clearTimeout(tabTimer)
  tabTimer = undefined
}

/* -------------------- global monitor -------------------- */

let inited = false
export function initDnd(): () => void {
  if (inited) return () => {}
  inited = true
  const reset = () => {
    dnd.active = false
    dnd.forbidden = false
    dnd.overTrash = false
    dnd.endKey = ''
    document.documentElement.style.cursor = ''
    document.body.classList.remove('dnd-active')
    resetTab()
  }
  const onDragEnd = () => reset()
  window.addEventListener('dragend', onDragEnd)
  const cleanup = monitorForElements({
    canMonitor: ({ source }) => (source.data as { type?: string }).type === 'icon',
    onDragStart: ({ source }) => {
      const s = source.data as unknown as DragData
      dnd.active = true
      dnd.icon = s.label.icon
      dnd.name = s.label.name
      dnd.forbidden = false
      dnd.overTrash = false
      dnd.endKey = ''
      document.body.classList.add('dnd-active')
    },
    onDrag: ({ source, location }) => {
      const s = source.data as unknown as DragData
      const datas = location.current.dropTargets.map(
        (t) => t.data as unknown as ItemData | ListData | { type: string }
      )
      const valid = datas.filter((d) => accepts(s, d))
      const overTrash = valid.some((d) => d.type === 'drop-trash')
      dnd.overTrash = overTrash
      dnd.forbidden = valid.length === 0
      const inner = valid[0]
      dnd.endKey = inner && inner.type === 'drop-list' ? listKeyOf(inner as ListData) : ''
      document.documentElement.style.cursor = dnd.forbidden ? 'not-allowed' : ''
      const input = location.current.input
      maybeSwitchTab(input.clientX, input.clientY)
    },
    onDrop: ({ source, location }) => {
      reset()
      applyDrop(
        source.data as unknown as DragData,
        location.current.dropTargets as { data: Record<string, unknown> }[]
      )
    },
  })
  return () => {
    cleanup()
    window.removeEventListener('dragend', onDragEnd)
    inited = false
  }
}

/* -------------------- capsule preview -------------------- */

function makeCapsule(icon: string | undefined, name: string): HTMLElement {
  const root = document.createElement('div')
  root.style.cssText =
    'position:fixed;top:0;left:0;z-index:99999;pointer-events:none;display:inline-flex;align-items:center;gap:8px;' +
    'max-width:240px;padding:6px 12px 6px 8px;border-radius:999px;background:rgba(28,32,44,0.9);' +
    'border:1px solid rgba(255,255,255,0.16);box-shadow:0 10px 28px rgba(0,0,0,0.5);color:#e8ecf4;font:13px/1.2 system-ui,sans-serif'
  const ico = document.createElement('span')
  ico.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:0 0 auto'
  if (icon) {
    const img = document.createElement('img')
    img.src = `/icons/assets/${icon}`
    img.style.cssText = 'width:22px;height:22px;object-fit:contain'
    ico.appendChild(img)
  }
  root.appendChild(ico)
  if (name) {
    const n = document.createElement('span')
    n.textContent = name
    n.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
    root.appendChild(n)
  }
  return root
}

/* -------------------- Svelte actions -------------------- */

export function dragSource(
  node: HTMLElement,
  spec: { getData: () => DragData; disabled?: () => boolean }
) {
  const cleanup = draggable({
    element: node,
    canDrag: () => !(spec.disabled?.() ?? false),
    getInitialData: () => spec.getData() as unknown as Record<string, unknown>,
    onGenerateDragPreview: ({ nativeSetDragImage }) => {
      const d = spec.getData()
      setCustomNativeDragPreview({
        nativeSetDragImage,
        render: ({ container }) => {
          container.appendChild(makeCapsule(d.label.icon, d.label.name))
          return () => {}
        },
      })
    },
  })
  return { destroy: cleanup }
}

export function dropItem(node: HTMLElement, spec: { getData: () => ItemData }) {
  const cleanup = dropTargetForElements({
    element: node,
    canDrop: ({ source }) => accepts(source.data as unknown as DragData, spec.getData()),
    getData: ({ input, element }) =>
      attachClosestEdge(spec.getData() as unknown as Record<PropertyKey, unknown>, {
        element,
        input,
        allowedEdges: ['left', 'right'],
      }) as unknown as Record<string, unknown>,
    onDragEnter: ({ self }) => {
      const e = extractClosestEdge(self.data as unknown as Record<PropertyKey, unknown>)
      if (e) node.setAttribute('data-dnd-edge', e)
    },
    onDrag: ({ self }) => {
      const e = extractClosestEdge(self.data as unknown as Record<PropertyKey, unknown>)
      if (e) node.setAttribute('data-dnd-edge', e)
      else node.removeAttribute('data-dnd-edge')
    },
    onDragLeave: () => node.removeAttribute('data-dnd-edge'),
    onDrop: () => node.removeAttribute('data-dnd-edge'),
  })
  return { destroy: cleanup }
}

export function dropList(node: HTMLElement, spec: { getData: () => ListData }) {
  const cleanup = dropTargetForElements({
    element: node,
    canDrop: ({ source }) => accepts(source.data as unknown as DragData, spec.getData()),
    getData: () => spec.getData() as unknown as Record<string, unknown>,
    onDragEnter: () => node.classList.add('dnd-drop-ok'),
    onDragLeave: () => node.classList.remove('dnd-drop-ok'),
    onDrop: () => node.classList.remove('dnd-drop-ok'),
  })
  return { destroy: cleanup }
}

export function dropTrash(node: HTMLElement) {
  const cleanup = dropTargetForElements({
    element: node,
    canDrop: ({ source }) => (source.data as { type?: string }).type === 'icon',
    getData: () => ({ type: 'drop-trash' }),
  })
  return { destroy: cleanup }
}
