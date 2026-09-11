import { describe, it, expect } from 'vitest'
import { cosineSimilarity } from '../src/similarity'

/**
 * Build two unit vectors with a known cosine similarity, so a test that
 * claims 0.85 is measuring the real function rather than a stub.
 */
function vectorsWithSimilarity(target: number): [number[], number[]] {
  const a = new Array(1536).fill(0); a[0] = 1
  const b = new Array(1536).fill(0)
  b[0] = target
  b[1] = Math.sqrt(1 - target * target)
  return [a, b]
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 0, 0]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('constructs the similarity the test helper claims', () => {
    const [a, b] = vectorsWithSimilarity(0.85)
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.85)
  })

  it('answers 0 rather than NaN for a zero vector', () => {
    // Degenerate but reachable: an embedding that failed to generate.
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0)
  })
})
