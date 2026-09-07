import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { setResourceStatus } from '@/lib/consume'

// Runs against the local Supabase stack (npx supabase start).
// Skipped when it is not reachable, so CI without Docker still passes.
const URL = 'http://127.0.0.1:54351'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const USER = '11111111-1111-1111-1111-111111111111'

const db: SupabaseClient = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

// Probed at module scope: skipIf is evaluated during collection, so a
// beforeAll would set this too late and every test would skip.
const reachable = await fetch(`${URL}/rest/v1/`, { signal: AbortSignal.timeout(2000) })
  .then(r => r.ok || r.status === 400 || r.status === 404)
  .catch(() => false)

async function seed() {
  await db.from('exposures').delete().eq('user_id', USER)
  await db.from('resource_nodes').delete().neq('relevance', -1)
  await db.from('nodes').delete().eq('user_id', USER)
  await db.from('resources').delete().eq('user_id', USER)

  const { data: node } = await db.from('nodes').insert({
    user_id: USER,
    title: 'React Hooks',
    slug: `react-hooks-${Math.random().toString(36).slice(2, 8)}`,
    created_by: 'ai',
  }).select('id').single()

  const { data: resource } = await db.from('resources').insert({
    user_id: USER,
    title: 'A Hooks Article',
    kind: 'article',
    status: 'queued',
  }).select('id').single()

  await db.from('resource_nodes').insert({
    resource_id: resource!.id,
    node_id: node!.id,
    relevance: 0.9,
  })

  return { nodeId: node!.id, resourceId: resource!.id }
}

describe.skipIf(!reachable)('setResourceStatus against real Postgres', () => {
  it('writes no exposure when a resource is merely marked as reading', async () => {
    const { resourceId, nodeId } = await seed()
    await setResourceStatus(db, resourceId, 'reading')

    const { data } = await db.from('exposures').select('*').eq('node_id', nodeId)
    expect(data).toHaveLength(0)
  })

  it('writes an exposure per linked node when consumed', async () => {
    const { resourceId, nodeId } = await seed()
    const result = await setResourceStatus(db, resourceId, 'consumed', 'read')

    expect(result.exposuresWritten).toBe(1)
    const { data } = await db.from('exposures').select('*').eq('node_id', nodeId)
    expect(data).toHaveLength(1)
    expect(data![0].depth).toBe('read')
    expect(data![0].reason).toContain('A Hooks Article')
  })

  it('raises ability above the floor once consumed', async () => {
    const { resourceId, nodeId } = await seed()
    await setResourceStatus(db, resourceId, 'consumed', 'read')

    const { data } = await db.from('nodes').select('ability, ability_confidence, last_exposure_at')
      .eq('id', nodeId).single()
    expect(Number(data!.ability)).toBeGreaterThan(1.0)
    expect(data!.last_exposure_at).not.toBeNull()
  })

  it('keeps ability at or below the consumption ceiling for reads', async () => {
    const { resourceId, nodeId } = await seed()
    await setResourceStatus(db, resourceId, 'consumed', 'read')

    const { data } = await db.from('nodes').select('ability').eq('id', nodeId).single()
    expect(Number(data!.ability)).toBeLessThanOrEqual(3.5)
  })

  it('refuses to consume without a depth', async () => {
    const { resourceId } = await seed()
    await expect(setResourceStatus(db, resourceId, 'consumed'))
      .rejects.toThrow('depth is required')
  })

  it('refuses an unknown status', async () => {
    const { resourceId } = await seed()
    await expect(setResourceStatus(db, resourceId, 'finished' as never))
      .rejects.toThrow('invalid status')
  })
})
