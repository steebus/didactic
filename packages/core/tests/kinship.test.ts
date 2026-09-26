import { describe, it, expect } from 'vitest'
import { kinship, kinText, KINSHIP, type KinMaterial, type KinTopic } from '../src/kinship'

const topic = (id: string, subjects: string[] = []): KinTopic => ({ id, subjects })
const read = (id: string, ...topics: string[]): KinMaterial => ({
  id, read: true, topics: topics.map(t => ({ id: t, relevance: 1 })),
})
const unread = (id: string, ...topics: string[]): KinMaterial => ({ ...read(id, ...topics), read: false })

function line(lines: ReturnType<typeof kinship>, a: string, b: string) {
  return lines.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))
}

describe('kinship from material', () => {
  it('ties two topics that keep arriving together', () => {
    const lines = kinship({
      topics: [topic('a'), topic('b')],
      materials: [read('r1', 'a', 'b'), read('r2', 'a', 'b'), read('r3', 'a', 'b')],
      marks: [], edges: [],
    })
    // Always together is a cosine of 1, shrunk by 3/4 for three shared.
    expect(line(lines, 'a', 'b')!.material).toBeCloseTo(0.75, 5)
  })

  it('halves a pair seen together only once', () => {
    const once = kinship({ topics: [topic('a'), topic('b')], materials: [read('r', 'a', 'b')], marks: [], edges: [] })
    expect(line(once, 'a', 'b')!.material).toBeCloseTo(0.5, 5)
  })

  it('damps a topic that is in everything', () => {
    // JavaScript in fifty resources and a niche topic in two, sharing
    // both. Without damping the hub would join everything it touches.
    const materials = [
      read('n1', 'js', 'niche'), read('n2', 'js', 'niche'),
      ...Array.from({ length: 48 }, (_, i) => read(`o${i}`, 'js', `other${i}`)),
    ]
    const topics = [topic('js'), topic('niche'), ...Array.from({ length: 48 }, (_, i) => topic(`other${i}`))]
    const lines = kinship({ topics, materials, marks: [], edges: [] })
    expect(line(lines, 'js', 'niche')!.material).toBeLessThan(0.2)
  })

  it('counts unread material, but for less than read', () => {
    const lines = kinship({
      topics: [topic('a'), topic('b'), topic('c')],
      materials: [read('r', 'a', 'b'), unread('u', 'a', 'c')],
      marks: [], edges: [],
    })
    expect(line(lines, 'a', 'c')!.material).toBeGreaterThan(0)
    expect(line(lines, 'a', 'b')!.material).toBeGreaterThan(line(lines, 'a', 'c')!.material)
  })

  it('makes one long article count for less per pair', () => {
    const lines = kinship({
      topics: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(id => topic(id)),
      materials: [read('short', 'a', 'b'), read('long', 'a', 'c', 'd', 'e', 'f', 'g', 'h', 'i')],
      marks: [], edges: [],
    })
    expect(line(lines, 'a', 'b')!.material).toBeGreaterThan(line(lines, 'a', 'c')!.material)
  })
})

describe('kinship from marks and stated relations', () => {
  it('makes one mark most of a tie and two nearly certain', () => {
    const one = kinship({ topics: [topic('a'), topic('b')], materials: [], marks: [{ topics: ['a', 'b'] }], edges: [] })
    const two = kinship({
      topics: [topic('a'), topic('b')], materials: [],
      marks: [{ topics: ['a', 'b'] }, { topics: ['b', 'a'] }], edges: [],
    })
    expect(line(one, 'a', 'b')!.marks).toBeCloseTo(1 - Math.exp(-1), 5)
    expect(line(two, 'a', 'b')!.marks).toBeCloseTo(1 - Math.exp(-2), 5)
  })

  it('takes the strongest relation between a pair, either way round', () => {
    const lines = kinship({
      topics: [topic('a'), topic('b')], materials: [], marks: [],
      edges: [{ from: 'a', to: 'b', weight: 0.4 }, { from: 'b', to: 'a', weight: 0.9 }],
    })
    expect(line(lines, 'a', 'b')!.stated).toBe(0.9)
    expect(line(lines, 'a', 'b')!.weight).toBeCloseTo(0.9 * KINSHIP.CHANNELS.stated, 5)
  })
})

describe('kinship from meaning', () => {
  // Every vector shares one large common direction, as gte-small's do:
  // raw cosines all sit near 0.99, and only the small parts differ.
  const vector = (group: number, jitter: number) => {
    const v = new Array(16).fill(0)
    v[0] = 10
    v[1 + group] = 1
    v[8 + (jitter % 8)] = 0.2
    return v
  }

  it('finds what the common direction was hiding', () => {
    const topics: KinTopic[] = [
      ...[0, 1, 2, 3].map(i => ({ id: `a${i}`, subjects: [], vector: vector(0, i) })),
      ...[0, 1, 2, 3].map(i => ({ id: `b${i}`, subjects: [], vector: vector(1, i + 4) })),
    ]
    const lines = kinship({ topics, materials: [], marks: [], edges: [] })
    expect(line(lines, 'a0', 'a1')?.meaning ?? 0).toBeGreaterThan(0.3)
    // Across the two groups the centred cosine is negative: no line.
    expect(line(lines, 'a0', 'b0')?.meaning ?? 0).toBe(0)
  })
})

describe('kinship', () => {
  it('never reads the subjects', () => {
    const materials = [read('r1', 'a', 'b', 'c'), read('r2', 'b', 'c')]
    const filed = kinship({ topics: [topic('a', ['s']), topic('b', ['t']), topic('c', ['s', 't'])], materials, marks: [], edges: [] })
    const loose = kinship({ topics: [topic('a'), topic('b'), topic('c')], materials, marks: [], edges: [] })
    expect(filed).toEqual(loose)
  })

  it('ignores topics it was not given', () => {
    const lines = kinship({ topics: [topic('a'), topic('b')], materials: [read('r', 'a', 'b', 'gone')], marks: [], edges: [] })
    expect(lines.every(l => l.a !== 'gone' && l.b !== 'gone')).toBe(true)
  })

  it('keeps a quiet topic\'s only tie even to a crowded hub', () => {
    // The hub has more than NEAREST stronger ties; the quiet topic has
    // one. The line survives because the quiet end keeps it.
    const n = KINSHIP.NEAREST + 4
    const materials = [
      ...Array.from({ length: n }, (_, i) => read(`s${i}`, 'hub', `t${i}`)),
      ...Array.from({ length: n }, (_, i) => read(`s2${i}`, 'hub', `t${i}`)),
      read('q', 'hub', 'quiet'),
    ]
    const topics = [topic('hub'), topic('quiet'), ...Array.from({ length: n }, (_, i) => topic(`t${i}`))]
    const lines = kinship({ topics, materials, marks: [], edges: [] })
    expect(line(lines, 'hub', 'quiet')).toBeDefined()
  })
})

describe('kinText', () => {
  it('reads a topic by its title and what is written under it', () => {
    expect(kinText('Composition', 'Arranging the frame.')).toBe('Composition — Arranging the frame.')
    expect(kinText(' Composition ', '  ')).toBe('Composition')
    expect(kinText('Composition', null)).toBe('Composition')
  })
})
