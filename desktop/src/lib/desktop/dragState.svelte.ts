class DragState {
  active = $state(false)

  set(v: boolean) {
    this.active = v
  }
}

export const dragState = new DragState()
