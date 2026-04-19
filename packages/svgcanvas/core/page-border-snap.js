const DEFAULT_PAGE_SNAP_TOLERANCE = 10

const getTolerance = (tolerance) => {
  const parsed = Number.parseFloat(tolerance)
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_PAGE_SNAP_TOLERANCE
}

const getPageBounds = (pageBounds) => ({
  left: Number(pageBounds?.left) || 0,
  top: Number(pageBounds?.top) || 0,
  right: Number(pageBounds?.right) || 0,
  bottom: Number(pageBounds?.bottom) || 0
})

const pickNearest = (candidates, tolerance) => {
  const matches = candidates.filter(candidate => candidate.distance <= tolerance)
  if (matches.length === 0) {
    return null
  }
  return matches.reduce((best, candidate) => {
    if (!best || candidate.distance < best.distance) {
      return candidate
    }
    return best
  }, null)
}

const getHorizontalSnap = (y, bounds, tolerance) => {
  return pickNearest([
    { edge: 'top', value: bounds.top, distance: Math.abs(y - bounds.top) },
    { edge: 'bottom', value: bounds.bottom, distance: Math.abs(y - bounds.bottom) }
  ], tolerance)
}

const getVerticalSnap = (x, bounds, tolerance) => {
  return pickNearest([
    { edge: 'left', value: bounds.left, distance: Math.abs(x - bounds.left) },
    { edge: 'right', value: bounds.right, distance: Math.abs(x - bounds.right) }
  ], tolerance)
}

const getCornerName = (horizontalEdge, verticalEdge) => {
  if (!horizontalEdge || !verticalEdge) {
    return null
  }
  return `${horizontalEdge}-${verticalEdge}`
}

export const snapPointToPageBorder = ({ x, y }, pageBounds, tolerance) => {
  const resolvedTolerance = getTolerance(tolerance)
  const bounds = getPageBounds(pageBounds)
  const verticalSnap = getVerticalSnap(x, bounds, resolvedTolerance)
  const horizontalSnap = getHorizontalSnap(y, bounds, resolvedTolerance)

  if (!verticalSnap && !horizontalSnap) {
    return {
      snapped: false,
      x,
      y
    }
  }

  return {
    snapped: true,
    x: verticalSnap ? verticalSnap.value : x,
    y: horizontalSnap ? horizontalSnap.value : y,
    type: verticalSnap && horizontalSnap ? 'corner' : 'edge',
    edge: verticalSnap?.edge || horizontalSnap?.edge || null,
    horizontalEdge: horizontalSnap?.edge || null,
    verticalEdge: verticalSnap?.edge || null,
    corner: getCornerName(horizontalSnap?.edge, verticalSnap?.edge)
  }
}

export const snapBBoxToPageBorder = (bbox, { dx, dy }, pageBounds, tolerance) => {
  const resolvedTolerance = getTolerance(tolerance)
  const bounds = getPageBounds(pageBounds)
  const nextLeft = bbox.x + dx
  const nextRight = bbox.x + bbox.width + dx
  const nextTop = bbox.y + dy
  const nextBottom = bbox.y + bbox.height + dy

  const verticalSnap = pickNearest([
    {
      edge: 'left',
      value: bounds.left,
      distance: Math.abs(nextLeft - bounds.left),
      dx: bounds.left - bbox.x
    },
    {
      edge: 'right',
      value: bounds.right,
      distance: Math.abs(nextRight - bounds.right),
      dx: bounds.right - (bbox.x + bbox.width)
    }
  ], resolvedTolerance)
  const horizontalSnap = pickNearest([
    {
      edge: 'top',
      value: bounds.top,
      distance: Math.abs(nextTop - bounds.top),
      dy: bounds.top - bbox.y
    },
    {
      edge: 'bottom',
      value: bounds.bottom,
      distance: Math.abs(nextBottom - bounds.bottom),
      dy: bounds.bottom - (bbox.y + bbox.height)
    }
  ], resolvedTolerance)

  if (!verticalSnap && !horizontalSnap) {
    return {
      snapped: false,
      dx,
      dy
    }
  }

  return {
    snapped: true,
    dx: verticalSnap ? verticalSnap.dx : dx,
    dy: horizontalSnap ? horizontalSnap.dy : dy,
    x: verticalSnap ? verticalSnap.value : null,
    y: horizontalSnap ? horizontalSnap.value : null,
    type: verticalSnap && horizontalSnap ? 'corner' : 'edge',
    edge: verticalSnap?.edge || horizontalSnap?.edge || null,
    horizontalEdge: horizontalSnap?.edge || null,
    verticalEdge: verticalSnap?.edge || null,
    corner: getCornerName(horizontalSnap?.edge, verticalSnap?.edge)
  }
}

export const snapResizeToPageBorder = (resizeMode, bbox, { dx, dy }, pageBounds, tolerance) => {
  const resolvedTolerance = getTolerance(tolerance)
  const bounds = getPageBounds(pageBounds)
  const verticalCandidates = []
  const horizontalCandidates = []

  if (resizeMode.includes('w')) {
    verticalCandidates.push(
      {
        edge: 'left',
        value: bounds.left,
        distance: Math.abs(bbox.x + dx - bounds.left),
        dx: bounds.left - bbox.x
      },
      {
        edge: 'right',
        value: bounds.right,
        distance: Math.abs(bbox.x + dx - bounds.right),
        dx: bounds.right - bbox.x
      }
    )
  }
  if (resizeMode.includes('e')) {
    const right = bbox.x + bbox.width
    verticalCandidates.push(
      {
        edge: 'left',
        value: bounds.left,
        distance: Math.abs(right + dx - bounds.left),
        dx: bounds.left - right
      },
      {
        edge: 'right',
        value: bounds.right,
        distance: Math.abs(right + dx - bounds.right),
        dx: bounds.right - right
      }
    )
  }
  if (resizeMode.includes('n')) {
    horizontalCandidates.push(
      {
        edge: 'top',
        value: bounds.top,
        distance: Math.abs(bbox.y + dy - bounds.top),
        dy: bounds.top - bbox.y
      },
      {
        edge: 'bottom',
        value: bounds.bottom,
        distance: Math.abs(bbox.y + dy - bounds.bottom),
        dy: bounds.bottom - bbox.y
      }
    )
  }
  if (resizeMode.includes('s')) {
    const bottom = bbox.y + bbox.height
    horizontalCandidates.push(
      {
        edge: 'top',
        value: bounds.top,
        distance: Math.abs(bottom + dy - bounds.top),
        dy: bounds.top - bottom
      },
      {
        edge: 'bottom',
        value: bounds.bottom,
        distance: Math.abs(bottom + dy - bounds.bottom),
        dy: bounds.bottom - bottom
      }
    )
  }

  const verticalSnap = pickNearest(verticalCandidates, resolvedTolerance)
  const horizontalSnap = pickNearest(horizontalCandidates, resolvedTolerance)

  if (!verticalSnap && !horizontalSnap) {
    return {
      snapped: false,
      dx,
      dy
    }
  }

  return {
    snapped: true,
    dx: verticalSnap ? verticalSnap.dx : dx,
    dy: horizontalSnap ? horizontalSnap.dy : dy,
    x: verticalSnap ? verticalSnap.value : null,
    y: horizontalSnap ? horizontalSnap.value : null,
    type: verticalSnap && horizontalSnap ? 'corner' : 'edge',
    edge: verticalSnap?.edge || horizontalSnap?.edge || null,
    horizontalEdge: horizontalSnap?.edge || null,
    verticalEdge: verticalSnap?.edge || null,
    corner: getCornerName(horizontalSnap?.edge, verticalSnap?.edge)
  }
}

export const getPageSnapTolerance = getTolerance
