import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getHomeData } from '@/lib/home'

const URL = 'http://127.0.0.1:54351'
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
  await db.from('resource_nodes').delete().gte('relevance', 0)
  await db.from('nodes').delete().eq('user_id', USER)
  await db.from('resources').delete().eq('user_id', USER)
  await db.from('clusters').delete().eq('user_id', USER)
}

async function makeNode(over: Record<string, unknown>) {
  const title = (over.title as string) ?? 'Node'
  const { data, error } = await db.from('nodes').insert({
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
    expect(data.clusters).toEqual([])
    expect(data.hot).toEqual([])
    expect(data.cold).toEqual([])
    expect(data.suggested).toBeNull()
    expect(data.totals.nodes).toBe(0)
  })

  it('excludes pending nodes from totals but counts them separately', async () => {
    await wipe()
    await makeNode({ title: 'Active One', state: 'active' })
    await makeNode({ title: 'Pending One', state: 'pending' })

    const data = await getHomeData(db)
    expect(data.totals.nodes).toBe(1)
    expect(data.pendingCount).toBe(1)
  })

  it('classifies a recently touched node as hot', async () => {
    await wipe()
    await makeNode({ title: 'Fresh', ability: 3.0, last_exposure_at: daysAgo(1) })

    const data = await getHomeData(db)
    expect(data.hot.map(n => n.title)).toContain('Fresh')
    expect(data.cold).toHaveLength(0)
  })

  it('classifies a long-untouched known node as cold and suggests it', async () => {
    await wipe()
    await makeNode({ title: 'Faded', ability: 3.0, last_exposure_at: daysAgo(400) })

    const data = await getHomeData(db)
    expect(data.cold.map(n => n.title)).toContain('Faded')
    expect(data.suggested?.title).toBe('Faded')
  })

  it('does not call a never-touched node cold - unsown is not the same as faded', async () => {
    await wipe()
    await makeNode({ title: 'Never Read', ability: 1.0, last_exposure_at: null })

    const data = await getHomeData(db)
    expect(data.cold).toHaveLength(0)
    expect(data.hot).toHaveLength(0)
  })

  it('counts queued-but-unread material per cluster', async () => {
    await wipe()
    const { data: cluster } = await db.from('clusters')
      .insert({ user_id: USER, title: 'React', colour: '#c25c3a' })
      .select('id').single()

    const nodeId = await makeNode({ title: 'Hooks', cluster_id: cluster!.id })
    const { data: resource } = await db.from('resources').insert({
      user_id: USER, title: 'Unread Article', kind: 'article', status: 'queued',
    }).select('id').single()
    await db.from('resource_nodes').insert({
      resource_id: resource!.id, node_id: nodeId, relevance: 0.8,
    })

    const data = await getHomeData(db)
    expect(data.clusters[0].queuedCount).toBe(1)
    expect(data.queued).toHaveLength(1)
  })

  it('rolls cluster freshness toward its worst members', async () => {
    await wipe()
    const { data: cluster } = await db.from('clusters')
      .insert({ user_id: USER, title: 'Mixed', colour: '#3d4a2f' })
      .select('id').single()

    await makeNode({ title: 'Hot A', ability: 3, last_exposure_at: daysAgo(1), cluster_id: cluster!.id })
    await makeNode({ title: 'Hot B', ability: 3, last_exposure_at: daysAgo(1), cluster_id: cluster!.id })
    for (let i = 0; i < 8; i++) {
      await makeNode({ title: `Cold ${i}`, ability: 3, last_exposure_at: daysAgo(500), cluster_id: cluster!.id })
    }

    const data = await getHomeData(db)
    // A plain mean would be ~0.2; the worst-weighted mean must be lower.
    expect(data.clusters[0].freshness).toBeLessThan(0.2)
  })
})
