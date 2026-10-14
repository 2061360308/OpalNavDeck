import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  GetPublicAccessBlockCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  mimeFor,
  normalizePath,
  PathError,
  PreconditionFailed,
  type FsEntry,
  type MultipartRequest,
  type MultipartResult,
  type PublicConfig,
  type ReadResult,
  type SignRequest,
  type SignResult,
  type StorageCapabilities,
  type StorageProvider,
  type WriteResult,
} from './provider.ts'

interface S3Options {
  endpoint?: string
  region: string
  bucket: string
  prefix: string
  accessKeyId?: string
  secretAccessKey?: string
  forcePathStyle?: boolean
}

const TTL = 900

export class S3Provider implements StorageProvider {
  readonly id = 's3' as const
  private client: S3Client
  private bucket: string
  private prefix: string
  private endpoint?: string
  private region: string

  constructor(opts: S3Options) {
    this.bucket = opts.bucket
    this.prefix = (opts.prefix || '').replace(/^\/+|\/+$/g, '')
    this.endpoint = opts.endpoint
    this.region = opts.region || 'us-east-1'
    this.client = new S3Client({
      region: this.region,
      endpoint: opts.endpoint || undefined,
      forcePathStyle: !!opts.forcePathStyle,
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
          : undefined,
    })
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

  capabilities(): StorageCapabilities {
    return {
      provider: 's3',
      direct: true,
      s3: { endpoint: this.endpoint, region: this.region, bucket: this.bucket, prefix: this.prefix },
      multipart: true,
      maxUploadBytes: 5 * 1024 * 1024 * 1024,
      presignTtlSec: TTL,
      locking: false,
    }
  }

  /**
   * Best-effort: verify the bucket allows public access and (in prefix mode)
   * that a policy grants `s3:GetObject` on the prefix. Objects are not checked.
   * Backends that don't implement these APIs (e.g. R2) return guidance.
   */
  async checkPublic(config: PublicConfig): Promise<{ ok: boolean; guidance: string }> {
    const notes: string[] = []
    let publicAllowed: boolean | undefined
    try {
      const pab = await this.client.send(
        new GetPublicAccessBlockCommand({ Bucket: this.bucket })
      )
      const c = pab.PublicAccessBlockConfiguration
      publicAllowed = !(
        c?.BlockPublicAcls ||
        c?.IgnorePublicAcls ||
        c?.BlockPublicPolicy ||
        c?.RestrictPublicBuckets
      )
      if (!publicAllowed) notes.push('Block Public Access is on; disable it for the public prefix.')
    } catch {
      notes.push('Could not read PublicAccessBlock (unsupported or missing permission).')
    }
    if (config.mode === 'prefix') {
      try {
        const policy = await this.client.send(new GetBucketPolicyCommand({ Bucket: this.bucket }))
        const text = policy.Policy ?? ''
        const ok = /GetObject/i.test(text) && /"\*"/.test(text)
        if (!ok) notes.push('No anonymous s3:GetObject statement found in the bucket policy.')
        return { ok: publicAllowed !== false && ok, guidance: notes.join(' ') || 'Looks public.' }
      } catch {
        notes.push('Could not read the bucket policy (R2 does not support it; use publicBucket mode).')
        return { ok: false, guidance: notes.join(' ') }
      }
    }
    return { ok: publicAllowed !== false, guidance: notes.join(' ') || 'Public bucket referenced.' }
  }

  async sign(req: SignRequest): Promise<SignResult> {
    const expiresIn = req.expiresIn ?? TTL
    const key = this.key(req.path)
    let cmd: any
    let method = 'GET'
    if (req.op === 'get') cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    else if (req.op === 'put') {
      cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: req.contentType ?? mimeFor(req.path) })
      method = 'PUT'
    } else if (req.op === 'head') {
      cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      method = 'HEAD'
    } else {
      cmd = new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
      method = 'DELETE'
    }
    const url = await getSignedUrl(this.client, cmd, { expiresIn })
    return { url, method, expiresIn }
  }

  async multipart(req: MultipartRequest): Promise<MultipartResult> {
    const key = this.key(req.path)
    if (req.action === 'create') {
      const res = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key }))
      return { uploadId: res.UploadId, key }
    }
    if (req.action === 'part') {
      if (!req.uploadId || !req.partNumber) throw new PathError('uploadId/partNumber required')
      const cmd = new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: req.uploadId,
        PartNumber: req.partNumber,
      })
      const url = await getSignedUrl(this.client, cmd, { expiresIn: TTL })
      return { url, expiresIn: TTL }
    }
    if (req.action === 'complete') {
      if (!req.uploadId || !req.parts) throw new PathError('uploadId/parts required')
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: req.uploadId,
          MultipartUpload: {
            Parts: req.parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        })
      )
      return {}
    }
    if (!req.uploadId) throw new PathError('uploadId required')
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: req.uploadId })
    )
    return {}
  }

  async list(dir: string): Promise<FsEntry[]> {
    const norm = normalizePath(dir)
    const prefix = this.keyPrefix(norm)
    const out: FsEntry[] = []
    let token: string | undefined
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          Delimiter: '/',
          ContinuationToken: token,
        })
      )
      for (const cp of res.CommonPrefixes ?? []) {
        if (!cp.Prefix) continue
        const rel = cp.Prefix.slice(this.prefix ? this.prefix.length + 1 : 0).replace(/\/$/, '')
        out.push({ path: '/' + rel, name: rel.slice(rel.lastIndexOf('/') + 1), type: 'dir', size: 0, mtime: 0 })
      }
      for (const obj of res.Contents ?? []) {
        if (!obj.Key || obj.Key === prefix) continue
        if (obj.Key.endsWith('/')) continue
        const rel = obj.Key.slice(this.prefix ? this.prefix.length + 1 : 0)
        out.push({
          path: '/' + rel,
          name: rel.slice(rel.lastIndexOf('/') + 1),
          type: 'file',
          size: obj.Size ?? 0,
          mtime: obj.LastModified ? obj.LastModified.getTime() : 0,
          mime: mimeFor(rel),
          etag: obj.ETag,
        })
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
    return out
  }

  async stat(p: string): Promise<FsEntry | null> {
    const norm = normalizePath(p)
    if (norm === '/') return { path: '/', name: '', type: 'dir', size: 0, mtime: 0 }
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(norm) })
      )
      return {
        path: norm,
        name: norm.slice(norm.lastIndexOf('/') + 1),
        type: 'file',
        size: head.ContentLength ?? 0,
        mtime: head.LastModified ? head.LastModified.getTime() : 0,
        mime: head.ContentType ?? mimeFor(norm),
        etag: head.ETag,
      }
    } catch {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.keyPrefix(norm), MaxKeys: 1 })
      )
      if ((res.KeyCount ?? 0) > 0) {
        return { path: norm, name: norm.slice(norm.lastIndexOf('/') + 1), type: 'dir', size: 0, mtime: 0 }
      }
      return null
    }
  }

  async read(p: string): Promise<ReadResult> {
    const norm = normalizePath(p)
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(norm) }))
    const bytes = res.Body ? await res.Body.transformToByteArray() : new Uint8Array()
    return { data: bytes, size: bytes.length, mime: res.ContentType ?? mimeFor(norm), etag: res.ETag }
  }

  async write(p: string, data: Uint8Array, ifMatch?: string): Promise<WriteResult> {
    try {
      const res = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key(p),
          Body: data,
          ContentType: mimeFor(p),
          IfMatch: ifMatch && ifMatch !== '' ? ifMatch : undefined,
        })
      )
      return { etag: res.ETag ?? '' }
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 412 || e?.name === 'PreconditionFailed') {
        throw new PreconditionFailed()
      }
      throw e
    }
  }

  async mkdir(p: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.keyPrefix(p), Body: new Uint8Array() })
    )
  }

  async move(from: string, to: string): Promise<void> {
    const norm = normalizePath(from)
    const st = await this.stat(norm)
    if (!st) throw new PathError('source not found')
    if (st.type === 'dir') {
      const items = await this.list(norm)
      for (const it of items) {
        const dst = normalizePath(to + (it.path.slice(norm === '/' ? 0 : norm.length)))
        if (it.type === 'dir') await this.mkdir(dst)
        else {
          const src = await this.read(it.path)
          await this.write(dst, src.data)
          await this.remove(it.path, false)
        }
      }
    } else {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${this.key(norm)}`,
          Key: this.key(to),
        })
      )
      await this.remove(norm, false)
    }
  }

  async remove(p: string, recursive: boolean): Promise<void> {
    const norm = normalizePath(p)
    if (norm === '/') throw new PathError('refuse to remove root')
    const st = await this.stat(norm)
    if (!st) return
    if (st.type === 'file') {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(norm) }))
      return
    }
    if (!recursive) {
      const items = await this.list(norm)
      if (items.length > 0) throw new PathError('directory not empty')
      return
    }
    let token: string | undefined
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.keyPrefix(norm),
          ContinuationToken: token,
        })
      )
      const objs = (res.Contents ?? []).map((o) => ({ Key: o.Key! }))
      if (objs.length) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objs } }))
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
  }
}
