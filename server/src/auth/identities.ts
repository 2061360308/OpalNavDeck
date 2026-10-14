import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { authDir } from './config.ts'

export type Provider = 'alipay' | 'github'

export interface Binding {
  subject: string
  display?: string
  boundAt: number
}

export type Identities = Partial<Record<Provider, Binding>>

function file(): string {
  return join(authDir(), 'identities.json')
}

export function readIdentities(): Identities {
  try {
    const raw = readFileSync(file(), 'utf8')
    const data = JSON.parse(raw) as Identities
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function writeIdentities(v: Identities) {
  mkdirSync(authDir(), { recursive: true })
  const target = file()
  const tmp = `${target}.tmp-${Date.now().toString(36)}`
  writeFileSync(tmp, JSON.stringify(v, null, 2))
  renameSync(tmp, target)
  try {
    chmodSync(target, 0o600)
  } catch {
    /* best effort */
  }
}

export function setBinding(provider: Provider, b: Binding) {
  const ids = readIdentities()
  ids[provider] = b
  writeIdentities(ids)
}

export function removeBinding(provider: Provider) {
  const ids = readIdentities()
  delete ids[provider]
  writeIdentities(ids)
}
