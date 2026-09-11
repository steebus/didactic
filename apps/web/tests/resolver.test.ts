import { describe, it, expect } from 'vitest'
import { resolveConcept, neighboursFor } from '@/lib/resolver'
import cases from './fixtures/resolver-cases.json'
import { config } from '@didactic/core/config'

// Build two unit vectors with a known cosine similarity, so fixture
// similarities drive the real code path rather than being stubbed.
function vectorsWithSimilarity(target: number): [number[], number[]] {
  const a = new Array(1536).fill(0); a[0] = 1
  const b = new Array(1536).fill(0)
  b[0] = target
  b[1] = Math.sqrt(1 - target * target)
  return [a, b]
}

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
        [{ id: 'topic-1', title: c.candidateTitle, embedding: candidateVec }],
        conceptVec
      )
      expect(result.action).toBe(c.expected)
    })
  }
})

describe('resolveConcept boundaries', () => {
  // Read from config rather than hardcoded: the bands are measured
  // against whichever embedding model is in use and are expected to
  // move. The boundaries themselves are what must not drift.
  it('treats the match threshold exactly as a link, not pending', () => {
    const [a, b] = vectorsWithSimilarity(config.RESOLVER_MATCH)
    const result = resolveConcept('x', [{ id: 'n', title: 'y', embedding: b }], a)
    expect(result.action).toBe('link')
  })

  it('treats the ambiguous floor exactly as pending, not create', () => {
    const [a, b] = vectorsWithSimilarity(config.RESOLVER_AMBIGUOUS)
    const result = resolveConcept('x', [{ id: 'n', title: 'y', embedding: b }], a)
    expect(result.action).toBe('pending')
  })

  it('creates just below the ambiguous floor rather than queueing noise', () => {
    const [a, b] = vectorsWithSimilarity(config.RESOLVER_AMBIGUOUS - 0.01)
    const result = resolveConcept('x', [{ id: 'n', title: 'y', embedding: b }], a)
    expect(result.action).toBe('create')
  })

  it('picks the single best candidate when several are above threshold', () => {
    const [a, near] = vectorsWithSimilarity(0.88)
    const [, nearer] = vectorsWithSimilarity(0.95)
    const result = resolveConcept('x', [
      { id: 'worse', title: 'a', embedding: near },
      { id: 'better', title: 'b', embedding: nearer },
    ], a)
    expect(result).toMatchObject({ action: 'link', topicId: 'better' })
  })

  it('reports the nearest topic id when deferring, so the user has context', () => {
    const midBand = (config.RESOLVER_MATCH + config.RESOLVER_AMBIGUOUS) / 2
    const [a, b] = vectorsWithSimilarity(midBand)
    const result = resolveConcept('x', [{ id: 'n-42', title: 'y', embedding: b }], a)
    expect(result).toMatchObject({ action: 'pending', nearestId: 'n-42' })
  })
})

describe('topics proposed together for one subject', () => {
  // The bar for a stranger and the bar for a sibling are different
  // questions. Everything under one subject shares a vocabulary, and
  // the embedding model reads that as similarity: a stock-market bed
  // measured 0.80-0.87 between complementary topics, which is squarely
  // in the band that would otherwise stop and ask.
  const sibling = (similarity: number) => {
    const [a, b] = vectorsWithSimilarity(similarity)
    return {
      concept: 'Common vs Preferred Stock',
      candidates: [{ id: 'batch:0', title: 'Equity Ownership Fundamentals', embedding: a }],
      embedding: b,
      siblings: new Set(['batch:0']),
    }
  }

  it('creates a sibling that merely shares the subject vocabulary', () => {
    const { concept, candidates, embedding, siblings } = sibling(0.87)
    expect(resolveConcept(concept, candidates, embedding, siblings).action).toBe('create')
  })

  it('still asks when a sibling is a near restatement', () => {
    const { concept, candidates, embedding, siblings } = sibling(0.92)
    expect(resolveConcept(concept, candidates, embedding, siblings).action).toBe('pending')
  })

  it('holds a stranger to the ordinary bar at the same similarity', () => {
    const { concept, candidates, embedding } = sibling(0.87)
    // No sibling set: the same vectors that were fine as siblings must
    // still reach the user when the match is an existing topic.
    expect(resolveConcept(concept, candidates, embedding).action).toBe('pending')
  })

  it('links an outright duplicate whoever proposed it', () => {
    const { concept, candidates, embedding, siblings } = sibling(0.97)
    expect(resolveConcept(concept, candidates, embedding, siblings).action).toBe('link')
  })

  it('keeps the sibling bar below the auto-merge bar', () => {
    expect(config.RESOLVER_SIBLING_AMBIGUOUS).toBeLessThan(config.RESOLVER_MATCH)
    expect(config.RESOLVER_SIBLING_AMBIGUOUS).toBeGreaterThan(config.RESOLVER_AMBIGUOUS)
  })
})

describe('neighbours offered to a freshly sown bed', () => {
  const vec = (a: number, b: number) => {
    const v = new Array(1536).fill(0)
    v[0] = a
    v[1] = b
    return v
  }
  // Unit vectors at known angles, so scores are predictable.
  const near = vec(1, 0)
  const mid = vec(0.8, 0.6)
  const far = vec(0, 1)

  const searched = [
    {
      vector: near,
      candidates: [
        { id: 'close', title: 'Risk and Volatility', embedding: near },
        { id: 'middling', title: 'Dividends', embedding: mid },
        { id: 'distant', title: 'Ballet', embedding: far },
      ],
    },
  ]

  it('offers the nearest existing topics first', () => {
    const out = neighboursFor(searched, new Set(), 3)
    expect(out.map(n => n.id)).toEqual(['close', 'middling', 'distant'])
  })

  it('never offers a topic this sowing just created', () => {
    // The whole point: a new bed relates to the map, not to itself
    // twice over.
    const out = neighboursFor(searched, new Set(['close']), 3)
    expect(out.map(n => n.id)).toEqual(['middling', 'distant'])
  })

  it('caps the list, keeping the nearest', () => {
    const out = neighboursFor(searched, new Set(), 1)
    expect(out.map(n => n.id)).toEqual(['close'])
  })

  it('keeps a topic once, at its best score across the whole bed', () => {
    // The same existing topic surfaces for several new topics; being
    // close to any one of them is what makes it worth offering.
    const twice = [
      { vector: far, candidates: [{ id: 'close', title: 'Risk', embedding: near }] },
      { vector: near, candidates: [{ id: 'close', title: 'Risk', embedding: near }] },
    ]
    const out = neighboursFor(twice, new Set(), 5)
    expect(out).toHaveLength(1)
    expect(out[0].score).toBeCloseTo(1)
  })

  it('returns nothing when the map is empty', () => {
    expect(neighboursFor([], new Set(), 30)).toEqual([])
  })
})
