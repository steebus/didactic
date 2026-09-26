import { describe, it, expect } from 'vitest'
import { kinship, type KinMark, type KinMaterial, type KinTopic } from '../src/kinship'
import {
  bindingSentence,
  foundSentence,
  jaccard,
  keyOf,
  kindLine,
  matchKept,
  sproutingSentence,
  UNNAMED,
  nameStillFits,
  readSprouts,
  stableCommunities,
  SPROUTING,
} from '../src/sprouting'

const read = (id: string, ...topics: string[]): KinMaterial => ({
  id, read: true, topics: topics.map(t => ({ id: t, relevance: 1 })),
})
const unread = (id: string, ...topics: string[]): KinMaterial => ({ ...read(id, ...topics), read: false })
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

/**
 * A map with four things in it:
 *
 * - Web Development, eleven topics: eight at its heart and three about
 *   drawing data, which it shares with Statistics.
 * - Statistics, nine: six at its heart and the other three on drawing
 *   data.
 * - Five loose topics on photography, which three resources and a mark
 *   keep putting together. A subject nobody sowed.
 * - Five loose topics that arrived on one article and nowhere else.
 */
function map() {
  const w = range('w', 8), s = range('s', 6), v = range('v', 6), p = range('p', 5), o = range('o', 5)
  const topics: KinTopic[] = [
    ...w.map(id => ({ id, subjects: ['web'] })),
    ...s.map(id => ({ id, subjects: ['stats'] })),
    ...v.slice(0, 3).map(id => ({ id, subjects: ['web'] })),
    ...v.slice(3).map(id => ({ id, subjects: ['stats'] })),
    ...p.map(id => ({ id, subjects: [] })),
    ...o.map(id => ({ id, subjects: [] })),
    { id: 'stray', subjects: [] },
  ]
  const materials: KinMaterial[] = [
    ...w.map((_, i) => read(`rw${i}`, ...[0, 1, 2, 3].map(k => w[(i + k) % 8]))),
    ...s.map((_, i) => read(`rs${i}`, ...[0, 1, 2].map(k => s[(i + k) % 6]))),
    read('rv0', 'v0', 'v1', 'v3', 'v4'),
    read('rv1', 'v1', 'v2', 'v4', 'v5'),
    unread('rv2', 'v0', 'v2', 'v3', 'v5'),
    read('rp0', 'p0', 'p1', 'p2'),
    read('rp1', 'p2', 'p3', 'p4'),
    unread('rp2', 'p0', 'p3', 'p4', 'p1'),
    read('ro', ...o),
    // A little crossing, as real material has.
    read('x1', 'w0', 'v0'),
    read('x2', 's0', 'v3'),
    read('x3', 'stray', 'w1'),
  ]
  const marks: KinMark[] = [{ topics: ['p1', 'p4'] }]
  return { topics, materials, marks }
}

function reading(m = map()) {
  const lines = kinship({ ...m, edges: [] })
  return readSprouts({ topics: m.topics, lines, materials: m.materials, marks: m.marks })
}

describe('readSprouts', () => {
  it('finds the subject nobody sowed, and the one drawn across two', () => {
    const { sprouts } = reading()
    const sets = sprouts.map(s => [...s.topicIds].sort().join(','))
    expect(sets).toContain('p0,p1,p2,p3,p4')
    expect(sets).toContain('v0,v1,v2,v3,v4,v5')
    expect(sprouts).toHaveLength(2)
  })

  it('says which kind each one is', () => {
    const { sprouts } = reading()
    const photo = sprouts.find(s => s.topicIds.includes('p0'))!
    const drawing = sprouts.find(s => s.topicIds.includes('v0'))!
    expect(photo.kind).toBe('new')
    expect(photo.loose).toBe(5)
    expect(drawing.kind).toBe('across')
    expect(drawing.from.map(f => f.subjectId).sort()).toEqual(['stats', 'web'])
  })

  it('carries the evidence as counts', () => {
    const photo = reading().sprouts.find(s => s.topicIds.includes('p0'))!
    expect(photo.binding.materials).toHaveLength(3)
    expect(photo.binding.read).toBe(2)
    expect(photo.binding.marks).toBe(1)
  })

  it('does not offer one article\'s worth of topics as a subject', () => {
    const { sprouts } = reading()
    expect(sprouts.some(s => s.topicIds.includes('o0'))).toBe(false)
  })

  it('does not offer a subject the reader already has', () => {
    const { sprouts } = reading()
    expect(sprouts.some(s => s.topicIds.includes('w0') && s.topicIds.includes('w5'))).toBe(false)
  })

  it('finds the subjects already on the map again', () => {
    // The only evidence that the reading can be believed about the
    // topics nobody has filed.
    expect(reading().found).toEqual({ subjectIds: ['stats', 'web'], of: 2 })
  })

  it('reads the same map the same way every time', () => {
    expect(reading()).toEqual(reading())
  })

  it('reads nothing into a map with no kinship', () => {
    expect(readSprouts({ topics: [], lines: [], materials: [], marks: [] })).toEqual({
      sprouts: [], found: { subjectIds: [], of: 0 },
    })
  })
})

describe('stableCommunities', () => {
  it('leaves a topic with no kept line in no community', () => {
    const lines = kinship({ ...map(), edges: [] })
    const communities = stableCommunities(lines)
    expect(communities.flat()).not.toContain('nothing')
    expect(communities.every(c => c.length > 1)).toBe(true)
  })
})

describe('matchKept', () => {
  const sprout = (ids: string[]) => ({ key: keyOf(ids), topicIds: ids })

  it('keeps a decision through a topic gained', () => {
    const fresh = sprout(['a', 'b', 'c', 'd', 'e'])
    const kept = [{ id: 'row', topicIds: ['a', 'b', 'c', 'd'] }]
    expect(matchKept([fresh], kept).get(fresh.key)?.id).toBe('row')
  })

  it('treats a sprout grown past recognition as a new question', () => {
    const fresh = sprout(['a', 'b', 'x', 'y', 'z'])
    const kept = [{ id: 'row', topicIds: ['a', 'b', 'c', 'd'] }]
    expect(matchKept([fresh], kept).size).toBe(0)
  })

  it('gives each kept row to one sprout only, the closest', () => {
    const near = sprout(['a', 'b', 'c', 'd'])
    const far = sprout(['a', 'b', 'c', 'q', 'r'])
    const kept = [{ id: 'row', topicIds: ['a', 'b', 'c', 'd'] }]
    const matched = matchKept([far, near], kept)
    expect(matched.get(near.key)?.id).toBe('row')
    expect(matched.has(far.key)).toBe(false)
  })
})

describe('nameStillFits', () => {
  it('asks again once the topics have drifted from the name', () => {
    expect(nameStillFits(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(true)
    expect(nameStillFits(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'b', 'c', 'd'])).toBe(false)
    expect(nameStillFits(['a'], null)).toBe(false)
  })
})

describe('jaccard and keyOf', () => {
  it('measures overlap as shared over all', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5)
    expect(jaccard([], [])).toBe(1)
  })

  it('keys a set of topics the same however it is listed', () => {
    expect(keyOf(['b', 'a', 'c'])).toBe(keyOf(['c', 'b', 'a']))
    expect(keyOf(['a', 'b'])).not.toBe(keyOf(['a', 'c']))
  })
})

describe('the sentences', () => {
  it('prints the evidence counts first', () => {
    expect(bindingSentence({ topicIds: ['a', 'b', 'c', 'd', 'e', 'f'], binding: { materials: range('m', 11), read: 4, marks: 2 } }))
      .toBe('6 topics, held together by 11 pieces of material, 4 of them read, and 2 marks.')
    expect(bindingSentence({ topicIds: ['a', 'b', 'c', 'd'], binding: { materials: ['m', 'n'], read: 0, marks: 0 } }))
      .toBe('4 topics, held together by 2 pieces of material, none of it read yet.')
    expect(bindingSentence({ topicIds: ['a', 'b', 'c', 'd'], binding: { materials: ['m', 'n'], read: 2, marks: 1 } }))
      .toBe('4 topics, held together by 2 pieces of material, all of it read, and 1 mark.')
  })

  it('reports the found-again check, or nothing where there is nothing to find', () => {
    expect(foundSentence({ subjectIds: ['a'], of: 3 })).toBe('Read the same way, the map finds 1 of your 3 subjects again.')
    expect(foundSentence({ subjectIds: ['a', 'b'], of: 2 })).toBe('Read the same way, the map finds all 2 of your subjects again.')
    expect(foundSentence({ subjectIds: [], of: 0 })).toBeNull()
  })

  it('holds its bars where the spec sets them', () => {
    expect(SPROUTING.MIN_TOPICS).toBe(4)
    expect(SPROUTING.MATCH).toBeLessThan(SPROUTING.RENAME)
  })
})

describe('kindLine and sproutingSentence', () => {
  it('names new ground, and every subject a bridge is drawn across', () => {
    expect(kindLine({ kind: 'new', from: [] })).toBe('New ground')
    expect(kindLine({ kind: 'across', from: [{ title: 'Web' }, { title: 'Statistics' }] }))
      .toBe('Across Web and Statistics')
    expect(kindLine({ kind: 'across', from: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }))
      .toBe('Across A, B and C')
  })

  it('counts what has come up, in words for one', () => {
    expect(sproutingSentence(0)).toBe('Nothing has come up on its own yet.')
    expect(sproutingSentence(1)).toBe('One subject has come up on its own.')
    expect(sproutingSentence(3)).toBe('3 subjects have come up on their own.')
    expect(UNNAMED).toBe('Not yet named')
  })
})
