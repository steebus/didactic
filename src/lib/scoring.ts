import type { SupabaseClient } from '@supabase/supabase-js'
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
  const diversityTerm = distinctDepths / 3
  const confidence = Math.min(1, 0.7 * countTerm + 0.3 * diversityTerm)

  return {
    ability: Math.round(ability * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
  }
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

export function clusterAggregate(
  nodes: Array<{ ability: number; freshness: number; state: string }>
): { ability: number; freshness: number } {
  const active = nodes.filter(n => n.state === 'active')
  if (active.length === 0) return { ability: 0, freshness: 0 }

  const ability = active.reduce((s, n) => s + n.ability, 0) / active.length

  // Weight toward the worst: a cluster must not look healthy because
  // two hot nodes mask twenty cold ones. Power mean with p < 1 pulls
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
 * The ONLY function permitted to write nodes.ability. Ability is a
 * cache over the exposure log, never a directly-set value.
 */
export async function recomputeAbility(db: SupabaseClient, nodeId: string) {
  const { data: exposures, error } = await db
    .from('exposures').select('*').eq('node_id', nodeId)
  if (error) throw error

  const { ability, confidence } = computeAbility(exposures ?? [])
  const lastExposure = (exposures ?? [])
    .map((e: Exposure) => e.created_at).sort().at(-1) ?? null

  const { error: updateError } = await db.from('nodes').update({
    ability,
    ability_confidence: confidence,
    last_exposure_at: lastExposure,
  }).eq('id', nodeId)
  if (updateError) throw updateError

  return { ability, confidence }
}
