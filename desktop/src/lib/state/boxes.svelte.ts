import type { Box, BoxLayout, BoxTheme } from '../types'
import { uid } from './widgets.svelte'
import { services } from './services.svelte'
import { recent, RECENT_LIMIT } from './recent.svelte'
import { stage } from '../stage/stageState.svelte'
import { guides } from '../desktop/guideStore.svelte'
import { snapMove } from '../desktop/snap'

const MIN_W = 160
const MIN_H = 80

export const DEFAULT_BOX_THEME: BoxTheme = {
  color: '#1f2229',
  opacity: 55,
  bgImage: '',
  bgImagePath: '',
  titlePos: 'top',
  tabPos: 'top',
  border: true,
  radius: true,
  showTitle: true,
  bigFont: false,
  iconOnly: false,
}

function makeTheme(): BoxTheme {
  return { ...DEFAULT_BOX_THEME }
}

function makeBox(partial: Partial<Box> & { x: number; y: number }): Box {
  return {
    id: uid('box'),
    title: '新建盒子',
    w: 300,
    h: 200,
    z: 1,
    serviceIds: [],
    layout: 'icons',
    iconSize: 64,
    theme: makeTheme(),
    collapsed: false,
    locked: false,
    tabs: [],
    ...partial,
  }
}

const seed: Box[] = [makeBox({ title: '自建服务', x: 120, y: 470, w: 300, h: 210, z: 1 })]

class BoxesState {
  list = $state<Box[]>(seed)
  /** box currently highlighted as a merge target while dragging */
  mergeTargetId = $state<string | null>(null)
  /** all boxes temporarily hidden (double-click desktop) */
  hidden = $state(false)
  private topZ = 10

  toggleHidden() {
    this.hidden = !this.hidden
  }

  byId(id: string): Box | undefined {
    return this.list.find((b) => b.id === id)
  }

  /** boxes living directly on the desktop (not merged into a container) */
  topLevel = $derived(this.list.filter((b) => !b.parentId))

  childrenOf(id: string): Box[] {
    const parent = this.byId(id)
    if (!parent) return []
    return parent.tabs.map((tid) => this.byId(tid)).filter((b): b is Box => !!b)
  }

  /** the box that owns the current content (active tab, or itself) */
  activeOf(box: Box): Box {
    if (box.tabs.length === 0) return box
    const active = box.activeTabId ? this.byId(box.activeTabId) : undefined
    return active && active.parentId === box.id ? active : (this.childrenOf(box.id)[0] ?? box)
  }

  add(x = 200, y = 200): Box {
    this.topZ += 1
    const b = makeBox({ x, y, z: this.topZ })
    this.list.push(b)
    this.clamp(b)
    return b
  }

  /** a box that mirrors a whole category (service group); content auto-syncs */
  addMapped(group: string, x = 200, y = 200): Box {
    this.topZ += 1
    const b = makeBox({ title: group, kind: 'mapped', mapGroup: group, x, y, z: this.topZ })
    this.list.push(b)
    this.clamp(b)
    return b
  }

  /** the single "recently used" box */
  addRecent(x = 200, y = 200): Box {
    this.topZ += 1
    const b = makeBox({ title: '最近使用', kind: 'recent', x, y, z: this.topZ })
    this.list.push(b)
    this.clamp(b)
    return b
  }

  findRecent(): Box | undefined {
    return this.list.find((b) => b.kind === 'recent')
  }

  /** ids of the members a box currently shows (derived for mapped/recent boxes) */
  memberIds(box: Box): string[] {
    if (box.kind === 'mapped') {
      const g = box.mapGroup ?? ''
      const cat = services.list.filter((s) => (s.group?.trim() || '未分类') === g).map((s) => s.id)
      const pref = box.serviceIds.filter((id) => cat.includes(id))
      const rest = cat.filter((id) => !pref.includes(id))
      return [...pref, ...rest]
    }
    if (box.kind === 'recent') return recent.ids.slice(0, RECENT_LIMIT)
    return [...box.serviceIds]
  }

  remove(id: string) {
    const box = this.byId(id)
    if (box) {
      for (const tid of [...box.tabs]) this.remove(tid)
    }
    this.list = this.list.filter((b) => b.id !== id && b.parentId !== id)
  }

  bringToFront(id: string) {
    const root = this.rootOf(id)
    if (!root) return
    this.topZ += 1
    root.z = this.topZ
  }

  private rootOf(id: string): Box | undefined {
    let cur = this.byId(id)
    let guard = 0
    while (cur?.parentId && guard < 32) {
      cur = this.byId(cur.parentId)
      guard += 1
    }
    return cur
  }

  move(id: string, x: number, y: number) {
    const b = this.byId(id)
    if (!b) return
    b.x = x
    b.y = y
    this.clamp(b)
  }

  resize(id: string, w: number, h: number) {
    const b = this.byId(id)
    if (!b) return
    b.w = Math.max(MIN_W, w)
    b.h = Math.max(MIN_H, h)
    this.clamp(b)
  }

  /** resize from a handle; anchors the opposite edge when dragging w/n */
  resizeRect(
    id: string,
    origX: number,
    origY: number,
    origW: number,
    origH: number,
    newW: number,
    newH: number,
    left: boolean,
    top: boolean
  ) {
    const b = this.byId(id)
    if (!b) return
    let w = Math.max(MIN_W, newW)
    let h = Math.max(MIN_H, newH)
    let x = left ? origX + origW - w : origX
    let y = top ? origY + origH - h : origY

    // horizontal: keep the anchored edge fixed, don't grow past the desktop
    if (left) {
      if (x < 0) {
        x = 0
        w = origX + origW
      }
    } else if (x + w > stage.refW) {
      w = Math.max(MIN_W, stage.refW - x)
    }

    // vertical
    if (top) {
      if (y < 0) {
        y = 0
        h = origY + origH
      }
    } else if (y + h > stage.refH) {
      h = Math.max(MIN_H, stage.refH - y)
    }

    b.x = x
    b.y = y
    b.w = w
    b.h = h
  }

  setIconSize(id: string, size: number) {
    const b = this.byId(id)
    if (b) b.iconSize = Math.max(40, Math.min(160, Math.round(size)))
  }

  setTheme(id: string, patch: Partial<BoxTheme>) {
    const b = this.byId(id)
    if (b) b.theme = { ...b.theme, ...patch }
  }

  resetTheme(id: string) {
    const b = this.byId(id)
    if (b) b.theme = makeTheme()
  }

  private clamp(b: Box) {
    const maxX = Math.max(0, stage.refW - b.w)
    const maxY = Math.max(0, stage.refH - b.h)
    b.x = Math.min(Math.max(0, b.x), maxX)
    b.y = Math.min(Math.max(0, b.y), maxY)
  }

  /** snapped move shared by the drag handlers */
  applyMove(id: string, x: number, y: number) {
    const b = this.byId(id)
    if (!b) return
    const candidates = this.topLevel
      .filter((o) => o.id !== id)
      .map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }))
    const res = snapMove({ x, y, w: b.w, h: b.h }, candidates, { w: stage.refW, h: stage.refH }, 8)
    guides.set(res.guides.v, res.guides.h)
    this.move(id, res.x, res.y)
  }

  setTitle(id: string, title: string) {
    const b = this.byId(id)
    if (b) b.title = title || b.title
  }

  setLayout(id: string, layout: BoxLayout) {
    const b = this.byId(id)
    if (b) b.layout = layout
  }

  toggleLayout(id: string) {
    const b = this.byId(id)
    if (b) b.layout = b.layout === 'icons' ? 'list' : 'icons'
  }

  toggleCollapsed(id: string) {
    const b = this.byId(id)
    if (b) b.collapsed = !b.collapsed
  }

  toggleLocked(id: string) {
    const b = this.byId(id)
    if (b) b.locked = !b.locked
  }

  /** the box whose content receives drops for `id` (container → active tab) */
  ownerFor(id: string): Box | undefined {
    const b = this.byId(id)
    return b ? this.activeOf(b) : undefined
  }

  /** add an icon to a box's visible content (no-op if already present) */
  addMember(id: string, serviceId: string) {
    const owner = this.ownerFor(id)
    if (!owner || owner.kind === 'mapped' || owner.kind === 'recent') return
    if (!owner.serviceIds.includes(serviceId)) owner.serviceIds.push(serviceId)
    this.bringToFront(id)
  }

  /** insert an icon into a specific owner box at `index` (no-op if already there) */
  insertMember(ownerId: string, serviceId: string, index: number) {
    const b = this.byId(ownerId)
    if (!b || b.kind === 'mapped' || b.kind === 'recent') return
    const next = b.serviceIds.filter((x) => x !== serviceId)
    const i = Math.max(0, Math.min(index, next.length))
    next.splice(i, 0, serviceId)
    b.serviceIds = next
  }

  /** remove an icon from a specific owner box */
  removeMember(ownerId: string, serviceId: string) {
    const b = this.byId(ownerId)
    if (!b || b.kind === 'mapped' || b.kind === 'recent') return
    const i = b.serviceIds.indexOf(serviceId)
    if (i >= 0) b.serviceIds.splice(i, 1)
  }

  /** replace a box's member list/order exactly (used by drag-reorder + cross-box moves) */
  setMembers(ownerId: string, ids: string[]) {
    const b = this.byId(ownerId)
    if (!b || b.kind === 'recent') return
    const seen = new Set<string>()
    const next: string[] = []
    for (const id of ids) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      next.push(id)
    }
    b.serviceIds = next
  }

  toggleMember(id: string, serviceId: string) {
    const b = this.byId(id)
    if (!b) return
    const i = b.serviceIds.indexOf(serviceId)
    if (i >= 0) b.serviceIds.splice(i, 1)
    else b.serviceIds.push(serviceId)
  }

  setActiveTab(id: string, tabId: string) {
    const b = this.byId(id)
    if (b && b.tabs.includes(tabId)) b.activeTabId = tabId
  }

  /** set a container's tab order (ids must belong to the container) */
  setTabOrder(id: string, ids: string[]) {
    const b = this.byId(id)
    if (!b) return
    const valid = ids.filter((tid) => b.tabs.includes(tid))
    const missing = b.tabs.filter((tid) => !valid.includes(tid))
    b.tabs = [...valid, ...missing]
  }

  /** reorder a tab within its container; `index` is the insertion position among the other tabs */
  moveTab(parentId: string, tabId: string, index: number) {
    const p = this.byId(parentId)
    if (!p || !p.tabs.includes(tabId)) return
    const next = p.tabs.filter((t) => t !== tabId)
    const i = Math.max(0, Math.min(index, next.length))
    next.splice(i, 0, tabId)
    p.tabs = next
  }

  /** does dropping `srcId` onto `dstId` produce a merge? */
  canMerge(srcId: string, dstId: string): boolean {
    if (srcId === dstId) return false
    const src = this.byId(srcId)
    const dst = this.byId(dstId)
    if (!src || !dst) return false
    if (src.locked || dst.locked) return false
    if (src.parentId || dst.parentId) return false
    return true
  }

  /** merge `srcId` into `dstId`; both ends become tabs of the resulting container */
  merge(srcId: string, dstId: string) {
    if (!this.canMerge(srcId, dstId)) return
    const src = this.byId(srcId)
    const dst = this.byId(dstId)
    if (!src || !dst) return

    // dst stays the container; its own content becomes a child box first
    const leaves: Box[] = []
    if (dst.tabs.length === 0) {
      const child = makeBox({
        title: dst.title,
        serviceIds: [...dst.serviceIds],
        layout: dst.layout,
        collapsed: dst.collapsed,
        locked: dst.locked,
        x: dst.x,
        y: dst.y,
        w: dst.w,
        h: dst.h,
        z: dst.z,
      })
      child.parentId = dst.id
      dst.serviceIds = []
      dst.title = dst.title || '盒子'
      dst.locked = false
      this.list.push(child)
      leaves.push(child)
    } else {
      leaves.push(...this.childrenOf(dst.id))
    }
    const srcFirstLeaf = leaves.length

    const srcLeaves: Box[] = []
    const pushLeaves = (b: Box, out: Box[]) => {
      if (b.tabs.length === 0) {
        out.push(b)
        return
      }
      for (const cid of [...b.tabs]) {
        const c = this.byId(cid)
        if (c) pushLeaves(c, out)
      }
    }
    pushLeaves(src, srcLeaves)
    leaves.push(...srcLeaves)

    for (const leaf of leaves) {
      leaf.parentId = dst.id
      leaf.z = dst.z
      leaf.tabs = []
      leaf.activeTabId = undefined
    }
    dst.tabs = leaves.map((l) => l.id)
    dst.x = Math.min(dst.x, src.x)
    dst.y = Math.min(dst.y, src.y)
    dst.activeTabId = leaves[srcFirstLeaf]?.id ?? leaves[0]?.id
    // a dragged container's shell is dropped; a plain box survives as a tab
    if (src.tabs.length > 0) this.list = this.list.filter((b) => b.id !== src.id)
    this.bringToFront(dst.id)
  }

  /** pull a tab back out onto the desktop (optionally at an explicit position) */
  detach(id: string, x?: number, y?: number) {
    const b = this.byId(id)
    if (!b || !b.parentId) return
    const parent = this.byId(b.parentId)
    this.topZ += 1
    b.parentId = undefined
    b.activeTabId = undefined
    b.tabs = []
    b.z = this.topZ
    if (parent) {
      parent.tabs = parent.tabs.filter((t) => t !== id)
      if (parent.activeTabId === id) parent.activeTabId = parent.tabs[0]

      if (parent.tabs.length === 1) {
        // only one tab left: the container folds back into that box
        const remaining = this.byId(parent.tabs[0])
        if (remaining) {
          remaining.parentId = undefined
          remaining.activeTabId = undefined
          remaining.tabs = []
          remaining.z = parent.z
          remaining.x = parent.x
          remaining.y = parent.y
          remaining.w = parent.w
          remaining.h = parent.h
        }
        this.list = this.list.filter((bb) => bb.id !== parent.id)
      }
    }
    if (typeof x === 'number' && typeof y === 'number') {
      b.x = x
      b.y = y
    } else {
      const px = parent?.x ?? b.x
      const py = parent?.y ?? b.y
      const ph = parent?.h ?? 0
      b.x = Math.min(px + 24, Math.max(0, stage.refW - b.w))
      b.y = Math.min(py + ph + 12, Math.max(0, stage.refH - b.h))
    }
    this.clamp(b)
  }

  setMergeTarget(id: string | null) {
    this.mergeTargetId = id
  }

  /** resolve which top-level box is under a virtual point (excludes `excludeId`) */
  hitTopLevel(vx: number, vy: number, excludeId: string): string | null {
    for (let i = this.topLevel.length - 1; i >= 0; i -= 1) {
      const b = this.topLevel[i]
      if (b.id === excludeId) continue
      if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) return b.id
    }
    return null
  }

  replaceAll(boxes: Box[]) {
    this.list = boxes
    const maxZ = boxes.reduce((m, b) => Math.max(m, b.z), 0)
    this.topZ = Math.max(this.topZ, maxZ)
  }
}

export const boxes = new BoxesState()
