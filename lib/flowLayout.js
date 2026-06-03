import { applyGroupLayoutToNodes } from './groups'

/**
 * Reflow only applies inside groups: re-run group layout when a member resizes.
 */
export function reflowAfterNodeResize(nodes, resizedId, _oldBox, groups = []) {
  const group = (groups || []).find((g) => g.nodeIds.includes(resizedId))
  if (!group) return nodes
  return applyGroupLayoutToNodes(nodes, group)
}

export function nodeBox(n) {
  return { x: n.x, y: n.y, width: n.width, height: n.height }
}

export function applyPatchWithReflow(nodes, nodeId, patch, groups = []) {
  const prev = nodes.find((n) => n.id === nodeId)
  if (!prev) return nodes

  const oldBox = nodeBox(prev)
  let next = nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n))
  const updated = next.find((n) => n.id === nodeId)
  if (!updated) return next

  const widthChanged = updated.width !== oldBox.width || patch.width != null
  const heightChanged = updated.height !== oldBox.height || patch.height != null

  const textLayoutChanged =
    updated.type === 'text' &&
    (patch.text != null ||
      patch.fontSize != null ||
      patch.width != null ||
      patch.lineHeight != null ||
      patch.height != null)

  const inGroup = (groups || []).some((g) => g.nodeIds.includes(nodeId))
  if (!inGroup || !textLayoutChanged) return next

  // Only reflow if the changed dimension actually affects the group's layout axis.
  // Horizontal groups stack on X → only width changes matter.
  // Vertical groups stack on Y → only height changes matter.
  // This prevents font-size / line-height changes from drifting x-positions in
  // horizontal groups (height-only change has no effect on horizontal stacking).
  const group = groups.find((g) => g.nodeIds.includes(nodeId))
  const isHorizontal = !group || group.layout !== 'vertical'
  const axisChanged = isHorizontal ? widthChanged : heightChanged

  if (axisChanged) {
    next = reflowAfterNodeResize(next, nodeId, oldBox, groups)
  }

  return next
}
