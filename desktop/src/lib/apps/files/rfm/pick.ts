import { wm } from '../../../state/windows.svelte'

let seq = 0
const resolvers = new Map<number, (path: string | null) => void>()
const accepts = new Map<number, (name: string) => boolean>()

/** open the file manager in picker mode and resolve with the chosen file path (or null) */
export function requestPick(
  accept: (name: string) => boolean,
  title = '选择文件'
): Promise<string | null> {
  const id = ++seq
  return new Promise((resolve) => {
    resolvers.set(id, resolve)
    accepts.set(id, accept)
    wm.open({
      title,
      icon: '📁',
      appId: 'files',
      w: 900,
      h: 600,
      data: { pickId: id },
    })
  })
}

export function isPendingPick(id: unknown): id is number {
  return typeof id === 'number' && resolvers.has(id)
}

export function pickAccept(id: number): ((name: string) => boolean) | undefined {
  return accepts.get(id)
}

export function resolvePick(id: number, path: string | null): void {
  const r = resolvers.get(id)
  if (!r) return
  resolvers.delete(id)
  accepts.delete(id)
  r(path)
}
