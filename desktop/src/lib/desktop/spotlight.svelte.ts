const ENDPOINT =
  'https://fd.api.iris.microsoft.com/v4/api/selection?placement=88000820&bcnt=4&fmt=json&locale=zh-CN&country=CN'

export interface SpotlightItem {
  landscape: string
  portrait: string
  title: string
  copyright: string
  ctaUri: string
}

class SpotlightState {
  list = $state<SpotlightItem[]>([])
  loading = $state(false)
  error = $state('')
  private fetchedAt = 0

  async load(force = false) {
    if (this.loading) return
    // cache for ~30 min
    if (!force && this.list.length && Date.now() - this.fetchedAt < 30 * 60 * 1000) return
    this.loading = true
    this.error = ''
    try {
      const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const items: SpotlightItem[] = []
      for (const entry of data?.batchrsp?.items ?? []) {
        try {
          const inner = typeof entry.item === 'string' ? JSON.parse(entry.item) : entry.item
          const ad = inner?.ad
          if (!ad) continue
          items.push({
            landscape: ad.landscapeImage?.asset ?? '',
            portrait: ad.portraitImage?.asset ?? '',
            title: ad.title ?? '',
            copyright: ad.copyright ?? '',
            ctaUri: ad.ctaUri ?? '',
          })
        } catch {
          /* skip malformed entry */
        }
      }
      if (!items.length) throw new Error('无可用聚焦图片')
      this.list = items
      this.fetchedAt = Date.now()
    } catch (e) {
      this.error = String((e as Error)?.message ?? e)
    } finally {
      this.loading = false
    }
  }

  /** pick the best asset for the given viewport aspect */
  pick(viewW: number, viewH: number, index: number): string {
    if (!this.list.length) return ''
    const it = this.list[((index % this.list.length) + this.list.length) % this.list.length]
    const portrait = viewH > viewW
    return (portrait ? it.portrait : it.landscape) || it.landscape || it.portrait
  }
}

export const spotlight = new SpotlightState()
