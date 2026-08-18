/**
 * Snap and grid utilities for canvas editor
 */

export const SNAP_THRESHOLD = 8

export interface SnapTarget {
  v: number[]
  h: number[]
}

export interface SnapResult {
  x: number
  y: number
  lines: Array<{ type: 'v' | 'h'; pos: number }>
}

export interface ResizeSnapResult extends SnapResult {
  w: number
  h: number
}

/**
 * Collect snap targets from nodes on the canvas
 */
export function collectSnapTargets(
  nodes: any[] | null | undefined,
  excludeIds: string[] = [],
  canvasW: number,
  canvasH: number
): SnapTarget {
  const v = [0, canvasW / 2, canvasW]
  const h = [0, canvasH / 2, canvasH]

  for (const n of nodes || []) {
    if (excludeIds.includes(n.id)) continue
    v.push(n.x, n.x + n.width / 2, n.x + n.width)
    h.push(n.y, n.y + n.height / 2, n.y + n.height)
  }

  return { v, h }
}

/**
 * Snap a moved position to nearby targets
 */
export function snapMovePosition(
  rawX: number,
  rawY: number,
  w: number,
  h: number,
  targetsV: number[],
  targetsH: number[],
  threshold: number = SNAP_THRESHOLD
): SnapResult {
  let newX = rawX
  let newY = rawY
  const lines: Array<{ type: 'v' | 'h'; pos: number }> = []

  const xEdges = [
    { get: () => newX, set: (v: number) => { newX = v } },
    { get: () => newX + w / 2, set: (v: number) => { newX = v - w / 2 } },
    { get: () => newX + w, set: (v: number) => { newX = v - w } },
  ]

  const yEdges = [
    { get: () => newY, set: (v: number) => { newY = v } },
    { get: () => newY + h / 2, set: (v: number) => { newY = v - h / 2 } },
    { get: () => newY + h, set: (v: number) => { newY = v - h } },
  ]

  for (const edge of xEdges) {
    for (const pos of targetsV) {
      if (Math.abs(edge.get() - pos) < threshold) {
        edge.set(pos)
        if (!lines.some((l) => l.type === 'v' && l.pos === pos)) {
          lines.push({ type: 'v', pos })
        }
        break
      }
    }
  }

  for (const edge of yEdges) {
    for (const pos of targetsH) {
      if (Math.abs(edge.get() - pos) < threshold) {
        edge.set(pos)
        if (!lines.some((l) => l.type === 'h' && l.pos === pos)) {
          lines.push({ type: 'h', pos })
        }
        break
      }
    }
  }

  return {
    x: Math.round(newX),
    y: Math.round(newY),
    lines,
  }
}

/**
 * Snap a resized box to nearby targets
 */
export function snapResizeBox(
  x: number,
  y: number,
  w: number,
  h: number,
  targetsV: number[],
  targetsH: number[],
  threshold: number = SNAP_THRESHOLD
): ResizeSnapResult {
  let nx = x
  let ny = y
  let nw = w
  let nh = h
  const lines: Array<{ type: 'v' | 'h'; pos: number }> = []

  const right = x + w
  const bottom = y + h

  // Snap right edge
  for (const pos of targetsV) {
    if (Math.abs(right - pos) < threshold) {
      nw = pos - x
      if (!lines.some((l) => l.type === 'v' && l.pos === pos)) {
        lines.push({ type: 'v', pos })
      }
      break
    }
  }

  // Snap bottom edge
  for (const pos of targetsH) {
    if (Math.abs(bottom - pos) < threshold) {
      nh = pos - y
      if (!lines.some((l) => l.type === 'h' && l.pos === pos)) {
        lines.push({ type: 'h', pos })
      }
      break
    }
  }

  // Snap left edge
  for (const pos of targetsV) {
    if (Math.abs(x - pos) < threshold) {
      const delta = pos - x
      nx = pos
      nw = w - delta
      if (!lines.some((l) => l.type === 'v' && l.pos === pos)) {
        lines.push({ type: 'v', pos })
      }
      break
    }
  }

  // Snap top edge
  for (const pos of targetsH) {
    if (Math.abs(y - pos) < threshold) {
      const delta = pos - y
      ny = pos
      nh = h - delta
      if (!lines.some((l) => l.type === 'h' && l.pos === pos)) {
        lines.push({ type: 'h', pos })
      }
      break
    }
  }

  return {
    x: Math.round(nx),
    y: Math.round(ny),
    w: Math.max(20, Math.round(nw)),
    h: Math.max(20, Math.round(nh)),
    lines,
  }
}
