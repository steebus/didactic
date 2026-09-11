import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_URL, LOCAL_SERVICE_KEY, DEV_USER, localDbReachable } from './local-db'

/**
 * What row level security is actually for.
 *
 * The API is on the service role and bypasses all of this, so these
 * tests say nothing about the web. What they cover is the surface the
 * phone uses: PostgREST with the owner's token, and PostgREST with no
 * token at all. A wrong policy does not raise an error there -- it
 * returns zero rows -- so the failure this guards against looks like an
 * empty app rather than a broken one.
 */

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/**
 * Every table the migration locks, plus the one 020 locked already.
 *
 * Listed by hand because PostgREST cannot read pg_class: a table added
 * later is caught by the migration's own enumeration, not by this file.
 */
const OWNED = [
  'subjects', 'topics', 'edges', 'resources', 'exposures',
  'conversations', 'curricula', 'lessons', 'subject_sowings', 'highlights',
]
const JOINED = [
  'topic_subjects', 'resource_topics', 'resource_subjects',
  'lesson_prereqs', 'lesson_resources', 'curriculum_sources',
  'messages', 'ingestion_jobs',
]

const admin: SupabaseClient = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
  auth: { persistSession: false },
})
const anon: SupabaseClient = createClient(LOCAL_URL, ANON_KEY, {
  auth: { persistSession: false },
})

const reachable = await localDbReachable()

let owner: SupabaseClient
let subjectId: string

beforeAll(async () => {
  if (!reachable) return

  // A real sign-in rather than a minted token: the seeded identity row
  // is what makes this possible, and a token GoTrue issued is the one
  // the phone will actually carry.
  const signedIn = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await signedIn.auth.signInWithPassword({
    email: 'dev@localhost',
    password: 'didactic-dev',
  })
  if (error) throw error
  owner = createClient(LOCAL_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })

  // Something of the owner's to find. Written on the service role,
  // which is how everything is written today.
  const { data: subject, error: writeError } = await admin
    .from('subjects')
    .insert({
      user_id: DEV_USER,
      title: `RLS probe ${Math.random().toString(36).slice(2, 8)}`,
      colour: '#3d4a2f',
    })
    .select('id')
    .single()
  if (writeError) throw writeError
  subjectId = subject!.id
})

afterAll(async () => {
  // The probe is the only row this file writes. Integration tests wipe
  // by user before they run, but leaving it would still put a subject
  // in front of anyone opening the app between runs.
  if (reachable && subjectId) await admin.from('subjects').delete().eq('id', subjectId)
})

describe.skipIf(!reachable)('row level security', () => {
  it('reads nothing from any locked table without a session', async () => {
    for (const table of [...OWNED, ...JOINED]) {
      const { data: rows, error } = await anon.from(table).select('*').limit(1)
      expect(error, `${table} errored instead of returning nothing`).toBeNull()
      expect(rows, `${table} is readable without a session`).toEqual([])
    }
  })

  it('reads nothing at all without a session', async () => {
    const { data, error } = await anon.from('subjects').select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("reads the owner's rows with the owner's token", async () => {
    const { data, error } = await owner.from('subjects').select('id').eq('id', subjectId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("refuses a write that files the owner's row under another account", async () => {
    const stranger = '22222222-2222-2222-2222-222222222222'
    const { error } = await owner
      .from('subjects')
      .insert({ user_id: stranger, title: 'not mine' })
    // with check is what stops this; without it the insert succeeds.
    expect(error).not.toBeNull()
  })

  it('leaves the admin client unaffected, which is what the API runs on', async () => {
    const { data, error } = await admin.from('subjects').select('id').eq('id', subjectId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
