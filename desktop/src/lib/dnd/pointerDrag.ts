export interface PointerDragHandlers {
  onMove?: (dx: number, dy: number, e: PointerEvent) => void
  onEnd?: (dx: number, dy: number, e: PointerEvent) => void
}

export function pointerDrag(start: PointerEvent, handlers: PointerDragHandlers) {
  const sx = start.clientX
  const sy = start.clientY
  let dx = 0
  let dy = 0

  const move = (e: PointerEvent) => {
    dx = e.clientX - sx
    dy = e.clientY - sy
    handlers.onMove?.(dx, dy, e)
  }
  const up = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    handlers.onEnd?.(dx, dy, e)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

export function hitTest<T extends Element>(e: PointerEvent, selector: string): T | null {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  return (el?.closest(selector) as T) ?? null
}
