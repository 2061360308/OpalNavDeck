import { AwsClient } from 'aws4fetch'
import { mimeFor, normalizePath } from './provider.ts'
import {
  PreconditionFailed,
  type FsEntry,
  type ReadResult,
  type SignRequest,
  type SignResult,
  type StorageCapabilities,
  type StorageProvider,
  type WriteResult,
} from './provider.ts'

/** Minimal structural typings for the R2 binding (avoids CF types dependency) */
interface R2ObjectLike {
  key: string
  size: number
  etag: string
  uploaded?: Date
  httpMetadata?: { contentType?: string }
  arrayBuffer(): Promise<ArrayBuffer>
}
interface R2ListLike {
  objects: R2ObjectLike[]
  delimitedPrefixes: string[]
  truncated: boolean
  cursor?: string
}
interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>
  get(key: string): Promise<R2ObjectLike | null>
  put(key: string, value: Uint8Array | ArrayBuffer, options?: any): Promise<R2ObjectLike | null>
  delete(keys: string | string[]): Promise<void>
  list(options?: any): Promise<R2ListLike>
}

export interface R2Options {
  bucketName?: string
  prefix?: string
  region?: string
  /** S3 API endpoint; defaults to https://<accountId>.r2.cloudflarestorage.com */
  endpoint?: string
  accountId?: string
  accessKeyId?: string
  secretAccessKey?: string
  presignTtlSec?: number
}

/**
 * Cloudflare R2 storage provider (object mode on Workers).
 * Reads/writes go through the R2 binding; presigned URLs (for the frontend's
 * direct blob transfer) are produced against R2's S3-compatible endpoint.
 */
export class R2Provider implements StorageProvider {
  readonly id = 's3' as const
  private bucket: R2BucketLike
  private prefix: string
  private bucketName: string
  private endpoint: string
  private region: string
  private ttl: number
  private signer?: AwsClient

  constructor(bucket: R2BucketLike, opts: R2Options = {}) {
    this.bucket = bucket
    this.prefix = (opts.prefix || '').replace(/^\/+|\/+$/g, '')
    this.bucketName = opts.bucketName || ''
    this.region = opts.region || 'auto'
    this.endpoint =
      opts.endpoint || (opts.accountId ? `https://${opts.accountId}.r2.cloudflarestorage.com` : '')
    this.ttl = opts.presignTtlSec ?? 3600
    if (opts.accessKeyId && opts.secretAccessKey) {
      this.signer = new AwsClient({
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        service: 's3',
        region: this.region,
      })
    }
  }

  private key(p: string): string {
    const norm = normalizePath(p)
    const rel = norm === '/' ? '' : norm.slice(1)
    return this.prefix ? `${this.prefix}/${rel}` : rel
  }

  private keyPrefix(dir: string): string {
    const k = this.key(dir)
    if (!k) return ''
    return k.endsWith('/') ? k : k + '/'
  }

  private rel(key: string): string {
    const k = this.prefix ? key.slice(this.prefix.length + 1) : key
    return '/' + k
  }

  capabilities(_baseUrl: string): StorageCapabilities {
    return {
      provider: 's3',
      direct: true,
      s3: {
        endpoint: this.endpoint || undefined,
        region: this.region,
        bucket: this.bucketName || undefined,
        prefix: this.prefix,
      },
      multipart: false,
      presignTtlSec: this.ttl,
      locking: true,
    }
  }

  async sign(req: SignRequest): Promise<SignResult> {
    if (!this.signer || !this.endpoint || !this.bucketName) {
      throw new Error('presign not configured (needs R2 account id + keys + bucket)')
    }
    const expiresIn = req.expiresIn ?? this.ttl
    const method =
      req.op === 'put' ? 'PUT' : req.op === 'delete' ? 'DELETE' : req.op === 'head' ? 'HEAD' : 'GET'
    const url = new URL(`${this.endpoint}/${this.bucketName}/${this.key(req.path)}`)
    url.searchParams.set('X-Amz-Expires', String(expiresIn))
    const signed = await this.signer.sign(new Request(url.toString(), { method }), {
      aws: { signQuery: true },
    })
    return { url: signed.url, method, expiresIn }
  }

  async list(dir: string): Promise<FsEntry[]> {
    const norm = normalizePath(dir)
    const prefix = this.keyPrefix(norm)
    const out: FsEntry[] = []
    let cursor: string | undefined
    do {
      const res = await this.bucket.list({ prefix, delimiter: '/', cursor })
      for (const cp of res.delimitedPrefixes ?? []) {
        const rel = cp.slice(this.prefix ? this.prefix.length + 1 : 0).replace(/\/$/, '')
        out.push({ path: '/' + rel, name: rel.slice(rel.lastIndexOf('/') + 1), type: 'dir', size: 0, mtime: 0 })
      }
      for (const o of res.objects ?? []) {
        if (o.key === prefix || o.key.endsWith('/')) continue
        const path = this.rel(o.key)
        out.push({
          path,
          name: path.slice(path.lastIndexOf('/') + 1),
          type: 'file',
          size: o.size ?? 0,
          mtime: o.uploaded ? o.uploaded.getTime() : 0,
          mime: o.httpMetadata?.contentType ?? mimeFor(path),
          etag: o.etag,
        })
      }
      cursor = res.truncated ? res.cursor : undefined
    } while (cursor)
    return out
  }

  async stat(p: string): Promise<FsEntry | null> {
    const norm = normalizePath(p)
    if (norm === '/') return { path: '/', name: '', type: 'dir', size: 0, mtime: 0 }
    const obj = await this.bucket.head(this.key(norm))
    if (obj) {
      return {
        path: norm,
        name: norm.slice(norm.lastIndexOf('/') + 1),
        type: 'file',
        size: obj.size ?? 0,
        mtime: obj.uploaded ? obj.uploaded.getTime() : 0,
        mime: obj.httpMetadata?.contentType ?? mimeFor(norm),
        etag: obj.etag,
      }
    }
    const res = await this.bucket.list({ prefix: this.keyPrefix(norm), limit: 1 })
    if ((res.objects?.length ?? 0) > 0 || (res.delimitedPrefixes?.length ?? 0) > 0) {
      return { path: norm, name: norm.slice(norm.lastIndexOf('/') + 1), type: 'dir', size: 0, mtime: 0 }
    }
    return null
  }

  async read(p: string): Promise<ReadResult> {
    const norm = normalizePath(p)
    const obj = await this.bucket.get(this.key(norm))
    if (!obj) throw new Error('not found')
    const buf = new Uint8Array(await obj.arrayBuffer())
    return { data: buf, size: buf.length, mime: obj.httpMetadata?.contentType ?? mimeFor(norm), etag: obj.etag }
  }

  async write(p: string, data: Uint8Array, ifMatch?: string): Promise<WriteResult> {
    const norm = normalizePath(p)
    const onlyIf = ifMatch && ifMatch !== '' ? { etagMatches: ifMatch } : undefined
    const res = await this.bucket.put(this.key(norm), data, {
      httpMetadata: { contentType: mimeFor(norm) },
      onlyIf,
    })
    if (!res) throw new PreconditionFailed()
    return { etag: res.etag ?? '' }
  }

  async mkdir(_p: string): Promise<void> {
    /* object storage has no real directories */
  }

  async move(from: string, to: string): Promise<void> {
    const norm = normalizePath(from)
    const st = await this.stat(norm)
    if (!st) throw new Error('source not found')
    if (st.type === 'dir') {
      for (const it of await this.list(norm)) {
        const dst = normalizePath(to + it.path.slice(norm === '/' ? 0 : norm.length))
        if (it.type === 'dir') await this.mkdir(dst)
        else await this.write(dst, (await this.read(it.path)).data)
        if (it.type !== 'dir') await this.remove(it.path, false)
      }
    } else {
      await this.write(to, (await this.read(norm)).data)
      await this.remove(norm, false)
    }
  }

  async remove(p: string, recursive: boolean): Promise<void> {
    const norm = normalizePath(p)
    if (norm === '/') throw new Error('refuse to remove root')
    const st = await this.stat(norm)
    if (!st) return
    if (st.type === 'file') {
      await this.bucket.delete(this.key(norm))
      return
    }
    if (!recursive) {
      if ((await this.list(norm)).length > 0) throw new Error('directory not empty')
      return
    }
    let cursor: string | undefined
    do {
      const res = await this.bucket.list({ prefix: this.keyPrefix(norm), cursor })
      const keys = (res.objects ?? []).map((o) => o.key)
      if (keys.length) await this.bucket.delete(keys)
      cursor = res.truncated ? res.cursor : undefined
    } while (cursor)
  }
}
