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
  await db.from('curricula').delete().eq('user_id', USER)
  await db.from('topics').delete().eq('user_id', USER)
  await db.from('subjects').delete().eq('user_id', USER)
  await db.from('resources').delete().eq('user_id', USER)
}

async function makeTopic(title: string) {
  const { data } = await db.from('topics').insert({
    user_id: USER, title, slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${uniq()}`,
    created_by: 'ai',
  }).select('id').single()
  return data!.id as string
}

async function makeRoute(topicId: string) {
  const { data } = await db.from('curricula').insert({
    user_id: USER, topic_id: topicId, title: 'A route', status: 'active', created_by: 'user',
  }).select('id').single()
  return data!.id as string
}

describe.skipIf(!reachable)('promote_topic_to_subject', () => {
  it('makes a subject and files the topic in it', async () => {
    await wipe()
    const topic = await makeTopic('Economic History')

    const { data: subjectId, error } = await db.rpc('promote_topic_to_subject', {
      p_topic: topic, p_colour: '#2f5233',
    })
    expect(error).toBeNull()

    const { data: filed } = await db.from('topic_subjects').select('topic_id')
      .eq('subject_id', subjectId)
    expect(filed!.map(f => f.topic_id)).toContain(topic)

    // The row survives: it can be carrying a reading log, and a subject
    // is not something you can have read.
    const { data: still } = await db.from('topics').select('primary_subject_id').eq('id', topic)
    expect(still).toHaveLength(1)
    expect(still![0].primary_subject_id).toBe(subjectId)
  })

  it('brings up everything the outline hangs under it', async () => {
    await wipe()
    const parent = await makeTopic('Row Level Security')
    const child = await makeTopic('Policies are additive')
    const grandchild = await makeTopic('Bypassing RLS')

    await db.from('edges').insert([
      { user_id: USER, from_topic: parent, to_topic: child, kind: 'specialises', weight: 0.8, created_by: 'ai' },
      { user_id: USER, from_topic: child, to_topic: grandchild, kind: 'prereq', weight: 0.8, created_by: 'ai' },
    ])

    const { data: subjectId } = await db.rpc('promote_topic_to_subject', {
      p_topic: parent, p_colour: '#2f5233',
    })

    const { data: filed } = await db.from('topic_subjects').select('topic_id')
      .eq('subject_id', subjectId)
    expect(filed!.map(f => f.topic_id).sort()).toEqual([parent, child, grandchild].sort())
  })

  it('keeps the reading log, which is why the row cannot be consumed', async () => {
    await wipe()
    const topic = await makeTopic('Economic History')
    const resource = await db.from('resources').insert({
      user_id: USER, title: 'An article', kind: 'article', status: 'consumed',
    }).select('id').single()

    await db.from('exposures').insert({
      user_id: USER, topic_id: topic, source: 'resource', source_id: resource.data!.id,
      depth: 'read', ability_delta: 0.5, reason: 'read of "An article"',
    })

    await db.rpc('promote_topic_to_subject', { p_topic: topic, p_colour: '#2f5233' })

    const { data } = await db.from('exposures').select('topic_id').eq('topic_id', topic)
    expect(data).toHaveLength(1)
  })

  it('refuses a topic that carries a route', async () => {
    await wipe()
    const topic = await makeTopic('React Hooks')
    await makeRoute(topic)

    const { error } = await db.rpc('promote_topic_to_subject', {
      p_topic: topic, p_colour: '#2f5233',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('route through it')
  })
})

describe.skipIf(!reachable)('demote_topic_into', () => {
  it('writes a lesson where the topic stood, and removes the row', async () => {
    await wipe()
    const topic = await makeTopic('Bypassing RLS')
    const into = await makeTopic('Row Level Security')
    const route = await makeRoute(into)

    const { data: lessonId, error } = await db.rpc('demote_topic_into', {
      p_topic: topic, p_into: into,
    })
    expect(error).toBeNull()

    const { data: lesson } = await db.from('lessons').select('title, curriculum_id, topic_id')
      .eq('id', lessonId).single()
    expect(lesson!.title).toBe('Bypassing RLS')
    expect(lesson!.curriculum_id).toBe(route)
    // Completing it writes an exposure against the topic it now sits in.
    expect(lesson!.topic_id).toBe(into)

    const { data: gone } = await db.from('topics').select('id').eq('id', topic)
    expect(gone).toHaveLength(0)
  })

  it('starts a draft route where the target has none', async () => {
    await wipe()
    const topic = await makeTopic('Bypassing RLS')
    const into = await makeTopic('Row Level Security')

    const { data: lessonId } = await db.rpc('demote_topic_into', { p_topic: topic, p_into: into })

    const { data: lesson } = await db.from('lessons').select('curriculum_id')
      .eq('id', lessonId).single()
    const { data: route } = await db.from('curricula').select('status, topic_id')
      .eq('id', lesson!.curriculum_id).single()
    // A draft, because a route that came into being as a side effect of
    // filing something is a proposal rather than a plan.
    expect(route!.status).toBe('draft')
    expect(route!.topic_id).toBe(into)
  })

  it('carries the marks and the reading log onto the target', async () => {
    await wipe()
    const topic = await makeTopic('Bypassing RLS')
    const into = await makeTopic('Row Level Security')
    const resource = await db.from('resources').insert({
      user_id: USER, title: 'The RLS docs', kind: 'article', status: 'consumed',
    }).select('id').single()

    await db.from('exposures').insert({
      user_id: USER, topic_id: topic, source: 'resource', source_id: resource.data!.id,
      depth: 'read', ability_delta: 0.5, reason: 'read of "The RLS docs"',
    })
    await db.from('highlights').insert({
      user_id: USER, topic_id: topic, quote: 'Policies are additive.',
    })

    await db.rpc('demote_topic_into', { p_topic: topic, p_into: into })

    const { data: exposures } = await db.from('exposures').select('topic_id').eq('topic_id', into)
    expect(exposures).toHaveLength(1)
    const { data: marks } = await db.from('highlights').select('topic_id').eq('topic_id', into)
    expect(marks).toHaveLength(1)
  })

  it('sends the lesson to what the topic was read from', async () => {
    await wipe()
    const topic = await makeTopic('Bypassing RLS')
    const into = await makeTopic('Row Level Security')
    const resource = await db.from('resources').insert({
      user_id: USER, title: 'The RLS docs', kind: 'article', status: 'queued',
    }).select('id').single()

    await db.from('resource_topics')
      .insert({ resource_id: resource.data!.id, topic_id: topic, relevance: 0.9 })

    const { data: lessonId } = await db.rpc('demote_topic_into', { p_topic: topic, p_into: into })

    const { data } = await db.from('lesson_resources').select('resource_id').eq('lesson_id', lessonId)
    expect(data!.map(r => r.resource_id)).toEqual([resource.data!.id])
  })

  it('refuses a topic that carries a route', async () => {
    await wipe()
    const topic = await makeTopic('Bypassing RLS')
    const into = await makeTopic('Row Level Security')
    await makeRoute(topic)

    const { error } = await db.rpc('demote_topic_into', { p_topic: topic, p_into: into })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('route through it')
  })

  it('refuses to demote a topic into itself', async () => {
    await wipe()
    const topic = await makeTopic('Bypassing RLS')
    const { error } = await db.rpc('demote_topic_into', { p_topic: topic, p_into: topic })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('itself')
  })
})
