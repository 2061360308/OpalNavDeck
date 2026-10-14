export const RECENT_LIMIT = 10

/** recently opened service ids, newest first, deduped, capped */
class RecentState {
  ids = $state<string[]>([])

  record(id: string) {
    if (!id) return
    this.ids = [id, ...this.ids.filter((x) => x !== id)].slice(0, RECENT_LIMIT)
  }

  set(ids: unknown) {
    this.ids = Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === 'string').slice(0, RECENT_LIMIT)
      : []
  }

  clear() {
    this.ids = []
  }
}

export const recent = new RecentState()
