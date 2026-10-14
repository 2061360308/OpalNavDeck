class GuidesState {
  v = $state<number[]>([])
  h = $state<number[]>([])

  set(v: number[], h: number[]) {
    this.v = v
    this.h = h
  }

  clear() {
    this.v = []
    this.h = []
  }
}

export const guides = new GuidesState()
