import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@didactic/core/config'
import { recomputeAbility } from './scoring'
import type { ExposureDepth } from '@didactic/core/types'

// Tiering, availability and progress moved to `@didactic/core`;
// completing a lesson writes an exposure and so stays here. Re-exported
// so `@/lib/curriculum` still answers for both halves.
export * from '@didactic/core/curriculum'

/**
 * Mark a lesson done and record what that taught. Completion is the only
 * thing a curriculum contributes to the map, and it goes through the
 * exposure log like everything else — a lesson cannot set an ability.
 *
 * Depth is the user's own account of how they worked through it, so the
 * consumption ceiling still applies: reading a lesson is `read`, doing
 * its exercises is `applied`.
 */
export async function completeLesson(
  db: SupabaseClient,
  lessonId: string,
  depth: ExposureDepth = 'read'
) {
  const { data: lesson, error } = await db.from('lessons')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', lessonId)
    .select('*')
    .single()
  if (error) throw error

  // Scaffolding lessons — an orientation, a recap — teach no single
  // concept and so move nothing.
  if (!lesson.topic_id) return { exposureWritten: false }

  // The figure before the work, so the page can show what the work was
  // worth. Every number in this app explains itself; the moment one
  // actually moves is the worst possible time to withhold it.
  const { data: before } = await db.from('topics')
    .select('title, ability').eq('id', lesson.topic_id).single()

  await db.from('exposures').insert({
    user_id: lesson.user_id,
    topic_id: lesson.topic_id,
    source: 'lesson',
    source_id: lesson.id,
    depth,
    ability_delta: config.DEPTH_WEIGHTS[depth],
    reason: `${depth === 'applied' ? 'worked through' : 'read'} the lesson "${lesson.title}"`,
  })
  const after = await recomputeAbility(db, lesson.topic_id)

  return {
    exposureWritten: true,
    topicTitle: before?.title ?? null,
    abilityBefore: before ? Number(before.ability) : null,
    abilityAfter: after.ability,
  }
}

/** Undo a completion, including the exposure it wrote. The record stays
 *  honest: an undone lesson taught nothing. */
export async function uncompleteLesson(db: SupabaseClient, lessonId: string) {
  const { data: lesson, error } = await db.from('lessons')
    .update({ completed_at: null })
    .eq('id', lessonId)
    .select('*')
    .single()
  if (error) throw error

  await db.from('exposures').delete().eq('source', 'lesson').eq('source_id', lessonId)
  if (lesson.topic_id) await recomputeAbility(db, lesson.topic_id)

  return { ok: true }
}
