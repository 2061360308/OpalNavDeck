import { normalizePath } from './provider.ts'
import type {
  FsEntry,
  ReadResult,
  SignRequest,
  SignResult,
  StorageCapabilities,
  StorageProvider,
  WriteResult,
} from './provider.ts'

export interface OverlayRule {
  prefix: string
  provider: StorageProvider
}

/**
 * Routes storage operations to different providers by path prefix. Used for the
 * public/secondary bucket: e.g. `/Rainmeter/Skins` and `/Rainmeter/Plugins`
 * live in the public bucket while everything else stays in the primary one
 * (same layout in both buckets).
 */
export class OverlayProvider implements StorageProvider {
  readonly id: StorageProvider['id']
  private primary: StorageProvider
  private rules: { prefix: string; provider: StorageProvider }[]

  constructor(primary: StorageProvider, rules: OverlayRule[]) {
    this.primary = primary
    this.id = primary.id
    this.rules = rules.map((r) => ({ prefix: normalizePath(r.prefix), provider: r.provider }))
  }

  private pick(p: string): StorageProvider {
    let norm: string
    try {
      norm = normalizePath(p)
    } catch {
      return this.primary
    }
    for (const r of this.rules) {
      if (norm === r.prefix || norm.startsWith(r.prefix + '/')) return r.provider
    }
    return this.primary
  }

  capabilities(baseUrl: string): StorageCapabilities {
    return this.primary.capabilities(baseUrl)
  }

  list(dir: string): Promise<FsEntry[]> {
    return this.pick(dir).list(dir)
  }
  stat(p: string): Promise<FsEntry | null> {
    return this.pick(p).stat(p)
  }
  read(p: string): Promise<ReadResult> {
    return this.pick(p).read(p)
  }
  write(p: string, data: Uint8Array, ifMatch?: string): Promise<WriteResult> {
    return this.pick(p).write(p, data, ifMatch)
  }
  mkdir(p: string): Promise<void> {
    return this.pick(p).mkdir(p)
  }
  remove(p: string, recursive: boolean): Promise<void> {
    return this.pick(p).remove(p, recursive)
  }
  checkPublic(config: any): Promise<{ ok: boolean; guidance: string }> {
    const p = this.primary
    if (p.checkPublic) return p.checkPublic(config)
    return Promise.resolve({ ok: false, guidance: 'provider cannot validate public access.' })
  }
  sign(req: SignRequest): Promise<SignResult> {
    const provider = this.pick(req.path)
    if (provider.sign) return provider.sign(req)
    throw new Error('signing not supported for this path')
  }

  async move(from: string, to: string): Promise<void> {
    const sp = this.pick(from)
    const dp = this.pick(to)
    if (sp === dp) return sp.move(from, to)
    const st = await sp.stat(from)
    if (!st) throw new Error('source not found')
    if (st.type === 'dir') {
      const norm = normalizePath(from)
      for (const it of await sp.list(norm)) {
        const dst = normalizePath(to + it.path.slice(norm === '/' ? 0 : norm.length))
        if (it.type === 'dir') await dp.mkdir(dst)
        else await dp.write(dst, (await sp.read(it.path)).data)
        if (it.type !== 'dir') await sp.remove(it.path, false)
      }
    } else {
      await dp.write(to, (await sp.read(normalizePath(from))).data)
      await sp.remove(from, false)
    }
  }
}
