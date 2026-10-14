export interface FsEntry {
  /** path relative to the storage root, always starting with '/' */
  path: string
  name: string
  type: 'file' | 'dir'
  size: number
  mtime: number
  mime?: string
  etag?: string
}

export interface ReadResult {
  data: Uint8Array
  size: number
  mime: string
  etag?: string
}

export interface WriteResult {
  etag: string
}

export interface StorageCapabilities {
  provider: 'local' | 's3'
  /** can the client transfer bytes directly (WebDAV or presigned)? */
  direct: boolean
  webdav?: { url: string }
  s3?: { endpoint?: string; region?: string; bucket?: string; prefix?: string }
  multipart: boolean
  maxUploadBytes?: number
  presignTtlSec?: number
  locking: boolean
}

/** shape of GET /api/storage/info (capabilities + program-managed extras) */
export interface StorageInfo {
  provider: 'local' | 'object'
  direct: boolean
  webdav?: { url: string }
  s3?: { endpoint?: string; region?: string; bucket?: string; prefix?: string }
  multipart: boolean
  maxUploadBytes?: number
  presignTtlSec?: number
  locking: boolean
  hidden?: string[]
  readonly?: string[]
  /** stable public base for code packages (widgets/plugins) or null when disabled */
  assetBase?: string | null
  public?: { enabled: boolean; mode: 'prefix' | 'bucket'; root?: string; baseUrl?: string }
}
