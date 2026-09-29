import { describe, it, expect } from 'vitest'
import { looseTopics, removeResource } from '@/lib/removal'
import { onlyFrom } from '@/lib/refile'
import { fakeDb } from './fake-db'

/**
 * Removing a resource from the inbox, and the topics only it brought in.
 *
 * What matters is that nothing is taken that anything else holds, and
 * that nothing is taken at all unless it was asked for.
 */

const world = () =>
  fakeDb({
    resources: [
      { id: 'r', user_id: 'u', storage_path: 'u/book.pdf' },
      { id: 'other', user_id: 'u', storage_path: null },
    ],
    resource_topics: [
      { resource_id: 'r', topic_id: 'bare' },
      { resource_id: 'r', topic_id: 'shared' },
      { resource_id: 'r', topic_id: 'taught' },
      { resource_id: 'other', topic_id: 'shared' },
    ],
    topics: [
      { id: 'bare', title: 'Bloom filters', state: 'active', user_id: 'u', created_by: 'ai' },
      { id: 'shared', title: 'Hashing', state: 'active', user_id: 'u', created_by: 'ai' },
      { id: 'taught', title: 'Sets', state: 'active', user_id: 'u', created_by: 'ai' },
    ],
    lessons: [{ topic_id: 'taught' }],
  })

describe('onlyFrom, asked before the links go', () => {
  it('does not count the resource being removed as holding anything', async () => {
    const { db } = world()
    expect(await onlyFrom(db, ['bare', 'shared', 'taught'], { besides: 'r' })).toEqual(['bare'])
    // Asked without `besides`, the resource's own link holds them all.
    expect(await onlyFrom(db, ['bare', 'shared', 'taught'])).toEqual([])
  })
})

describe('looseTopics', () => {
  it('names only the topics nothing else holds', async () => {
    const { db } = world()
    expect(await looseTopics(db, 'u', 'r')).toEqual([{ id: 'bare', title: 'Bloom filters', state: 'active', user_id: 'u', created_by: 'ai' }])
  })
})

describe('removeResource', () => {
  it('leaves the topics alone unless asked', async () => {
    const { db, log } = world()
    expect(await removeResource(db, 'u', 'r')).toEqual({ ok: true, topicsRemoved: 0 })
    expect(log.some(e => e.table === 'topics' && e.op === 'delete')).toBe(false)
    expect(log.some(e => e.table === 'storage:resources')).toBe(true)
  })

  it('takes only the loose topics when asked', async () => {
    const { db, log } = world()
    const result = await removeResource(db, 'u', 'r', { topics: true })
    expect(result).toEqual({ ok: true, topicsRemoved: 1 })
    const deleted = log.find(e => e.table === 'topics' && e.op === 'delete')
    expect(deleted?.where).toContainEqual(['in', 'id', ['bare']])
  })

  it('refuses a resource read into the record, and one that is not the caller’s', async () => {
    const read = fakeDb({ resources: [{ id: 'r', user_id: 'u' }] }, { exposures: 1 })
    expect(await removeResource(read.db, 'u', 'r', { topics: true })).toMatchObject({ ok: false, status: 409 })
    const { db } = world()
    expect(await removeResource(db, 'someone-else', 'r')).toMatchObject({ ok: false, status: 404 })
  })
})
