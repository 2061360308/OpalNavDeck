/** global service/icon editor overlay (create + edit) */
class EditorState {
  open = $state(false)
  /** null = creating a new item; otherwise the id being edited */
  id = $state<string | null>(null)

  show(id: string | null = null) {
    this.id = id
    this.open = true
  }

  close() {
    this.open = false
  }
}

export const editor = new EditorState()
