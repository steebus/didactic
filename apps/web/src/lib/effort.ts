import { cacheLife, cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tags } from '@didactic/core/tags'
import {
  inherentComplexity,
  subjectEffort,
  targetFor,
  topicEffort,
  varietiesOf,
  type GrainEdge,
  type ShapeReading,
  type SubjectEffort,
  type TargetSource,
  type TopicEffort,
} from '@didactic/core/grain'
import { supabaseAdmin } from './supabase'
import { everyRow } from './rows'

/** Every topic's effort to its target, and every subject's. */
export interface EffortMap {
  topics: Record<string, TopicEffort>
  subjects: Record<string, SubjectEffort>
}

/**
 * How big every topic is and how far the reader is from their target
 * on each (`core/grain`), read off the whole map at once.
 *
 * At once because the figures are relational: a topic's size leans on
 * the prerequisite chain under it, and how big it reads leans on its
 * varieties. Computed on read and cached rather than stored, like
 * freshness: nothing here is a decision, and a stored copy would only
 * be a copy that could go stale. Held until the map, a subject or the
 * material moves.
 */
export async function getEffortMap(): Promise<EffortMap> {
  'use cache'
  cacheTag(tags.topics, tags.subjects, tags.resources)
  cacheLife('held')
  return readEffortMap(supabaseAdmin())
}

export async function readEffortMap(db: SupabaseClient): Promise<EffortMap> {
  const [topics, edges, memberships, subjects, sowings, links, topicTargets, subjectTargets, bodies, shapes] = await Promise.all([
    everyRow<{ id: string; ability: number; ability_confidence: number }>((a, b) =>
      db.from('topics').select('id, ability, ability_confidence').eq('state', 'active').order('id').range(a, b)),
    everyRow<{ from_topic: string; to_topic: string; kind: string; created_by: string }>((a, b) =>
      db.from('edges').select('from_topic, to_topic, kind, created_by').in('kind', ['prereq', 'specialises']).order('id').range(a, b)),
    everyRow<{ topic_id: string; subject_id: string }>((a, b) =>
      db.from('topic_subjects').select('topic_id, subject_id').order('topic_id').order('subject_id').range(a, b)),
    everyRow<{ id: string; title: string }>((a, b) =>
      db.from('subjects').select('id, title').order('id').range(a, b)),
    everyRow<{ subject_id: string; roots: number | null }>((a, b) =>
      db.from('subject_sowings').select('subject_id, roots').order('subject_id').range(a, b)),
    everyRow<{ resource_id: string; topic_id: string }>((a, b) =>
      db.from('resource_topics').select('resource_id, topic_id').order('resource_id').order('topic_id').range(a, b)),
    // Asked on their own, and an error read as none: before 061 there
    // are no targets or word counts, and the figure still stands on the
    // assumed target and on the prerequisite chain.
    everyRow<{ id: string; target_depth: number | null }>((a, b) =>
      db.from('topics').select('id, target_depth').not('target_depth', 'is', null).order('id').range(a, b)),
    everyRow<{ id: string; target_depth: number | null }>((a, b) =>
      db.from('subjects').select('id, target_depth').not('target_depth', 'is', null).order('id').range(a, b)),
    everyRow<{ resource_id: string; words: number | null }>((a, b) =>
      db.from('resource_bodies').select('resource_id, words').not('words', 'is', null).order('resource_id').range(a, b)),
    // How each topic is written about (063). None before the migration.
    everyRow<{ topic_id: string; works: number; topic_share: number; subfield_share: number; software_share: number }>((a, b) =>
      db.from('topic_shapes').select('topic_id, works, topic_share, subfield_share, software_share').order('topic_id').range(a, b)),
  ])

  return effortFrom({
    topics: topics.data.map(t => ({ id: t.id, ability: Number(t.ability), confidence: Number(t.ability_confidence) })),
    edges: edges.data.map(e => ({ from: e.from_topic, to: e.to_topic, kind: e.kind, createdBy: e.created_by })),
    memberships: memberships.data,
    subjects: subjects.data,
    roots: new Map(sowings.data.map(s => [s.subject_id, s.roots === null ? null : Number(s.roots)])),
    links: links.data,
    topicTargets: new Map(topicTargets.error ? [] : topicTargets.data.map(t => [t.id, Number(t.target_depth)])),
    subjectTargets: new Map(subjectTargets.error ? [] : subjectTargets.data.map(s => [s.id, Number(s.target_depth)])),
    words: new Map(bodies.error ? [] : bodies.data.map(b => [b.resource_id, Number(b.words)])),
    shapes: new Map(
      shapes.error
        ? []
        : shapes.data.map(r => [
            r.topic_id,
            {
              works: Number(r.works),
              topicShare: Number(r.topic_share),
              subfieldShare: Number(r.subfield_share),
              softwareShare: Number(r.software_share),
            },
          ])
    ),
  })
}

/**
 * The figures, from rows already read. Separate from the reads so the
 * arithmetic can be tested against a map written out by hand.
 */
export function effortFrom(input: {
  topics: ReadonlyArray<{ id: string; ability: number; confidence: number }>
  edges: readonly GrainEdge[]
  memberships: ReadonlyArray<{ topic_id: string; subject_id: string }>
  subjects: ReadonlyArray<{ id: string; title: string }>
  roots: ReadonlyMap<string, number | null>
  links: ReadonlyArray<{ resource_id: string; topic_id: string }>
  topicTargets: ReadonlyMap<string, number>
  subjectTargets: ReadonlyMap<string, number>
  words: ReadonlyMap<string, number>
  shapes?: ReadonlyMap<string, ShapeReading>
}): EffortMap {
  const active = new Map(input.topics.map(t => [t.id, t]))

  // Material about one topic alone: a resource filed under exactly one.
  const topicsOf = new Map<string, string[]>()
  for (const link of input.links) {
    const held = topicsOf.get(link.resource_id)
    if (held) held.push(link.topic_id)
    else topicsOf.set(link.resource_id, [link.topic_id])
  }
  const focusedWords = new Map<string, number>()
  for (const [resource, topicIds] of topicsOf) {
    const words = input.words.get(resource)
    if (topicIds.length !== 1 || !words) continue
    focusedWords.set(topicIds[0], (focusedWords.get(topicIds[0]) ?? 0) + words)
  }

  const inherent = inherentComplexity({ topicIds: [...active.keys()], edges: input.edges, focusedWords, shapes: input.shapes })

  const subjectById = new Map(input.subjects.map(s => [s.id, s]))
  const sourcesOf = new Map<string, TargetSource[]>()
  for (const m of input.memberships) {
    const subject = subjectById.get(m.subject_id)
    if (!subject || !active.has(m.topic_id)) continue
    const held = sourcesOf.get(m.topic_id) ?? []
    held.push({
      id: subject.id,
      title: subject.title,
      target: input.subjectTargets.get(subject.id) ?? null,
      roots: input.roots.get(subject.id) ?? null,
    })
    sourcesOf.set(m.topic_id, held)
  }

  const topics: Record<string, TopicEffort> = {}
  for (const t of active.values()) {
    const target = targetFor(input.topicTargets.get(t.id) ?? null, sourcesOf.get(t.id) ?? [])
    const varieties = varietiesOf(t.id, input.edges)
      .flatMap(id => {
        const v = active.get(id)
        const c = inherent.get(id)
        return v && c ? [{ inherent: c, ability: v.ability, confidence: v.confidence }] : []
      })
    topics[t.id] = topicEffort({ inherent: inherent.get(t.id)!, ability: t.ability, confidence: t.confidence, target, varieties })
  }

  const subjects: Record<string, SubjectEffort> = {}
  for (const s of input.subjects) {
    const members = input.memberships.filter(m => m.subject_id === s.id && topics[m.topic_id])
    subjects[s.id] = {
      ...subjectEffort(members.map(m => topics[m.topic_id])),
      target: input.subjectTargets.get(s.id) ?? null,
      topics: members.length,
    }
  }

  return { topics, subjects }
}
