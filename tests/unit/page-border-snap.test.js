import {
  getPageSnapTolerance,
  snapBBoxToPageBorder,
  snapPointToPageBorder,
  snapResizeToPageBorder
} from '../../packages/svgcanvas/core/page-border-snap.js'

describe('page border snapping', () => {
  const pageBounds = {
    left: 0,
    top: 0,
    right: 640,
    bottom: 480
  }

  it('snaps a point to the nearest page edge', () => {
    const result = snapPointToPageBorder({ x: 125, y: 4 }, pageBounds, 10)

    expect(result.snapped).toBe(true)
    expect(result.type).toBe('edge')
    expect(result.edge).toBe('top')
    expect(result.x).toBe(125)
    expect(result.y).toBe(0)
  })

  it('prefers a page corner when both axes are within tolerance', () => {
    const result = snapPointToPageBorder({ x: 637, y: 6 }, pageBounds, 10)

    expect(result.snapped).toBe(true)
    expect(result.type).toBe('corner')
    expect(result.corner).toBe('top-right')
    expect(result.x).toBe(640)
    expect(result.y).toBe(0)
  })

  it('snaps a translated bbox to the page border without grid fallback', () => {
    const result = snapBBoxToPageBorder(
      { x: 40, y: 12, width: 120, height: 50 },
      { dx: 15, dy: -8 },
      pageBounds,
      10
    )

    expect(result.snapped).toBe(true)
    expect(result.type).toBe('edge')
    expect(result.edge).toBe('top')
    expect(result.dx).toBe(15)
    expect(result.dy).toBe(-12)
  })

  it('snaps a translated bbox corner when both translated edges are close', () => {
    const result = snapBBoxToPageBorder(
      { x: 500, y: 400, width: 120, height: 70 },
      { dx: 18, dy: 6 },
      pageBounds,
      25
    )

    expect(result.snapped).toBe(true)
    expect(result.type).toBe('corner')
    expect(result.corner).toBe('bottom-right')
    expect(result.dx).toBe(20)
    expect(result.dy).toBe(10)
  })

  it('uses the default tolerance when the configured step is invalid', () => {
    expect(getPageSnapTolerance(undefined)).toBe(10)
    expect(getPageSnapTolerance('bad')).toBe(10)
  })

  it('snaps resize handles against the page border based on the active edges', () => {
    const result = snapResizeToPageBorder(
      'se',
      { x: 500, y: 400, width: 120, height: 70 },
      { dx: 18, dy: 6 },
      pageBounds,
      25
    )

    expect(result.snapped).toBe(true)
    expect(result.type).toBe('corner')
    expect(result.corner).toBe('bottom-right')
    expect(result.dx).toBe(20)
    expect(result.dy).toBe(10)
  })
})
