import { describe, it, expect } from 'vitest'
import { resolveConcept, cosineSimilarity } from '@/lib/resolver'
import cases from './fixtures/resolver-cases.json'

// Build two unit vectors with a known cosine similarity, so fixture
// similarities drive the real code path rather than being stubbed.
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
})

describe('resolveConcept fixture suite', () => {
  for (const c of cases) {
    it(c.name, () => {
      if (c.candidateTitle === null) {
        const v = new Array(1536).fill(0); v[0] = 1
        const result = resolveConcept(c.concept, [], v)
        expect(result.action).toBe(c.expected)
        return
      }
      const [conceptVec, candidateVec] = vectorsWithSimilarity(c.similarity!)
      const result = resolveConcept(
        c.concept,
        [{ id: 'node-1', title: c.candidateTitle, embedding: candidateVec }],
        conceptVec
      )
      expect(result.action).toBe(c.expected)
    })
  }
})

describe('resolveConcept boundaries', () => {
  it('treats exactly 0.85 as a link, not pending', () => {
    const [a, b] = vectorsWithSimilarity(0.85)
    const result = resolveConcept('x', [{ id: 'n', title: 'y', embedding: b }], a)
    expect(result.action).toBe('link')
  })

  it('treats exactly 0.70 as pending, not create', () => {
    const [a, b] = vectorsWithSimilarity(0.70)
    const result = resolveConcept('x', [{ id: 'n', title: 'y', embedding: b }], a)
    expect(result.action).toBe('pending')
  })

  it('picks the single best candidate when several are above threshold', () => {
    const [a, near] = vectorsWithSimilarity(0.88)
    const [, nearer] = vectorsWithSimilarity(0.95)
    const result = resolveConcept('x', [
      { id: 'worse', title: 'a', embedding: near },
      { id: 'better', title: 'b', embedding: nearer },
    ], a)
    expect(result).toMatchObject({ action: 'link', nodeId: 'better' })
  })

  it('reports the nearest node id when deferring, so the user has context', () => {
    const [a, b] = vectorsWithSimilarity(0.75)
    const result = resolveConcept('x', [{ id: 'n-42', title: 'y', embedding: b }], a)
    expect(result).toMatchObject({ action: 'pending', nearestId: 'n-42' })
  })
})
