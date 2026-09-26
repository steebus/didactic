import { cacheLife, cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  kinship,
  kinText,
  type KinEdge,
  type KinLine,
  type KinMark,
  type KinMaterial,
  type KinTopic,
} from '@didactic/core/kinship'
import {
  bindingSentence,
  foundSentence,
  matchKept,
  nameStillFits,
  readSprouts,
  type Sprout,
  type SproutReading,
} from '@didactic/core/sprouting'
import type { Sprouting, SproutView } from '@didactic/core/shapes'
import { tags } from '@didactic/core/tags'
import { plates } from '@didactic/tokens'
import { supabaseAdmin } from './supabase'
import { embed } from './embedding'
import { nameTheSprouts, NAMED_PER_CALL } from './llm/sprouts'

/**
 * Sprouting subjects: the reading, what was decided about it, and the
 * three things a reader can do with one.
 *
 * The maths is `core/kinship` and `core/sprouting`; what stays here is
 * reading the map for them, keeping decisions, and the one model call.
 * The reading itself is never stored: it is a pure function of the map,
 * so it is computed on read and cached on the same tags as the map.
 */

/** A decision kept about a set of topics (`052`). */
interface Kept {
  id: string
  topicIds: string[]
  namedTopicIds: string[] | null
  title: string | null
  why: string | null
  coreTopicIds: string[]
  status: 'open' | 'dismissed' | 'planted' | 'passed'
}

/** The map as the reading needs it. */
interface MapRead {
  topics: Array<{ id: string; title: string; summary: string | null; subjects: string[]; vector: number[] | null }>
  materials: Array<KinMaterial & { title: string }>
  marks: KinMark[]
  edges: KinEdge[]
  subjects: Array<{ id: string; title: string; colour: string }>
  /** Null when `052` has not run: nothing can be kept yet. */
  kept: Kept[] | null
  /** Topics with no `title — summary` vector yet; 0 before `052`. */
  unembedded: number
}

/** Material listed per sprout on the sheet. */
const MATERIAL_SHOWN = 6

/** Vectors filled per request, and how long filling may take. */
const FILL_BATCH = 48
const FILL_BUDGET_MS = 20_000

/**
 * The reading, cached until the map or a decision changes.
 *
 * Tagged on everything it is built from: topics and their summaries,
 * subjects (through membership), material, marks, and the decisions.
 */
export async function getSprouting(): Promise<Sprouting> {
  'use cache'
  cacheTag(tags.topics, tags.subjects, tags.resources, tags.highlights, tags.sprouts)
  // Built in here rather than passed in: a Supabase client does not
  // survive the serialisation at a `use cache` boundary.
  const map = await readTheMap(supabaseAdmin())
  // Held until a write drops a tag, like every reader -- except a
  // reading taken before `052` has run. The build and the migration are
  // not one transaction, and a build that read the map a minute early
  // would otherwise hold "nothing can be kept" until some unrelated
  // write happened to drop a tag, with no press on the sheet able to.
  if (map.kept === null) cacheLife('minutes')
  else cacheLife('held')
  return present(map)
}

/**
 * Fill what vectors the budget allows, keep a row for every sprout the
 * reading finds, and name the ones with no name or a stale one.
 *
 * Answers the reading as it stands afterwards, read fresh rather than
 * through the cache, which the caller is about to drop.
 */
export async function tendTheSprouts(
  db: SupabaseClient,
  userId: string
): Promise<{ sprouting: Sprouting; warnings: string[] }> {
  const warnings: string[] = []
  await fillKinVectors(db, warnings)

  const map = await readTheMap(db)
  if (!map.kept) {
    warnings.push('Sprouting subjects cannot be kept until migration 052 has run.')
    return { sprouting: present(map), warnings }
  }

  const reading = readOf(map)
  const matched = matchKept(reading.sprouts, map.kept)

  // A row for every sprout nobody has looked at, and the latest topics
  // on every one that has: the next reading matches against these.
  const fresh = reading.sprouts.filter(s => !matched.has(s.key))
  if (fresh.length > 0) {
    const { data, error } = await db.from('sprouts')
      .insert(fresh.map(s => ({ user_id: userId, topic_ids: s.topicIds })))
      .select('id, topic_ids, named_topic_ids, title, why, core_topic_ids, status')
    if (error) warnings.push(`Could not keep the new sprouts: ${error.message}`)
    for (const row of data ?? []) {
      const kept = keptOf(row)
      const sprout = fresh.find(s => sameSet(s.topicIds, kept.topicIds))
      if (sprout) matched.set(sprout.key, kept)
      map.kept.push(kept)
    }
  }
  for (const sprout of reading.sprouts) {
    const kept = matched.get(sprout.key)
    if (!kept || sameSet(kept.topicIds, sprout.topicIds)) continue
    kept.topicIds = sprout.topicIds
    await db.from('sprouts')
      .update({ topic_ids: sprout.topicIds, updated_at: new Date().toISOString() })
      .eq('id', kept.id)
  }

  // Strongest first, so a map with more than one call's worth names
  // what the sheet prints at the top.
  const toName = reading.sprouts
    .map(sprout => ({ sprout, kept: matched.get(sprout.key) }))
    .filter((x): x is { sprout: Sprout; kept: Kept } =>
      !!x.kept && x.kept.status === 'open' && !nameStillFits(x.sprout.topicIds, x.kept.namedTopicIds))
    .slice(0, NAMED_PER_CALL)

  if (toName.length > 0) {
    const byId = new Map(map.topics.map(t => [t.id, t]))
    const subjectTitle = new Map(map.subjects.map(s => [s.id, s.title]))
    const materialTitle = new Map(map.materials.map(m => [m.id, m.title]))

    try {
      const namings = await nameTheSprouts({
        subjects: map.subjects.map(s => s.title),
        sprouts: toName.map(({ sprout, kept }) => ({
          id: kept.id,
          topics: sprout.topicIds.map(id => ({
            id,
            title: byId.get(id)?.title ?? id,
            summary: byId.get(id)?.summary ?? null,
            filedUnder: (byId.get(id)?.subjects ?? []).map(s => subjectTitle.get(s) ?? s),
          })),
          material: sprout.binding.materials.map(id => materialTitle.get(id) ?? id).slice(0, 12),
        })),
      })

      for (const naming of namings) {
        const entry = toName.find(x => x.kept.id === naming.id)
        if (!entry) continue
        const passed = naming.verdict === 'not_a_subject'
        const patch = {
          title: passed ? null : naming.title,
          why: naming.why || null,
          core_topic_ids: naming.coreTopicIds,
          named_topic_ids: entry.sprout.topicIds,
          status: passed ? 'passed' as const : 'open' as const,
          updated_at: new Date().toISOString(),
        }
        const { error } = await db.from('sprouts').update(patch).eq('id', naming.id)
        if (error) {
          warnings.push(`Could not keep a name: ${error.message}`)
          continue
        }
        Object.assign(entry.kept, {
          title: patch.title,
          why: patch.why,
          coreTopicIds: patch.core_topic_ids,
          namedTopicIds: patch.named_topic_ids,
          status: patch.status,
        })
      }
    } catch (e) {
      // The reading stands without names: every sprout still prints,
      // as not yet named, and can still be given a bed by hand.
      warnings.push(`Could not name them this time: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { sprouting: present(map, reading), warnings }
}

/**
 * Give a sprout a bed: make the subject, and file every topic in it.
 *
 * Unplaced, as the loose sheet's bulk file is and for the same reason --
 * placing is a model call per topic -- and the answer says so. The
 * topics are the kept row's, less any since thrown away.
 */
export async function plantTheSprout(
  db: SupabaseClient,
  userId: string,
  sproutId: string,
  title: string | null
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: row, error } = await db.from('sprouts')
    .select('id, topic_ids, title, status').eq('id', sproutId).maybeSingle()
  if (error) return { status: 500, body: { error: error.message } }
  if (!row) return { status: 404, body: { error: 'There is no such sprouting subject.' } }
  if (row.status !== 'open') {
    return { status: 409, body: { error: 'That one has already been dealt with.' } }
  }

  const name = (title ?? '').trim() || (row.title as string | null)?.trim() || ''
  if (!name) return { status: 400, body: { error: 'A subject needs a name.' } }

  const { data: standing } = await db.from('topics')
    .select('id').eq('user_id', userId).in('id', row.topic_ids as string[])
  const ids = (standing ?? []).map(t => t.id as string)
  if (ids.length === 0) {
    return { status: 409, body: { error: 'Every topic it held has since been thrown away.' } }
  }

  const { count } = await db.from('subjects').select('id', { count: 'exact', head: true })
  const colour = plates[(count ?? 0) % plates.length]

  const { data: subject, error: subjectError } = await db.from('subjects')
    .insert({ user_id: userId, title: name, colour })
    .select('id').single()
  if (subjectError || !subject) {
    return { status: 500, body: { error: subjectError?.message ?? 'The subject was not made.' } }
  }

  const { error: fileError } = await db.from('topic_subjects').upsert(
    ids.map(topic_id => ({ topic_id, subject_id: subject.id, created_by: 'user' as const })),
    { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
  )
  if (fileError) {
    // A subject with nothing in it would print on the stock list as a
    // bed with nothing growing; take it back rather than leave it.
    await db.from('subjects').delete().eq('id', subject.id)
    return { status: 500, body: { error: fileError.message } }
  }

  // A loose topic takes the new bed as its home, as the bulk file does.
  await db.from('topics')
    .update({ primary_subject_id: subject.id })
    .in('id', ids)
    .is('primary_subject_id', null)

  await db.from('sprouts')
    .update({ status: 'planted', subject_id: subject.id, title: name, updated_at: new Date().toISOString() })
    .eq('id', sproutId)

  return {
    status: 200,
    body: {
      subjectId: subject.id,
      filed: ids.length,
      note: `${name} has a bed with ${ids.length} ${ids.length === 1 ? 'topic' : 'topics'} in it, not yet placed — use Draw connections on the bed to work out what follows what.`,
    },
  }
}

/** Say not this. The reading will not offer it again unless it grows
 *  past recognition, at which point it is a different question. */
export async function dismissTheSprout(
  db: SupabaseClient,
  sproutId: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data, error } = await db.from('sprouts')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', sproutId).eq('status', 'open')
    .select('id')
  if (error) return { status: 500, body: { error: error.message } }
  if (!data?.length) return { status: 404, body: { error: 'There is no open sprouting subject by that id.' } }
  return { status: 200, body: { ok: true } }
}

/* ------------------------------------------------------------- reading */

/** Every row of a table, a page at a time. PostgREST answers at most
 *  a thousand rows a request, and a reading that silently lost the
 *  thousand-and-first link would be a reading of a different map. */
async function everyRow<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if (!data || data.length < size) return { data: out, error: null }
  }
}

/** pgvector arrives as the text of an array. */
function vectorOf(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[]
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function readTheMap(db: SupabaseClient): Promise<MapRead> {
  const [topics, memberships, links, highlights, tagged, edges, subjects, kept] = await Promise.all([
    everyRow<{ id: string; title: string; summary: string | null }>((a, b) =>
      db.from('topics').select('id, title, summary').eq('state', 'active').order('id').range(a, b)),
    everyRow<{ topic_id: string; subject_id: string }>((a, b) =>
      db.from('topic_subjects').select('topic_id, subject_id').order('topic_id').order('subject_id').range(a, b)),
    everyRow<{ topic_id: string; relevance: number; resources: unknown }>((a, b) =>
      db.from('resource_topics').select('topic_id, relevance, resources(id, title, status)')
        .order('resource_id').order('topic_id').range(a, b)),
    everyRow<{ id: string; topic_id: string | null }>((a, b) =>
      db.from('highlights').select('id, topic_id').order('id').range(a, b)),
    everyRow<{ highlight_id: string; topic_id: string | null }>((a, b) =>
      db.from('highlight_tags').select('highlight_id, topic_id').not('topic_id', 'is', null)
        .order('highlight_id').order('topic_id').range(a, b)),
    everyRow<{ from_topic: string; to_topic: string; weight: number }>((a, b) =>
      db.from('edges').select('from_topic, to_topic, weight').order('id').range(a, b)),
    db.from('subjects').select('id, title, colour').order('title'),
    db.from('sprouts').select('id, topic_ids, named_topic_ids, title, why, core_topic_ids, status').order('created_at'),
  ])

  // The vectors, read separately so they are asked for once each: the
  // kinship vector where there is one, and the title's otherwise. The
  // column arrives with `052`; before it, every topic reads by title.
  const kin = await everyRow<{ id: string; kin_embedding: unknown }>((a, b) =>
    db.from('topics').select('id, kin_embedding').eq('state', 'active')
      .not('kin_embedding', 'is', null).order('id').range(a, b), 250)
  const hasKin = !kin.error
  const title = await everyRow<{ id: string; embedding: unknown }>((a, b) => {
    const q = db.from('topics').select('id, embedding').eq('state', 'active').not('embedding', 'is', null)
    return (hasKin ? q.is('kin_embedding', null) : q).order('id').range(a, b)
  }, 250)

  const vectors = new Map<string, number[]>()
  for (const row of title.data) {
    const v = vectorOf(row.embedding)
    if (v) vectors.set(row.id, v)
  }
  for (const row of hasKin ? kin.data : []) {
    const v = vectorOf(row.kin_embedding)
    if (v) vectors.set(row.id, v)
  }

  const subjectsOf = new Map<string, string[]>()
  for (const m of memberships.data) {
    const held = subjectsOf.get(m.topic_id)
    if (held) held.push(m.subject_id)
    else subjectsOf.set(m.topic_id, [m.subject_id])
  }

  const materials = new Map<string, KinMaterial & { title: string }>()
  for (const link of links.data) {
    const r = link.resources as { id: string; title: string; status: string } | null
    if (!r) continue
    const held = materials.get(r.id) ?? { id: r.id, title: r.title, read: r.status === 'consumed', topics: [] }
    ;(held.topics as Array<{ id: string; relevance: number }>).push({
      id: link.topic_id,
      relevance: Number(link.relevance),
    })
    materials.set(r.id, held)
  }

  // A mark joins where it was taken and everything its note names.
  const named = new Map<string, string[]>()
  for (const t of tagged.data) {
    if (!t.topic_id) continue
    const held = named.get(t.highlight_id)
    if (held) held.push(t.topic_id)
    else named.set(t.highlight_id, [t.topic_id])
  }
  const marks: KinMark[] = highlights.data
    .map(h => ({ topics: [...(h.topic_id ? [h.topic_id] : []), ...(named.get(h.id) ?? [])] }))
    .filter(m => new Set(m.topics).size >= 2)

  const unembedded = hasKin ? topics.data.length - kin.data.length : 0

  return {
    topics: topics.data.map(t => ({
      id: t.id,
      title: t.title,
      summary: t.summary,
      subjects: subjectsOf.get(t.id) ?? [],
      vector: vectors.get(t.id) ?? null,
    })),
    materials: [...materials.values()],
    marks,
    edges: edges.data.map(e => ({ from: e.from_topic, to: e.to_topic, weight: Number(e.weight) })),
    subjects: (subjects.data ?? []) as MapRead['subjects'],
    kept: kept.error ? null : (kept.data ?? []).map(keptOf),
    unembedded: Math.max(0, unembedded),
  }
}

function keptOf(row: Record<string, unknown>): Kept {
  return {
    id: row.id as string,
    topicIds: (row.topic_ids as string[] | null) ?? [],
    namedTopicIds: (row.named_topic_ids as string[] | null) ?? null,
    title: (row.title as string | null) ?? null,
    why: (row.why as string | null) ?? null,
    coreTopicIds: (row.core_topic_ids as string[] | null) ?? [],
    status: row.status as Kept['status'],
  }
}

function readOf(map: MapRead): SproutReading & { lines: KinLine[] } {
  const topics: KinTopic[] = map.topics.map(t => ({ id: t.id, subjects: t.subjects, vector: t.vector }))
  const lines = kinship({ topics, materials: map.materials, marks: map.marks, edges: map.edges })
  return { ...readSprouts({ topics, lines, materials: map.materials, marks: map.marks }), lines }
}

/** The reading as the sheet and the bed print it. */
function present(map: MapRead, given?: SproutReading & { lines: KinLine[] }): Sprouting {
  const reading = given ?? readOf(map)
  const matched = map.kept ? matchKept(reading.sprouts, map.kept) : new Map<string, Kept>()

  const byId = new Map(map.topics.map(t => [t.id, t]))
  const subjectById = new Map(map.subjects.map(s => [s.id, s]))
  const materialById = new Map(map.materials.map(m => [m.id, m]))

  const sprouts: SproutView[] = []
  let setAside = 0
  for (const sprout of reading.sprouts) {
    const kept = matched.get(sprout.key)
    if (kept && kept.status !== 'open') {
      if (kept.status !== 'planted') setAside++
      continue
    }

    const named = kept?.title ? kept : null
    const core = new Set(
      named?.coreTopicIds.filter(id => sprout.topicIds.includes(id)).length
        ? named.coreTopicIds
        : sprout.topicIds.slice(0, 3)
    )

    sprouts.push({
      id: kept?.id ?? null,
      key: sprout.key,
      title: named?.title ?? null,
      why: named?.why ?? null,
      kind: sprout.kind,
      from: sprout.from.flatMap(f => {
        const s = subjectById.get(f.subjectId)
        return s ? [{ subjectId: s.id, title: s.title, colour: s.colour, count: f.count }] : []
      }),
      topics: [
        ...sprout.topicIds.filter(id => core.has(id)),
        ...sprout.topicIds.filter(id => !core.has(id)),
      ].map(id => ({
        id,
        title: byId.get(id)?.title ?? id,
        loose: (byId.get(id)?.subjects.length ?? 0) === 0,
        core: core.has(id),
      })),
      material: sprout.binding.materials.slice(0, MATERIAL_SHOWN).flatMap(id => {
        const m = materialById.get(id)
        return m ? [{ id: m.id, title: m.title, read: m.read }] : []
      }),
      evidence: bindingSentence(sprout),
      stale: !!named && !nameStillFits(sprout.topicIds, named.namedTopicIds),
    })
  }

  return {
    sprouts,
    kinship: reading.lines.map(l => [l.a, l.b, Math.round(l.weight * 1000) / 1000]),
    found: foundSentence(reading.found),
    setAside,
    unnamed: map.kept ? sprouts.filter(s => !s.title || s.stale).length : 0,
    unembedded: map.unembedded,
    keeps: map.kept !== null,
  }
}

/* ------------------------------------------------------------ vectors */

/**
 * Embed `title — summary` for topics that have no kinship vector yet,
 * as many as the budget allows. Never fatal: a topic without one reads
 * by its title's vector until the next pass.
 */
async function fillKinVectors(db: SupabaseClient, warnings: string[]): Promise<number> {
  const { data, error } = await db.from('topics')
    .select('id, title, summary')
    .eq('state', 'active')
    .is('kin_embedding', null)
    .limit(FILL_BATCH)
  // Before `052` the column is not there, and there is nothing to fill.
  if (error || !data?.length) return 0

  const deadline = Date.now() + FILL_BUDGET_MS
  let filled = 0
  const queue = [...data]
  const worker = async () => {
    while (queue.length > 0 && Date.now() < deadline) {
      const topic = queue.shift()!
      try {
        const vector = await embed(kinText(topic.title as string, topic.summary as string | null))
        const { error: updateError } = await db.from('topics')
          .update({ kin_embedding: JSON.stringify(vector) })
          .eq('id', topic.id)
        if (!updateError) filled++
      } catch (e) {
        warnings.push(`Could not read "${topic.title}" for kinship: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return filled
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const held = new Set(a)
  return b.every(id => held.has(id))
}
