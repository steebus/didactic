import type { SupabaseClient } from '@supabase/supabase-js'
import { GRAIN } from '@didactic/core/config'
import type { ShapeReading } from '@didactic/core/grain'

/*
 * How a topic is written about (063), read from OpenAlex's works: the
 * phrase in titles and abstracts, grouped by research topic, subfield and
 * type. `core/grain.readShape` turns the counts into the shape term of a
 * topic's size. Nothing here is shown to the reader as such.
 *
 * No path aliases, so `scripts/probe-shapes.ts` can run it against the
 * map from a terminal.
 */

const WORKS = 'https://api.openalex.org/works'

/** A reading older than this is taken again. */
export const RESHAPE_DAYS = 180

type Fetch = typeof fetch

export interface LiteratureRead {
  reading: ShapeReading
  /** The subjects it was searched within, or null for alone. */
  context: string | null
  topTopic: string | null
  topSubfield: string | null
}

/** What is searched for a topic: its name, without asides or quotes. */
export function phraseOf(title: string): string {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/["“”:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

interface Grouped {
  count: number
  groups: Array<{ key: string; name: string; count: number }>
}

async function grouped(expr: string, by: string, key: string, fetchImpl: Fetch): Promise<Grouped> {
  const filter = encodeURIComponent(`title_and_abstract.search:${expr}`)
  const res = await fetchImpl(`${WORKS}?filter=${filter}&group_by=${by}&api_key=${key}`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`literature: ${res.status}`)
  const body = (await res.json()) as {
    meta?: { count?: number }
    group_by?: Array<{ key: string; key_display_name: string; count: number }>
  }
  return {
    count: body.meta?.count ?? 0,
    groups: (body.group_by ?? []).map(g => ({ key: g.key, name: g.key_display_name, count: g.count })),
  }
}

/** The largest placed group's share, and its name. */
function top(g: Grouped): { share: number; name: string | null } {
  const placed = g.groups.filter(x => x.key !== 'unknown')
  const total = placed.reduce((sum, x) => sum + x.count, 0)
  if (total === 0) return { share: 0, name: null }
  const best = placed.reduce((a, b) => (b.count > a.count ? b : a))
  return { share: best.count / total, name: best.name }
}

/**
 * Read how a phrase is written about. Within its subjects first, because
 * a word like "aperture" belongs to radar in the literature and to
 * photography on this map; alone where the subjects leave too little.
 */
export async function readLiterature(
  phrase: string,
  subjects: readonly string[],
  key: string,
  fetchImpl: Fetch = fetch
): Promise<LiteratureRead> {
  const quoted = `"${phrase.replace(/"/g, '')}"`
  const context = subjects
    .map(s => phraseOf(s))
    .filter(s => s && s !== phrase)
  const tries: Array<string | null> = context.length > 0 ? [context.map(c => `"${c}"`).join(' OR '), null] : [null]

  for (const [i, within] of tries.entries()) {
    const expr = within ? `${quoted} AND (${within})` : quoted
    const topics = await grouped(expr, 'primary_topic.id', key, fetchImpl)
    const read = async (): Promise<LiteratureRead> => {
      const [subfields, types] = await Promise.all([
        grouped(expr, 'primary_topic.subfield.id', key, fetchImpl),
        grouped(expr, 'type', key, fetchImpl),
      ])
      const software = types.groups.find(g => g.name === 'software')?.count ?? 0
      const t = top(topics)
      const s = top(subfields)
      return {
        reading: {
          works: topics.count,
          topicShare: round(t.share),
          subfieldShare: round(s.share),
          softwareShare: round(topics.count > 0 ? software / topics.count : 0),
        },
        context: within ? context.join(' | ') : null,
        topTopic: t.name,
        topSubfield: s.name,
      }
    }
    if (topics.count >= GRAIN.SHAPE.MIN_WORKS || i === tries.length - 1) return read()
  }
  throw new Error('literature: nothing was tried')
}

/**
 * Read one topic and keep what was read. Null where the literature could
 * not be asked -- no key, or the service refused -- and nothing is kept,
 * so it is asked again another time.
 */
export async function shapeTopic(
  db: SupabaseClient,
  topic: { id: string; user_id: string; title: string },
  key: string | undefined,
  fetchImpl: Fetch = fetch
): Promise<ShapeReading | null> {
  if (!key) return null
  const { data: memberships } = await db
    .from('topic_subjects').select('subjects(title)').eq('topic_id', topic.id)
  const subjects = (memberships ?? []).flatMap(m => {
    const s = m.subjects as unknown as { title: string } | null
    return s ? [s.title] : []
  })
  const phrase = phraseOf(topic.title)
  if (!phrase) return null

  let read: LiteratureRead
  try {
    read = await readLiterature(phrase, subjects, key, fetchImpl)
  } catch {
    return null
  }

  const { error } = await db.from('topic_shapes').upsert({
    topic_id: topic.id,
    user_id: topic.user_id,
    phrase,
    context: read.context,
    works: read.reading.works,
    topic_share: read.reading.topicShare,
    subfield_share: read.reading.subfieldShare,
    software_share: read.reading.softwareShare,
    top_topic: read.topTopic,
    top_subfield: read.topSubfield,
    probed_at: new Date().toISOString(),
  })
  return error ? null : read.reading
}

/** Whether a kept reading still stands for a topic of this title. */
export function stillShaped(kept: { phrase: string; probed_at: string } | null | undefined, title: string, now = Date.now()): boolean {
  if (!kept) return false
  if (kept.phrase !== phraseOf(title)) return false
  return now - new Date(kept.probed_at).getTime() < RESHAPE_DAYS * 86_400_000
}

/** Read every active topic that has no standing reading, up to `limit`. */
export async function shapeUnread(
  db: SupabaseClient,
  key: string | undefined,
  limit = 50,
  fetchImpl: Fetch = fetch
): Promise<{ read: number; failed: number; left: number }> {
  const [{ data: topics }, { data: kept }] = await Promise.all([
    db.from('topics').select('id, user_id, title').eq('state', 'active').order('created_at'),
    db.from('topic_shapes').select('topic_id, phrase, probed_at'),
  ])
  const keptBy = new Map((kept ?? []).map(k => [k.topic_id as string, k as { phrase: string; probed_at: string }]))
  const due = (topics ?? []).filter(t => !stillShaped(keptBy.get(t.id as string), t.title as string))
  let read = 0
  let failed = 0
  for (const t of due.slice(0, limit)) {
    const ok = await shapeTopic(db, t as { id: string; user_id: string; title: string }, key, fetchImpl)
    if (ok) read++
    else failed++
  }
  return { read, failed, left: Math.max(0, due.length - limit) }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
