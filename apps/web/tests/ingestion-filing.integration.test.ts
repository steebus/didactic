import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_URL, LOCAL_SERVICE_KEY, DEV_USER as USER, localDbReachable } from './local-db'

const db: SupabaseClient = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } })
const reachable = await localDbReachable()

const uniq = () => Math.random().toString(36).slice(2, 8)
const vector = JSON.stringify(new Array(384).fill(0).map((_, i) => (i === 0 ? 1 : 0)))

async function wipe() {
  await db.from('edges').delete().eq('user_id', USER)
  await db.from('resource_topics').delete().gte('relevance', 0)
  await db.from('topics').delete().eq('user_id', USER)
  await db.from('subjects').delete().eq('user_id', USER)
  await db.from('resources').delete().eq('user_id', USER)
}

async function makeResource() {
  const { data } = await db.from('resources').insert({
    user_id: USER, title: `A book ${uniq()}`, kind: 'book',
  }).select('id').single()
  return data!.id as string
}

async function makeSubject(title: string) {
  const { data } = await db.from('subjects').insert({
    user_id: USER, title, colour: '#2f5233',
  }).select('id').single()
  return data!.id as string
}

async function makeTopic(title: string, summary: string | null, subjectId?: string) {
  const { data } = await db.from('topics').insert({
    user_id: USER, title, summary, slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${uniq()}`,
    created_by: 'ai',
  }).select('id').single()
  const id = data!.id as string
  if (subjectId) await db.from('topic_subjects').insert({ topic_id: id, subject_id: subjectId })
  return id
}

const newTopic = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  slug: title.toLowerCase().replace(/\W+/g, '-'),
  summary: `What ${title} covers.`,
  embedding: vector,
  state: 'active',
  relevance: 0.8,
  ...extra,
})

async function commit(resourceId: string, topics: unknown[], links: unknown[] = []) {
  const { data, error } = await db.rpc('commit_ingestion', {
    p_resource_id: resourceId,
    p_user_id: USER,
    p_summary: 'A book.',
    p_new_topics: topics,
    p_links: links,
  })
  expect(error).toBeNull()
  return (data ?? []) as Array<{ out_id: string; out_title: string }>
}

async function subjectsOf(topicId: string) {
  const { data } = await db.from('topic_subjects').select('subject_id').eq('topic_id', topicId)
  return (data ?? []).map(r => r.subject_id as string).sort()
}

describe.skipIf(!reachable)('commit_ingestion files by reading (045)', () => {
  it('files a read topic under the subjects the reading named, and stores its description', async () => {
    await wipe()
    const investing = await makeSubject('Investing')
    const resource = await makeResource()

    const [created] = await commit(resource, [newTopic('P/E Ratio', { subject_ids: [investing] })])

    expect(await subjectsOf(created.out_id)).toEqual([investing])
    const { data } = await db.from('topics').select('summary').eq('id', created.out_id).single()
    expect(data!.summary).toBe('What P/E Ratio covers.')
  })

  it('files a topic read as standing alone nowhere, even where the agreement rule would have', async () => {
    await wipe()
    const investing = await makeSubject('Investing')
    const matched = await makeTopic('Value Investing', null, investing)
    const resource = await makeResource()

    const [created] = await commit(
      resource,
      [newTopic('Economic History', { subject_ids: [] })],
      [{ topic_id: matched, relevance: 0.9 }]
    )
    expect(await subjectsOf(created.out_id)).toEqual([])
  })

  it('falls back to the agreement rule for a topic nobody read', async () => {
    await wipe()
    const investing = await makeSubject('Investing')
    const matched = await makeTopic('Value Investing', null, investing)
    const resource = await makeResource()

    const [created] = await commit(
      resource,
      [newTopic('Margin of Safety')],
      [{ topic_id: matched, relevance: 0.9 }]
    )
    expect(await subjectsOf(created.out_id)).toEqual([investing])
  })

  it("refuses a subject that is not the owner's", async () => {
    await wipe()
    const resource = await makeResource()
    const [created] = await commit(resource, [
      newTopic('P/E Ratio', { subject_ids: ['00000000-0000-0000-0000-000000000000', 'not-a-uuid'] }),
    ])
    expect(await subjectsOf(created.out_id)).toEqual([])
  })

  it('never files a pending topic, whatever the reading said', async () => {
    await wipe()
    const investing = await makeSubject('Investing')
    const resource = await makeResource()
    const [created] = await commit(resource, [
      newTopic('PE Ratio', { state: 'pending', subject_ids: [investing] }),
    ])
    expect(await subjectsOf(created.out_id)).toEqual([])
  })

  it('gives a matched topic a description only where it has none', async () => {
    await wipe()
    const bare = await makeTopic('Price-to-Earnings Ratio', null)
    const written = await makeTopic('Mr Market', 'Graham’s allegory for price moods.')
    const resource = await makeResource()

    await commit(resource, [], [
      { topic_id: bare, relevance: 0.7, summary: 'Share price over earnings per share.' },
      { topic_id: written, relevance: 0.7, summary: 'Something else entirely.' },
    ])

    const { data } = await db.from('topics').select('id, summary').in('id', [bare, written])
    const summary = new Map((data ?? []).map(t => [t.id, t.summary]))
    expect(summary.get(bare)).toBe('Share price over earnings per share.')
    expect(summary.get(written)).toBe('Graham’s allegory for price moods.')
  })
})
