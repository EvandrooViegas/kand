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

  const sizeChanged =
    updated.width !== oldBox.width ||
    updated.height !== oldBox.height ||
    patch.width != null ||
    patch.height != null

  const textLayoutChanged =
    updated.type === 'text' &&
    (patch.text != null ||
      patch.fontSize != null ||
      patch.width != null ||
      patch.lineHeight != null ||
      patch.height != null)

  const shouldReflow = sizeChanged && textLayoutChanged

  const inGroup = (groups || []).some((g) => g.nodeIds.includes(nodeId))
  if (shouldReflow && inGroup) {
    next = reflowAfterNodeResize(next, nodeId, oldBox, groups)
  }

  return next
}
