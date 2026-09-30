import { describe, it, expect, vi, beforeEach } from 'vitest'

const evaluate = vi.fn()
vi.mock('ai', () => ({ experimental_evaluate: evaluate }))

beforeEach(() => { evaluate.mockReset() })

const BED = [
  { id: 'order-routing', title: 'Order routing', summary: null },
  { id: 'custody', title: 'Custody', summary: null },
]

/**
 * Answer the sameness question with `same`, the scope question with
 * `scope`, and every pair question from `pairs` by the other topic's id.
 */
function reading(same: Record<string, number>, pairs: Record<string, [string, number]> = {}, scope = 0.9) {
  evaluate.mockImplementation(async ({ questions }: { questions: Record<string, { instructions: string }> }) => ({
    answers: Object.fromEntries(Object.entries(questions).map(([id, q]) => {
      if (id.startsWith('same:')) {
        const choice = Object.entries(same).sort((a, b) => b[1] - a[1])[0][0]
        return [id, { choice, probabilities: same }]
      }
      if (id.startsWith('scope:')) return [id, { choice: 'same', probabilities: { same: scope } }]
      const hit = Object.entries(pairs).find(([title]) => q.instructions.includes(`"${title}"`))
      const [choice, p] = hit ? hit[1] : ['none', 1]
      return [id, { choice, probabilities: { [choice]: p } }]
    })),
  }))
}

const sort = async (bed = BED) => {
  const { sortIntoBed } = await import('@/lib/llm/filing')
  return sortIntoBed({ subjectTitle: 'Brokerage', topic: { id: 'new', title: 'Settlement' }, bed })
}

describe('placing a topic in the bed it was added to', () => {
  it('keeps the edges that put it under something, and says so', async () => {
    reading({ none: 0.9 }, { 'Order routing': ['b_first', 0.8] })
    const sorted = await sort()

    expect(sorted?.edges).toEqual([{ from: 'order-routing', to: 'new', kind: 'prereq', weight: 0.8 }])
    expect(sorted?.note).toBe('Placed under Order routing.')
  })

  it('only ever draws edges that touch the new topic', async () => {
    reading({ none: 0.9 }, { 'Order routing': ['related', 0.9], Custody: ['related', 0.9] })
    for (const e of (await sort())!.edges) expect([e.from, e.to]).toContain('new')
  })
})

describe('a claim that the topic is already here', () => {
  it('is raised when the reading links it', async () => {
    reading({ custody: 0.9, none: 0.1 })
    const sorted = await sort()
    expect(sorted?.sameAs).toBe('custody')
    expect(sorted?.reading?.action).toBe('link')
  })

  it('is raised, as a question, when the reading is unsure', async () => {
    reading({ custody: 0.5, none: 0.5 })
    expect((await sort())?.sameAs).toBe('custody')
  })

  it('is cleared when the reading is sure it is its own topic', async () => {
    reading({ none: 0.9, custody: 0.1 })
    const sorted = await sort()
    expect(sorted?.sameAs).toBeNull()
    expect(sorted?.reading?.action).toBe('create')
  })
})

describe('a bed that cannot be read', () => {
  it('is not read at all when it is empty', async () => {
    expect(await sort([])).toBeNull()
    expect(evaluate).not.toHaveBeenCalled()
  })

  it('throws rather than clearing the topic when the reading fails', async () => {
    evaluate.mockRejectedValue(new Error('gateway down'))
    await expect(sort()).rejects.toThrow('gateway down')
  })

  it('never offers the topic it is placing as already there', async () => {
    reading({ none: 1 })
    await sort([...BED, { id: 'new', title: 'Settlement', summary: null }])

    const offered = evaluate.mock.calls
      .flatMap(c => Object.entries(c[0].questions as Record<string, { criteria: Record<string, unknown> }>))
      .filter(([id]) => id.startsWith('same:'))
      .flatMap(([, q]) => Object.keys(q.criteria))
    expect(offered).not.toContain('new')
  })
})
