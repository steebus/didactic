import type { SupabaseClient } from '@supabase/supabase-js'
import { lessonNeighbours } from '@didactic/core/lessonState'
import { answeredIn } from './answers'

/**
 * An embedded row, as PostgREST types it: the row, a list of the row,
 * or null, depending on how much the generator could work out.
 */
type Embedded<T> = T | T[] | null | undefined

function unwrap<T>(rows: Embedded<T>[]): T[] {
  return rows.flatMap(r => (Array.isArray(r) ? r : r ? [r] : []))
}

function one<T>(row: Embedded<T>): T | null {
  return (Array.isArray(row) ? row[0] : row) ?? null
}

type Subject = { id: string; title: string }
type Topic = { id: string; title: string }
/** The join row, as PostgREST nests it under the topic. */
type TopicSubject = { subjects?: Embedded<Subject> }
type ResourceRow = { id: string; title: string; kind: string; url: string | null; status: string }
type PrereqLesson = { id: string; title: string; completed_at: string | null }
type TopicRow = Topic & { topic_subjects?: Embedded<TopicSubject> }
type CurriculumRow = { topics?: Embedded<TopicRow> }

/**
 * Everything the lesson sheet prints, in one read.
 *
 * Lives here rather than in the route handler because both want it:
 * the sheet reads it on the server so the prose arrives with the HTML,
 * and `/api/lessons/[id]` serves the same shape to anything that asks
 * over the wire. One function, so the two cannot drift.
 *
 * What is *not* here is the roster the body's `lesson:` and `source:`
 * names resolve against -- see `/api/lessons/[id]/links`. Both rosters
 * fan out across every topic that shares a subject, and neither prints
 * a word of the lesson.
 */
export async function readLesson(db: SupabaseClient, id: string, userId: string | null) {
  const { data: lesson } = await db.from('lessons').select('*').eq('id', id).single()
  if (!lesson) return null

  const [
    { data: curriculum },
    { data: prereqs },
    { data: resources },
    { data: highlights },
    { data: route },
    answered,
  ] = await Promise.all([
    // The topic rides along on the curriculum rather than costing its
    // own round trip: it is one hop off it and the sheet wants both.
    // The subject rides along too, one further hop: the sheet prints
    // Subject > Topic above the title, and the whole trail is still
    // cheaper here than a second round trip for one name.
    db.from('curricula')
      .select('id, title, goal, topic_id, status, topics(id, title, topic_subjects(subjects(id, title)))')
      .eq('id', lesson.curriculum_id).single(),
    // Likewise the prereq lessons themselves. The foreign key is named
    // because `lesson_prereqs` points at `lessons` twice and PostgREST
    // will not guess which side to follow.
    db.from('lesson_prereqs')
      .select('lessons!lesson_prereqs_requires_lesson_id_fkey(id, title, completed_at)')
      .eq('lesson_id', id),
    db.from('lesson_resources').select('relevance, resources(id, title, kind, url, status)')
      .eq('lesson_id', id),
    db.from('highlights').select('*').eq('lesson_id', id).order('created_at'),
    // The route this lesson sits in, in the order it is meant to be
    // worked, so the foot of the reading can offer the way on. Titles
    // and ids only: the neighbours are two links, not two lessons.
    db.from('lessons').select('id, title, position, has_body')
      .eq('curriculum_id', lesson.curriculum_id).order('position'),
    // Which of this lesson's questions have been answered before.
    // Without it a question answered yesterday reads as fresh today and
    // the reader is promised a boost that has already been paid.
    userId ? answeredIn(db, userId, id) : Promise.resolve({}),
  ])

  const required = unwrap<PrereqLesson>(
    (prereqs ?? []).map(p => (p as { lessons: Embedded<PrereqLesson> }).lessons)
  )

  // The topic came back nested on the curriculum to save a round trip;
  // it is served beside it rather than inside it, so the shape the
  // sheet reads is the shape it always was.
  const { topics, ...rest } = (curriculum ?? {}) as CurriculumRow & Record<string, unknown>
  // The topic's own subjects came back nested under it. Served beside
  // the topic as a plain list, so the sheet reads a trail rather than
  // a join table. A topic filed under two subjects names the first:
  // the trail says where this sheet sits, and it sits in one place.
  const topicRow = one(topics)
  const { topic_subjects, ...topicRest } = (topicRow ?? {}) as TopicRow &
    Record<string, unknown>
  const subject = topicRow
    ? one(unwrap<Subject>(unwrap<TopicSubject>([topic_subjects]).map(t => t.subjects)))
    : null

  return {
    lesson,
    curriculum: curriculum ? (rest as Omit<typeof curriculum, 'topics'>) : null,
    topic: topicRow ? (topicRest as Topic) : null,
    subject,
    // The generator types a followed key as possibly-many; this one is
    // a to-one and comes back as a single row. Flattened here so the
    // sheet reads a resource rather than a list of one.
    resources: (resources ?? []).flatMap(r => {
      const row = one((r as { resources: Embedded<ResourceRow> }).resources)
      return row ? [{ relevance: r.relevance as number, resources: row }] : []
    }),
    highlights: highlights ?? [],
    requires: required,
    // The way on, at the foot of the reading. Derived from the route
    // rather than stored, so reshaping the route reorders these with it.
    neighbours: lessonNeighbours(route ?? [], id),
    answered,
    // Availability is derived, so the page never has to trust a stored flag.
    available: required.every(r => r.completed_at !== null),
  }
}
