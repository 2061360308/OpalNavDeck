export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SnapGuides {
  v: number[]
  h: number[]
}

export interface SnapResult {
  x: number
  y: number
  guides: SnapGuides
}

function linesFromRects(rects: Rect[], axis: 'x' | 'y'): number[] {
  const out: number[] = []
  for (const r of rects) {
    if (axis === 'x') out.push(r.x, r.x + r.w / 2, r.x + r.w)
    else out.push(r.y, r.y + r.h / 2, r.y + r.h)
  }
  return out
}

function solve(candidates: number[], value: number, size: number, threshold: number) {
  const anchors = [value, value + size / 2, value + size]
  let best: { delta: number; line: number } | null = null
  for (const line of candidates) {
    for (const a of anchors) {
      const d = line - a
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, line }
      }
    }
  }
  if (!best) return { value, guide: null as number | null }
  return { value: value + best.delta, guide: best.line }
}

export function snapMove(
  rect: Rect,
  candidates: Rect[],
  bounds: { w: number; h: number },
  threshold: number
): SnapResult {
  const vLines = [0, bounds.w / 2, bounds.w, ...linesFromRects(candidates, 'x')]
  const hLines = [0, bounds.h / 2, bounds.h, ...linesFromRects(candidates, 'y')]

  const sx = solve(vLines, rect.x, rect.w, threshold)
  const sy = solve(hLines, rect.y, rect.h, threshold)

  return {
    x: sx.value,
    y: sy.value,
    guides: {
      v: sx.guide === null ? [] : [sx.guide],
      h: sy.guide === null ? [] : [sy.guide],
    },
  }
}
