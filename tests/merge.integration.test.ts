import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54351'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const USER = '11111111-1111-1111-1111-111111111111'

const db: SupabaseClient = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

const reachable = await fetch(`${URL}/rest/v1/`, { signal: AbortSignal.timeout(2000) })
  .then(r => r.ok || r.status === 400 || r.status === 404)
  .catch(() => false)

const uniq = () => Math.random().toString(36).slice(2, 8)

async function wipe() {
  await db.from('exposures').delete().eq('user_id', USER)
  await db.from('edges').delete().eq('user_id', USER)
  await db.from('resource_nodes').delete().gte('relevance', 0)
  await db.from('nodes').delete().eq('user_id', USER)
  await db.from('resources').delete().eq('user_id', USER)
}

async function makeNode(title: string) {
  const { data } = await db.from('nodes').insert({
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

describe.skipIf(!reachable)('merge_nodes against real Postgres', () => {
  it('moves exposures onto the surviving node', async () => {
    await wipe()
    const dupe = await makeNode('Hooks in React')
    const canonical = await makeNode('React Hooks')
    const resource = await makeResource('Article')

    await db.from('exposures').insert({
      user_id: USER, node_id: dupe, source: 'resource', source_id: resource,
      depth: 'read', ability_delta: 0.5, reason: 'read of "Article"',
    })

    await db.rpc('merge_nodes', { p_from: dupe, p_into: canonical })

    const { data: moved } = await db.from('exposures').select('*').eq('node_id', canonical)
    expect(moved).toHaveLength(1)
    const { data: gone } = await db.from('nodes').select('*').eq('id', dupe)
    expect(gone).toHaveLength(0)
  })

  it('keeps the stronger relevance when both nodes share a resource', async () => {
    await wipe()
    const dupe = await makeNode('Hooks in React')
    const canonical = await makeNode('React Hooks')
    const resource = await makeResource('Shared Article')

    await db.from('resource_nodes').insert([
      { resource_id: resource, node_id: dupe, relevance: 0.9 },
      { resource_id: resource, node_id: canonical, relevance: 0.4 },
    ])

    await db.rpc('merge_nodes', { p_from: dupe, p_into: canonical })

    const { data } = await db.from('resource_nodes').select('*').eq('resource_id', resource)
    expect(data).toHaveLength(1)
    expect(Number(data![0].relevance)).toBeCloseTo(0.9)
  })

  it('re-points edges and drops the self-edge the merge creates', async () => {
    await wipe()
    const dupe = await makeNode('Hooks in React')
    const canonical = await makeNode('React Hooks')
    const other = await makeNode('JavaScript')

    await db.from('edges').insert([
      { user_id: USER, from_node: dupe, to_node: canonical, kind: 'related', weight: 0.5, created_by: 'ai' },
      { user_id: USER, from_node: dupe, to_node: other, kind: 'prereq', weight: 0.8, created_by: 'ai' },
    ])

    await db.rpc('merge_nodes', { p_from: dupe, p_into: canonical })

    const { data } = await db.from('edges').select('*')
    // dupe->canonical became canonical->canonical and was dropped;
    // dupe->other survives as canonical->other.
    expect(data).toHaveLength(1)
    expect(data![0].from_node).toBe(canonical)
    expect(data![0].to_node).toBe(other)
  })

  it('refuses to merge a node into itself', async () => {
    await wipe()
    const node = await makeNode('React Hooks')
    const { error } = await db.rpc('merge_nodes', { p_from: node, p_into: node })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('itself')
  })
})
