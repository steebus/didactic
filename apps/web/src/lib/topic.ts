import { cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tags } from './tags'
import type { HighlightRow } from './highlights'
import { computeFreshness } from './scoring'
import { curriculumProgress } from './curriculum'
import type { Resource, Subject } from './types'
import { supabaseAdmin } from './supabase'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/topic` still answers for both.
import type { TopicArea } from '@didactic/core/shapes'
export type { TopicNeighbour, CurriculumCard, LessonRow, TopicArea } from '@didactic/core/shapes'

/**
 * Everything the topic area shows: the curriculum and the material,
 * which is what opening a node on the graph is for.
 */
export async function getTopicArea(topicId: string): Promise<TopicArea | null> {
  'use cache'
  // Everything below is built from this one topic, so one tag drops
  // the whole sheet. The routes that write to it name the same tag.
  cacheTag(tags.topic(topicId), tags.topics)
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that.
  return readTopicArea(supabaseAdmin(), topicId)
}

export async function readTopicArea(
  db: SupabaseClient,
  topicId: string
): Promise<TopicArea | null> {
  // Two waves, not five.
  //
  // The database is a continent away -- one round trip measures about
  // 140ms -- so a query that waits for a query it does not need costs
  // the whole trip again. This used to run five stages deep, which is
  // most of a second spent waiting rather than reading. Everything that
  // depends only on the topic id goes in the first wave; the second
  // holds the two things that genuinely need an answer first (lessons
  // need curriculum ids, neighbours need edges).
  const [
    { data: topic },
    { data: memberships },
    { data: curricula },
    { data: links },
    { data: edges },
    { data: exposures },
    { data: highlights },
  ] = await Promise.all([
    db.from('topics').select('*').eq('id', topicId).single(),
    db.from('topic_subjects').select('subjects(id, title, colour)').eq('topic_id', topicId),
    db.from('curricula').select('*').eq('topic_id', topicId)
      .order('created_at', { ascending: false }),
    db.from('resource_topics').select('relevance, resources(*)').eq('topic_id', topicId),
    db.from('edges').select('from_topic, to_topic, kind')
      .or(`from_topic.eq.${topicId},to_topic.eq.${topicId}`),
    db.from('exposures').select('id, reason, depth, created_at').eq('topic_id', topicId)
      .order('created_at', { ascending: false }).limit(8),
    // Carries lesson_id, so the per-lesson counts are derived from this
    // rather than fetched a second time.
    db.from('highlights')
      .select('*, lesson:lessons(id, title), topic:topics(id, title)')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false }),
  ])

  if (!topic) return null

  const curriculumIds = (curricula ?? []).map(c => c.id)
  const neighbourIds = [
    ...new Set((edges ?? []).map(e => (e.from_topic === topicId ? e.to_topic : e.from_topic))),
  ]

  const [{ data: lessons }, { data: neighbourTopics }] = await Promise.all([
    curriculumIds.length
      ? db.from('lessons')
          .select('id, curriculum_id, title, summary, position, stage, estimated_minutes, completed_at')
          .in('curriculum_id', curriculumIds)
          .order('position')
      : Promise.resolve({
          data: [] as Array<{
            id: string
            curriculum_id: string
            title: string
            summary: string | null
            position: number
            stage: string
            estimated_minutes: number | null
            completed_at: string | null
          }>,
        }),
    neighbourIds.length
      ? db.from('topics').select('id, title').in('id', neighbourIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
  ])

  const lessonMarks = highlights ?? []
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
