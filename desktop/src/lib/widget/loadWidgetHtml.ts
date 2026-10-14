import { fs } from '../api/fs'
import { PATHS } from '@desktop/shared'
import BRIDGE from './bridge/client.js?raw'

const SKINS_ROOT = PATHS.skins

function dirOf(url: string): string {
  const i = url.lastIndexOf('/')
  return i >= 0 ? url.slice(0, i + 1) : url
}

/**
 * Load a widget entry entirely from the public code base: fetch the entry
 * document, then inject a `<base>` (so relative asset/import paths resolve
 * against the package directory) and the bridge client. The result is a
 * self-contained document suitable for `<iframe srcdoc>`.
 */
export async function loadWidgetHtml(id: string, entry = 'index.html'): Promise<string> {
  await fs.ready
  const path = `${SKINS_ROOT}/${id}/${entry}`
  const url = fs.assetUrl(path)
  if (!url) throw new Error('no public asset base configured for widgets')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`widget "${id}" not found (${res.status})`)
  let html = await res.text()

  const base = `<base href="${dirOf(url)}" />`
  const bridge = `<script>\n${BRIDGE}\n</script>`
  const inject = base + bridge
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`)
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${inject}</head>`)
  } else {
    html = inject + html
  }
  return html
}
