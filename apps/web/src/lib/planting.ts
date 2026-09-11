import { cacheLife, cacheTag } from 'next/cache'
import { computeFreshness } from '@didactic/core/scoring'
import { markLabel, MARKS_ON_THE_BED } from '@didactic/core/graphMarks'
import { tags } from '@didactic/core/tags'
import { supabaseAdmin } from './supabase'

/**
 * The whole planting: every topic, every connection, and the material
 * and lessons that hang off them.
 *
 * Read by `GET /api/topics` and by `GET /api/graph`, which differ only
 * in whether the subjects come with it. The marks are here rather than
 * in either route for the same reason as the rest: a layer added to one
 * bed and not the other is a bed that disagrees with itself. Written once because the shape
 * is the bed's, not a route's: two copies of this query would drift the
 * moment one grew a column.
 */
export async function getPlanting() {
  'use cache'
  cacheTag(tags.topics, tags.subjects, tags.resources)
  // Held until a write drops one of the tags above. See the `held`
  // profile in next.config.ts for why nothing here expires on time.
  cacheLife('held')
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that.
  const db = supabaseAdmin()
  const [
    { data: topics },
    { data: edges },
    { data: memberships },
    { data: resourceLinks },
    { data: lessons },
  ] = await Promise.all([
    db.from('topics').select(
      'id, title, ability, ability_confidence, last_exposure_at, primary_subject_id, state'
    ),
    db.from('edges').select('from_topic, to_topic, kind, weight'),
    db.from('topic_subjects').select('topic_id, subject_id'),
    // A resource can touch several topics, so it is returned once with
    // every topic it links to rather than duplicated per topic.
    db.from('resource_topics')
      .select('topic_id, relevance, resources(id, title, kind, status)'),
    db.from('lessons')
      .select('id, title, topic_id, stage, completed_at, curriculum_id')
      .not('topic_id', 'is', null),
  ])

  // Marks, and what their notes name. A mark hangs off the topic its
  // lesson teaches -- that is where it came from -- and off whatever
  // the note itself points at, which is very often somewhere else:
  // the thought a passage on custody leaves you with is usually about
  // settlement. Newest first and capped, because a reader who marks
  // everything would otherwise draw a bed nobody can read.
  const [{ data: marks }, { data: marked }] = await Promise.all([
    db.from('highlights')
      .select('id, quote, note, topic_id, lesson_id')
      .order('created_at', { ascending: false })
      .limit(MARKS_ON_THE_BED),
    db.from('highlight_tags').select('highlight_id, topic_id, lesson_id'),
  ])

  // A topic may sit under several subjects, so the canvas filter needs
  // the whole membership set, not just the home subject it is coloured by.
  const subjectsFor = new Map<string, string[]>()
  for (const m of memberships ?? []) {
    const list = subjectsFor.get(m.topic_id)
    if (list) list.push(m.subject_id)
    else subjectsFor.set(m.topic_id, [m.subject_id])
  }

  // One entry per resource, carrying every topic it touches. A paper on
  // retrieval belongs to embeddings and vector search both, and the
  // canvas should show it reaching into each.
  const resourceMap = new Map<
    string,
    { id: string; title: string; kind: string; status: string; topic_ids: string[] }
  >()
  // What each mark names, gathered onto the mark rather than left as
  // rows: the canvas draws per node.
  const named = new Map<string, { topic_ids: string[]; lesson_ids: string[] }>()
  for (const tag of marked ?? []) {
    const held = named.get(tag.highlight_id) ?? { topic_ids: [], lesson_ids: [] }
    if (tag.topic_id) held.topic_ids.push(tag.topic_id)
    if (tag.lesson_id) held.lesson_ids.push(tag.lesson_id)
    named.set(tag.highlight_id, held)
  }

  for (const link of resourceLinks ?? []) {
    const r = link.resources as unknown as {
      id: string; title: string; kind: string; status: string
    } | null
    if (!r) continue
    const existing = resourceMap.get(r.id)
    if (existing) existing.topic_ids.push(link.topic_id)
    else resourceMap.set(r.id, { ...r, topic_ids: [link.topic_id] })
  }

  return {
    topics: (topics ?? []).map(t => ({
      ...t,
      ability: Number(t.ability),
      ability_confidence: Number(t.ability_confidence),
      freshness: computeFreshness(t.last_exposure_at, Number(t.ability)),
      subject_ids: subjectsFor.get(t.id) ?? [],
    })),
    edges: edges ?? [],
    resources: [...resourceMap.values()],
    lessons: lessons ?? [],
    marks: (marks ?? []).map(m => ({
      id: m.id as string,
      // A mark has no title, so it is named by what it says: the note
      // where there is one, because that is the reader's own words,
      // and the passage where there is not.
      label: markLabel(m.note, m.quote),
      topic_id: m.topic_id as string | null,
      lesson_id: m.lesson_id as string,
      noted: Boolean(m.note),
      ...(named.get(m.id as string) ?? { topic_ids: [], lesson_ids: [] }),
    })),
  }
}
