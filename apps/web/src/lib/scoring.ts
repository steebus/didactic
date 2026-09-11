import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAbility } from '@didactic/core/scoring'
import type { Exposure } from '@didactic/core/types'

// The maths moved to `@didactic/core`; what stays here is the writing,
// which needs a database client and so cannot follow it. Callers of the
// pure half read the package directly.

/**
 * The ONLY function permitted to write topics.ability. Ability is a
 * cache over the exposure log, never a directly-set value.
 */
export async function recomputeAbility(db: SupabaseClient, topicId: string) {
  const { data: exposures, error } = await db
    .from('exposures').select('*').eq('topic_id', topicId)
  if (error) throw error

  const { ability, confidence } = computeAbility(exposures ?? [])
  const lastExposure = (exposures ?? [])
    .map((e: Exposure) => e.created_at).sort().at(-1) ?? null

  const { error: updateError } = await db.from('topics').update({
    ability,
    ability_confidence: confidence,
    last_exposure_at: lastExposure,
  }).eq('id', topicId)
  if (updateError) throw updateError

  return { ability, confidence }
}

/**
 * The same thing for a set of topics, in two round trips rather than
 * two per topic.
 *
 * Laying out a bed of twenty topics one at a time meant forty queries
 * in series behind an LLM call, which is what pushed the sowing past
 * the platform's function timeout. The rule is unchanged: ability is
 * still computed from the exposure log and written nowhere else.
 */
export async function recomputeAbilities(db: SupabaseClient, topicIds: string[]) {
  if (topicIds.length === 0) return

  const { data: exposures, error } = await db
    .from('exposures').select('*').in('topic_id', topicIds)
  if (error) throw error

  const byTopic = new Map<string, Exposure[]>()
  for (const exposure of (exposures ?? []) as Exposure[]) {
    const list = byTopic.get(exposure.topic_id)
    if (list) list.push(exposure)
    else byTopic.set(exposure.topic_id, [exposure])
  }

  await Promise.all(
    topicIds.map(async topicId => {
      const own = byTopic.get(topicId) ?? []
      const { ability, confidence } = computeAbility(own)
      const lastExposure = own.map(e => e.created_at).sort().at(-1) ?? null
      const { error: updateError } = await db.from('topics').update({
        ability,
        ability_confidence: confidence,
        last_exposure_at: lastExposure,
      }).eq('id', topicId)
      if (updateError) throw updateError
    })
  )
}
