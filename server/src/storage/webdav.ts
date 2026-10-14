import type { Hono } from 'hono'
import { isReadonlyPath, PreconditionFailed, type FsEntry } from './provider.ts'
import type { LocalProvider } from './local.ts'

const DAV_BASE = '/dav'

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function encodeHref(path: string, isDir: boolean): string {
  const norm = path === '/' ? '' : path
  const encoded = norm
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return DAV_BASE + encoded + (isDir && !encoded.endsWith('/') ? '/' : '')
}

function httpDate(ms: number): string {
  return new Date(ms || Date.now()).toUTCString()
}

function entryXml(e: FsEntry): string {
  const isDir = e.type === 'dir'
  const props: string[] = [
    `<D:displayname>${xmlEscape(e.name)}</D:displayname>`,
    `<D:getlastmodified>${httpDate(e.mtime)}</D:getlastmodified>`,
    isDir
      ? `<D:resourcetype><D:collection/></D:resourcetype>`
      : `<D:resourcetype/>`,
    `<D:getcontentlength>${e.size}</D:getcontentlength>`,
  ]
  if (!isDir) props.push(`<D:getcontenttype>${xmlEscape(e.mime ?? 'application/octet-stream')}</D:getcontenttype>`)
  if (e.etag) props.push(`<D:getetag>${xmlEscape(e.etag)}</D:getetag>`)
  return (
    `<D:response><D:href>${xmlEscape(encodeHref(e.path, isDir))}</D:href>` +
    `<D:propstat><D:prop>${props.join('')}</D:prop>` +
    `<D:status>HTTP/1.1 200 OK</D:status></D:propstat>` +
    `<D:propstat><D:prop/><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat>` +
    `</D:response>`
  )
}

function davPath(reqPath: string): string {
  let p = reqPath
  if (p.startsWith(DAV_BASE)) p = p.slice(DAV_BASE.length)
  if (!p) p = '/'
  try {
    p = decodeURIComponent(p)
  } catch {
    /* keep raw */
  }
  return p
}

function destinationPath(header: string | undefined, host: string): string | null {
  if (!header) return null
  try {
    const url = new URL(header, `http://${host}`)
    return davPath(url.pathname)
  } catch {
    return null
  }
}

async function copyRecursive(provider: LocalProvider, from: string, to: string) {
  const st = await provider.stat(from)
  if (!st) return
  if (st.type === 'dir') {
    await provider.mkdir(to)
    for (const child of await provider.list(from)) {
      const rel = child.path.slice(from === '/' ? 0 : from.length)
      await copyRecursive(provider, child.path, to + rel)
    }
  } else {
    const data = await provider.read(from)
    await provider.write(to, data.data)
  }
}

export function registerWebdav(app: Hono, provider: LocalProvider) {
  app.on(['OPTIONS'], DAV_BASE, (c) => {
    c.header('DAV', '1, 2')
    c.header('Allow', 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY')
    c.header('MS-Author-Via', 'DAV')
    return c.body(null, 204)
  })
  app.on(['OPTIONS'], `${DAV_BASE}/*`, (c) => {
    c.header('DAV', '1, 2')
    c.header('Allow', 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY')
    return c.body(null, 204)
  })

  app.on(['GET', 'HEAD'], `${DAV_BASE}/*`, async (c) => {
    const p = davPath(c.req.path)
    const st = await provider.stat(p)
    if (!st || st.type === 'dir') return c.body(null, 404)
    const inm = c.req.header('If-None-Match')
    if (inm && st.etag && inm === st.etag) return c.body(null, 304)
    if (c.req.method === 'HEAD') {
      c.header('Content-Type', st.mime ?? 'application/octet-stream')
      c.header('Content-Length', String(st.size))
      if (st.etag) c.header('ETag', st.etag)
      return c.body(null, 200)
    }
    const r = await provider.read(p)
    c.header('Content-Type', r.mime)
    if (r.etag) c.header('ETag', r.etag)
    return c.body(r.data as unknown as ArrayBuffer, 200)
  })

  app.on(['PUT'], `${DAV_BASE}/*`, async (c) => {
    const p = davPath(c.req.path)
    if (isReadonlyPath(p)) return c.body(null, 403)
    const buf = new Uint8Array(await c.req.arrayBuffer())
    const ifMatch = c.req.header('If-Match')
    const ifNone = c.req.header('If-None-Match')
    try {
      if (ifNone === '*' && (await provider.stat(p))) return c.body(null, 412)
      const existed = !!(await provider.stat(p))
      await provider.write(p, buf, ifMatch)
      return c.body(null, existed ? 204 : 201)
    } catch (e) {
      if (e instanceof PreconditionFailed) return c.body(null, 412)
      throw e
    }
  })

  app.on(['DELETE'], `${DAV_BASE}/*`, async (c) => {
    const p = davPath(c.req.path)
    if (isReadonlyPath(p)) return c.body(null, 403)
    const ifMatch = c.req.header('If-Match')
    const st = await provider.stat(p)
    if (!st) return c.body(null, 404)
    if (ifMatch && st.etag && ifMatch !== st.etag) return c.body(null, 412)
    await provider.remove(p, true)
    return c.body(null, 204)
  })

  app.on(['MKCOL'], `${DAV_BASE}/*`, async (c) => {
    const p = davPath(c.req.path)
    if (isReadonlyPath(p)) return c.body(null, 403)
    if (await provider.stat(p)) return c.body(null, 405)
    await provider.mkdir(p)
    return c.body(null, 201)
  })

  app.on(['MOVE'], `${DAV_BASE}/*`, async (c) => {
    const from = davPath(c.req.path)
    const to = destinationPath(c.req.header('Destination'), c.req.header('Host') ?? 'localhost')
    if (!to) return c.body(null, 400)
    if (isReadonlyPath(from) || isReadonlyPath(to)) return c.body(null, 403)
    if (!(await provider.stat(from))) return c.body(null, 404)
    const overwrite = (c.req.header('Overwrite') ?? 'T').toUpperCase() !== 'F'
    if (!overwrite && (await provider.stat(to))) return c.body(null, 412)
    await provider.remove(to, true)
    await provider.move(from, to)
    return c.body(null, 201)
  })

  app.on(['COPY'], `${DAV_BASE}/*`, async (c) => {
    const from = davPath(c.req.path)
    const to = destinationPath(c.req.header('Destination'), c.req.header('Host') ?? 'localhost')
    if (!to) return c.body(null, 400)
    if (isReadonlyPath(to)) return c.body(null, 403)
    if (!(await provider.stat(from))) return c.body(null, 404)
    const overwrite = (c.req.header('Overwrite') ?? 'T').toUpperCase() !== 'F'
    if (!overwrite && (await provider.stat(to))) return c.body(null, 412)
    await provider.remove(to, true)
    await copyRecursive(provider, from, to)
    return c.body(null, 201)
  })

  app.on(['PROPFIND'], `${DAV_BASE}/*`, async (c) => {
    const p = davPath(c.req.path)
    const depth = c.req.header('Depth') ?? '1'
    const st = await provider.stat(p)
    if (!st) return c.body(null, 404)
    const responses: string[] = [entryXml(st)]
    if (st.type === 'dir' && depth !== '0') {
      for (const child of await provider.list(p)) responses.push(entryXml(child))
    }
    const xml =
      `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<D:multistatus xmlns:D="DAV:">${responses.join('')}</D:multistatus>`
    c.header('Content-Type', 'application/xml; charset=utf-8')
    return c.body(xml, 207)
  })
}
