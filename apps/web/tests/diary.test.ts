import { describe, it, expect, vi, beforeEach } from 'vitest'
import { depthOf, VERDICTS } from '@/lib/llm/diary'
import { config } from '@didactic/core/config'

const evaluate = vi.hoisted(() => vi.fn())
vi.mock('ai', () => ({ experimental_evaluate: evaluate }))

describe('what a verdict records', () => {
  it('maps every verdict but one onto a depth the scorer knows', () => {
    for (const verdict of VERDICTS) {
      const depth = depthOf(verdict)
      if (verdict === 'mentioned') {
        // The whole point of having it: a topic named in passing must
        // have a way to record nothing. Without it the model has to
        // pick one of the four, and the cheapest way to get a wrong
        // `read` is to leave no way to say "no claim".
        expect(depth).toBeNull()
      } else {
        expect(depth).not.toBeNull()
        expect(config.DEPTH_WEIGHTS).toHaveProperty(depth as string)
      }
    }
  })

  it('records struggle at no weight, and applied above the ceiling', () => {
    expect(config.DEPTH_WEIGHTS[depthOf('struggled')!]).toBe(0)
    // `applied` is the only depth that can pass 3.5, and the diary is
    // the only thing in the app that writes one.
    expect(config.DEPTH_WEIGHTS[depthOf('applied')!]).toBe(1.0)
  })
})

describe('what an entry is stored as', () => {
  it('writes an empty quote rather than a null one', async () => {
    // `highlights.quote` is `not null` (020), and a mark with nothing
    // quoted -- a note on a lesson as a whole -- has always been an
    // empty string. The first version of this wrote null and every
    // entry was refused by the database; 042 corrected the check
    // constraint to match, and this holds the insert to it.
    const { createEntry } = await import('@/lib/diary')

    let written: Record<string, unknown> | null = null
    const db = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
        insert: (row: Record<string, unknown>) => {
          if (table === 'highlights') written = row
          return {
            select: () => ({
              single: async () => ({ data: { id: 'e1', ...row }, error: null }),
            }),
          }
        },
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
    }

    await createEntry(db as never, { userId: 'u', note: 'Something worth keeping.' })

    expect(written).not.toBeNull()
    expect(written!.quote).toBe('')
    expect(written!.kind).toBe('diary')
    // An entry is not anchored to anything: it is a page about a week,
    // not a thought about a sentence.
    expect(written!.lesson_id).toBeNull()
  })
})

describe('reading an entry', () => {
  beforeEach(() => evaluate.mockReset())

  const ENTRY = 'Read a chapter on caching. Shipped the lazy loading today. It finally works.'

  it('writes the verdict it was sure of, quoting a sentence the writer wrote', async () => {
    evaluate
      .mockResolvedValueOnce({ answers: { t1: { choice: 'applied', probabilities: { applied: 0.9 } } } })
      .mockResolvedValueOnce({ answers: { t1: { choice: 's1', probabilities: { s1: 0.8 } } } })
    const { readEntry } = await import('@/lib/llm/diary')

    expect(await readEntry(ENTRY, [{ id: 't1', title: 'Lazy loading' }])).toEqual([
      { topicId: 't1', verdict: 'applied', because: 'Shipped the lazy loading today.' },
    ])
  })

  it('writes nothing for a verdict it was unsure of, and asks for no quote', async () => {
    evaluate.mockResolvedValueOnce({
      answers: { t1: { choice: 'applied', probabilities: { applied: 0.45, read: 0.4 } } },
    })
    const { readEntry } = await import('@/lib/llm/diary')

    expect(await readEntry(ENTRY, [{ id: 't1', title: 'Lazy loading' }])).toEqual([
      { topicId: 't1', verdict: 'mentioned', because: '' },
    ])
    expect(evaluate).toHaveBeenCalledTimes(1)
  })

  it('keeps the verdict when the quote cannot be chosen', async () => {
    evaluate
      .mockResolvedValueOnce({ answers: { t1: { choice: 'read', probabilities: { read: 0.9 } } } })
      .mockRejectedValueOnce(new Error('gateway down'))
    const { readEntry } = await import('@/lib/llm/diary')

    expect(await readEntry(ENTRY, [{ id: 't1', title: 'Caching' }])).toEqual([
      { topicId: 't1', verdict: 'read', because: '' },
    ])
  })
})
