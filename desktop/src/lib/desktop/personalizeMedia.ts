import { fs } from '../api/fs'
import { sanitizeIconName } from '../state/services.svelte'
import { PATHS, mediaUrl, parseMediaUrl } from '@desktop/shared'

export type MediaKind = 'wallpapers' | 'cursors' | 'themes'

const DIR: Record<MediaKind, string> = {
  wallpapers: PATHS.wallpapers,
  cursors: PATHS.cursors,
  themes: PATHS.themes,
}

function uniqueName(orig: string): string {
  const dot = orig.lastIndexOf('.')
  const base = sanitizeIconName(dot > 0 ? orig.slice(0, dot) : orig) || 'file'
  const ext = dot > 0 ? orig.slice(dot).replace(/[^.a-zA-Z0-9]/g, '') : ''
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${base}${ext}`
}

/** store an uploaded media blob under /Personalize/<kind> and return its public url */
export async function putMedia(kind: MediaKind, file: Blob, name?: string): Promise<string> {
  const orig = name ?? (file as File).name ?? 'file'
  const fname = uniqueName(orig)
  await fs.writeBlob(`${DIR[kind]}/${fname}`, file)
  return mediaUrl(kind, fname)
}

export async function removeMedia(url: string): Promise<void> {
  const m = parseMediaUrl(url)
  if (!m) return
  try {
    await fs.remove(`${DIR[m.kind as MediaKind]}/${m.file}`)
  } catch {
    /* ignore */
  }
}
