import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'
import { recomputeAbility } from './scoring'
import type { ExposureDepth, Lesson, LessonPrereq } from './types'
import type { LessonLink } from './lessonLinks'

/** Derived at read time, never stored — like freshness. */
export type LessonAvailability = 'complete' | 'available' | 'locked'

export interface LessonView {
  lesson: Lesson
  availability: LessonAvailability
  /** Lessons that must be finished first, in the order they are stored. */
  requires: string[]
  /** How deep into the route this lesson sits: 0 is a starting point. */
  tier: number
}

export interface CurriculumProgress {
  total: number
  complete: number
  /** 0–1. An empty curriculum is 0, not 1: nothing has been learned. */
  fraction: number
}

type PrereqLike = Pick<LessonPrereq, 'lesson_id' | 'requires_lesson_id'>
type LessonLike = Pick<Lesson, 'id' | 'position' | 'completed_at'>

/**
 * Tier a lesson by its longest chain of prerequisites. A linear
 * curriculum tiers 0,1,2…; a branching one puts every genuine starting
 * point at tier 0 and lets branches run at their own depth.
 *
 * Prereqs come from a table with no cycle constraint, and an agent
 * proposing a curriculum can produce one. A lesson caught in a cycle is
 * given the tier it would have had ignoring the back edge rather than
 * hanging the page; `findPrereqCycle` is what surfaces the problem.
 */
export function tierLessons(
  lessons: LessonLike[],
  prereqs: PrereqLike[]
): Map<string, number> {
  const ids = new Set(lessons.map(l => l.id))
  const requires = new Map<string, string[]>()
  for (const p of prereqs) {
    if (!ids.has(p.lesson_id) || !ids.has(p.requires_lesson_id)) continue
    const list = requires.get(p.lesson_id)
    if (list) list.push(p.requires_lesson_id)
    else requires.set(p.lesson_id, [p.requires_lesson_id])
  }

  const tiers = new Map<string, number>()
  const visiting = new Set<string>()

  const tierOf = (id: string): number => {
    const known = tiers.get(id)
    if (known !== undefined) return known
    // A back edge into a lesson already on the stack is a cycle. Treat
    // it as no constraint so the rest of the map still tiers.
    if (visiting.has(id)) return 0
    visiting.add(id)
    const parents = requires.get(id) ?? []
    const tier = parents.length === 0
      ? 0
      : Math.max(...parents.map(tierOf)) + 1
    visiting.delete(id)
    tiers.set(id, tier)
    return tier
  }

  for (const lesson of lessons) tierOf(lesson.id)
  return tiers
}

/**
 * A lesson is available when everything it requires is complete. This is
 * the whole of the branching rule: linear curricula fall out of it
 * because each of their lessons requires exactly the one before.
 */
export function viewLessons(lessons: Lesson[], prereqs: PrereqLike[]): LessonView[] {
  const ids = new Set(lessons.map(l => l.id))
  const complete = new Set(lessons.filter(l => l.completed_at !== null).map(l => l.id))
  const tiers = tierLessons(lessons, prereqs)

  const requires = new Map<string, string[]>()
  for (const p of prereqs) {
    if (!ids.has(p.lesson_id) || !ids.has(p.requires_lesson_id)) continue
    const list = requires.get(p.lesson_id)
    if (list) list.push(p.requires_lesson_id)
    else requires.set(p.lesson_id, [p.requires_lesson_id])
  }

  return [...lessons]
    .sort((a, b) => (tiers.get(a.id)! - tiers.get(b.id)!) || (a.position - b.position))
    .map(lesson => {
      const needs = requires.get(lesson.id) ?? []
      const availability: LessonAvailability = complete.has(lesson.id)
        ? 'complete'
        : needs.every(id => complete.has(id))
          ? 'available'
          : 'locked'
      return { lesson, availability, requires: needs, tier: tiers.get(lesson.id)! }
    })
}

export function curriculumProgress(lessons: Array<{ completed_at: string | null }>): CurriculumProgress {
  const total = lessons.length
  const complete = lessons.filter(l => l.completed_at !== null).length
  return { total, complete, fraction: total === 0 ? 0 : complete / total }
}

/**
 * Return one cycle in the prerequisite graph, or null. A curriculum with
 * a cycle has lessons that can never become available, so it is shown to
 * the user for a decision rather than saved as a plan.
 */
export function findPrereqCycle(prereqs: PrereqLike[]): string[] | null {
  const requires = new Map<string, string[]>()
  for (const p of prereqs) {
    const list = requires.get(p.lesson_id)
    if (list) list.push(p.requires_lesson_id)
    else requires.set(p.lesson_id, [p.requires_lesson_id])
  }

  const done = new Set<string>()
  const stack: string[] = []
  const onStack = new Set<string>()

  const walk = (id: string): string[] | null => {
    if (onStack.has(id)) return [...stack.slice(stack.indexOf(id)), id]
    if (done.has(id)) return null
    stack.push(id)
    onStack.add(id)
    for (const parent of requires.get(id) ?? []) {
      const cycle = walk(parent)
      if (cycle) return cycle
    }
    stack.pop()
    onStack.delete(id)
    done.add(id)
    return null
  }

  for (const id of requires.keys()) {
    const cycle = walk(id)
    if (cycle) return cycle
  }
  return null
}

/** Chain every lesson to the one before it, which is what makes a
 *  curriculum linear. Returns rows ready for `lesson_prereqs`. */
export function linearPrereqs(lessonIds: string[]): PrereqLike[] {
  return lessonIds.slice(1).map((id, i) => ({
    lesson_id: id,
    requires_lesson_id: lessonIds[i],
  }))
}

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
