export interface ToastItem {
  id: number
  text: string
}

/** tiny non-blocking toast queue (bottom-center, auto-dismiss) */
class ToastState {
  items = $state<ToastItem[]>([])
  private seq = 0

  show(text: string, ms = 2400) {
    const id = ++this.seq
    this.items = [...this.items, { id, text }]
    window.setTimeout(() => this.dismiss(id), ms)
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id)
  }
}

export const toast = new ToastState()
