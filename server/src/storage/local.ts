import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, readdir, rm, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  mimeFor,
  normalizePath,
  PathError,
  PreconditionFailed,
  type FsEntry,
  type ReadResult,
  type StorageCapabilities,
  type StorageProvider,
  type WriteResult,
} from './provider.ts'

/** etag = short content hash; cheap enough for config/small files */
function etagOf(buf: Uint8Array): string {
  return '"' + createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"'
}

export class LocalProvider implements StorageProvider {
  readonly id = 'local' as const
  private root: string

  constructor(root: string) {
    this.root = resolve(root)
    mkdirSync(this.root, { recursive: true })
  }

  private abs(p: string): string {
    const norm = normalizePath(p)
    const full = resolve(this.root, '.' + norm)
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new PathError('path escapes root')
    }
    return full
  }

  capabilities(baseUrl: string): StorageCapabilities {
    return {
      provider: 'local',
      direct: true,
      webdav: { url: baseUrl.replace(/\/$/, '') + '/dav' },
      multipart: true,
      locking: false,
    }
  }

  async list(dir: string): Promise<FsEntry[]> {
    const norm = normalizePath(dir)
    const full = this.abs(norm)
    const names = await readdir(full)
    const out: FsEntry[] = []
    for (const name of names) {
      const childPath = norm === '/' ? `/${name}` : `${norm}/${name}`
      const s = await stat(join(full, name))
      const isDir = s.isDirectory()
      out.push({
        path: childPath,
        name,
        type: isDir ? 'dir' : 'file',
        size: isDir ? 0 : s.size,
        mtime: Math.round(s.mtimeMs),
        mime: isDir ? undefined : mimeFor(name),
      })
    }
    out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
    return out
  }

  async stat(p: string): Promise<FsEntry | null> {
    const norm = normalizePath(p)
    const full = this.abs(norm)
    if (!existsSync(full)) return null
    const s = await stat(full)
    const isDir = s.isDirectory()
    let etag: string | undefined
    if (!isDir) {
      try {
        etag = etagOf(new Uint8Array(await readFile(full)))
      } catch {
        etag = undefined
      }
    }
    return {
      path: norm,
      name: norm === '/' ? '' : norm.slice(norm.lastIndexOf('/') + 1),
      type: isDir ? 'dir' : 'file',
      size: isDir ? 0 : s.size,
      mtime: Math.round(s.mtimeMs),
      mime: isDir ? undefined : mimeFor(norm),
      etag,
    }
  }

  async read(p: string): Promise<ReadResult> {
    const norm = normalizePath(p)
    const full = this.abs(norm)
    const s = await stat(full)
    if (s.isDirectory()) throw new PathError('is a directory')
    const buf = new Uint8Array(await readFile(full))
    return { data: buf, size: buf.length, mime: mimeFor(norm), etag: etagOf(buf) }
  }

  async write(p: string, data: Uint8Array, ifMatch?: string): Promise<WriteResult> {
    const norm = normalizePath(p)
    const full = this.abs(norm)
    if (ifMatch !== undefined && existsSync(full)) {
      const cur = etagOf(new Uint8Array(await readFile(full)))
      if (ifMatch !== '' && ifMatch !== cur) throw new PreconditionFailed(cur)
    } else if (ifMatch && !existsSync(full)) {
      throw new PreconditionFailed()
    }
    mkdirSync(dirname(full), { recursive: true })
    const tmp = full + '.tmp-' + Date.now().toString(36)
    await writeFile(tmp, data)
    await rename(tmp, full)
    return { etag: etagOf(data) }
  }

  async mkdir(p: string): Promise<void> {
    mkdirSync(this.abs(p), { recursive: true })
  }

  async move(from: string, to: string): Promise<void> {
    const a = this.abs(from)
    const b = this.abs(to)
    mkdirSync(dirname(b), { recursive: true })
    await rename(a, b)
  }

  async remove(p: string, recursive: boolean): Promise<void> {
    const norm = normalizePath(p)
    if (norm === '/') throw new PathError('refuse to remove root')
    await rm(this.abs(norm), { recursive, force: true })
  }

  /** absolute path helper for the WebDAV layer */
  toAbs(p: string): string {
    return this.abs(p)
  }

  relativeOf(abs: string): string {
    const rel = relative(this.root, abs).split(sep).join('/')
    return '/' + rel
  }
}
