import { describe, it, expect, afterEach } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_URL, LOCAL_SERVICE_KEY, DEV_USER, localDbReachable } from './local-db'
import { freshMemory } from '@didactic/core/fsrs'
import { memoryColumns } from '@didactic/core/clozes'

/**
 * What a grubbed-out topic takes with it.
 *
 * A cloze is a question cut from one lesson's own sentence, about one
 * topic's material. A topic that has been grubbed out has no material
 * to ask about, so being asked one of its questions a week later is
 * being asked about a bed that is gone -- and there would be no way to
 * act on it, because Edit and the lesson behind it are gone too.
 *
 * This is a schema test rather than a route test on purpose. What
 * deletes the rows is the foreign keys, and a chain of cascades is
 * exactly the kind of thing that is reasoned about correctly and
 * written down wrongly. Reasoning said the rows went; only Postgres
 * can say it.
 *
 * Probed at module scope, because skipIf is evaluated during
 * collection.
 */

const admin: SupabaseClient = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
  auth: { persistSession: false },
})

const reachable = await localDbReachable()

/** Everything this file wrote, newest first, so it comes apart cleanly. */
let planted: { subjects: string[]; topics: string[] } = { subjects: [], topics: [] }

afterEach(async () => {
  if (!reachable) return
  if (planted.topics.length) await admin.from('topics').delete().in('id', planted.topics)
  if (planted.subjects.length) await admin.from('subjects').delete().in('id', planted.subjects)
  planted = { subjects: [], topics: [] }
})

/**
 * A bed with one lesson in it and one cloze cut from that lesson.
 *
 * Written on the service role, which is how everything is written
 * today. The ids come back rather than the rows: what every case below
 * asks is whether a row is still there.
 */
async function sow(title: string) {
  const tag = Math.random().toString(36).slice(2, 8)

  const { data: subject, error: subjectError } = await admin
    .from('subjects')
    .insert({ user_id: DEV_USER, title: `${title} ${tag}`, colour: '#6b3550' })
    .select('id')
    .single()
  if (subjectError) throw subjectError
  planted.subjects.push(subject!.id)

  const { data: topic, error: topicError } = await admin
    .from('topics')
    .insert({ user_id: DEV_USER, title: `${title} topic ${tag}`, created_by: 'user' })
    .select('id')
    .single()
  if (topicError) throw topicError
  planted.topics.push(topic!.id)

  await admin.from('topic_subjects').insert({ topic_id: topic!.id, subject_id: subject!.id })

  const { data: curriculum, error: routeError } = await admin
    .from('curricula')
    .insert({
      user_id: DEV_USER,
      topic_id: topic!.id,
      title: `${title} route ${tag}`,
      created_by: 'user',
    })
    .select('id')
    .single()
  if (routeError) throw routeError

  const { data: lesson, error: lessonError } = await admin
    .from('lessons')
    .insert({
      user_id: DEV_USER,
      curriculum_id: curriculum!.id,
      topic_id: topic!.id,
      title: `${title} lesson ${tag}`,
      slug: `lesson-${tag}`,
      body: 'Saving a resource is intent; only consuming it counts.',
      position: 0,
      created_by: 'user',
    })
    .select('id')
    .single()
  if (lessonError) throw lessonError

  const { data: concept, error: conceptError } = await admin
    .from('cloze_concepts')
    .insert({
      user_id: DEV_USER,
      lesson_id: lesson!.id,
      topic_id: topic!.id,
      name: 'Exposure is not intent',
      position: 0,
    })
    .select('id')
    .single()
  if (conceptError) throw conceptError

  const text = 'Saving a resource is intent; only consuming it counts.'
  const { data: cloze, error: clozeError } = await admin
    .from('clozes')
    .insert({
      user_id: DEV_USER,
      concept_id: concept!.id,
      lesson_id: lesson!.id,
      topic_id: topic!.id,
      text,
      blank: 'consuming',
      blank_start: text.indexOf('consuming'),
      blank_end: text.indexOf('consuming') + 'consuming'.length,
      created_by: 'user',
      ...memoryColumns(freshMemory()),
    })
    .select('id')
    .single()
  if (clozeError) throw clozeError

  const { data: review, error: reviewError } = await admin
    .from('cloze_reviews')
    .insert({
      user_id: DEV_USER,
      cloze_id: cloze!.id,
      rating: 'good',
      stability_after: 3,
      difficulty_after: 5,
      state_after: 'review',
      due_after: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (reviewError) throw reviewError

  return {
    subjectId: subject!.id,
    topicId: topic!.id,
    lessonId: lesson!.id,
    conceptId: concept!.id,
    clozeId: cloze!.id,
    reviewId: review!.id,
  }
}

/** Whether a row is still there. */
async function stands(table: string, id: string) {
  const { count } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('id', id)
  return (count ?? 0) > 0
}

describe.skipIf(!reachable)('what a grubbed-out topic takes with it', () => {
  it('takes the clozes, their concepts and their answers', async () => {
    const bed = await sow('Cascade')

    const { error } = await admin.from('topics').delete().eq('id', bed.topicId)
    expect(error).toBeNull()

    expect(await stands('clozes', bed.clozeId), 'the cloze outlived its topic').toBe(false)
    expect(await stands('cloze_concepts', bed.conceptId)).toBe(false)
    expect(await stands('cloze_reviews', bed.reviewId)).toBe(false)
    // And the lesson it was cut from, which is how it got there.
    expect(await stands('lessons', bed.lessonId)).toBe(false)
  })

  it('takes them when the topic is grubbed out with its subject', async () => {
    // What `DELETE /api/subjects/[id]` does: the topics no other
    // subject holds, and then the subject itself.
    const bed = await sow('Cascade by subject')

    await admin.from('topics').delete().eq('id', bed.topicId)
    await admin.from('subjects').delete().eq('id', bed.subjectId)

    expect(await stands('clozes', bed.clozeId)).toBe(false)
    expect(await stands('cloze_concepts', bed.conceptId)).toBe(false)
    expect(await stands('cloze_reviews', bed.reviewId)).toBe(false)
  })

  it('keeps them when only the subject row goes, because the topic stands', async () => {
    // A topic held by a second subject is kept (`topicsKeptElsewhere`),
    // and its material is still material. Losing the garden because a
    // bed was re-filed would be the wrong way round.
    const bed = await sow('Subject alone')

    await admin.from('subjects').delete().eq('id', bed.subjectId)

    expect(await stands('clozes', bed.clozeId), 'the cloze went with a kept topic').toBe(true)
    expect(await stands('cloze_concepts', bed.conceptId)).toBe(true)
  })

  it('replaces the agent\'s cards when a lesson is read again, and keeps the reader\'s', async () => {
    // What `sowClozes(regenerate)` does: delete the lesson's concepts
    // and write a new set. Before 035 the old cards stayed -- stripped
    // of the concept that named them and indistinguishable from the
    // reader's own -- and the new set was written alongside, so the one
    // path that exists to replace a lesson's cards doubled them, and
    // did it again on every press.
    const bed = await sow('Read again')

    const { data: own, error } = await admin
      .from('clozes')
      .insert({
        user_id: DEV_USER,
        concept_id: null,
        lesson_id: bed.lessonId,
        topic_id: bed.topicId,
        text: 'A passage the reader chose for themselves.',
        blank: 'chose',
        blank_start: 'A passage the reader '.length,
        blank_end: 'A passage the reader '.length + 'chose'.length,
        created_by: 'user',
        ...memoryColumns(freshMemory()),
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    await admin.from('cloze_concepts').delete().eq('lesson_id', bed.lessonId)

    expect(await stands('clozes', bed.clozeId), "the agent's card survived a regeneration").toBe(false)
    expect(await stands('cloze_reviews', bed.reviewId)).toBe(false)
    expect(await stands('clozes', own!.id), "the reader's own card was thrown away").toBe(true)
  })

  it('takes a cloze filed under the topic even when its lesson is not', async () => {
    // Nothing files a cloze this way today -- `topic_id` is always the
    // topic of the curriculum its lesson sits in -- so the row goes
    // through the lesson either way. What this holds is the column's
    // own statement of intent (035): the day anything does file one
    // across, it must not outlive the bed and be offered to a reader
    // who has no way to act on it.
    const bed = await sow('Filed across')
    const elsewhere = await sow('The other bed')

    await admin.from('clozes').update({ topic_id: elsewhere.topicId }).eq('id', bed.clozeId)
    await admin.from('cloze_concepts').update({ topic_id: elsewhere.topicId }).eq('id', bed.conceptId)

    await admin.from('topics').delete().eq('id', elsewhere.topicId)

    expect(await stands('clozes', bed.clozeId)).toBe(false)
    expect(await stands('cloze_concepts', bed.conceptId)).toBe(false)
    // Its own lesson is untouched: only the filing was elsewhere.
    expect(await stands('lessons', bed.lessonId)).toBe(true)
  })
})
