/** @typedef {{ gapX: number, gapY: number }} GroupGap */
/** @typedef {{ id: string, name: string, nodeIds: string[], layout: 'horizontal'|'vertical', gaps: GroupGap[] }} CanvasGroup */

export function normalizeGroupGaps(group) {
  const count = Math.max(0, (group.nodeIds?.length || 0) - 1)
  const gaps = [...(group.gaps || [])]
  while (gaps.length < count) gaps.push({ gapX: 16, gapY: 0 })
  return gaps.slice(0, count)
}

export function sortNodeIdsByLayout(nodeIds, nodes, layout = 'horizontal') {
  const map = new Map(nodes.map((n) => [n.id, n]))
  return [...nodeIds]
    .filter((id) => map.has(id))
    .sort((a, b) => {
      const na = map.get(a)
      const nb = map.get(b)
      if (layout === 'vertical') {
        if (na.y !== nb.y) return na.y - nb.y
        return na.x - nb.x
      }
      if (na.x !== nb.x) return na.x - nb.x
      return na.y - nb.y
    })
}

/** Reposition group members; first node in nodeIds stays as anchor. */
export function applyGroupLayoutToNodes(nodes, group) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const ids = (group.nodeIds || []).filter((id) => nodeMap.has(id))
  if (ids.length === 0) return nodes

  const gaps = normalizeGroupGaps({ ...group, nodeIds: ids })
  const positions = new Map()
  const first = nodeMap.get(ids[0])
  positions.set(ids[0], { x: first.x, y: first.y })

  for (let i = 1; i < ids.length; i++) {
    const prev = nodeMap.get(ids[i - 1])
    const prevPos = positions.get(ids[i - 1])
    const gap = gaps[i - 1] || { gapX: 0, gapY: 0 }
    const gapX = typeof gap.gapX === 'number' ? gap.gapX : 0
    const gapY = typeof gap.gapY === 'number' ? gap.gapY : 0

    if (group.layout === 'vertical') {
      positions.set(ids[i], {
        x: Math.round(prevPos.x + gapX),
        y: Math.round(prevPos.y + prev.height + gapY),
      })
    } else {
      positions.set(ids[i], {
        x: Math.round(prevPos.x + prev.width + gapX),
        y: Math.round(prevPos.y + gapY),
      })
    }
  }

  return nodes.map((n) => {
    const pos = positions.get(n.id)
    return pos ? { ...n, x: pos.x, y: pos.y } : n
  })
}

export function getGroupBounds(nodes, group) {
  const members = (group.nodeIds || [])
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean)
  if (!members.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of members) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function reorderGroupNodeIds(nodeIds, draggedId, beforeId) {
  const ids = [...nodeIds]
  const from = ids.indexOf(draggedId)
  if (from === -1) return ids
  ids.splice(from, 1)
  if (!beforeId) return [...ids, draggedId]
  const to = ids.indexOf(beforeId)
  if (to === -1) ids.push(draggedId)
  else ids.splice(to, 0, draggedId)
  return ids
}

export function insertNodeIdIntoGroup(group, nodeId, beforeId = null) {
  const ids = group.nodeIds.filter((id) => id !== nodeId)
  if (beforeId) {
    const idx = ids.indexOf(beforeId)
    if (idx === -1) ids.push(nodeId)
    else ids.splice(idx, 0, nodeId)
  } else {
    ids.push(nodeId)
  }
  return { ...group, nodeIds: ids, gaps: normalizeGroupGaps({ ...group, nodeIds: ids }) }
}

export function removeNodeIdFromGroup(group, nodeId) {
  const idx = group.nodeIds.indexOf(nodeId)
  if (idx === -1) return group
  const nodeIds = group.nodeIds.filter((id) => id !== nodeId)
  const gaps = normalizeGroupGaps({ ...group, nodeIds })
  const newGaps = [...gaps]
  if (idx > 0 && idx - 1 < newGaps.length) newGaps.splice(idx - 1, 1)
  else if (idx === 0 && newGaps.length) newGaps.splice(0, 1)
  return { ...group, nodeIds, gaps: normalizeGroupGaps({ ...group, nodeIds, gaps: newGaps }) }
}

export function moveNodeIdInGroup(group, nodeId, direction) {
  const ids = [...group.nodeIds]
  const idx = ids.indexOf(nodeId)
  if (idx === -1) return group
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= ids.length) return group
  ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
  const gaps = normalizeGroupGaps(group)
  if (gaps.length >= swap) {
    if (direction === 'up' && swap > 0) {
      ;[gaps[swap - 1], gaps[swap]] = [gaps[swap], gaps[swap - 1]]
    } else if (direction === 'down' && swap < gaps.length) {
      ;[gaps[swap], gaps[swap + 1]] = [gaps[swap + 1], gaps[swap]]
    }
  }
  return { ...group, nodeIds: ids, gaps: normalizeGroupGaps({ ...group, nodeIds: ids, gaps }) }
}

export function removeNodeFromAllGroups(groups, nodeId) {
  return (groups || [])
    .map((g) => {
      const idx = g.nodeIds.indexOf(nodeId)
      if (idx === -1) return g
      const nodeIds = g.nodeIds.filter((id) => id !== nodeId)
      const gaps = normalizeGroupGaps({ ...g, nodeIds })
      const newGaps = [...gaps]
      if (idx > 0 && idx <= newGaps.length) newGaps.splice(idx - 1, 1)
      else if (idx === 0 && newGaps.length) newGaps.splice(0, 1)
      return { ...g, nodeIds, gaps: normalizeGroupGaps({ ...g, nodeIds, gaps: newGaps }) }
    })
    .filter((g) => g.nodeIds.length >= 2)
}
