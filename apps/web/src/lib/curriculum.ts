import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@didactic/core/config'
import { recomputeAbility } from './scoring'
import type { ExposureDepth } from '@didactic/core/types'
import type { LessonLink } from '@didactic/core/lessonLinks'

// Tiering, availability and progress moved to `@didactic/core`;
// completing a lesson writes an exposure and so stays here. Re-exported
// so `@/lib/curriculum` still answers for both halves.

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

/**
 * How many lessons one lesson may be shown.
 *
 * A reader with a wide subject can hold hundreds; past a point they
 * stop being neighbours and start being the whole catalogue, and the
 * list is also what a body is written against. The near ones come
 * first, so what a ceiling drops is always the furthest.
 */
export const WITHIN_REACH = 240

/**
 * Every lesson a lesson may point at.
 *
 * Its own topic first -- the rest of its route and the other routes
 * through the same ground -- then the topics its subjects hold, which
 * is the "one topic over" the body is already allowed to reach for in
 * the reader's own material. Beyond that is somebody else's subject
 * and not a neighbour.
 *
 * Read fresh every time the lesson is read rather than frozen into the
 * body when it is written: the body is cached on the row and the map
 * under it keeps moving. See `lessonLinks.ts`.
 */
export async function lessonsWithinReach(
  db: SupabaseClient,
  topicId: string,
  /** The lesson doing the pointing, which is not its own neighbour. */
  exclude: string
): Promise<LessonLink[]> {
  const { data: memberships } = await db.from('topic_subjects')
    .select('subject_id').eq('topic_id', topicId)
  const subjectIds = (memberships ?? []).map(m => m.subject_id)

  const { data: siblings } = subjectIds.length
    ? await db.from('topic_subjects').select('topic_id').in('subject_id', subjectIds)
    : { data: [] }

  const topicIds = [...new Set([topicId, ...(siblings ?? []).map(t => t.topic_id)])]

  const [{ data: topics }, { data: curricula }] = await Promise.all([
    db.from('topics').select('id, title').in('id', topicIds),
    db.from('curricula').select('id, topic_id').in('topic_id', topicIds),
  ])

  const titleOf = new Map((topics ?? []).map(t => [t.id, t.title as string]))
  const topicOf = new Map((curricula ?? []).map(c => [c.id, c.topic_id as string]))
  if (topicOf.size === 0) return []

  const { data: lessons } = await db.from('lessons')
    .select('id, title, curriculum_id, position')
    .in('curriculum_id', [...topicOf.keys()])
    .order('position')

  return (lessons ?? [])
    .filter(l => l.id !== exclude)
    .map(l => {
      const under = topicOf.get(l.curriculum_id) ?? null
      return {
        id: l.id as string,
        title: l.title as string,
        topicTitle: under ? titleOf.get(under) ?? null : null,
        here: under === topicId,
      }
    })
    // Near before far, so a name two lessons answer to goes to the one
    // in the reader's own topic and a ceiling only ever drops the
    // furthest away.
    .sort((a, b) => Number(b.here) - Number(a.here))
    .slice(0, WITHIN_REACH)
}
