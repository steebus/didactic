import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cloze, ClozeCard, ClozeCount } from '@didactic/core/clozes'
import { memoryColumns, memoryOf } from '@didactic/core/clozes'
import { freshMemory, review, type Rating } from '@didactic/core/fsrs'
import { proposeClozes } from './llm/clozes'

/**
 * The garden: what is planted when a lesson is worked, and what is
 * pulled up to be tended.
 *
 * The reading half of this is deliberately dull -- a due list is an
 * index scan, and the whole feature rests on the tally in the nav being
 * cheap enough to print on every sheet. The writing half is where the
 * care is: a cloze is written once, from a body that may be rewritten
 * afterwards, so everything a card needs to be answered has to be on
 * its own row by the time this returns.
 */

/** How much of the text before a passage is kept to tell two apart. */
const PREFIX_CHARS = 40

/** The columns a card is read with, everywhere it is read. */
const CARD_COLUMNS = `
  *,
  concept:cloze_concepts (id, name, gist),
  lesson:lessons (id, title),
  topic:topics (id, title)
`

/** Ratings, as the four words the `cloze_rating` enum holds. */
const RATING_WORDS = ['again', 'hard', 'good', 'easy'] as const

export const ratingWord = (rating: Rating) => RATING_WORDS[rating - 1]

/**
 * The text that came just before a passage in the lesson.
 *
 * Same job as a highlight's prefix and the same forty characters: it is
 * what tells two identical sentences apart when the cloze is drawn back
 * onto the prose. Computed against whitespace-collapsed text, because
 * that is what `paintMarks` searches.
 */
export function prefixFor(body: string, text: string): string | null {
  const flat = body.replace(/\s+/g, ' ')
  const at = flat.indexOf(text.replace(/\s+/g, ' ').trim())
  if (at <= 0) return null
  const prefix = flat.slice(Math.max(0, at - PREFIX_CHARS), at)
  return prefix.trim() || null
}

/** Where a lesson sits, for the denormalised topic on every row. */
async function topicOf(db: SupabaseClient, lessonId: string) {
  const { data } = await db
    .from('lessons')
    .select('id, title, body, curriculum_id, curricula (topic_id)')
    .eq('id', lessonId)
    .single()
  if (!data) return null

  const curriculum = data.curricula as { topic_id: string } | { topic_id: string }[] | null
  const topicId = Array.isArray(curriculum) ? curriculum[0]?.topic_id : curriculum?.topic_id

  return {
    id: data.id as string,
    title: data.title as string,
    body: (data.body as string | null) ?? '',
    topicId: (topicId as string | undefined) ?? null,
  }
}

export interface Sown {
  /** Concepts written this time. Empty when there was nothing to plant. */
  concepts: Array<{ id: string; name: string; clozes: number }>
  /** How many cards are now standing against the lesson, in total. */
  total: number
  /** Said when the lesson was already tended and nothing was asked of
   *  the model. The ordinary case on a second visit. */
  already: boolean
}

/**
 * Plant the trackers for a lesson.
 *
 * Idempotent by default, and that is the whole design of it: this is
 * fired by marking a lesson worked, and a lesson is marked worked,
 * un-marked and marked again. Finding concepts already standing, it
 * says so and asks the model nothing -- otherwise every second press
 * would be another model call and another four cards over the same
 * sentences, and the garden would fill with duplicates faster than
 * anyone could tend it.
 *
 * `regenerate` is the reader asking for the lesson to be read again,
 * which replaces the agent's concepts and their clozes. Anything the
 * reader made by hand is left alone -- it belongs to no concept, and
 * they did not ask for their own work to be thrown away.
 */
export async function sowClozes(
  db: SupabaseClient,
  userId: string,
  lessonId: string,
  { regenerate = false }: { regenerate?: boolean } = {}
): Promise<Sown> {
  const lesson = await topicOf(db, lessonId)
  if (!lesson) throw new Error('That lesson is not there.')
  if (!lesson.body.trim()) throw new Error('That lesson has not been written yet.')

  const { data: standing } = await db
    .from('cloze_concepts')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('user_id', userId)

  if ((standing?.length ?? 0) > 0 && !regenerate) {
    return { concepts: [], total: await countFor(db, userId, lessonId), already: true }
  }

  const proposed = await proposeClozes(lesson.title, lesson.body)

  // Only now, once the model has answered with something usable. Doing
  // it first would mean a failed call left the lesson with nothing
  // where it had something.
  if (regenerate && (standing?.length ?? 0) > 0) {
    // The clozes go with the concepts by cascade (035, where it became
    // true: 034 filed `concept_id` as `set null`, so this left every
    // old card standing and wrote the new set alongside it -- the one
    // path that exists to replace a lesson's cards doubled them).
    // A cloze the reader made by hand belongs to no concept and is
    // untouched, which is the other half of what this means.
    await db.from('cloze_concepts').delete().eq('lesson_id', lessonId).eq('user_id', userId)
  }

  const now = new Date()
  const written: Sown['concepts'] = []

  for (const [position, concept] of proposed.entries()) {
    const { data: row, error } = await db
      .from('cloze_concepts')
      .insert({
        user_id: userId,
        lesson_id: lessonId,
        topic_id: lesson.topicId,
        name: concept.name,
        gist: concept.gist || null,
        position,
        created_by: 'ai',
      })
      .select('id')
      .single()
    if (error || !row) continue

    const rows = concept.clozes.map(cloze => {
      const start = cloze.text.indexOf(cloze.blank)
      return {
        user_id: userId,
        concept_id: row.id,
        lesson_id: lessonId,
        topic_id: lesson.topicId,
        text: cloze.text,
        prefix: prefixFor(lesson.body, cloze.text),
        blank: cloze.blank,
        blank_start: start,
        blank_end: start + cloze.blank.length,
        hint: cloze.hint ?? null,
        created_by: 'ai' as const,
        ...memoryColumns(freshMemory(now)),
      }
    })

    const { data: planted } = await db.from('clozes').insert(rows).select('id')
    written.push({ id: row.id, name: concept.name, clozes: planted?.length ?? 0 })
  }

  return { concepts: written, total: await countFor(db, userId, lessonId), already: false }
}

async function countFor(db: SupabaseClient, userId: string, lessonId: string) {
  const { count } = await db
    .from('clozes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
  return count ?? 0
}

/** Which clozes a scope covers. Every read below takes the same shape. */
export interface Scope {
  subjectId?: string | null
  topicId?: string | null
  lessonId?: string | null
}

/**
 * Narrow a query to a subject, a topic or a lesson.
 *
 * A subject is the one that costs a second query: a cloze carries the
 * topic it was taken under, and which subjects hold that topic is a
 * join table. Resolved to a list of topic ids rather than joined in the
 * select, because PostgREST's inner-join filter would change the shape
 * of every row for the sake of one optional filter.
 */
async function within(db: SupabaseClient, scope: Scope): Promise<string[] | null> {
  if (!scope.subjectId) return null
  const { data } = await db
    .from('topic_subjects')
    .select('topic_id')
    .eq('subject_id', scope.subjectId)
  return (data ?? []).map(r => r.topic_id as string)
}

/**
 * What is due, oldest first.
 *
 * Oldest rather than newest because an overdue card is the one the
 * schedule is most wrong about, and the sooner it is answered the
 * sooner the schedule stops being wrong. A limit is always applied:
 * a reader who has been away for a month has several hundred due and
 * wants a sitting, not a backlog.
 */
export async function dueClozes(
  db: SupabaseClient,
  userId: string,
  scope: Scope = {},
  limit = 40
): Promise<ClozeCard[]> {
  let query = db
    .from('clozes')
    .select(CARD_COLUMNS)
    .eq('user_id', userId)
    .lte('due', new Date().toISOString())
    .order('due', { ascending: true })
    .limit(limit)

  if (scope.lessonId) query = query.eq('lesson_id', scope.lessonId)
  if (scope.topicId) query = query.eq('topic_id', scope.topicId)

  const topics = await within(db, scope)
  if (topics) {
    if (topics.length === 0) return []
    query = query.in('topic_id', topics)
  }

  const { data } = await query
  return (data ?? []) as unknown as ClozeCard[]
}

/**
 * One cloze at random, due or not.
 *
 * The other way in: a reader with nothing due who wants to turn
 * something over anyway. Randomness is done in the application over a
 * page of ids rather than in Postgres, because `order by random()` is a
 * full sort of the table on every press and the alternatives
 * (`tablesample`, a random cursor) are worse for a table this size and
 * wrong for one that is filtered.
 */
export async function randomCloze(
  db: SupabaseClient,
  userId: string,
  scope: Scope = {}
): Promise<ClozeCard | null> {
  let ids = db.from('clozes').select('id').eq('user_id', userId).limit(2000)

  if (scope.lessonId) ids = ids.eq('lesson_id', scope.lessonId)
  if (scope.topicId) ids = ids.eq('topic_id', scope.topicId)

  const topics = await within(db, scope)
  if (topics) {
    if (topics.length === 0) return null
    ids = ids.in('topic_id', topics)
  }

  const { data: pool } = await ids
  if (!pool || pool.length === 0) return null

  const chosen = pool[Math.floor(Math.random() * pool.length)].id as string
  const { data } = await db.from('clozes').select(CARD_COLUMNS).eq('id', chosen).single()
  return (data ?? null) as unknown as ClozeCard | null
}

/** Every cloze taken from one lesson, for drawing them on its prose. */
export async function clozesIn(
  db: SupabaseClient,
  userId: string,
  lessonId: string
): Promise<ClozeCard[]> {
  const { data } = await db
    .from('clozes')
    .select(CARD_COLUMNS)
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as ClozeCard[]
}

/**
 * What is waiting.
 *
 * Three counts on one index, because this is printed in the running
 * head of every sheet in the catalogue. `next` is what lets the sheet
 * say when there will be something rather than only that there is
 * nothing, which is the difference between an empty garden and a
 * tended one.
 */
export async function countClozes(
  db: SupabaseClient,
  userId: string
): Promise<ClozeCount> {
  const now = new Date().toISOString()

  const [{ count: due }, { count: total }, { data: soonest }] = await Promise.all([
    db
      .from('clozes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('due', now),
    db.from('clozes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db
      .from('clozes')
      .select('due')
      .eq('user_id', userId)
      .gt('due', now)
      .order('due', { ascending: true })
      .limit(1),
  ])

  return {
    due: due ?? 0,
    total: total ?? 0,
    next: soonest?.[0]?.due ?? null,
  }
}

export interface Answered {
  cloze: Cloze
  /** Days until it is wanted again, for telling the reader. */
  intervalDays: number
  /** How likely they were to hold it, just before they answered. */
  retrievability: number
}

/**
 * Answer a cloze, and write down both what it did and that it happened.
 *
 * The row is moved and the log is appended, in that order. If the log
 * write fails the schedule is still right, which is the way round that
 * matters: a missing log line costs a future refitting, a missing
 * schedule move costs the reader the same card again in a minute.
 */
export async function answerCloze(
  db: SupabaseClient,
  userId: string,
  clozeId: string,
  rating: Rating,
  now: Date = new Date()
): Promise<Answered> {
  const { data: before } = await db
    .from('clozes')
    .select('*')
    .eq('id', clozeId)
    .eq('user_id', userId)
    .single()
  if (!before) throw new Error('That cloze is not there.')

  const cloze = before as Cloze
  const done = review(memoryOf(cloze), rating, now)

  const { data: after, error } = await db
    .from('clozes')
    .update({ ...memoryColumns(done.memory), updated_at: now.toISOString() })
    .eq('id', clozeId)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error

  await db.from('cloze_reviews').insert({
    user_id: userId,
    cloze_id: clozeId,
    rating: ratingWord(rating),
    elapsed_days: done.elapsedDays,
    retrievability: done.retrievability,
    stability_before: cloze.stability,
    difficulty_before: cloze.difficulty,
    stability_after: done.memory.stability,
    difficulty_after: done.memory.difficulty,
    state_after: done.memory.state,
    due_after: done.memory.due,
    reviewed_at: now.toISOString(),
  })

  return {
    cloze: after as Cloze,
    intervalDays: done.intervalDays,
    retrievability: done.retrievability,
  }
}
