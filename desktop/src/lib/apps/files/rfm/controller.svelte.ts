import { fs, type FsEntry } from '../../../api/fs'
import { wm } from '../../../state/windows.svelte'
import { isViewable } from '../../viewer/viewerRegistry'
import { DEFAULT_LABELS, type FileManagerLabels } from './labels'
import { getExtension, type RfmNode } from './types'
import { HIDDEN_PREFIXES, READONLY_PREFIXES } from '@desktop/shared'

export function itemFromEntry(e: FsEntry): RfmNode {
  return {
    id: e.path,
    name: e.name,
    kind: e.type === 'dir' ? 'folder' : 'file',
    size: e.size,
    path: e.path,
    extension: getExtension({ id: e.path, name: e.name, kind: 'file' }),
  }
}

export class RfmController {
  path = $state('/')
  entries = $state<FsEntry[]>([])
  tree = $state<RfmNode[]>([])
  selectedId = $state<string | null>(null)
  view = $state<'list' | 'cards'>('list')
  search = $state('')
  theme = $state<'light' | 'dark'>('dark')
  loading = $state(false)
  error = $state('')
  expanded = $state<Set<string>>(new Set())
  pinned = $state<Set<string>>(new Set())
  showSidebar = $state(true)
  showDetails = $state(true)
  sidebarDrawer = $state(false)
  detailsDrawer = $state(false)
  width = $state(0)
  showHidden = $state(false)

  // picker mode (opened via requestPick): selecting a file resolves the promise
  picking = $state(false)
  accept: ((name: string) => boolean) | null = null
  onPick: ((node: RfmNode) => void) | null = null

  labels: FileManagerLabels = DEFAULT_LABELS
  private treeMap = new Map<string, RfmNode>()
  private PIN_KEY = 'rfm-pins'

  constructor() {
    try {
      const raw = localStorage.getItem(this.PIN_KEY)
      if (raw) this.pinned = new Set(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }

  isPinned(id: string): boolean {
    return this.pinned.has(id)
  }

  togglePin(id: string): void {
    const next = new Set(this.pinned)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    this.pinned = next
    try {
      localStorage.setItem(this.PIN_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  }

  canView(node: RfmNode): boolean {
    return node.kind === 'file' && isViewable(node.name)
  }

  download(node: RfmNode): void {
    void (async () => {
      const r = await fs.readBlob(node.id)
      if (!r) return
      const url = URL.createObjectURL(r.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = node.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    })()
  }

  get rootLabel(): string {
    return 'Home'
  }

  get items(): RfmNode[] {
    const q = this.search.trim().toLowerCase()
    return this.entries
      .filter((e) => (this.showHidden ? true : !this.isHidden(e.path)))
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .map(itemFromEntry)
  }

  isHidden(path: string): boolean {
    const prefixes = fs.info?.hidden ?? HIDDEN_PREFIXES
    if (path.split('/').some((s) => s.startsWith('.'))) return true
    return prefixes.some((pre) => path === pre || path.startsWith(pre + '/'))
  }

  isReadonly(path: string): boolean {
    const prefixes = fs.info?.readonly ?? READONLY_PREFIXES
    return prefixes.some((pre) => path === pre || path.startsWith(pre + '/'))
  }

  toggleHidden(): void {
    this.showHidden = !this.showHidden
    void this.rebuildTree()
  }

  private async rebuildTree(): Promise<void> {
    this.tree = await this.buildTree('/')
  }

  get breadcrumbs(): { id: string; name: string }[] {
    if (this.path === '/') return []
    const segs = this.path.split('/').filter(Boolean)
    return segs.map((name, i) => ({ id: '/' + segs.slice(0, i + 1).join('/'), name }))
  }

  get selectedNode(): RfmNode | null {
    if (!this.selectedId) return null
    const e = this.entries.find((x) => x.path === this.selectedId)
    if (e) return itemFromEntry(e)
    return this.treeMap.get(this.selectedId) ?? null
  }

  async init(root = '/'): Promise<void> {
    this.tree = await this.buildTree(root)
    await this.open(root)
  }

  async open(path: string): Promise<void> {
    this.path = path
    this.selectedId = null
    this.sidebarDrawer = false
    this.loading = true
    this.error = ''
    try {
      this.entries = await fs.list(path)
    } catch (e) {
      this.error = String(e)
      this.entries = []
    } finally {
      this.loading = false
    }
  }

  refresh(): void {
    void this.open(this.path)
  }

  toggleSidebar(): void {
    if (this.showSidebar && this.width >= 720) {
      this.showSidebar = false
      return
    }
    this.sidebarDrawer = !this.sidebarDrawer
  }

  toggleDetails(): void {
    if (this.showDetails && this.width >= 860) {
      this.showDetails = false
      return
    }
    this.detailsDrawer = !this.detailsDrawer
  }

  get sidebarDocked(): boolean {
    return this.showSidebar && this.width >= 720
  }

  get detailsDocked(): boolean {
    return this.showDetails && this.width >= 860
  }

  setWidth(value: number): void {
    this.width = value
  }

  select(node: RfmNode): void {
    this.selectedId = node.id
  }

  activate(node: RfmNode): void {
    if (node.kind === 'folder') {
      void this.open(node.id)
      return
    }
    if (this.picking) {
      if (!this.accept || this.accept(node.name)) this.onPick?.(node)
      return
    }
    if (isViewable(node.name)) {
      wm.open({
        title: node.name,
        icon: '📄',
        appId: 'viewer:' + node.id,
        w: 880,
        h: 620,
        data: { path: node.id, name: node.name },
      })
    }
  }

  toggleExpanded(id: string): void {
    const next = new Set(this.expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    this.expanded = next
  }

  expandAll(): void {
    const out: string[] = []
    const walk = (nodes: RfmNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'folder') {
          out.push(n.id)
          walk(n.children ?? [])
        }
      }
    }
    walk(this.tree)
    this.expanded = new Set(out)
  }

  collapseAll(): void {
    this.expanded = new Set()
  }

  private async buildTree(path: string, depth = 0): Promise<RfmNode[]> {
    if (depth > 6) return []
    let list: FsEntry[]
    try {
      list = await fs.list(path)
    } catch {
      return []
    }
    const out: RfmNode[] = []
    for (const e of list) {
      if (e.type !== 'dir') continue
      if (!this.showHidden && this.isHidden(e.path)) continue
      const node: RfmNode = {
        id: e.path,
        name: e.name,
        kind: 'folder',
        path: e.path,
        children: await this.buildTree(e.path, depth + 1),
      }
      this.treeMap.set(node.id, node)
      out.push(node)
    }
    return out
  }
}
