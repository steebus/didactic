import type { Lesson, LessonPrereq } from './types'

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
