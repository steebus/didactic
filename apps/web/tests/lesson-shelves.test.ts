import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * What a lesson is shown of the reader's library.
 *
 * Both shelves go into the prompt whole -- title, link, read or not,
 * and summary apiece -- so what is read here is what the model is
 * handed, and an unbounded read is an unbounded prompt. The near shelf
 * had no ceiling: every resource ever filed against the topic. That
 * was a paragraph while a topic held a handful of things and a reading
 * list once ingestion started filing properly.
 *
 * These tests read the query rather than the answer, because the bug
 * was never in what came back -- it was in what was asked for.
 */

/** Every `from()` the route made, with the clauses hung off it. */
interface Asked {
  table: string
  eq?: [string, unknown]
  in?: [string, unknown]
  order?: [string, { ascending?: boolean } | undefined]
  limit?: number
  single?: true
}
let asked: Asked[] = []

const lesson = {
  id: 'les-1',
  title: 'Web Font Optimization',
  summary: null,
  stage: 'core',
  estimated_minutes: 20,
  curriculum_id: 'cur-1',
  body: null,
  body_finished: false,
  body_rounds: 0,
}
const curriculum = { id: 'cur-1', title: 'Making it fast', goal: null, topic_id: 'top-1' }

/** A filed resource, as PostgREST hands the embed back. */
const filed = { resources: { title: 'A book', summary: null, url: null, status: 'unread' } }

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const record: Asked = { table }
      asked.push(record)
      const q = {
        select: () => q,
        update: () => q,
        eq: (column: string, value: unknown) => ((record.eq = [column, value]), q),
        in: (column: string, value: unknown) => ((record.in = [column, value]), q),
        order: (column: string, options?: { ascending?: boolean }) =>
          ((record.order = [column, options]), q),
        limit: (n: number) => ((record.limit = n), q),
        single: async () => {
          record.single = true
          return {
            data: table === 'lessons' ? lesson : table === 'curricula' ? curriculum : { title: 'Fonts' },
            error: null,
          }
        },
        // Awaiting the builder itself is a list read, or a write.
        then: (resolve: (v: unknown) => void) =>
          resolve({
            data:
              table === 'resource_topics'
                ? [filed]
                : // One row answering both reads of this table: the
                  // memberships read takes `subject_id`, the siblings
                  // read takes `topic_id`.
                  table === 'topic_subjects'
                  ? [{ subject_id: 'sub-1', topic_id: 'top-2' }]
                  : [],
            error: null,
          }),
      }
      return q
    },
  }),
}))

const generateLessonBody = vi.fn()
vi.mock('@/lib/llm/curriculum', () => ({ generateLessonBody, ROUNDS_MAX: 6 }))
vi.mock('@/lib/curriculum', () => ({ lessonsWithinReach: async () => [] }))
vi.mock('@/lib/citations', () => ({
  passagesForLesson: async () => ({ passages: [] }),
  unsupportedCitations: () => [],
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

beforeEach(() => {
  asked = []
  generateLessonBody.mockReset().mockResolvedValue({ text: 'The lesson.', finished: true })
})

const write = async () => {
  const { POST } = await import('@/app/api/lessons/[id]/body/route')
  return POST(new Request('http://localhost/api/lessons/les-1/body', { method: 'POST', body: '{}' }), {
    params: Promise.resolve({ id: 'les-1' }),
  })
}

/** The two reads of the library: the topic's own shelf, then its neighbours'. */
const shelves = () => {
  const reads = asked.filter(a => a.table === 'resource_topics')
  return { here: reads.find(a => a.eq), over: reads.find(a => a.in) }
}

describe('the shelf a lesson is written from', () => {
  it('is bounded, so a well-stocked topic is not an unbounded prompt', async () => {
    await write()

    expect(shelves().here!.limit).toBe(40)
  })

  it('takes the best-scored of it rather than whatever comes back first', async () => {
    // A ceiling on an unordered read keeps an arbitrary forty, which is
    // a worse prompt than no ceiling rather than a better one.
    await write()

    expect(shelves().here!.order).toEqual(['relevance', { ascending: false }])
  })

  it('reads the neighbours the same way, which were capped but unordered', async () => {
    await write()

    const over = shelves().over!
    expect(over.limit).toBe(40)
    expect(over.order).toEqual(['relevance', { ascending: false }])
  })

  it('still writes the lesson', async () => {
    // The shelves are an input to the prompt; capping them must not
    // change what the route does with what comes back.
    const res = await write()

    expect(generateLessonBody).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ body: 'The lesson.', done: true })
  })
})
