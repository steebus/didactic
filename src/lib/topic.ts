import type { SupabaseClient } from '@supabase/supabase-js'
import type { HighlightRow } from './highlights'
import { computeFreshness } from './scoring'
import { curriculumProgress } from './curriculum'
import type { Curriculum, Resource, Subject, Topic } from './types'

export interface TopicNeighbour {
  id: string
  title: string
  kind: string
  /** True when this topic comes before the one being viewed. */
  incoming: boolean
}

export interface CurriculumCard extends Curriculum {
  total: number
  complete: number
  fraction: number
  /** The lessons themselves, in the order they are meant to be worked.
   *  The topic sheet lists these directly: a topic has one route
   *  through it in practice, and printing the route's name above its
   *  own lessons was a level of indirection that said nothing. */
  lessons: LessonRow[]
}

export interface LessonRow {
  id: string
  title: string
  summary: string | null
  position: number
  stage: string
  minutes: number | null
  completed_at: string | null
  /** How many passages were marked while reading it. A lesson you
   *  argued with is worth finding again. */
  marks: number
}

export interface TopicArea {
  topic: Topic & { freshness: number }
  subjects: Subject[]
  curricula: CurriculumCard[]
  resources: Array<{ relevance: number; resource: Resource }>
  neighbours: TopicNeighbour[]
  exposures: Array<{ id: string; reason: string; depth: string; created_at: string }>
  /** Passages marked in this topic's lessons, newest first. The lesson
   *  they came from stops mattering quickly; the topic is what makes
   *  them worth keeping. */
  highlights: HighlightRow[]
}

/**
 * Everything the topic area shows: the curriculum and the material,
 * which is what opening a node on the graph is for.
 */
export async function getTopicArea(
  db: SupabaseClient,
  topicId: string
): Promise<TopicArea | null> {
  const { data: topic } = await db.from('topics').select('*').eq('id', topicId).single()
  if (!topic) return null

  const [
    { data: memberships },
    { data: curricula },
    { data: links },
    { data: edges },
    { data: exposures },
  ] = await Promise.all([
    db.from('topic_subjects').select('subjects(id, title, colour)').eq('topic_id', topicId),
    db.from('curricula').select('*').eq('topic_id', topicId)
      .order('created_at', { ascending: false }),
    db.from('resource_topics').select('relevance, resources(*)').eq('topic_id', topicId),
    db.from('edges').select('from_topic, to_topic, kind')
      .or(`from_topic.eq.${topicId},to_topic.eq.${topicId}`),
    db.from('exposures').select('id, reason, depth, created_at').eq('topic_id', topicId)
      .order('created_at', { ascending: false }).limit(8),
  ])

  const curriculumIds = (curricula ?? []).map(c => c.id)
  const { data: lessons } = curriculumIds.length
    ? await db.from('lessons')
        .select('id, curriculum_id, title, summary, position, stage, estimated_minutes, completed_at')
        .in('curriculum_id', curriculumIds)
        .order('position')
    : { data: [] }

  const { data: lessonMarks } = await db.from('highlights')
    .select('lesson_id')
    .eq('topic_id', topicId)

  const { data: highlights } = await db.from('highlights')
    .select('*, lesson:lessons(id, title), topic:topics(id, title)')
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false })

  const neighbourIds = [
    ...new Set((edges ?? []).map(e => (e.from_topic === topicId ? e.to_topic : e.from_topic))),
  ]
  const { data: neighbourTopics } = neighbourIds.length
    ? await db.from('topics').select('id, title').in('id', neighbourIds)
    : { data: [] }
  const titleById = new Map((neighbourTopics ?? []).map(t => [t.id, t.title]))

  return {
    topic: {
      ...topic,
      ability: Number(topic.ability),
      ability_confidence: Number(topic.ability_confidence),
      freshness: computeFreshness(topic.last_exposure_at, Number(topic.ability)),
    },
    subjects: (memberships ?? []).flatMap(m =>
      m.subjects ? [m.subjects as unknown as Subject] : []
    ),
    curricula: (curricula ?? []).map(c => {
      const mine = (lessons ?? []).filter(l => l.curriculum_id === c.id)
      return {
        ...c,
        ...curriculumProgress(mine),
        lessons: mine.map(l => ({
          id: l.id,
          title: l.title,
          summary: l.summary ?? null,
          position: l.position,
          stage: l.stage,
          minutes: l.estimated_minutes ?? null,
          completed_at: l.completed_at ?? null,
          marks: (lessonMarks ?? []).filter(m => m.lesson_id === l.id).length,
        })),
      }
    }),
    highlights: (highlights ?? []) as unknown as HighlightRow[],
    resources: (links ?? []).map(l => ({
      relevance: Number(l.relevance),
      resource: l.resources as unknown as Resource,
    })),
    neighbours: (edges ?? []).flatMap(e => {
      const otherId = e.from_topic === topicId ? e.to_topic : e.from_topic
      const title = titleById.get(otherId)
      return title
        ? [{ id: otherId, title, kind: e.kind, incoming: e.to_topic === topicId }]
        : []
    }),
    exposures: exposures ?? [],
  }
}
