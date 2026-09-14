import { config } from './config'
import type { Exposure } from './types'

const FLOOR = 1.0
const MAX = 5.0

export function computeAbility(exposures: Exposure[]): { ability: number; confidence: number } {
  if (exposures.length === 0) return { ability: FLOOR, confidence: 0 }

  // All exposure counts toward the consumption band; applied work counts
  // there too AND additionally unlocks the band above the ceiling.
  // Applied work is still exposure, so it must never score below a read.
  let totalWeight = 0
  let appliedWeight = 0
  for (const e of exposures) {
    const w = config.DEPTH_WEIGHTS[e.depth]
    totalWeight += w
    if (e.depth === 'applied') appliedWeight += w
  }

  // Log curve: diminishing returns. The tenth article moves far less
  // than the first.
  const curve = (w: number) => Math.log1p(w) / Math.log1p(10)

  const consumptionHeadroom = config.CONSUMPTION_CEILING - FLOOR
  const appliedHeadroom = MAX - config.CONSUMPTION_CEILING

  const fromConsumption = Math.min(curve(totalWeight), 1) * consumptionHeadroom
  const fromApplied = Math.min(curve(appliedWeight), 1) * appliedHeadroom

  const ability = Math.min(MAX, FLOOR + fromConsumption + fromApplied)

  // Confidence grows with count and with depth diversity: one skim
  // yields a low-confidence guess, not a confident one.
  const distinctDepths = new Set(exposures.map(e => e.depth)).size
  const countTerm = Math.min(exposures.length / 10, 1)
  // Over the kinds of engagement there are, rather than over a literal
  // three: adding 'marked' made a hard-coded divisor able to exceed
  // one, which would have let highlights alone report full confidence.
  const diversityTerm = distinctDepths / Object.keys(config.DEPTH_WEIGHTS).length
  let confidence = Math.min(1, 0.7 * countTerm + 0.3 * diversityTerm)

  // A struggle since the last real exposure holds the figure open.
  //
  // Weight zero keeps a struggle from adding ability, but on its own it
  // would make the app *more* sure rather than less: it is one more
  // exposure of one more kind, so both terms above go up. That is
  // exactly backwards. Someone writing that a topic is not landing has
  // told the app its figure is wrong, and the figure should say so.
  //
  // So a struggle that nothing has answered yet clamps confidence under
  // CONFIDENT_ENOUGH, which is where every sheet starts printing a
  // topic as vague. Not a subtraction from ability: the reading
  // happened and erasing it would be its own kind of lie. What changes
  // is the app's claim to know -- which is the thing that was actually
  // wrong.
  //
  // "Since the last real exposure" is what makes it clear on its own.
  // Read the thing again, apply it, answer a question about it, and the
  // struggle is history rather than the current state; write another
  // entry saying it still is not landing and it clamps again. Nobody
  // has to go and mark anything resolved.
  if (struggling(exposures)) confidence = Math.min(confidence, config.STRUGGLING_CONFIDENCE)

  return {
    ability: Math.round(ability * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
  }
}

/**
 * Whether the most recent thing this topic has to say is that it is not
 * landing.
 *
 * Read in date order rather than by counting: three struggles followed
 * by a close read is a topic someone has since got to grips with, and
 * a tally would still be calling it shaky.
 */
function struggling(exposures: Exposure[]): boolean {
  let latest: Exposure | null = null
  for (const e of exposures) {
    // Only real engagement answers a struggle. Keeping a passage is
    // evidence you were there, not evidence you have got it, and
    // neither is answering one question -- a reader who says a topic
    // is not landing and then highlights a sentence of it has not
    // resolved anything. A skim is the lightest thing that counts.
    if (e.depth !== 'struggled' && config.DEPTH_WEIGHTS[e.depth] < config.DEPTH_WEIGHTS.skim) {
      continue
    }
    if (!latest || e.created_at > latest.created_at) latest = e
  }
  return latest?.depth === 'struggled'
}

export function computeFreshness(
  lastExposureAt: string | null,
  ability: number,
  now: Date = new Date()
): number {
  if (!lastExposureAt) return 0
  const days = (now.getTime() - new Date(lastExposureAt).getTime()) / 86_400_000
  if (days <= 0) return 1

  // Better-known material fades more slowly.
  const halfLife = config.FRESHNESS_HALF_LIFE_DAYS * (1 + (ability - 1) / 4)
  const freshness = Math.exp((-days * Math.LN2) / halfLife)
  return Math.max(0, Math.min(1, freshness))
}

export function subjectAggregate(
  topics: Array<{ ability: number; freshness: number; state: string }>
): { ability: number; freshness: number } {
  const active = topics.filter(t => t.state === 'active')
  if (active.length === 0) return { ability: 0, freshness: 0 }

  const ability = active.reduce((s, n) => s + n.ability, 0) / active.length

  // Weight toward the worst: a subject must not look healthy because
  // two hot topics mask twenty cold ones. Power mean with p < 1 pulls
  // the result down toward the minimum.
  const p = 0.3
  const powerMean = Math.pow(
    active.reduce((s, n) => s + Math.pow(n.freshness, p), 0) / active.length,
    1 / p
  )

  return {
    ability: Math.round(ability * 100) / 100,
    freshness: Math.round(powerMean * 100) / 100,
  }
}

/**
 * Ability (1-5) as the percentage the sheet prints. An empty subject
 * aggregates to 0, below the floor, so the figure is clamped rather
 * than printing a negative percentage.
 */
export function viabilityFigure(ability: number) {
  return Math.max(0, Math.round(((ability - 1) / 4) * 100))
}

/**
 * Whether a figure should be printed as a guess rather than a number.
 *
 * One line, in one place, because five surfaces draw this state and
 * each of them used to carry its own `< 0.4`. A threshold spelled out
 * five times is a threshold that moves in four of them.
 *
 * It is also the line a struggle holds a topic under, so the clamp in
 * `computeAbility` and the sheets that read the result cannot drift
 * apart: change `CONFIDENT_ENOUGH` and both follow.
 */
export function vagueFigure(confidence: number): boolean {
  return confidence < config.CONFIDENT_ENOUGH
}
