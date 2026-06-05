/** @typedef {{ gapX: number, gapY: number }} GroupGap */
/** @typedef {{ id: string, name: string, nodeIds: string[], layout: 'horizontal'|'vertical', align: 'left'|'center'|'right'|'free', gaps: GroupGap[] }} CanvasGroup */

/**
 * Returns the effective visible dimensions of a node, accounting for crop.
 * Crop values are percentages (0-100) trimmed from each edge.
 */
export function getNodeEffectiveDimensions(node) {
  if (node.type !== 'image') return { width: node.width, height: node.height, offsetX: 0, offsetY: 0 }
  const cL = node.cropLeft || 0
  const cR = node.cropRight || 0
  const cT = node.cropTop || 0
  const cB = node.cropBottom || 0
  const width = node.width * (100 - cL - cR) / 100
  const height = node.height * (100 - cT - cB) / 100
  const offsetX = node.width * cL / 100
  const offsetY = node.height * cT / 100
  return { width, height, offsetX, offsetY }
}

export function normalizeGroupGaps(group) {
  const count = Math.max(0, (group.nodeIds?.length || 0) - 1)
  const gaps = [...(group.gaps || [])]
  // Default gap is 0 — elements sit flush against each other.
  // The user sets the gap explicitly via the group panel.
  while (gaps.length < count) gaps.push({ gapX: 0, gapY: 0 })
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

  const align = group.align || 'free'
  const positions = new Map()
  const first = nodeMap.get(ids[0])
  const firstDims = getNodeEffectiveDimensions(first)

  // If free mode, keep all items at their original positions
  if (align === 'free') {
    for (const id of ids) {
      const node = nodeMap.get(id)
      positions.set(id, { x: node.x, y: node.y })
    }
    return nodes.map((n) => {
      const pos = positions.get(n.id)
      return pos ? { ...n, x: pos.x, y: pos.y } : n
    })
  }

  const gaps = normalizeGroupGaps({ ...group, nodeIds: ids })

  // Derive the cross-axis origin from the actual stored node positions.
  // This is the leftmost (for vertical) or topmost (for horizontal) visible edge
  // across all members — it represents where the group's content actually starts.
  // We intentionally ignore group.originX/originY here because those can be stale
  // (e.g. set from the first node's position before centering was applied).
  const crossOrigin = group.layout === 'vertical'
    ? Math.min(...ids.map(id => {
        const n = nodeMap.get(id)
        const d = getNodeEffectiveDimensions(n)
        return n.x + d.offsetX
      }))
    : Math.min(...ids.map(id => {
        const n = nodeMap.get(id)
        const d = getNodeEffectiveDimensions(n)
        return n.y + d.offsetY
      }))

  // Anchor: first node stays exactly where it is on the main axis
  positions.set(ids[0], { x: first.x, y: first.y })

  // --- Pass 1: main-axis — place each node flush after the previous ---
  for (let i = 1; i < ids.length; i++) {
    const prev = nodeMap.get(ids[i - 1])
    const prevDims = getNodeEffectiveDimensions(prev)
    const prevPos = positions.get(ids[i - 1])
    const gap = gaps[i - 1] || { gapX: 0, gapY: 0 }
    const gapX = typeof gap.gapX === 'number' ? gap.gapX : 0
    const gapY = typeof gap.gapY === 'number' ? gap.gapY : 0
    const curDims = getNodeEffectiveDimensions(nodeMap.get(ids[i]))

    if (group.layout === 'vertical') {
      const prevVisibleBottom = prevPos.y + prevDims.offsetY + prevDims.height
      positions.set(ids[i], {
        x: prevPos.x, // will be overwritten in Pass 2
        y: prevVisibleBottom + gapY - curDims.offsetY,
      })
    } else {
      const prevVisibleRight = prevPos.x + prevDims.offsetX + prevDims.width
      positions.set(ids[i], {
        x: prevVisibleRight + gapX - curDims.offsetX,
        y: prevPos.y, // will be overwritten in Pass 2
      })
    }
  }

  // --- Pass 2: cross-axis alignment using the stable stored origin ---
  if (group.layout === 'vertical') {
    const memberWidths = ids.map((id) => getNodeEffectiveDimensions(nodeMap.get(id)).width)
    const maxWidth = Math.max(...memberWidths)

    for (const id of ids) {
      const pos = positions.get(id)
      const dims = getNodeEffectiveDimensions(nodeMap.get(id))
      let visibleX = crossOrigin
      if (align === 'center') {
        visibleX = Math.round(crossOrigin + (maxWidth - dims.width) / 2)
      } else if (align === 'right') {
        visibleX = Math.round(crossOrigin + maxWidth - dims.width)
      }
      positions.set(id, { ...pos, x: Math.round(visibleX - dims.offsetX) })
    }
  } else {
    const memberHeights = ids.map((id) => getNodeEffectiveDimensions(nodeMap.get(id)).height)
    const maxHeight = Math.max(...memberHeights)

    for (const id of ids) {
      const pos = positions.get(id)
      const dims = getNodeEffectiveDimensions(nodeMap.get(id))
      let visibleY = crossOrigin
      if (align === 'center') {
        visibleY = Math.round(crossOrigin + (maxHeight - dims.height) / 2)
      } else if (align === 'right') {
        visibleY = Math.round(crossOrigin + maxHeight - dims.height)
      }
      positions.set(id, { ...pos, y: Math.round(visibleY - dims.offsetY) })
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
    const { width, height, offsetX, offsetY } = getNodeEffectiveDimensions(n)
    const visX = n.x + offsetX
    const visY = n.y + offsetY
    minX = Math.min(minX, visX)
    minY = Math.min(minY, visY)
    maxX = Math.max(maxX, visX + width)
    maxY = Math.max(maxY, visY + height)
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
