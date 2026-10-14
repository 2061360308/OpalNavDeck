import type { CursorRole } from '../types'
import { settings } from './settings.svelte'
import { putMedia } from './personalizeMedia'

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** minimal ZIP reader (store + deflate), good enough for cursor/icon theme packs */
export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  let eocd = -1
  const min = Math.max(0, u8.length - 22 - 65535)
  for (let i = u8.length - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip 文件')
  const count = dv.getUint16(eocd + 10, true)
  let off = dv.getUint32(eocd + 16, true)
  const out: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break
    const method = dv.getUint16(off + 10, true)
    const compSize = dv.getUint32(off + 20, true)
    const nameLen = dv.getUint16(off + 28, true)
    const extraLen = dv.getUint16(off + 30, true)
    const commentLen = dv.getUint16(off + 32, true)
    const localOff = dv.getUint32(off + 42, true)
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen))
    off += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    const lNameLen = dv.getUint16(localOff + 26, true)
    const lExtraLen = dv.getUint16(localOff + 28, true)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const comp = u8.subarray(dataStart, dataStart + compSize)
    let data: Uint8Array
    if (method === 0) data = comp
    else if (method === 8) data = await inflateRaw(comp)
    else throw new Error('不支持的压缩方式：' + method)
    out.push({ name, data })
  }
  return out
}

async function inflateRaw(comp: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = blobOf(comp).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function blobOf(u8: Uint8Array): Blob {
  return new Blob([u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer])
}

const ROLE_KEYS: [RegExp, CursorRole][] = [
  [/diagonal.*2|dgn2|nesw|对角线 ?2|对角 ?2/, 'neswResize'],
  [/diagonal.*1|dgn1|nwse|对角线 ?1|对角 ?1/, 'nwseResize'],
  [/normal|arrow|default|正常/, 'default'],
  [/help|帮助/, 'help'],
  [/working|appstarting|background|后台/, 'progress'],
  [/busy|wait|忙/, 'wait'],
  [/precision|cross|精确/, 'crosshair'],
  [/unavailable|not|^no\b|不可用/, 'notAllowed'],
  [/vertical|vert|sizeNS|ns-?resize|垂直/, 'nsResize'],
  [/horizontal|horz|sizeWE|ew-?resize|水平/, 'ewResize'],
  [/move|sizeall|移动/, 'move'],
  [/link|hand|pointer|链接/, 'pointer'],
  [/text|ibeam|beam|text|文本/, 'text'],
]

export function guessRole(filename: string): CursorRole | null {
  const n = filename.toLowerCase()
  for (const [re, role] of ROLE_KEYS) if (re.test(n)) return role
  return null
}

export interface PackResult {
  theme: string
  applied: number
  roles: CursorRole[]
}

/** import a packed cursor theme (.zip) and map its files onto cursor roles */
export async function importCursorPack(file: File): Promise<PackResult> {
  const entries = await readZip(await file.arrayBuffer())
  const theme = file.name.replace(/\.[^.]+$/, '')
  const found: Partial<Record<CursorRole, string>> = {}
  const order: CursorRole[] = []
  for (const e of entries) {
    const base = e.name.split('/').pop() || e.name
    if (!/\.(cur|png|svg|ico|ani)$/i.test(base)) continue
    const role = guessRole(base)
    if (!role || found[role]) continue
    const ext = base.slice(base.lastIndexOf('.')).toLowerCase()
    const url = await putMedia('cursors', blobOf(e.data), `${theme}-${role}${ext}`)
    found[role] = url
    order.push(role)
  }
  if (!order.length) throw new Error('主题包中没有可识别的鼠标文件')
  settings.cursor.roles = { ...settings.cursor.roles, ...found }
  settings.cursor.enabled = true
  return { theme, applied: order.length, roles: order }
}
