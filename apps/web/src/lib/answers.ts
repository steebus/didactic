import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@didactic/core/config'
import { recomputeAbility } from './scoring'

/**
 * Record that a question inside a lesson was answered, and pay for it
 * if it was right.
 *
 * The whole design rests on the first answer being the only one that
 * counts, and that is the database's job rather than this function's: a
 * unique index on (user, lesson, question) means two presses racing each
 * other cannot both read "not answered yet" and both write. So the
 * insert is attempted and a conflict is the answer, not an error.
 *
 * A wrong answer is written too. It costs nothing -- a question you got
 * wrong and then understood is the one that taught you something -- but
 * it is the reader's own record of what they have been asked, and it
 * closes the question so that reading the explanation and then picking
 * the right one does not pay.
 */
export async function recordAnswer(
  db: SupabaseClient,
  {
    userId,
    lessonId,
    questionKey,
    correct,
  }: { userId: string; lessonId: string; questionKey: string; correct: boolean }
): Promise<{
  /** Whether this was the first answer, and so whether it counted. */
  counted: boolean
  /** Written only for a first answer that was right. */
  exposureWritten: boolean
  topicTitle: string | null
  abilityBefore: number | null
  abilityAfter: number | null
}> {
  const nothing = {
    counted: false,
    exposureWritten: false,
    topicTitle: null,
    abilityBefore: null,
    abilityAfter: null,
  }

  const { data: written, error } = await db
    .from('lesson_answers')
    .insert({
      user_id: userId,
      lesson_id: lessonId,
      question_key: questionKey,
      correct,
    })
    // Nothing comes back on a conflict, which is how a second answer is
    // recognised without a read of its own.
    .select('id')
    .maybeSingle()

  // 23505 is a unique violation: this question has been answered before.
  // Anything else is a real failure and is the caller's to report.
  if (error) {
    if (error.code === '23505') return nothing
    throw error
  }
  if (!written) return nothing
  if (!correct) return { ...nothing, counted: true }

  const { data: lesson } = await db
    .from('lessons')
    .select('user_id, title, topic_id')
    .eq('id', lessonId)
    .single()

  // Scaffolding lessons -- an orientation, a recap -- teach no single
  // concept and so move nothing, exactly as completing one does not.
  if (!lesson?.topic_id) return { ...nothing, counted: true }

  const { data: before } = await db
    .from('topics')
    .select('title, ability')
    .eq('id', lesson.topic_id)
    .single()

  await db.from('exposures').insert({
    user_id: lesson.user_id,
    topic_id: lesson.topic_id,
    // 'quiz' has been in the enum since the first migration and has
    // never had anything to write it. This is what it was for.
    source: 'quiz',
    source_id: lessonId,
    depth: 'answered',
    ability_delta: config.DEPTH_WEIGHTS.answered,
    reason: `answered a question in "${lesson.title}" correctly`,
  })

  const after = await recomputeAbility(db, lesson.topic_id)

  return {
    counted: true,
    exposureWritten: true,
    topicTitle: before?.title ?? null,
    abilityBefore: before ? Number(before.ability) : null,
    abilityAfter: after.ability,
  }
}

/**
 * Which of a lesson's questions have already been answered.
 *
 * The page needs this on open, or a question answered yesterday reads
 * as fresh today and the reader is told it counted when it did not.
 */
export async function answeredIn(
  db: SupabaseClient,
  userId: string,
  lessonId: string
): Promise<Record<string, boolean>> {
  const { data } = await db
    .from('lesson_answers')
    .select('question_key, correct')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)

  return Object.fromEntries((data ?? []).map(r => [r.question_key, r.correct]))
}
