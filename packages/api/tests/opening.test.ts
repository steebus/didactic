import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { didactic } from '../src/index'

/**
 * The two composed calls: a lesson written all the way through, and a
 * bed opened at its beginning.
 *
 * Both exist because the work does not fit in one request — a body is
 * written a round at a time, and drafting a route is a call of its own
 * — and both are here rather than in a front end so that the web and
 * the phone drive the same loop with the same cap and the same words.
 * What is checked is the sequencing, because that is the part a caller
 * cannot see and the part that would go wrong identically on both.
 */

const original = globalThis.fetch

/** Answer each call in turn, recording what was asked for. */
function replies(...bodies: Array<{ status?: number; body: unknown }>) {
  const asked: Array<{ method: string; path: string }> = []
  let n = 0
  globalThis.fetch = vi.fn(async (input: unknown, init: unknown) => {
    const path = String(input)
    const method = (init as RequestInit | undefined)?.method ?? 'GET'
    asked.push({ method, path })
    const next = bodies[Math.min(n++, bodies.length - 1)]
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return asked
}

const round = (over: Record<string, unknown> = {}) => ({
  body: { body: 'prose', cached: false, done: false, round: 1, words: 400, ...over },
})

const route = (lessons: Array<{ id: string; title: string }>) => ({
  body: {
    curriculum: { id: 'cur-1' },
    lessons: lessons.map(l => ({ lesson: l, availability: 'available', requires: [], tier: 0 })),
    prereqs: [],
    progress: { total: lessons.length, complete: 0, fraction: 0 },
  },
})

beforeEach(() => vi.restoreAllMocks())
afterEach(() => {
  globalThis.fetch = original
})

describe('writeWhole', () => {
  it('goes round until the lesson says it is finished', async () => {
    const asked = replies(
      round({ round: 1, words: 400 }),
      round({ round: 2, words: 900 }),
      round({ round: 3, words: 1400, done: true })
    )

    const said: string[] = []
    const res = await didactic().lessons.writeWhole('les-1', p => said.push(p))

    expect(res.ok).toBe(true)
    expect(res.body.rounds).toBe(3)
    expect(asked).toHaveLength(3)
    // The finished round is the news, not a progress note, so only the
    // unfinished ones report.
    expect(said).toEqual([
      'Round 1 done · about 400 words so far',
      'Round 2 done · about 900 words so far',
    ])
  })

  it('stops on a round that failed rather than trying it again', async () => {
    const asked = replies({ status: 502, body: { error: 'The model was busy.' } })

    const res = await didactic().lessons.writeWhole('les-1')

    expect(res.ok).toBe(false)
    expect(res.error).toBe('The model was busy.')
    expect(asked).toHaveLength(1)
  })

  it('carries the round cap’s warning out with the finished body', async () => {
    replies(round({ done: true, warning: 'The lesson ran long and was stopped where it stands.' }))

    const res = await didactic().lessons.writeWhole('les-1')
    expect(res.body.warnings).toEqual(['The lesson ran long and was stopped where it stands.'])
  })
})

describe('draftAndOpen', () => {
  it('drafts a route, then writes the first lesson of it', async () => {
    const asked = replies(
      { body: { curriculumId: 'cur-1', lessonsCreated: 6, shape: 'linear', droppedPrereqs: null } },
      route([{ id: 'les-1', title: 'What exposure is' }]),
      round({ done: true })
    )

    const said: string[] = []
    const routes: Array<{ curriculumId: string; lessonId: string; lessonTitle: string }> = []
    const res = await didactic().curricula.draftAndOpen(
      { id: 'top-1' },
      { report: p => said.push(p), onRoute: r => routes.push(r) }
    )

    expect(res.ok).toBe(true)
    expect(res.body).toMatchObject({
      curriculumId: 'cur-1',
      drafted: true,
      lessonId: 'les-1',
      lessonTitle: 'What exposure is',
    })
    expect(asked.map(a => `${a.method} ${a.path}`)).toEqual([
      'POST /api/curricula',
      'GET /api/curricula/cur-1',
      'POST /api/lessons/les-1/body',
    ])
    // The drafting has nothing to report out of it; the route is the
    // first honest figure there is.
    expect(said).toEqual(['A route of 1 lesson · writing the first'])
    // Announced before a word of the lesson is written, which is the
    // only moment at which anything outside can know to leave it alone.
    expect(routes).toEqual([
      { curriculumId: 'cur-1', lessonId: 'les-1', lessonTitle: 'What exposure is' },
    ])
  })

  it('follows a route the topic already has rather than drafting a second', async () => {
    const asked = replies(route([{ id: 'les-9', title: 'Where we left off' }]), round({ done: true }))

    const res = await didactic().curricula.draftAndOpen({ id: 'top-1', curriculumId: 'cur-7' })

    expect(res.body.drafted).toBe(false)
    expect(asked[0]).toEqual({ method: 'GET', path: '/api/curricula/cur-7' })
    expect(asked.some(a => a.path === '/api/curricula')).toBe(false)
  })

  it('takes the first lesson of the route, in the route’s own order', async () => {
    replies(
      { body: { curriculumId: 'cur-1', lessonsCreated: 2, shape: 'linear', droppedPrereqs: null } },
      route([
        { id: 'les-first', title: 'First' },
        { id: 'les-second', title: 'Second' },
      ]),
      round({ done: true })
    )

    const res = await didactic().curricula.draftAndOpen({ id: 'top-1' })
    expect(res.body.lessonId).toBe('les-first')
  })

  it('says the route stands when only the lesson failed', async () => {
    // "Nothing came of this" and "there is a route waiting, and one
    // page of it to write" are different facts, and the second one is
    // worth acting on.
    replies(
      { body: { curriculumId: 'cur-1', lessonsCreated: 6, shape: 'linear', droppedPrereqs: null } },
      route([{ id: 'les-1', title: 'What exposure is' }]),
      { status: 502, body: { error: 'The model was busy.' } }
    )

    const res = await didactic().curricula.draftAndOpen({ id: 'top-1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/route was drafted/i)
    expect(res.error).toMatch(/The model was busy\./)
  })

  it('stops at a draft that failed, and says what the draft said', async () => {
    const asked = replies({ status: 503, body: { error: 'ANTHROPIC_API_KEY is not set.' } })

    const res = await didactic().curricula.draftAndOpen({ id: 'top-1' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('ANTHROPIC_API_KEY is not set.')
    expect(asked).toHaveLength(1)
  })

  it('carries a lost prerequisite ordering out as a warning', async () => {
    replies(
      {
        body: {
          curriculumId: 'cur-1',
          lessonsCreated: 6,
          shape: 'branching',
          droppedPrereqs: 'The draft looped back on itself, so the ordering was left out.',
        },
      },
      route([{ id: 'les-1', title: 'First' }]),
      round({ done: true })
    )

    const res = await didactic().curricula.draftAndOpen({ id: 'top-1' })
    expect(res.body.warnings).toEqual([
      'The draft looped back on itself, so the ordering was left out.',
    ])
  })

  it('refuses a route that came back with no lessons in it', async () => {
    replies(
      { body: { curriculumId: 'cur-1', lessonsCreated: 0, shape: 'linear', droppedPrereqs: null } },
      route([])
    )

    const res = await didactic().curricula.draftAndOpen({ id: 'top-1' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/no first one to write/)
  })
})

describe('the route, announced before it is written', () => {
  it('is not announced at all when the drafting failed', async () => {
    replies({ status: 502, body: { error: 'The model was busy.' } })

    const routes: unknown[] = []
    await didactic().curricula.draftAndOpen({ id: 'top-1' }, { onRoute: r => routes.push(r) })
    expect(routes).toEqual([])
  })

  it('is announced for a route that already stood, which is written the same way', async () => {
    replies(route([{ id: 'les-9', title: 'Where we left off' }]), round({ done: true }))

    const routes: Array<{ lessonId: string }> = []
    await didactic().curricula.draftAndOpen(
      { id: 'top-1', curriculumId: 'cur-7' },
      { onRoute: r => routes.push(r) }
    )
    expect(routes.map(r => r.lessonId)).toEqual(['les-9'])
  })
})
