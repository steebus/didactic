import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The order a bed is laid out in, and where it is opened.
 *
 * The map arrives as a list, and that list is an answer to a question
 * the model was asked: where should someone start, and what leans on
 * what. It used to be thrown away on the way to the database, because
 * membership carried no order and every read sorted by title — so a
 * bed sown "Exposure, Metering, Zone system" printed back as
 * "Exposure, Metering, Zone system" only by luck of the alphabet.
 *
 * What is checked here is that the order survives the planting, that it
 * is written against this subject rather than against the topic, and
 * that the topic offered as the beginning is one it is safe to lay a
 * route through.
 */

const embed = vi.fn()
const resolveConcept = vi.fn()
const fetchCandidates = vi.fn()
const neighboursFor = vi.fn()
const recomputeAbilities = vi.fn()
const proposeEdges = vi.fn()

vi.mock('@/lib/embedding', () => ({ embed }))
vi.mock('@/lib/resolver', () => ({ resolveConcept, fetchCandidates, neighboursFor }))
vi.mock('@/lib/scoring', () => ({ recomputeAbilities }))
vi.mock('@/lib/llm/edges', () => ({ proposeEdges }))

const state = {
  /** What `topics` answers a read with, for the beginning-of-bed look-up. */
  rows: [] as Array<{ id: string; title: string; state: string }>,
  /** What the first topic already carries, if anything. */
  curricula: [] as Array<{ id: string; status: string }>,
  upserts: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>,
  /** Set to fail the order write without failing the planting. */
  orderError: null as { message: string } | null,
}

function fakeDb() {
  return {
    from(table: string) {
      let inserted: Array<Record<string, unknown>> | null = null

      const answer = () => {
        if (table === 'topics') {
          // A multi-row insert answers in the order it was given.
          if (inserted) {
            return {
              data: inserted.map((row, i) => ({ id: `new-${i}`, title: row.title })),
              error: null,
            }
          }
          return { data: state.rows, error: null }
        }
        if (table === 'curricula') return { data: state.curricula, error: null }
        if (table === 'topic_subjects' && state.orderError) {
          return { data: null, error: state.orderError }
        }
        return { data: [], error: null }
      }

      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        in: () => q,
        insert: (rows: Array<Record<string, unknown>>) => {
          inserted = rows
          return q
        },
        upsert: (rows: Array<Record<string, unknown>>) => {
          state.upserts.push({ table, rows })
          return q
        },
        single: async () => answer(),
        maybeSingle: async () => answer(),
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      })
      return q
    },
  }
}

const SUBJECT = { id: 'sub-1', user_id: 'user-1', title: 'Photography' }

/** The bed as the model proposed it: introductory first. */
const MAP = [
  { name: 'Exposure', summary: 'Light and time.', estimated_level: 2 },
  { name: 'Metering', summary: 'Reading the light.', estimated_level: 2 },
  { name: 'Zone system', summary: 'Placing tones.', estimated_level: 4 },
]

const brief = {
  subject: 'Photography',
  roots: 0,
  confident: '',
  gaps: '',
  depth: '',
  qualifiers: [],
  evidence: [],
  sources: [],
}

const plant = async (topics = MAP) => {
  const { plantMap } = await import('@/lib/sowing')
  // Generous, so nothing is given up for want of time.
  return plantMap(fakeDb() as never, SUBJECT, topics, brief as never, Date.now() + 60_000)
}

/** What the order write recorded, in the order it wrote it. */
const orderRows = () =>
  state.upserts
    .filter(u => u.table === 'topic_subjects' && u.rows.some(r => 'position' in r))
    .at(-1)!.rows

beforeEach(() => {
  state.upserts = []
  state.curricula = []
  state.orderError = null
  state.rows = [
    { id: 'new-0', title: 'Exposure', state: 'active' },
    { id: 'new-1', title: 'Metering', state: 'active' },
    { id: 'new-2', title: 'Zone system', state: 'active' },
  ]

  embed.mockReset().mockResolvedValue([0.1, 0.2, 0.3])
  fetchCandidates.mockReset().mockResolvedValue([])
  neighboursFor.mockReset().mockReturnValue([])
  recomputeAbilities.mockReset().mockResolvedValue(undefined)
  proposeEdges.mockReset().mockResolvedValue([])
  resolveConcept.mockReset().mockReturnValue({ action: 'create' })
})

describe('the order a bed was laid out in', () => {
  it('is written onto the membership, simplest first, as the map proposed it', async () => {
    await plant()

    expect(orderRows()).toEqual([
      { topic_id: 'new-0', subject_id: 'sub-1', position: 0 },
      { topic_id: 'new-1', subject_id: 'sub-1', position: 1 },
      { topic_id: 'new-2', subject_id: 'sub-1', position: 2 },
    ])
  })

  it('keeps a topic reused from elsewhere in its place in this bed', async () => {
    // A topic belongs to every subject it genuinely sits under, and
    // where it falls is true of it here and not there — which is why
    // the order rides on the membership rather than on the topic.
    resolveConcept.mockImplementation((title: string) =>
      title === 'Metering'
        ? { action: 'link', topicId: 'old-metering' }
        : { action: 'create' }
    )
    state.rows = [
      { id: 'new-0', title: 'Exposure', state: 'active' },
      { id: 'old-metering', title: 'Metering', state: 'active' },
      { id: 'new-1', title: 'Zone system', state: 'active' },
    ]

    await plant()

    expect(orderRows().map(r => [r.topic_id, r.position])).toEqual([
      ['new-0', 0],
      ['old-metering', 1],
      ['new-1', 2],
    ])
  })

  it('places a topic twice proposed once, at the earlier of the two', async () => {
    // Two names can resolve onto one existing topic. The same row twice
    // in one upsert is rejected outright by Postgres, which would lose
    // the whole order for one repeated topic.
    resolveConcept.mockImplementation((title: string) =>
      title === 'Exposure' || title === 'Zone system'
        ? { action: 'link', topicId: 'old-exposure' }
        : { action: 'create' }
    )
    state.rows = [
      { id: 'old-exposure', title: 'Exposure', state: 'active' },
      { id: 'new-0', title: 'Metering', state: 'active' },
    ]

    await plant()

    expect(orderRows().map(r => [r.topic_id, r.position])).toEqual([
      ['old-exposure', 0],
      ['new-0', 1],
    ])
  })

  it('costs the order and not the bed when it cannot be written', async () => {
    state.orderError = { message: 'permission denied' }

    const planting = await plant()

    expect(planting.problem).toBeNull()
    expect(planting.created).toHaveLength(3)
    expect(planting.warnings.some(w => /alphabetically/.test(w))).toBe(true)
  })
})

describe('where a freshly laid bed is opened', () => {
  it('is the first topic in its own order, not the first by name', async () => {
    const planting = await plant()

    expect(planting.first).toEqual({
      id: 'new-0',
      title: 'Exposure',
      curriculumId: null,
    })
  })

  it('hands back a route the topic already carries rather than a second one', async () => {
    // The most introductory thing in a new bed can be something already
    // worked elsewhere on the map.
    state.curricula = [{ id: 'route-1', status: 'active' }]

    const planting = await plant()
    expect(planting.first?.curriculumId).toBe('route-1')
  })

  it('skips a topic waiting on an adjudication', async () => {
    // It may be about to be merged into something else, and lessons
    // written against it would be written against a topic that is
    // shortly not going to exist.
    state.rows = [
      { id: 'new-0', title: 'Exposure', state: 'pending' },
      { id: 'new-1', title: 'Metering', state: 'active' },
      { id: 'new-2', title: 'Zone system', state: 'active' },
    ]

    const planting = await plant()
    expect(planting.first?.id).toBe('new-1')
  })

  it('offers nothing for a bed with nothing active in it', async () => {
    state.rows = [
      { id: 'new-0', title: 'Exposure', state: 'pending' },
      { id: 'new-1', title: 'Metering', state: 'pending' },
      { id: 'new-2', title: 'Zone system', state: 'pending' },
    ]

    const planting = await plant()
    expect(planting.first).toBeNull()
  })
})
