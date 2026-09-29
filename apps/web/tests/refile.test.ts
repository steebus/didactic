import { describe, it, expect } from 'vitest'
import { REFILE_READ } from '@didactic/core/whole'
import { onlyFrom, refileResource } from '@/lib/refile'
import { fakeDb } from './fake-db'

/**
 * Filing a resource again, as one topic or by its parts.
 *
 * What matters is what goes: the resource's links, and the topics that
 * exist only because it brought them in -- never one anything else
 * holds, whether that is another resource, a lesson, a mark, a bed it
 * was sown into or a person's own hand.
 */

const resource = { id: 'r', user_id: 'u', kind: 'article' }

describe('onlyFrom', () => {
  it('lets go only of topics nothing else holds', async () => {
    const { db } = fakeDb({
      topics: [
        { id: 'bare', created_by: 'ai' },
        { id: 'mine', created_by: 'user' },
        { id: 'read', created_by: 'ai' },
        { id: 'sown', created_by: 'ai' },
        { id: 'elsewhere', created_by: 'ai' },
        { id: 'filed', created_by: 'ai' },
        { id: 'marked', created_by: 'ai' },
      ],
      exposures: [{ topic_id: 'read' }],
      topic_subjects: [
        { topic_id: 'sown', created_by: 'ai', position: 3 },
        { topic_id: 'filed', created_by: 'ai', position: null },
      ],
      resource_topics: [{ topic_id: 'elsewhere' }],
      highlights: [{ topic_id: 'marked' }],
    })
    const gone = await onlyFrom(db, ['bare', 'mine', 'read', 'sown', 'elsewhere', 'filed', 'marked'])
    // `filed` was placed in a subject by the reading alone, which is the
    // reading's own work and goes with it.
    expect(gone.sort()).toEqual(['bare', 'filed'])
  })

  it('keeps everything it was asked about when a table cannot be read', async () => {
    const { db } = fakeDb({ topics: [{ id: 'bare', created_by: 'ai' }] }, { failing: ['clozes'] })
    expect(await onlyFrom(db, ['bare'])).toEqual([])
  })
})

describe('refileResource', () => {
  it('keeps the say, clears the old filing and what only it brought in, and reads it again', async () => {
    const { db, log } = fakeDb({
      resources: [resource],
      resource_topics: [{ resource_id: 'r', topic_id: 'hash' }, { resource_id: 'r', topic_id: 'js' }],
      topics: [{ id: 'hash', created_by: 'ai' }, { id: 'js', created_by: 'ai' }],
      lessons: [{ topic_id: 'js' }],
      ingestion_jobs: [{ id: 'j', resource_id: 'r' }],
    })

    expect(await refileResource(db, 'u', 'r', 'whole')).toEqual({ ok: true, cleared: 1, queued: true })
    const writes = log.map(l => `${l.op} ${l.table}`)
    expect(writes).toEqual([
      'update resources',
      'delete resource_topics',
      'delete topics',
      'update ingestion_jobs',
      'rpc enqueue_ingestion',
    ])
    expect(log[0].row).toEqual({ filing: 'whole' })
    expect(log[2].where).toContainEqual(['in', 'id', ['hash']])
  })

  it('refuses once the resource has been read into the record, and touches nothing', async () => {
    const { db, log } = fakeDb({ resources: [resource] }, { exposures: 2 })
    expect(await refileResource(db, 'u', 'r', 'parts')).toEqual({ ok: false, status: 409, error: REFILE_READ })
    expect(log).toEqual([])
  })

  it('answers not found for someone else’s resource', async () => {
    const { db } = fakeDb({ resources: [{ ...resource, user_id: 'someone' }] })
    expect(await refileResource(db, 'u', 'r', 'whole')).toMatchObject({ ok: false, status: 404 })
  })

  it('reads a document into the graph again by forgetting its summary', async () => {
    const { db, log } = fakeDb({ resources: [{ ...resource, kind: 'pdf' }] })
    await refileResource(db, 'u', 'r', 'whole')
    expect(log[0].row).toEqual({ filing: 'whole', summary: null })
    expect(log.map(l => `${l.op} ${l.table}`)).toContain('insert ingestion_jobs')
  })
})
