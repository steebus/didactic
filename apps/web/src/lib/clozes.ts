import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cloze, ClozeCard, ClozeCount } from '@didactic/core/clozes'
import { cardFront, cardTruth, memoryColumns, memoryOf, shuffled } from '@didactic/core/clozes'
import { freshMemory, review, type Rating } from '@didactic/core/fsrs'
import { proposeClozes, readingNote, type ProposedCard } from './llm/clozes'

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
  /**
   * Why a reading planted nothing, where it planted nothing.
   *
   * A reading that comes to nothing has several quite different causes
   * and they want opposite fixes: the model found no concepts, it wrote
   * cards that every rule refused, they were all already asked, or the
   * database would not take them. All four used to arrive at the reader
   * as one sentence -- "already asked every way it can be" -- which the
   * app had no way of knowing and which was, on the reading that
   * prompted this, false. Null when cards were planted and there is
   * nothing to explain.
   */
  note?: string | null
}

/**
 * A card as anything that writes one holds it.
 *
 * The model's proposal, plus the one thing only a client sends: where
 * inside the passage the reader's selection started. Held together so
 * that the three places a card is written -- sown, made by hand,
 * rewritten -- go through one function and cannot drift apart.
 */
export type WritableCard = ProposedCard & { blankStart?: number }

/**
 * The columns a card is written from, whatever shape it is.
 *
 * One function rather than a branch at each call site, because a card
 * is written in three places -- sown from a lesson, made by hand, and
 * rewritten -- and a kind that sets its columns differently in one of
 * them is a row the database's `clozes_shape` refuses at the third
 * attempt, in production, on a Sunday.
 *
 * A standard card carries nulls where a cloze carries its passage, and
 * the other way about. That is what the constraint checks and what
 * every reader of a row may therefore assume.
 */
export function cardColumns(card: WritableCard, body = ''): {
  kind: ProposedCard['kind']
  text: string | null
  blank: string | null
  blank_start: number | null
  blank_end: number | null
  question: string | null
  answer: string | null
  note: string | null
  anchor: string | null
  prefix: string | null
  hint: string | null
} {
  const anchor = card.anchor?.trim() || null
  const cloze = card.kind === 'cloze'
  const text = card.text ?? ''
  const blank = card.blank ?? ''
  // `blankStart` is a hint and never taken on trust: it settles a word
  // that appears twice in one sentence, and it is wrong whenever it
  // came off a selection in the rendered prose rather than out of the
  // passage stored beside it.
  const start = !cloze
    ? -1
    : card.blankStart !== undefined &&
        text.slice(card.blankStart, card.blankStart + blank.length) === blank
      ? card.blankStart
      : text.indexOf(blank)

  return {
    kind: card.kind,
    text: cloze ? text : null,
    blank: cloze ? blank : null,
    blank_start: cloze && start >= 0 ? start : null,
    blank_end: cloze && start >= 0 ? start + blank.length : null,
    question: cloze ? null : (card.question ?? null),
    answer: cloze ? null : (card.answer ?? null),
    note: cloze ? null : (card.note ?? null),
    anchor,
    // The prefix disambiguates whatever the wash is drawn on, which is
    // the anchor where there is one and the passage itself on a card
    // written before 046 -- the same rule `cardAnchor` states.
    prefix: prefixFor(body, anchor ?? (cloze ? text : '')),
    hint: card.hint ?? null,
  }
}

/**
 * Plant the trackers for a lesson.
 *
 * Idempotent by default, and that is the whole design of it: this is
 * fired by marking a lesson worked, and a lesson is marked worked,
 * un-marked and marked again. Finding concepts already standing, it
 * says so and asks the model nothing -- otherwise every second press
 * would be another model call and another handful of cards over the
 * same material, and the garden would fill with duplicates faster than
 * anyone could tend it.
 *
 * `more` is the reader pressing *Write some more* under a lesson, and
 * it **adds**. Nothing standing is deleted: a card they have been
 * answering for three months carries a review history that is the only
 * evidence of what they hold, and throwing it away in the name of a
 * better prompt would be the app deciding its own writing matters more
 * than their answering. What stops the deck doubling is that the model
 * is handed every front already standing and told to write what is
 * missing, and anything it writes anyway that matches one is dropped in
 * `verify` -- told, so the cards are genuinely different; dropped, so
 * the promise does not rest on having been told.
 *
 * A concept the model names that is already standing is reused rather
 * than written twice, matched on its name with the case and spacing
 * taken off. The alternative is two "Latency" rows under one lesson
 * under one lesson, which reads to the reader as the app having
 * forgotten what it did last week.
 */
export async function sowClozes(
  db: SupabaseClient,
  userId: string,
  lessonId: string,
  { more = false }: { more?: boolean } = {}
): Promise<Sown> {
  const lesson = await topicOf(db, lessonId)
  if (!lesson) throw new Error('That lesson is not there.')
  if (!lesson.body.trim()) throw new Error('That lesson has not been written yet.')

  const { data: standing } = await db
    .from('cloze_concepts')
    .select('id, name, position')
    .eq('lesson_id', lessonId)
    .eq('user_id', userId)
    .order('position', { ascending: true })

  if ((standing?.length ?? 0) > 0 && !more) {
    return { concepts: [], total: await countFor(db, userId, lessonId), already: true }
  }

  // What is already asked here, as fronts. Every card against the
  // lesson, not only the ones under a concept: a cloze the reader made
  // by hand over a passage they chose belongs to no concept and is
  // still a question they have been asked.
  const { data: asked } = await db
    .from('clozes')
    // The whole row rather than the columns this needs by name: the
    // migration and this code go up on the same push but are not a
    // transaction, and a `select` naming a column the database has not
    // got yet is an error where `*` is simply a narrower row.
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)

  const here = (asked ?? []) as unknown as Parameters<typeof cardFront>[0][]
  const fronts = here.map(card => cardFront(card, '…'))

  // Which way the true-or-false cards already here come out. The
  // reading draws the verdict that is behind, so a lesson whose garden
  // is four statements all answered `False` -- which is every lesson
  // tended before this -- comes out of its next reading with the other
  // word on it rather than a fifth of the same.
  const verdicts = here.map(card => cardTruth(card))

  const { concepts: proposed, report } = await proposeClozes(
    lesson.title,
    lesson.body,
    fronts,
    verdicts
  )

  const now = new Date()
  /** What the database would not take, said in its own words. */
  const refused: string[] = []
  const written: Sown['concepts'] = []
  const byName = new Map(
    (standing ?? []).map(c => [String(c.name).trim().toLowerCase(), c.id as string])
  )
  let position = (standing ?? []).reduce((n, c) => Math.max(n, Number(c.position) + 1), 0)

  for (const concept of proposed) {
    let conceptId = byName.get(concept.name.trim().toLowerCase()) ?? null

    if (!conceptId) {
      const { data: row, error } = await db
        .from('cloze_concepts')
        .insert({
          user_id: userId,
          lesson_id: lessonId,
          topic_id: lesson.topicId,
          name: concept.name,
          gist: concept.gist || null,
          position: position++,
          created_by: 'ai',
        })
        .select('id')
        .single()
      if (error || !row) {
        // Said rather than skipped. A concept the database refuses is
        // every one of its cards lost, and it used to leave no trace at
        // all -- the reading simply came back smaller than it was.
        refused.push(`the concept "${concept.name}" (${error?.message ?? 'no row came back'})`)
        continue
      }
      conceptId = row.id as string
      byName.set(concept.name.trim().toLowerCase(), conceptId)
    }

    const rows = concept.cards.map(card => ({
      user_id: userId,
      concept_id: conceptId,
      lesson_id: lessonId,
      topic_id: lesson.topicId,
      created_by: 'ai' as const,
      ...cardColumns(card, lesson.body),
      ...memoryColumns(freshMemory(now)),
    }))

    // The error was discarded here, and a refused batch was reported as
    // a concept with nought cards under it -- which reads, at the other
    // end, exactly like a lesson with nothing left to ask. A row that
    // fails `clozes_shape` takes its whole batch with it, so this is
    // the difference between "nothing to ask" and "nine cards the
    // database would not have".
    const { data: planted, error: refusal } = await db.from('clozes').insert(rows).select('id')
    if (refusal) refused.push(`${rows.length} under "${concept.name}" (${refusal.message})`)
    written.push({ id: conceptId, name: concept.name, clozes: planted?.length ?? 0 })
  }

  const cards = written.reduce((n, c) => n + c.clozes, 0)

  return {
    concepts: written,
    total: await countFor(db, userId, lessonId),
    already: false,
    // Only where the reading came to nothing: a reading that planted
    // cards has said what it did by planting them.
    note: cards > 0 ? null : refused.length
      ? `The database refused ${refused.join('; ')}.`
      : readingNote(report),
  }
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
 * What is due: chosen oldest-first, then shuffled.
 *
 * The two halves are doing different jobs and it is worth being clear
 * which is which. **Chosen** oldest-first, because an overdue card is
 * the one the schedule is most wrong about and a reader who has been
 * away for a month has several hundred due and wants a sitting rather
 * than a backlog -- so the sitting has to be drawn from the most
 * overdue end, not from wherever the table happens to start.
 *
 * **Shuffled** after, because the order cards were planted in is the
 * order they were *read* in: a lesson's whole deck arrives in a block,
 * and each card is answered with the one before it still in mind. That
 * is not recall, it is a run-on, and every *Easy* it earns is a lie the
 * scheduler then reasons from for a fortnight. Shuffling is what makes
 * each card meet the reader cold, which is the only state an answer is
 * worth grading in.
 *
 * Done here rather than in Postgres for the same reason `randomCloze`
 * is: `order by random()` is a full sort of the table on every read,
 * and this is a page of forty rows already in hand.
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
  return shuffled((data ?? []) as unknown as ClozeCard[])
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

/**
 * Every card against one lesson, oldest first.
 *
 * Two callers with two uses: the reading, which draws the ones with an
 * anchor onto the prose, and "Tend this lesson", which lists all of
 * them to be read over, rewritten or pulled up. One read rather than
 * two, because they are the same rows and the list is the honest
 * inventory -- a card the reader cannot see is a card they cannot fix.
 */
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
