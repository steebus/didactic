import { describe, it, expect } from 'vitest'
import { readConcepts } from '@/lib/llm/concepts'

/**
 * What the model actually sends back, rather than what the tool schema
 * asked for. Every case here was seen in production on an ordinary
 * article, and each one used to take the whole ingestion down.
 */
describe('readConcepts', () => {
  it('reads the shape the schema asked for', () => {
    const read = readConcepts({
      summary: 'About React rendering.',
      concepts: [
        { name: 'React rendering', relevance: 0.9 },
        { name: 'Profiling', relevance: 0.6 },
      ],
    })
    expect(read.summary).toBe('About React rendering.')
    expect(read.concepts).toHaveLength(2)
  })

  it('reads concepts that arrived as JSON text rather than as an array', () => {
    // The failure that jammed the inbox: `.filter` is not a function on
    // a string, the throw failed the job, and the worker retried it
    // twice more before giving up.
    const read = readConcepts({
      concepts: JSON.stringify([
        { name: 'React rendering', relevance: 0.9 },
        { name: 'Profiling', relevance: 0.6 },
      ]),
    })
    expect(read.concepts.map(c => c.name)).toEqual(['React rendering', 'Profiling'])
  })

  it('survives a missing summary, which the schema marks required', () => {
    expect(readConcepts({ concepts: [] }).summary).toBeNull()
    expect(readConcepts({ summary: '   ', concepts: [] }).summary).toBeNull()
  })

  it('keeps a concept that came without a relevance', () => {
    // The model named it, which is the part that matters. Dropping it
    // would lose a topic over a missing number.
    const read = readConcepts({ concepts: [{ name: 'Memoisation' }] })
    expect(read.concepts).toEqual([{ name: 'Memoisation', relevance: 0.5 }])
  })

  it('drops what cannot be used, and only that', () => {
    const read = readConcepts({
      concepts: [
        { name: '', relevance: 0.9 },
        { name: '   ', relevance: 0.9 },
        { name: 'Out of range', relevance: 7 },
        { name: 'Negative', relevance: -1 },
        { name: 'Good', relevance: 0.8 },
      ],
    })
    expect(read.concepts).toEqual([{ name: 'Good', relevance: 0.8 }])
  })

  it('never throws, whatever arrives', () => {
    // This is the boundary where model output becomes app data. One
    // malformed field costs that field, never the resource.
    for (const input of [null, undefined, {}, 'nonsense', 42, { concepts: 'not json' }, { concepts: '{}' }]) {
      expect(() => readConcepts(input)).not.toThrow()
      expect(readConcepts(input).concepts).toEqual([])
    }
  })
})
