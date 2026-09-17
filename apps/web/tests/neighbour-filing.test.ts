import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { claimsFor, fileWhatTheBedIsSureOf } from '@/lib/filing'

type Row = Record<string, unknown>

/**
 * Enough Supabase to answer the four reads these two make, and to
 * record the one write. The builders are thenable, which is what the
 * client's own chains are.
 */
function fakeDb(tables: Record<string, Row[]>, upserted: Row[][] = []) {
  const build = (name: string) => {
    let rows = [...(tables[name] ?? [])]
    const chain = {
      select: () => chain,
      eq: (col: string, v: unknown) => { rows = rows.filter(r => r[col] === v); return chain },
      in: (col: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[col])); return chain },
      or: (clause: string) => {
        // `from_topic.in.(a,b),to_topic.in.(a,b)` — the one shape used.
        const ids = new Set(clause.match(/\(([^)]*)\)/g)?.flatMap(g => g.slice(1, -1).split(',')) ?? [])
        rows = rows.filter(r => ids.has(r.from_topic as string) || ids.has(r.to_topic as string))
        return chain
      },
      upsert: (written: Row[]) => { upserted.push(written); return Promise.resolve({ error: null }) },
      then: (done: (r: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(done),
    }
    return chain
  }
  return { from: build } as unknown as SupabaseClient
}

const edge = (from: string, to: string) => ({ from_topic: from, to_topic: to })
const filed = (topic: string, subject: string) => ({ topic_id: topic, subject_id: subject })

describe('claimsFor', () => {
  it('reads a loose topic\'s subjects off the company it keeps', async () => {
    // Price-to-Earnings Ratio as it stood: five neighbours in Shares and
    // Stocks, two loose, filed under nothing itself.
    const claims = await claimsFor(fakeDb({
      edges: [
        edge('pe', 'index'), edge('pe', 'dca'), edge('pe', 'diversify'),
        edge('pe', 'multiples'), edge('fundamentals', 'pe'),
        edge('pe', 'mutual'), edge('pe', 'value'),
      ],
      topic_subjects: [
        filed('index', 'stocks'), filed('dca', 'stocks'), filed('diversify', 'stocks'),
        filed('multiples', 'stocks'), filed('fundamentals', 'stocks'),
      ],
    }), ['pe'])

    expect(claims.get('pe')).toEqual([
      { subjectId: 'stocks', agreeing: 5, share: 1, standing: 'settled' },
    ])
  })

  it('reads an edge from either end', async () => {
    const claims = await claimsFor(fakeDb({
      edges: [edge('other', 'loose')],
      topic_subjects: [filed('other', 'web')],
    }), ['loose'])

    expect(claims.get('loose')?.[0].agreeing).toBe(1)
  })

  it('says nothing about a topic joined only to other loose topics', async () => {
    const claims = await claimsFor(fakeDb({
      edges: [edge('a', 'b'), edge('a', 'c')],
      topic_subjects: [],
    }), ['a'])

    expect(claims.get('a')).toBeUndefined()
  })

  it('counts a neighbour once however many edges reach it', async () => {
    // The bed holds a row per claim, and one pair can make several. Two
    // edges to one topic is one voice, or a single well-connected
    // neighbour would clear a bar meant to need three.
    const claims = await claimsFor(fakeDb({
      edges: [edge('loose', 'react'), edge('react', 'loose'), edge('loose', 'react')],
      topic_subjects: [filed('react', 'web')],
    }), ['loose'])

    expect(claims.get('loose')?.[0].agreeing).toBe(1)
  })

  it('asks nothing of an empty list', async () => {
    expect(await claimsFor(fakeDb({}), [])).toEqual(new Map())
  })
})

describe('fileWhatTheBedIsSureOf', () => {
  it('files the settled claim and reports it', async () => {
    const upserted: Row[][] = []
    const filedRows = await fileWhatTheBedIsSureOf(fakeDb({
      edges: [edge('pe', 'a'), edge('pe', 'b'), edge('pe', 'c')],
      topic_subjects: [filed('a', 'stocks'), filed('b', 'stocks'), filed('c', 'stocks')],
    }, upserted), ['pe'])

    expect(filedRows).toEqual([{ topicId: 'pe', subjectId: 'stocks' }])
    expect(upserted[0]).toEqual([
      { topic_id: 'pe', subject_id: 'stocks', created_by: 'ai' },
    ])
  })

  it('leaves an unsettled claim alone rather than filing it', async () => {
    // Data Science, with two neighbours in Web Development and no
    // business being filed under it. The loose sheet offers this one.
    const upserted: Row[][] = []
    const filedRows = await fileWhatTheBedIsSureOf(fakeDb({
      edges: [edge('ds', 'a'), edge('ds', 'b')],
      topic_subjects: [filed('a', 'web'), filed('b', 'web')],
    }, upserted), ['ds'])

    expect(filedRows).toEqual([])
    expect(upserted).toEqual([])
  })

  it('skips a topic that is already filed, asked now rather than trusted', async () => {
    const upserted: Row[][] = []
    const filedRows = await fileWhatTheBedIsSureOf(fakeDb({
      edges: [edge('t', 'a'), edge('t', 'b'), edge('t', 'c')],
      topic_subjects: [
        filed('t', 'somewhere'),
        filed('a', 'web'), filed('b', 'web'), filed('c', 'web'),
      ],
    }, upserted), ['t'])

    expect(filedRows).toEqual([])
    expect(upserted).toEqual([])
  })
})
