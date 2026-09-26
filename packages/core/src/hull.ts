/**
 * The outline drawn around a set of seeds, and whether a point is in it.
 *
 * A sprouting subject is drawn on the bed as a dashed line around its
 * topics, unfilled: an outline rather than a hull, because nothing has
 * been sown there yet. Geometry rather than drawing, so the phone's Skia
 * bed outlines the same shape the web's canvas does, and pressing inside
 * one means the same thing on both.
 */

export interface Point {
  x: number
  y: number
}

/**
 * The convex hull, anticlockwise, by Andrew's monotone chain. Fewer
 * than three distinct points answer themselves.
 */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points]
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const unique = sorted.filter((p, i) => i === 0 || p.x !== sorted[i - 1].x || p.y !== sorted[i - 1].y)
  if (unique.length < 3) return unique

  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: Point[] = []
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return [...lower, ...upper]
}

/**
 * An outline that clears every point by `pad`, with rounded corners.
 *
 * Each point is stood in for by a ring of `segments` points at `pad`
 * around it and the hull taken of all of them -- which rounds the
 * corners, and gives one seed a circle and two a capsule rather than a
 * point and a line.
 */
export function outline(points: readonly Point[], pad: number, segments = 12): Point[] {
  const ring: Point[] = []
  for (const p of points) {
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      ring.push({ x: p.x + Math.cos(angle) * pad, y: p.y + Math.sin(angle) * pad })
    }
  }
  return convexHull(ring)
}

/** Whether a point falls inside a polygon, by counting crossings. */
export function contains(polygon: readonly Point[], point: Point): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      if (point.x < x) inside = !inside
    }
  }
  return inside
}

/** The centre of a set of points, or null for none. */
export function centroid(points: readonly Point[]): Point | null {
  if (points.length === 0) return null
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
