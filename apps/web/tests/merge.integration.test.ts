import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54600'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const USER = '11111111-1111-1111-1111-111111111111'

const db: SupabaseClient = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

const reachable = await fetch(`${URL}/rest/v1/`, { signal: AbortSignal.timeout(2000) })
  .then(r => r.ok || r.status === 400 || r.status === 404)
  .catch(() => false)

const uniq = () => Math.random().toString(36).slice(2, 8)

async function wipe() {
  await db.from('exposures').delete().eq('user_id', USER)
  await db.from('highlight_tags').delete().eq('user_id', USER)
  await db.from('highlights').delete().eq('user_id', USER)
  await db.from('edges').delete().eq('user_id', USER)
  await db.from('resource_topics').delete().gte('relevance', 0)
  await db.from('topics').delete().eq('user_id', USER)
  await db.from('resources').delete().eq('user_id', USER)
}

async function makeTopic(title: string) {
  const { data } = await db.from('topics').insert({
    user_id: USER, title, slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${uniq()}`,
    created_by: 'ai',
  }).select('id').single()
  return data!.id as string
}

async function makeResource(title: string) {
  const { data } = await db.from('resources').insert({
    user_id: USER, title, kind: 'article', status: 'queued',
  }).select('id').single()
  return data!.id as string
}

describe.skipIf(!reachable)('merge_topics against real Postgres', () => {
  it('moves exposures onto the surviving topic', async () => {
    await wipe()
    const dupe = await makeTopic('Hooks in React')
    const canonical = await makeTopic('React Hooks')
    const resource = await makeResource('Article')

    await db.from('exposures').insert({
      user_id: USER, topic_id: dupe, source: 'resource', source_id: resource,
      depth: 'read', ability_delta: 0.5, reason: 'read of "Article"',
    })

    await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })

    const { data: moved } = await db.from('exposures').select('*').eq('topic_id', canonical)
    expect(moved).toHaveLength(1)
    const { data: gone } = await db.from('topics').select('*').eq('id', dupe)
    expect(gone).toHaveLength(0)
  })

  it('keeps the stronger relevance when both topics share a resource', async () => {
    await wipe()
    const dupe = await makeTopic('Hooks in React')
    const canonical = await makeTopic('React Hooks')
    const resource = await makeResource('Shared Article')

    await db.from('resource_topics').insert([
      { resource_id: resource, topic_id: dupe, relevance: 0.9 },
      { resource_id: resource, topic_id: canonical, relevance: 0.4 },
    ])

    await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })

    const { data } = await db.from('resource_topics').select('*').eq('resource_id', resource)
    expect(data).toHaveLength(1)
    expect(Number(data![0].relevance)).toBeCloseTo(0.9)
  })

  it('re-points edges and drops the self-edge the merge creates', async () => {
    await wipe()
    const dupe = await makeTopic('Hooks in React')
    const canonical = await makeTopic('React Hooks')
    const other = await makeTopic('JavaScript')

    await db.from('edges').insert([
      { user_id: USER, from_topic: dupe, to_topic: canonical, kind: 'related', weight: 0.5, created_by: 'ai' },
      { user_id: USER, from_topic: dupe, to_topic: other, kind: 'prereq', weight: 0.8, created_by: 'ai' },
    ])

    await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })

    const { data } = await db.from('edges').select('*')
    // dupe->canonical became canonical->canonical and was dropped;
    // dupe->other survives as canonical->other.
    expect(data).toHaveLength(1)
    expect(data![0].from_topic).toBe(canonical)
    expect(data![0].to_topic).toBe(other)
  })

  /**
   * The failure the adjudication queue was actually reporting:
   *
   *     duplicate key value violates unique constraint
   *     "edges_from_node_to_node_kind_key"
   *
   * Two topics both leading to a third is the ordinary shape of a
   * duplicate -- it is most of why the two are being merged -- and the
   * function moved the edges first and cleared the collisions
   * afterwards, so the move itself failed on the constraint.
   */
  it('folds two edges onto the same third topic into one', async () => {
    await wipe()
    const dupe = await makeTopic('Defensive vs Enterprising Investor')
    const canonical = await makeTopic('Speculation vs Investment')
    const other = await makeTopic('Margin of Safety')

    await db.from('edges').insert([
      { user_id: USER, from_topic: dupe, to_topic: other, kind: 'related', weight: 0.9, created_by: 'ai' },
      { user_id: USER, from_topic: canonical, to_topic: other, kind: 'related', weight: 0.4, created_by: 'ai' },
    ])

    const { error } = await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })
    expect(error).toBeNull()

    const { data } = await db.from('edges').select('*')
    expect(data).toHaveLength(1)
    expect(data![0].from_topic).toBe(canonical)
    // The survivor keeps the stronger of the two weights, so merging a
    // duplicate never weakens a connection the map already drew.
    expect(Number(data![0].weight)).toBeCloseTo(0.9)
  })

  it('folds a collision on the incoming side too', async () => {
    await wipe()
    const dupe = await makeTopic('DOM Update Performance')
    const canonical = await makeTopic('DOM Batching')
    const other = await makeTopic('Reflow')

    await db.from('edges').insert([
      { user_id: USER, from_topic: other, to_topic: dupe, kind: 'prereq', weight: 0.5, created_by: 'ai' },
      { user_id: USER, from_topic: other, to_topic: canonical, kind: 'prereq', weight: 0.5, created_by: 'ai' },
    ])

    const { error } = await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })
    expect(error).toBeNull()

    const { data } = await db.from('edges').select('*')
    expect(data).toHaveLength(1)
    expect(data![0].to_topic).toBe(canonical)
  })

  it('keeps an edge of a different kind between the same pair', async () => {
    // The constraint is on (from, to, kind), so two topics may be both
    // a prerequisite and related. Folding one into the other must not
    // quietly drop the second reading.
    await wipe()
    const dupe = await makeTopic('Hooks in React')
    const canonical = await makeTopic('React Hooks')
    const other = await makeTopic('JavaScript')

    await db.from('edges').insert([
      { user_id: USER, from_topic: dupe, to_topic: other, kind: 'related', weight: 0.5, created_by: 'ai' },
      { user_id: USER, from_topic: canonical, to_topic: other, kind: 'prereq', weight: 0.5, created_by: 'ai' },
    ])

    await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })

    const { data } = await db.from('edges').select('kind').order('kind')
    expect(data!.map(e => e.kind)).toEqual(['prereq', 'related'])
  })

  it('carries the marked passages over rather than cutting them loose', async () => {
    // `highlights.topic_id` is `on delete set null` (022), so before
    // `043` a merge left every passage marked on the duplicate filed
    // under nothing -- the least replaceable thing in the app.
    await wipe()
    const dupe = await makeTopic('Hooks in React')
    const canonical = await makeTopic('React Hooks')

    await db.from('highlights').insert({
      user_id: USER, topic_id: dupe, quote: 'A hook is just a function.',
    })

    await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })

    const { data } = await db.from('highlights').select('topic_id')
    expect(data).toHaveLength(1)
    expect(data![0].topic_id).toBe(canonical)
  })

  it('folds a note that named both topics into one tag', async () => {
    // `highlight_tags` is unique per (mark, topic) and cascades on
    // delete, so the duplicate's tag is dropped rather than moved onto
    // one that already exists -- naming the same thing twice in one
    // note is one tag, not two.
    await wipe()
    const dupe = await makeTopic('Hooks in React')
    const canonical = await makeTopic('React Hooks')

    const { data: mark } = await db.from('highlights').insert({
      user_id: USER, topic_id: canonical, quote: 'Both names, one thing.',
    }).select('id').single()

    await db.from('highlight_tags').insert([
      { user_id: USER, highlight_id: mark!.id, topic_id: dupe },
      { user_id: USER, highlight_id: mark!.id, topic_id: canonical },
    ])

    const { error } = await db.rpc('merge_topics', { p_from: dupe, p_into: canonical })
    expect(error).toBeNull()

    const { data } = await db.from('highlight_tags').select('topic_id')
    expect(data).toHaveLength(1)
    expect(data![0].topic_id).toBe(canonical)
  })

  it('refuses to merge a topic into itself', async () => {
    await wipe()
    const topic = await makeTopic('React Hooks')
    const { error } = await db.rpc('merge_topics', { p_from: topic, p_into: topic })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('itself')
  })
})
