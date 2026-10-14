export type RfmKind = 'folder' | 'file'

export interface RfmNode {
  id: string
  name: string
  kind: RfmKind
  children?: RfmNode[]
  extension?: string
  size?: number
  path?: string
}

export function getExtension(node: RfmNode): string {
  if (node.kind !== 'file') return ''
  const name = node.name
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return ''
  return name.slice(i + 1).toLowerCase()
}
