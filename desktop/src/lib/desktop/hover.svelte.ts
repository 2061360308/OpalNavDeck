class HoverState {
  id = $state<string | null>(null)

  set(id: string | null) {
    this.id = id
  }

  clear() {
    if (this.id !== null) this.id = null
  }
}

export const hover = new HoverState()
