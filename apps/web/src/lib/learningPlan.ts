import type { SupabaseClient } from '@supabase/supabase-js'
import {
  entryBody,
  type LearningPlan,
  type PlanEntry,
  type PlanQualifier,
} from '@didactic/core/learningPlan'

export * from '@didactic/core/learningPlan'

/**
 * The writing half of the learning plan.
 *
 * The pure half -- what the document is and how it reads -- is in
 * `@didactic/core/learningPlan`, because the phone prints it on the
 * course sheet. This is the part that talks to the database, and it
 * follows the rule the rest of `src/lib` follows: the reader is
 * re-exported through here so a caller has one import.
 *
 * Every function is deliberately unfailing. The plan is a context
 * thread, not a record anyone's work depends on: a course whose plan
 * could not be written is a course that still exists, and a lesson
 * whose summary could not be appended is a lesson that was still
 * written. Losing the whole of either over the document about them
 * would be the tail wagging the dog.
 */

interface PlanRow {
  curriculum_id: string
  reasoning: string | null
  qualifiers: unknown
  entries: unknown
  updated_at: string | null
}

function readRow(row: PlanRow): LearningPlan {
  return {
    curriculumId: row.curriculum_id,
    reasoning: row.reasoning,
    // Both columns are jsonb the database does not police the shape of.
    // Anything that is not the expected shape is dropped rather than
    // passed on: a malformed entry would otherwise reach a system
    // prompt as `[object Object]`.
    qualifiers: Array.isArray(row.qualifiers)
      ? (row.qualifiers as unknown[]).flatMap(q => {
          const o = (q ?? {}) as Record<string, unknown>
          if (typeof o.prompt !== 'string') return []
          return [{
            prompt: o.prompt,
            level: typeof o.level === 'number' ? o.level : 0,
            answer: typeof o.answer === 'string' ? o.answer : null,
          } satisfies PlanQualifier]
        })
      : [],
    entries: Array.isArray(row.entries)
      ? (row.entries as unknown[]).flatMap(e => {
          const o = (e ?? {}) as Record<string, unknown>
          if (typeof o.body !== 'string' || !o.body.trim()) return []
          return [{
            at: typeof o.at === 'string' ? o.at : '',
            by: o.by === 'user' ? 'user' : 'ai',
            kind: o.kind === 'note' ? 'note' : 'lesson',
            ref: typeof o.ref === 'string' ? o.ref : null,
            body: o.body,
          } satisfies PlanEntry]
        })
      : [],
    updatedAt: row.updated_at,
  }
}

/**
 * The plan for a course, or null.
 *
 * Null covers three different things -- no such course, a course
 * drafted before plans existed, and a read that failed -- and the
 * callers all want the same thing from all three, which is to carry on
 * without one. The distinction that does matter, a plan that exists but
 * says nothing, is `planIsEmpty`'s to make.
 */
export async function readPlan(
  db: SupabaseClient,
  curriculumId: string
): Promise<LearningPlan | null> {
  const { data, error } = await db
    .from('curriculum_plans')
    .select('curriculum_id, reasoning, qualifiers, entries, updated_at')
    .eq('curriculum_id', curriculumId)
    .maybeSingle()

  if (error || !data) return null
  return readRow(data as PlanRow)
}

/**
 * The qualifying answers a course should be planned against.
 *
 * Taken from the sowing of the subjects the topic sits under, and
 * snapshotted into the plan rather than read through to. `017` holds
 * them at the subject level and they move: the reader can sow the same
 * subject again and answer differently, and a course planned a year ago
 * would then silently re-read itself as though it had always been
 * planned for the person they are now.
 *
 * A topic in two subjects has two sowings and takes both. They are
 * answers about the same reader, and the course sits in both beds.
 */
export async function qualifiersForTopic(
  db: SupabaseClient,
  topicId: string
): Promise<PlanQualifier[]> {
  const { data: memberships } = await db
    .from('topic_subjects')
    .select('subject_id')
    .eq('topic_id', topicId)

  const subjectIds = (memberships ?? []).map(m => (m as { subject_id: string }).subject_id)
  if (subjectIds.length === 0) return []

  const { data: sowings } = await db
    .from('subject_sowings')
    .select('qualifiers')
    .in('subject_id', subjectIds)

  const out: PlanQualifier[] = []
  const seen = new Set<string>()

  for (const sowing of (sowings ?? []) as Array<{ qualifiers: unknown }>) {
    if (!Array.isArray(sowing.qualifiers)) continue
    for (const raw of sowing.qualifiers as unknown[]) {
      const o = (raw ?? {}) as Record<string, unknown>
      const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : ''
      const answer = typeof o.answer === 'string' ? o.answer.trim() : ''
      // Unanswered ones are dropped here rather than at print time:
      // they are not evidence about the reader, and carrying them makes
      // the snapshot look fuller than it is.
      if (!prompt || !answer || seen.has(prompt)) continue
      seen.add(prompt)
      out.push({
        prompt,
        level: typeof o.level === 'number' ? o.level : 0,
        answer,
      })
    }
  }

  return out
}

/**
 * Open the plan for a course that has just been drafted.
 *
 * `upsert` rather than `insert`, so a course redrafted over the top of
 * itself gets its reasoning replaced rather than failing on the primary
 * key -- and so this is safe to call twice, which matters because it is
 * called from a route that can be retried.
 *
 * The entries are deliberately not touched. A redraft changes why the
 * course is shaped as it is; it does not un-write the lessons already
 * logged, and an agent that later reads "this was redrafted and here is
 * what had already been covered" is better informed than one handed a
 * blank log.
 */
export async function openPlan(
  db: SupabaseClient,
  input: {
    curriculumId: string
    userId: string
    reasoning: string | null
    qualifiers: PlanQualifier[]
  }
): Promise<void> {
  const { error } = await db.from('curriculum_plans').upsert(
    {
      curriculum_id: input.curriculumId,
      user_id: input.userId,
      reasoning: input.reasoning?.trim() || null,
      qualifiers: input.qualifiers,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'curriculum_id' }
  )

  if (error) {
    console.error(`learningPlan: could not open the plan for ${input.curriculumId}`, error)
  }
}

/**
 * Add one line to the log.
 *
 * Through `append_plan_entry` rather than a read-modify-write, because
 * two lesson agents finishing at once would each read the log, add
 * their line to what they read, and write back -- and the second write
 * would drop the first agent's line without anything noticing. The
 * function appends inside a single statement, which cannot.
 *
 * Returns whether the line landed, for the one caller that wants to
 * say so. Everything else can ignore it: a missing entry costs the next
 * agent some context, not the lesson.
 */
export async function appendEntry(
  db: SupabaseClient,
  curriculumId: string,
  entry: {
    by: PlanEntry['by']
    kind: PlanEntry['kind']
    ref?: string | null
    body: string | null | undefined
  }
): Promise<boolean> {
  const body = entryBody(entry.body)
  if (!body) return false

  const { error } = await db.rpc('append_plan_entry', {
    p_curriculum_id: curriculumId,
    p_entry: { by: entry.by, kind: entry.kind, ref: entry.ref ?? null, body },
  })

  if (error) {
    console.error(`learningPlan: could not append to the plan for ${curriculumId}`, error)
    return false
  }
  return true
}

/**
 * Replace the reasoning, which is the half a reader edits.
 *
 * The log is not editable through here and is not meant to be: it is a
 * record of what was actually written, and a record anyone can rewrite
 * is not one. A reader who disagrees with it adds a note saying so,
 * which is what `appendEntry` with `by: 'user'` is for.
 */
export async function reviseReasoning(
  db: SupabaseClient,
  curriculumId: string,
  reasoning: string
): Promise<boolean> {
  const { error } = await db
    .from('curriculum_plans')
    .update({ reasoning: reasoning.trim() || null, updated_at: new Date().toISOString() })
    .eq('curriculum_id', curriculumId)

  return !error
}
