import type { FsEntry, ReadResult, WriteResult, StorageCapabilities } from '@desktop/shared'

export type { FsEntry, ReadResult, WriteResult, StorageCapabilities }
export {
  PathError,
  normalizePath,
  mimeFor,
  MIME,
  READONLY_PREFIXES,
  HIDDEN_PREFIXES,
  isReadonlyPath,
  isHiddenPath,
} from '@desktop/shared'

export type ProviderId = 'local' | 's3'

export class PreconditionFailed extends Error {
  currentEtag?: string
  constructor(currentEtag?: string) {
    super('precondition failed')
    this.name = 'PreconditionFailed'
    this.currentEtag = currentEtag
  }
}

export type PublicMode = 'prefix' | 'bucket'

export interface PublicConfig {
  enabled: boolean
  /** `prefix` = a directory inside the main bucket; `bucket` = a separate public-read bucket */
  mode: PublicMode
  /** prefix mode: the storage path made public */
  root?: string
  /** bucket mode: the referenced public-read bucket name */
  bucket?: string
  /** stable public base URL (custom domain / website endpoint) */
  baseUrl?: string
}

export type SignOp = 'get' | 'put' | 'delete' | 'head'

export interface SignRequest {
  op: SignOp
  path: string
  contentType?: string
  contentLength?: number
  expiresIn?: number
}

export interface SignResult {
  url: string
  method: string
  headers?: Record<string, string>
  expiresIn: number
}

export interface MultipartRequest {
  action: 'create' | 'part' | 'complete' | 'abort'
  path: string
  uploadId?: string
  partNumber?: number
  parts?: { partNumber: number; etag: string }[]
}

export interface MultipartResult {
  uploadId?: string
  url?: string
  expiresIn?: number
  etag?: string
  key?: string
}

export interface StorageProvider {
  readonly id: ProviderId
  capabilities(baseUrl: string): StorageCapabilities
  list(dir: string): Promise<FsEntry[]>
  stat(path: string): Promise<FsEntry | null>
  read(path: string): Promise<ReadResult>
  write(path: string, data: Uint8Array, ifMatch?: string): Promise<WriteResult>
  mkdir(path: string): Promise<void>
  move(from: string, to: string): Promise<void>
  remove(path: string, recursive: boolean): Promise<void>
  sign?(req: SignRequest): Promise<SignResult>
  multipart?(req: MultipartRequest): Promise<MultipartResult>
  /** best-effort validation that a public prefix is reachable anonymously */
  checkPublic?(config: PublicConfig): Promise<{ ok: boolean; guidance: string }>
}
