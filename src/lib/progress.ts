/**
 * Route progress: a third channel, beside ability (the viability figure)
 * and freshness (the condition hatch). Those two say how well a topic is
 * held and how warm it is; this one says how far the deliberate route
 * through it has actually been worked.
 *
 * It is derived, never stored — read straight off a topic's curricula and
 * their lessons — so it can never disagree with the lessons printed under
 * it. One shared vocabulary drives the chip on a bed row, the note on a
 * topic sheet, and the growing specimen on every band.
 */

import type { CurriculumStatus } from './types'

export type RouteState = 'no-route' | 'drafted' | 'unstarted' | 'in-progress' | 'worked'

export interface RouteProgress {
  state: RouteState
  complete: number
  total: number
  /** 0–1, complete over total. An empty or unstarted route is 0, never 1:
   *  nothing has been worked. */
  fraction: number
}

interface RouteLike {
  status: CurriculumStatus
  total: number
  complete: number
}

/**
 * The one route a topic is followed through, of however many it carries.
 * An approved route wins, then a draft, then whatever exists — the same
 * order the topic sheet uses, because in practice there is one route and
 * showing it beats naming all of them.
 */
export function pickRoute<T extends { status: CurriculumStatus }>(curricula: T[]): T | null {
  return (
    curricula.find(c => c.status === 'active') ??
    curricula.find(c => c.status === 'draft') ??
    curricula[0] ??
    null
  )
}

export function routeProgress(curricula: RouteLike[]): RouteProgress {
  const route = pickRoute(curricula)
  if (!route) return { state: 'no-route', complete: 0, total: 0, fraction: 0 }

  const { total, complete } = route
  const fraction = total > 0 ? complete / total : 0
  // A draft counts for nothing until it is approved, so it never reads as
  // started however many of its lessons happen to be marked.
  if (route.status !== 'active') return { state: 'drafted', complete, total, fraction }
  if (complete === 0) return { state: 'unstarted', complete, total, fraction }
  if (complete >= total) return { state: 'worked', complete, total, fraction }
  return { state: 'in-progress', complete, total, fraction }
}

/**
 * Fold several topics' routes into one figure for a subject band. The
 * word is derived from the summed lessons the same way a single route
 * derives it, so the band never claims progress its topics do not have.
 * Topics with no route at all are left out of the sum rather than
 * dragging the figure to zero.
 */
export function aggregateRoutes(routes: RouteProgress[]): RouteProgress {
  const withRoute = routes.filter(r => r.state !== 'no-route')
  if (withRoute.length === 0) return { state: 'no-route', complete: 0, total: 0, fraction: 0 }

  const total = withRoute.reduce((sum, r) => sum + r.total, 0)
  const complete = withRoute.reduce((sum, r) => sum + r.complete, 0)
  const fraction = total > 0 ? complete / total : 0

  let state: RouteState
  if (total === 0) state = 'drafted'
  else if (complete === 0) state = 'unstarted'
  else if (complete >= total) state = 'worked'
  else state = 'in-progress'

  return { state, complete, total, fraction }
}

export const ROUTE_LABEL: Record<RouteState, string> = {
  'no-route': 'No route',
  drafted: 'Route drafted',
  unstarted: 'Not started',
  'in-progress': 'In progress',
  worked: 'Worked',
}

/** Least worked first, so a bed can float what is being worked to the
 *  top. Mirrors STOCK_ORDER's worst-first logic on the other channel. */
export const ROUTE_ORDER: RouteState[] = [
  'no-route',
  'drafted',
  'unstarted',
  'in-progress',
  'worked',
]

/**
 * Map progress onto the roots specimen's 0–5 growth, so the plant on a
 * band grows as the route is worked: bare ground with no route, a
 * seedling part way in, in full flower when every lesson is done. The
 * caption carries the real figure, so the plant is never mistaken for a
 * self-reported roots level.
 */
export function routeLevel(p: RouteProgress): number {
  switch (p.state) {
    case 'no-route':
      return 0
    case 'drafted':
    case 'unstarted':
      return 1
    case 'in-progress':
      return Math.max(2, Math.min(4, Math.round(p.fraction * 5)))
    case 'worked':
      return 5
  }
}

/**
 * A progress-specific caption, kept clear of the roots stage names
 * ("Seedling", "In leaf") so the plant on a band never reads as the
 * user's own self-report.
 */
export function routeCaption(p: RouteProgress): string {
  switch (p.state) {
    case 'no-route':
      return 'No route yet'
    case 'drafted':
      return p.total > 0 ? `A ${p.total}-lesson draft` : 'Route drafted'
    case 'unstarted':
      return p.total > 0 ? `0 of ${p.total} worked` : 'Route ready'
    case 'in-progress':
      return `${p.complete} of ${p.total} worked`
    case 'worked':
      return `All ${p.total} worked`
  }
}
