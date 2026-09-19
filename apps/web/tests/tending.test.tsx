// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ClozeCard as Card } from '@didactic/core/clozes'

/**
 * Answering, and getting out of the way.
 *
 * A sitting is a rhythm: read, judge, next. Everything here is about
 * not interrupting it -- the card goes on the press rather than when
 * the server says so, and nothing stands between one question and the
 * one after it.
 */

const review = vi.fn()
const due = vi.fn()

vi.mock('@didactic/api', () => ({
  didactic: () => ({
    clozes: {
      due,
      random: vi.fn(async () => ({ ok: true, body: { clozes: [] }, status: 200, error: null })),
      review,
      remove: vi.fn(),
      patch: vi.fn(),
      count: vi.fn(async () => ({ ok: true, body: { due: 0, total: 0, next: null }, status: 200, error: null })),
    },
  }),
}))

const { TendSheet } = await import('@/app/tend/TendSheet')

function card(id: string, text: string, blank: string): Card {
  const start = text.indexOf(blank)
  return {
    id, concept_id: null, lesson_id: 'l', topic_id: null,
    kind: 'cloze',
    text, prefix: null, blank, blank_start: start, blank_end: start + blank.length,
    question: null, answer: null, note: null, anchor: null,
    hint: null, created_by: 'ai',
    stability: null, difficulty: null, state: 'new', reps: 0, lapses: 0,
    due: '2026-09-12T09:00:00.000Z', last_reviewed_at: null,
    created_at: '', updated_at: '',
    concept: null, lesson: null, topic: null,
  }
}

const FIRST = card('c1', 'Minification removes whitespace and comments.', 'whitespace')
const SECOND = card('c2', 'Compression encodes the same bytes smaller.', 'encodes')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  due.mockResolvedValue({ ok: true, body: { clozes: [FIRST, SECOND] }, status: 200, error: null })
  review.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

async function sitting() {
  await act(async () => {
    root.render(
      <TendSheet subjectId={null} topicId={null} lessonId={null} random={false} />
    )
  })
}

const press = (label: string) => {
  const button = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent?.startsWith(label)
  )
  if (!button) throw new Error(`no button starting "${label}" — saw: ${
    Array.from(container.querySelectorAll('button')).map(b => b.textContent).join(' | ')
  }`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** A promise this test decides when to settle. */
function deferred<T>() {
  let settle: (value: T) => void = () => {}
  const promise = new Promise<T>(resolve => (settle = resolve))
  return { promise, settle }
}

/* The bug 047 fixes, at the surface it appeared on.

   The gist was printed above the question, so that an answer was
   recalled from something rather than guessed from nothing. But a gist
   belongs to the *concept* and is written about the concept rather
   than about any one card under it — one sentence cannot be written to
   avoid the answers of every card it sits over, so sooner or later it
   hands one over. It did: "Jank is a stutter that
   happens when the work needed to produce a frame overruns the ~16.7ms
   budget", printed above a card asking what the frame budget is. */
describe('what a card shows before it is turned over', () => {
  const GIST = 'Jank happens when a frame overruns the ~16.7ms budget for 60fps.'

  const withGist = (): Card => ({
    ...card('c9', 'A browser must produce a new frame roughly every 16.7 milliseconds.', '16.7 milliseconds'),
    concept: { id: 'k1', name: 'Jank and the frame budget', gist: GIST },
  })

  it('keeps the concept gist out of the document until the answer is asked for', async () => {
    due.mockResolvedValue({ ok: true, body: { clozes: [withGist()] }, status: 200, error: null })
    await sitting()

    expect(container.textContent).toContain('A browser must produce')
    // Not merely hidden: not there at all, so it cannot be read off the
    // page, selected, or found by a search.
    expect(container.textContent).not.toContain('16.7ms')
    expect(container.textContent).not.toContain(GIST)
  })

  it('still prints the concept name, which is a heading and not a claim', async () => {
    due.mockResolvedValue({ ok: true, body: { clozes: [withGist()] }, status: 200, error: null })
    await sitting()
    expect(container.textContent).toContain('Jank and the frame budget')
  })

  it('shows the gist with the answer, where it reinforces instead of cribbing', async () => {
    due.mockResolvedValue({ ok: true, body: { clozes: [withGist()] }, status: 200, error: null })
    await sitting()
    press('Show it')
    expect(container.textContent).toContain(GIST)
  })
})

describe('a sitting', () => {
  it('shows the first card face down, with the answer nowhere on the page', async () => {
    await sitting()
    expect(container.textContent).toContain('Minification removes')
    expect(container.textContent).not.toContain('whitespace')
    expect(container.textContent).toContain('Show it')
  })

  it('prints what each answer would cost, before any of them is pressed', async () => {
    await sitting()
    press('Show it')
    // The wait is said here, on the button, which is the only place it
    // can change what the reader does. Afterwards it is history.
    expect(container.textContent).toContain('10 min')
    expect(container.textContent).toContain('Gone')
    expect(container.textContent).toContain('A struggle')
  })

  it('moves to the next card on the press, without waiting for the server', async () => {
    const held = deferred<unknown>()
    review.mockReturnValue(held.promise)

    await sitting()
    press('Show it')
    press('Got it')

    // The request has gone and has not come back.
    expect(review).toHaveBeenCalledWith('c1', 3)
    expect(container.textContent).not.toContain('Minification removes')
    // And the next card arrives face down, as every card does: its own
    // blank is masked, so the answer is not on the page.
    expect(container.textContent).toContain('the same bytes smaller')
    expect(container.textContent).not.toContain('encodes')
  })

  it('confirms nothing afterwards: no "back in", no Next to press', async () => {
    review.mockResolvedValue({
      ok: true, status: 200, error: null,
      body: { cloze: FIRST, intervalDays: 3, retrievability: 0.9, wait: '3 d' },
    })

    await sitting()
    press('Show it')
    await act(async () => {
      press('Got it')
    })

    expect(container.textContent).not.toContain('Back in')
    expect(container.textContent).not.toContain('3 d.')
    const labels = Array.from(container.querySelectorAll('button')).map(b => b.textContent)
    expect(labels).not.toContain('Next')
  })

  it('counts what was tended, and what is left', async () => {
    review.mockResolvedValue({
      ok: true, status: 200, error: null,
      body: { cloze: FIRST, intervalDays: 3, retrievability: 0.9, wait: '3 d' },
    })

    await sitting()
    expect(container.textContent).toContain('2 cards are due')

    press('Show it')
    await act(async () => {
      press('Got it')
    })

    expect(container.textContent).toContain('1 card is due')
    expect(container.textContent).toContain('1 tended')
  })

  it('deals from a deck while there is more than one, and off it on the last', async () => {
    review.mockResolvedValue({
      ok: true, status: 200, error: null,
      body: { cloze: FIRST, intervalDays: 3, retrievability: 0.9, wait: '3 d' },
    })

    await sitting()
    expect(container.querySelector('[data-more]')).not.toBeNull()

    press('Show it')
    await act(async () => {
      press('Got it')
    })

    // One card left: the edges behind it would be promising a card that
    // is not there.
    expect(container.querySelector('[data-more]')).toBeNull()
  })

  it('says so when an answer did not reach the server, and carries on', async () => {
    review.mockResolvedValue({
      ok: false, status: 500, body: {}, error: 'The garden could not be reached',
    })

    await sitting()
    press('Show it')
    await act(async () => {
      press('Got it')
    })

    // The reader is already on the next card -- the sitting is not
    // interrupted -- and the schedule was never moved, so the cloze is
    // still due and says so.
    expect(container.textContent).toContain('the same bytes smaller')
    expect(container.textContent).toContain('The garden could not be reached')
    expect(container.textContent).toContain('still due')
  })

  it('rests when the last card is answered', async () => {
    review.mockResolvedValue({
      ok: true, status: 200, error: null,
      body: { cloze: FIRST, intervalDays: 3, retrievability: 0.9, wait: '3 d' },
    })

    await sitting()
    for (let i = 0; i < 2; i++) {
      press('Show it')
      await act(async () => {
        press('Got it')
      })
    }

    expect(container.textContent).toContain('That is the lot')
    expect(container.textContent).toContain('2 cards tended')
  })
})
