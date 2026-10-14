import { createClient, type WebDAVClient } from 'webdav'
import { authHeaders, serviceHeaders } from '../persist/api'
import type { FsEntry, StorageInfo, WriteResult } from '@desktop/shared'

export type { FsEntry, StorageInfo, WriteResult }

export interface ReadTextResult {
  text: string
  etag?: string
}

export class FsConflict extends Error {
  etag?: string
  constructor(etag?: string) {
    super('file was modified')
    this.name = 'FsConflict'
    this.etag = etag
  }
}

export interface FsDriver {
  readonly kind: string
  list(path: string): Promise<FsEntry[]>
  stat(path: string): Promise<FsEntry | null>
  readText(path: string): Promise<ReadTextResult | null>
  readBlob(path: string): Promise<{ blob: Blob; etag?: string } | null>
  writeText(path: string, text: string, ifMatch?: string): Promise<WriteResult>
  writeBlob(path: string, blob: Blob, ifMatch?: string): Promise<WriteResult>
  mkdir(path: string): Promise<void>
  move(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
}

function withSlash(p: string): string {
  return p.startsWith('/') ? p : '/' + p
}

/* -------------------- proxy driver (/api/fs) -------------------- */

export class ProxyDriver implements FsDriver {
  readonly kind = 'proxy'

  private async req(path: string, init?: RequestInit): Promise<Response> {
    return fetch(path, {
      ...init,
      headers: { ...authHeaders({ 'Content-Type': 'application/json' }), ...(init?.headers ?? {}) },
    })
  }

  async list(path: string): Promise<FsEntry[]> {
    const res = await this.req(`/api/fs/list?path=${encodeURIComponent(withSlash(path))}`)
    if (!res.ok) throw new Error('list failed')
    return (await res.json()).entries
  }

  async stat(path: string): Promise<FsEntry | null> {
    const res = await this.req(`/api/fs/stat?path=${encodeURIComponent(withSlash(path))}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error('stat failed')
    return res.json()
  }

  async readText(path: string): Promise<ReadTextResult | null> {
    const res = await this.req(`/api/fs/read?path=${encodeURIComponent(withSlash(path))}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error('read failed')
    return { text: await res.text(), etag: res.headers.get('ETag') ?? undefined }
  }

  async readBlob(path: string): Promise<{ blob: Blob; etag?: string } | null> {
    const res = await this.req(`/api/fs/read?path=${encodeURIComponent(withSlash(path))}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error('read failed')
    return { blob: await res.blob(), etag: res.headers.get('ETag') ?? undefined }
  }

  async writeText(path: string, text: string, ifMatch?: string): Promise<WriteResult> {
    const headers: Record<string, string> = {}
    if (ifMatch) headers['If-Match'] = ifMatch
    const res = await this.req(`/api/fs/write?path=${encodeURIComponent(withSlash(path))}`, {
      method: 'PUT',
      headers,
      body: text,
    })
    if (res.status === 412) throw new FsConflict(res.headers.get('ETag') ?? undefined)
    if (!res.ok) throw new Error('write failed')
    return { etag: res.headers.get('ETag') ?? '' }
  }

  async writeBlob(path: string, blob: Blob, ifMatch?: string): Promise<WriteResult> {
    const headers: Record<string, string> = {}
    if (ifMatch) headers['If-Match'] = ifMatch
    const res = await this.req(`/api/fs/write?path=${encodeURIComponent(withSlash(path))}`, {
      method: 'PUT',
      headers,
      body: blob,
    })
    if (res.status === 412) throw new FsConflict(res.headers.get('ETag') ?? undefined)
    if (!res.ok) throw new Error('write failed')
    return { etag: res.headers.get('ETag') ?? '' }
  }

  async mkdir(path: string): Promise<void> {
    await this.req('/api/fs/mkdir', { method: 'POST', body: JSON.stringify({ path: withSlash(path) }) })
  }

  async move(from: string, to: string): Promise<void> {
    await this.req('/api/fs/move', {
      method: 'PUT',
      body: JSON.stringify({ from: withSlash(from), to: withSlash(to) }),
    })
  }

  async remove(path: string): Promise<void> {
    await this.req(`/api/fs?path=${encodeURIComponent(withSlash(path))}&recursive=1`, { method: 'DELETE' })
  }
}

/* -------------------- WebDAV driver -------------------- */

export class WebDAVDriver implements FsDriver {
  readonly kind = 'webdav'
  private client: WebDAVClient

  constructor(url: string) {
    this.client = createClient(url, { headers: serviceHeaders() })
  }

  async list(path: string): Promise<FsEntry[]> {
    const items = (await this.client.getDirectoryContents(withSlash(path))) as any[]
    return items
      .filter((it) => it.filename !== withSlash(path))
      .map((it) => ({
        path: it.filename,
        name: it.basename,
        type: it.type === 'directory' ? 'dir' : 'file',
        size: it.size ?? 0,
        mtime: it.lastmod ? Date.parse(it.lastmod) : 0,
        mime: it.mime || undefined,
        etag: it.etag ?? undefined,
      }))
  }

  async stat(path: string): Promise<FsEntry | null> {
    try {
      const it: any = await this.client.stat(withSlash(path))
      return {
        path: it.filename,
        name: it.basename,
        type: it.type === 'directory' ? 'dir' : 'file',
        size: it.size ?? 0,
        mtime: it.lastmod ? Date.parse(it.lastmod) : 0,
        mime: it.mime || undefined,
        etag: it.etag ?? undefined,
      }
    } catch {
      return null
    }
  }

  async readText(path: string): Promise<ReadTextResult | null> {
    try {
      const res: any = await this.client.getFileContents(withSlash(path), {
        format: 'text',
        details: true,
      })
      return { text: String(res.data), etag: res.headers?.etag }
    } catch {
      return null
    }
  }

  async readBlob(path: string): Promise<{ blob: Blob; etag?: string } | null> {
    try {
      const res: any = await this.client.getFileContents(withSlash(path), { details: true })
      return { blob: new Blob([res.data]), etag: res.headers?.etag }
    } catch {
      return null
    }
  }

  async writeText(path: string, text: string, ifMatch?: string): Promise<WriteResult> {
    const headers: Record<string, string> = {}
    if (ifMatch) headers['If-Match'] = ifMatch
    try {
      await this.client.putFileContents(withSlash(path), text, { headers, overwrite: true })
    } catch (e) {
      throw asConflict(e)
    }
    const st = await this.stat(path)
    return { etag: st?.etag ?? '' }
  }

  async writeBlob(path: string, blob: Blob, ifMatch?: string): Promise<WriteResult> {
    const buf = await blob.arrayBuffer()
    const headers: Record<string, string> = {}
    if (ifMatch) headers['If-Match'] = ifMatch
    try {
      await this.client.putFileContents(withSlash(path), buf as any, { headers, overwrite: true })
    } catch (e) {
      throw asConflict(e)
    }
    const st = await this.stat(path)
    return { etag: st?.etag ?? '' }
  }

  async mkdir(path: string): Promise<void> {
    await this.client.createDirectory(withSlash(path), { recursive: true })
  }

  async move(from: string, to: string): Promise<void> {
    await this.client.moveFile(withSlash(from), withSlash(to))
  }

  async remove(path: string): Promise<void> {
    await this.client.deleteFile(withSlash(path))
  }
}

function asConflict(e: unknown): unknown {
  const status = (e as any)?.response?.status ?? (e as any)?.status
  if (status === 412) return new FsConflict((e as any)?.response?.headers?.etag)
  return e
}

/* -------------------- S3 driver (presigned direct transfer) -------------------- */

const MULTIPART_THRESHOLD = 64 * 1024 * 1024
const PART_SIZE = 16 * 1024 * 1024

export class S3Driver implements FsDriver {
  readonly kind = 's3'
  private proxy = new ProxyDriver()

  private async sign(body: Record<string, unknown>): Promise<any> {
    const res = await fetch('/api/fs/sign', {
      method: 'POST',
      headers: { ...authHeaders({ 'Content-Type': 'application/json' }) },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('sign failed')
    return res.json()
  }

  private async mpu(body: Record<string, unknown>): Promise<any> {
    const res = await fetch('/api/fs/mpu', {
      method: 'POST',
      headers: { ...authHeaders({ 'Content-Type': 'application/json' }) },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('multipart failed')
    return res.json()
  }

  list(path: string) {
    return this.proxy.list(path)
  }
  stat(path: string) {
    return this.proxy.stat(path)
  }
  readText(path: string) {
    return this.proxy.readText(path)
  }
  writeText(path: string, text: string, ifMatch?: string) {
    return this.proxy.writeText(path, text, ifMatch)
  }
  mkdir(path: string) {
    return this.proxy.mkdir(path)
  }
  move(from: string, to: string) {
    return this.proxy.move(from, to)
  }
  remove(path: string) {
    return this.proxy.remove(path)
  }

  async readBlob(path: string): Promise<{ blob: Blob; etag?: string } | null> {
    const existing = await this.stat(path)
    if (!existing) return null
    const { url } = await this.sign({ op: 'get', path })
    const res = await fetch(url)
    if (!res.ok) return null
    return { blob: await res.blob(), etag: res.headers.get('ETag') ?? existing.etag }
  }

  async writeBlob(path: string, blob: Blob, _ifMatch?: string): Promise<WriteResult> {
    if (blob.size > MULTIPART_THRESHOLD) return this.writeMultipart(path, blob)
    const { url, headers } = await this.sign({
      op: 'put',
      path,
      contentType: blob.type || 'application/octet-stream',
    })
    const res = await fetch(url, { method: 'PUT', headers: headers ?? {}, body: blob })
    if (!res.ok) throw new Error('upload failed')
    return { etag: res.headers.get('ETag') ?? '' }
  }

  private async writeMultipart(path: string, blob: Blob): Promise<WriteResult> {
    const { uploadId } = await this.mpu({ action: 'create', path })
    const parts: { partNumber: number; etag: string }[] = []
    const count = Math.ceil(blob.size / PART_SIZE)
    for (let i = 0; i < count; i++) {
      const partNumber = i + 1
      const chunk = blob.slice(i * PART_SIZE, Math.min(blob.size, (i + 1) * PART_SIZE))
      const { url } = await this.mpu({ action: 'part', path, uploadId, partNumber })
      const res = await fetch(url, { method: 'PUT', body: chunk })
      if (!res.ok) throw new Error('part upload failed')
      const etag = res.headers.get('ETag')
      if (!etag) throw new Error('missing part ETag (check bucket CORS exposes ETag)')
      parts.push({ partNumber, etag })
    }
    await this.mpu({ action: 'complete', path, uploadId, parts })
    return { etag: '' }
  }
}

/* -------------------- facade -------------------- */

class FsFacade {
  info: StorageInfo | null = null
  /** stable public base URL for code packages, if the deployment exposes one */
  assetBase: string | null = null
  /** resolves once `init()` has completed (even if it failed) */
  readonly ready: Promise<void>
  private markReady!: () => void
  private driver: FsDriver | null = null

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve
    })
  }

  async init(): Promise<StorageInfo> {
    try {
      const res = await fetch('/api/storage/info', { headers: authHeaders() })
      const info = (await res.json()) as StorageInfo
      this.info = info
      this.assetBase = info.assetBase ? info.assetBase.replace(/\/$/, '') : null
      if (info.s3) {
        this.driver = new S3Driver()
      } else if (info.webdav) {
        try {
          this.driver = new WebDAVDriver(info.webdav.url)
        } catch {
          this.driver = new ProxyDriver()
        }
      } else {
        this.driver = new ProxyDriver()
      }
      return info
    } finally {
      this.markReady()
    }
  }

  private get d(): FsDriver {
    if (!this.driver) this.driver = new ProxyDriver()
    return this.driver
  }

  /**
   * Resolve a storage path to a stable, native-loadable public URL
   * (`<assetBase>/<path>`), or null when no public root is configured.
   */
  assetUrl(path: string): string | null {
    if (!this.assetBase) return null
    return this.assetBase + withSlash(path)
  }

  list(path: string) {
    return this.d.list(path)
  }
  stat(path: string) {
    return this.d.stat(path)
  }
  readText(path: string) {
    return this.d.readText(path)
  }
  readBlob(path: string) {
    return this.d.readBlob(path)
  }
  writeText(path: string, text: string, ifMatch?: string) {
    return this.d.writeText(path, text, ifMatch)
  }
  writeBlob(path: string, blob: Blob, ifMatch?: string) {
    return this.d.writeBlob(path, blob, ifMatch)
  }
  mkdir(path: string) {
    return this.d.mkdir(path)
  }
  move(from: string, to: string) {
    return this.d.move(from, to)
  }
  remove(path: string) {
    return this.d.remove(path)
  }
}

export const fs = new FsFacade()
