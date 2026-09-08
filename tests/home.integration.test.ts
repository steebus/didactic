import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getHomeData } from '@/lib/home'

const URL = 'http://127.0.0.1:54600'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const USER = '11111111-1111-1111-1111-111111111111'

const db: SupabaseClient = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

const reachable = await fetch(`${URL}/rest/v1/`, { signal: AbortSignal.timeout(2000) })
  .then(r => r.ok || r.status === 400 || r.status === 404)
  .catch(() => false)

const uniq = () => Math.random().toString(36).slice(2, 8)
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString()

async function wipe() {
  await db.from('exposures').delete().eq('user_id', USER)
  await db.from('edges').delete().eq('user_id', USER)
  await db.from('resource_topics').delete().gte('relevance', 0)
  await db.from('topic_subjects').delete().in('created_by', ['ai', 'user', 'skeleton'])
  await db.from('topics').delete().eq('user_id', USER)
  await db.from('resources').delete().eq('user_id', USER)
  await db.from('subjects').delete().eq('user_id', USER)
}

async function makeTopic(over: Record<string, unknown>) {
  const title = (over.title as string) ?? 'Topic'
  const { data, error } = await db.from('topics').insert({
    user_id: USER,
    title,
    slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${uniq()}`,
    created_by: 'ai',
    ...over,
  }).select('id').single()
  if (error) throw error
  return data!.id as string
}

describe.skipIf(!reachable)('getHomeData against real Postgres', () => {
  it('returns empty structures on a fresh database rather than throwing', async () => {
    await wipe()
    const data = await getHomeData(db)
    expect(data.subjects).toEqual([])
    expect(data.hot).toEqual([])
    expect(data.cold).toEqual([])
    expect(data.suggested).toBeNull()
    expect(data.totals.topics).toBe(0)
  })

  it('excludes pending topics from totals but counts them separately', async () => {
    await wipe()
    await makeTopic({ title: 'Active One', state: 'active' })
    await makeTopic({ title: 'Pending One', state: 'pending' })

    const data = await getHomeData(db)
    expect(data.totals.topics).toBe(1)
    expect(data.pendingCount).toBe(1)
  })

  it('classifies a recently touched topic as hot', async () => {
    await wipe()
    await makeTopic({ title: 'Fresh', ability: 3.0, last_exposure_at: daysAgo(1) })

    const data = await getHomeData(db)
    expect(data.hot.map(n => n.title)).toContain('Fresh')
    expect(data.cold).toHaveLength(0)
  })

  it('classifies a long-untouched known topic as cold and suggests it', async () => {
    await wipe()
    await makeTopic({ title: 'Faded', ability: 3.0, last_exposure_at: daysAgo(400) })

    const data = await getHomeData(db)
    expect(data.cold.map(n => n.title)).toContain('Faded')
    expect(data.suggested?.title).toBe('Faded')
  })

  it('does not call a never-touched topic cold - unsown is not the same as faded', async () => {
    await wipe()
    await makeTopic({ title: 'Never Read', ability: 1.0, last_exposure_at: null })

    const data = await getHomeData(db)
    expect(data.cold).toHaveLength(0)
    expect(data.hot).toHaveLength(0)
  })

  it('counts queued-but-unread material per subject', async () => {
    await wipe()
    const { data: subject } = await db.from('subjects')
      .insert({ user_id: USER, title: 'React', colour: '#c25c3a' })
      .select('id').single()

    const topicId = await makeTopic({ title: 'Hooks', primary_subject_id: subject!.id })
    const { data: resource } = await db.from('resources').insert({
      user_id: USER, title: 'Unread Article', kind: 'article', status: 'queued',
    }).select('id').single()
    await db.from('resource_topics').insert({
      resource_id: resource!.id, topic_id: topicId, relevance: 0.8,
    })

    const data = await getHomeData(db)
    expect(data.subjects[0].queuedCount).toBe(1)
    expect(data.queued).toHaveLength(1)
  })

  it('counts a topic toward every subject it is filed under', async () => {
    await wipe()
    const [{ data: portrait }, { data: landscape }] = await Promise.all([
      db.from('subjects').insert({ user_id: USER, title: 'Portraits', colour: '#6b4a5a' })
        .select('id').single(),
      db.from('subjects').insert({ user_id: USER, title: 'Landscapes', colour: '#3d4a2f' })
        .select('id').single(),
    ])

    // Exposure is needed by both and belongs to both. Under the old
    // single owning subject one of them would have shown as empty.
    const topicId = await makeTopic({
      title: 'Exposure', ability: 3, last_exposure_at: daysAgo(2),
      primary_subject_id: portrait!.id,
    })
    await db.from('topic_subjects')
      .insert({ topic_id: topicId, subject_id: landscape!.id, created_by: 'user' })

    const data = await getHomeData(db)
    expect(data.subjects.map(s => s.count)).toEqual([1, 1])
    expect(data.unfiled).toEqual([])
  })

  it('rolls subject freshness toward its worst members', async () => {
    await wipe()
    const { data: subject } = await db.from('subjects')
      .insert({ user_id: USER, title: 'Mixed', colour: '#3d4a2f' })
      .select('id').single()

    await makeTopic({ title: 'Hot A', ability: 3, last_exposure_at: daysAgo(1), primary_subject_id: subject!.id })
    await makeTopic({ title: 'Hot B', ability: 3, last_exposure_at: daysAgo(1), primary_subject_id: subject!.id })
    for (let i = 0; i < 8; i++) {
      await makeTopic({ title: `Cold ${i}`, ability: 3, last_exposure_at: daysAgo(500), primary_subject_id: subject!.id })
    }

    const data = await getHomeData(db)
    // A plain mean would be ~0.2; the worst-weighted mean must be lower.
    expect(data.subjects[0].freshness).toBeLessThan(0.2)
  })
})
