import { describe, it, expect } from 'vitest'
import { kinship, type KinMark, type KinMaterial, type KinTopic } from '../src/kinship'
import {
  bindingSentence,
  foundSentence,
  jaccard,
  keyOf,
  kindLine,
  subjectSentence,
  SUBJECT_VERDICT,
  matchKept,
  setAsideSentence,
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

  it('says what it set aside, and why', () => {
    // The answer to "nothing is sprouting, but I can see a clump".
    const { setAside } = reading()
    const article = setAside.find(a => a.topicIds.includes('o0'))!
    expect(article.reason).toBe('one-resource')
    expect(article.materials).toEqual(['ro'])
    expect(article.topicIds).toEqual(['o0', 'o1', 'o2', 'o3', 'o4'])
  })

  it('does not offer a subject the reader already has', () => {
    const { sprouts } = reading()
    expect(sprouts.some(s => s.topicIds.includes('w0') && s.topicIds.includes('w5'))).toBe(false)
  })

  it('finds the subjects already on the map again', () => {
    // The only evidence that the reading can be believed about the
    // topics nobody has filed.
    expect(reading().found).toEqual({ subjectIds: ['stats', 'web'], of: 2, inParts: [] })
  })

  it('reads the same map the same way every time', () => {
    expect(reading()).toEqual(reading())
  })

  it('reads nothing into a map with no kinship', () => {
    expect(readSprouts({ topics: [], lines: [], materials: [], marks: [] })).toEqual({
      sprouts: [], found: { subjectIds: [], of: 0, inParts: [] }, subjects: [], setAside: [],
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
    expect(foundSentence({ subjectIds: ['a'], of: 3, inParts: [] })).toBe('Read the same way, the map finds 1 of your 3 subjects again.')
    expect(foundSentence({ subjectIds: ['a', 'b'], of: 2, inParts: [] })).toBe('Read the same way, the map finds all 2 of your subjects again.')
    expect(foundSentence({ subjectIds: ['a', 'b'], of: 3, inParts: ['b'] })).toBe('Read the same way, the map finds 2 of your 3 subjects again, one of them in parts.')
    expect(foundSentence({ subjectIds: [], of: 0, inParts: [] })).toBeNull()
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

/**
 * Two essays on one theme, as ingestion actually leaves them: each filed
 * its own topics, so they share none, and only what the topics mean ties
 * one essay to the other. Beside them, two unrelated articles.
 *
 * The meaning is built the way gte-small's is shaped: every vector
 * shares one large common direction, a theme direction is shared by the
 * topics of both essays, and each topic has a little of its own.
 */
function essays() {
  const dims = 24
  const vec = (theme: number, own: number) => {
    const v = new Array(dims).fill(0)
    v[0] = 8
    v[1 + theme] = 1
    v[8 + (own % 16)] = 0.35
    return v
  }
  const emerson = range('e', 9), twain = range('t', 7), photo = range('ph', 4), econ = range('ec', 4)
  const topics: KinTopic[] = [
    ...emerson.map((id, i) => ({ id, subjects: [], vector: vec(0, i) })),
    ...twain.map((id, i) => ({ id, subjects: [], vector: vec(0, i + 9) })),
    ...photo.map((id, i) => ({ id, subjects: [], vector: vec(2, i) })),
    ...econ.map((id, i) => ({ id, subjects: [], vector: vec(4, i + 4) })),
  ]
  const materials: KinMaterial[] = [
    read('emerson', ...emerson), read('twain', ...twain), read('photo', ...photo), read('econ', ...econ),
  ]
  // Ingestion relates the topics one resource brought in to each other.
  const edges = materials.flatMap(m => m.topics.slice(1).map((t, i) => ({ from: m.topics[i].id, to: t.id, weight: 0.6 })))
  const lines = kinship({ topics, materials, marks: [], edges })
  return readSprouts({ topics, lines, materials, marks: [] })
}

describe('two essays on one theme', () => {
  it('sprout together, though each alone is one article', () => {
    const { sprouts } = essays()
    const both = sprouts.find(s => s.topicIds.includes('e0'))
    expect(both).toBeDefined()
    expect(both!.topicIds.some(id => id.startsWith('t'))).toBe(true)
    expect(both!.binding.materials.sort()).toEqual(['emerson', 'twain'])
  })

  it('do not pull unrelated articles into a subject with each other', () => {
    const { sprouts, setAside } = essays()
    expect(sprouts.some(s => s.topicIds.includes('ph0') && s.topicIds.includes('ec0'))).toBe(false)
    const alone = setAside.filter(a => a.topicIds.includes('ph0') || a.topicIds.includes('ec0'))
    expect(alone.length).toBeGreaterThan(0)
  })
})

describe('setAsideSentence', () => {
  it('says what one reading is, and what would make it a subject', () => {
    expect(setAsideSentence({ topicIds: range('a', 9), reason: 'one-resource', materials: ['r'] }))
      .toBe('9 topics that came in on one piece of material and have turned up nowhere else yet. One reading is fertile ground rather than a subject; it sprouts when other material on the same theme joins it.')
  })

  it('says when the material holding a clump has nothing in common', () => {
    expect(setAsideSentence({ topicIds: range('a', 6), reason: 'unjoined', materials: ['r', 's'] }))
      .toBe('6 topics carried by 2 pieces of material that nothing else ties together, so nothing says they are one subject.')
  })
})

/**
 * How each of the reader's own subjects comes out, one scenario per
 * verdict. The vectors share one large common direction, as gte-small's
 * do, and differ in a direction per theme.
 */
describe('how each subject reads', () => {
  const vec = (theme: number, own: number) => {
    const v = new Array(40).fill(0)
    v[0] = 8
    v[1 + theme] = 1
    v[20 + (own % 20)] = 0.3
    return v
  }
  const byId = (r: ReturnType<typeof readSprouts>, id: string) => r.subjects.find(s => s.subjectId === id)!

  it('is whole where one community holds most of it', () => {
    const r = reading()
    expect(byId(r, 'web').verdict).toBe('whole')
    expect(byId(r, 'web').withMaterial).toBe(11)
  })

  it('is found in parts where it splits into sub-themes of its own', () => {
    // Twelve topics in three clumps of four, each read together twice,
    // and nothing between the clumps: three sub-themes, none of them
    // half the subject, all of them it.
    const ids = range('s', 12)
    const topics: KinTopic[] = ids.map((id, i) => ({ id, subjects: ['S'], vector: vec(Math.floor(i / 4), i) }))
    const materials = [0, 1, 2].flatMap(g => [read(`a${g}`, ...ids.slice(g * 4, g * 4 + 4)), read(`b${g}`, ...ids.slice(g * 4, g * 4 + 4))])
    const lines = kinship({ topics, materials, marks: [], edges: [] })
    const r = readSprouts({ topics, lines, materials, marks: [] })
    expect(byId(r, 'S').verdict).toBe('parts')
    expect(byId(r, 'S').parts).toEqual([4, 4, 4])
    expect(r.found.inParts).toEqual(['S'])
  })

  it('is mixed where it fell in with another subject, and says what was missing', () => {
    // Two subjects with no material and no relations, whose names mean
    // much the same thing: the reading has nothing to tell them apart.
    // A third, unrelated group, as a real map always has: without it the
    // mean the meaning channel takes out would be A and B's own theme.
    const a = range('a', 6), b = range('b', 6), c = range('c', 6)
    const topics: KinTopic[] = [
      ...a.map((id, i) => ({ id, subjects: ['A'], vector: vec(0, i) })),
      ...b.map((id, i) => ({ id, subjects: ['B'], vector: vec(0, i + 6) })),
      ...c.map((id, i) => ({ id, subjects: [], vector: vec(5, i + 12) })),
    ]
    const lines = kinship({ topics, materials: [], marks: [], edges: [] })
    const r = readSprouts({ topics, lines, materials: [], marks: [] })
    const readA = byId(r, 'A')
    expect(readA.verdict).toBe('mixed')
    expect(readA.with[0].subjectId).toBe('B')
    expect(readA.related).toBe(0)
    expect(subjectSentence(readA, id => (id === 'B' ? 'System Design' : id)))
      .toMatch(/^Read together with other topics: \d+ with System Design's\. None of its topics has a relation drawn to another of its own and none has any material, so the reading had little but their names to go on\. Draw connections on its bed gives it more\.$/)
  })

  it('is thin where most of it is tied to nothing', () => {
    const ids = range('t', 5)
    const topics: KinTopic[] = [...ids.map(id => ({ id, subjects: ['T'] })), { id: 'x', subjects: [] }, { id: 'y', subjects: [] }]
    const lines = kinship({ topics, materials: [read('r', 'x', 'y', 't0')], marks: [], edges: [] })
    const r = readSprouts({ topics, lines, materials: [read('r', 'x', 'y', 't0')], marks: [] })
    expect(byId(r, 'T').verdict).toBe('thin')
    expect(byId(r, 'T').alone).toBeGreaterThanOrEqual(4)
  })

  it('names every verdict for the list', () => {
    expect(Object.keys(SUBJECT_VERDICT).sort()).toEqual(['mixed', 'parts', 'thin', 'whole'])
  })

  it('words whole and parts by their counts', () => {
    const base = { subjectId: 'S', size: 12, own: 12, with: [], alone: 0, related: 12, withMaterial: 12 }
    expect(subjectSentence({ ...base, verdict: 'whole', parts: [10] }, id => id)).toBe('10 of its 12 topics read together, as one.')
    expect(subjectSentence({ ...base, verdict: 'parts', parts: [5, 4, 3] }, id => id))
      .toBe('Read as 3 sub-themes of 5, 4 and 3 topics, each still its own: 12 of its 12 in all.')
  })
})

describe('set aside with no material at all', () => {
  it('says so, rather than calling it one piece of material', () => {
    expect(setAsideSentence({ topicIds: range('a', 5), reason: 'no-material', materials: [] }))
      .toMatch(/^5 topics that no material you have saved puts together/)
  })
})
