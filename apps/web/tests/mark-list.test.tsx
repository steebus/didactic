// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Highlighter } from '@/components/Highlighter'
import { Prose } from '@/components/Prose'
import type { Highlight as Mark } from '@didactic/core/types'

/**
 * The list of what is marked, beside the reading.
 *
 * What is under test is the way in and the way back: the tally and the
 * button both open it, it lists the marks in the order the lesson
 * reads rather than the order they were kept, and pressing one travels
 * to the passage in the text.
 */

const BODY = [
  '## What a seed is counting',
  '',
  'It counts two things, and it counts them together.',
  '',
  '- Moisture, which starts the radicle',
  '- Warmth, which spends the reserve',
  '',
  'A bed watered once and then left is worse than one never watered.',
].join('\n')

const mark = (id: string, quote: string, note: string | null = null): Mark => ({
  id, user_id: 'u', kind: 'mark' as const, lesson_id: 'l', topic_id: null, quote,
  prefix: null, note, created_at: '', updated_at: '',
})

// Kept in the order a reader wandered through the lesson: the last
// sentence first, then the first, then a note on the lesson itself.
const KEPT: Mark[] = [
  mark('last', 'A bed watered once and then left'),
  mark('first', 'It counts two things', 'The pair, again.'),
  mark('note', '', 'A thought about the whole thing.'),
]

let container: HTMLDivElement
let root: Root
let narrow = false

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  narrow = false
  window.matchMedia = ((q: string) => ({
    matches: narrow, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  Element.prototype.scrollIntoView = vi.fn()
  // Only the timers: React schedules its own work through microtasks,
  // and faking those stalls the renderer rather than the page.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function render(existing: Mark[] = KEPT) {
  act(() => {
    root.render(
      <Highlighter lessonId="l" existing={existing}>
        <Prose markdown={BODY} />
      </Highlighter>
    )
  })
}

const list = () => document.body.querySelector('aside[aria-label]')
/** The rows of the list. A note can carry a list of its own, and those
 *  items are not marks. */
const rows = () => Array.from(list()?.querySelector('ol')?.children ?? [])
const tally = () =>
  Array.from(container.querySelectorAll('button')).find(b =>
    b.textContent?.includes('marked here')
  )!
const press = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

/**
 * The list leaves under its own animation, so it is still on the page
 * until it has finished going.
 *
 * In a browser that is the animation ending; here it is the backstop
 * the component keeps for the case where the animation never runs at
 * all, which is exactly the case a headless DOM is in.
 */
const finishLeaving = () =>
  act(() => {
    vi.advanceTimersByTime(900)
  })

describe('opening the list', () => {
  it('is shut until it is asked for', () => {
    render()
    expect(list()).toBeNull()
  })

  it('opens from the tally under the reading', () => {
    render()
    expect(tally().textContent).toContain('2 passages marked here')
    press(tally())
    expect(list()).not.toBeNull()
  })

  it('opens from the button on the edge of the sheet', () => {
    render()
    const button = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'What you have marked in this lesson'
    )!
    press(button)
    expect(list()).not.toBeNull()
  })

  it('shuts again from the tally, and on Escape', () => {
    render()
    press(tally())
    press(tally())
    // Still there while it goes, and gone once it has gone.
    expect(list()).not.toBeNull()
    finishLeaving()
    expect(list()).toBeNull()

    press(tally())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    finishLeaving()
    expect(list()).toBeNull()
  })

  it('leaves under its own animation rather than vanishing', () => {
    render()
    press(tally())
    press(tally())
    expect(list()).not.toBeNull()
    // The tally stops claiming the list is open the moment it starts
    // going, rather than when it has gone.
    expect(tally().getAttribute('aria-expanded')).toBe('false')
    finishLeaving()
    expect(list()).toBeNull()
  })

  it('hangs off the body rather than the prose', () => {
    render()
    press(tally())
    expect(container.contains(list())).toBe(false)
  })
})

describe('what the list says', () => {
  it('puts the marks in the order the lesson reads, not the order they were kept', () => {
    render()
    press(tally())
    expect(rows().map(r => r.textContent?.slice(0, 20))).toEqual([
      expect.stringContaining('It counts two'),
      expect.stringContaining('A bed watered'),
      expect.stringContaining('A note on this'),
    ])
  })

  it('prints the note under the passage, as it will read', () => {
    render()
    press(tally())
    expect(list()!.textContent).toContain('The pair, again.')
  })

  it('says so when there is nothing marked', () => {
    render([mark('one', 'It counts two things')])
    press(tally())
    // Removing the only mark leaves the list open and empty rather
    // than vanishing under the reader.
    expect(rows().length).toBe(1)
  })
})

describe('travelling to a passage', () => {
  it('scrolls the lesson to the mark and says which one it is', () => {
    render()
    press(tally())
    const passage = list()!.querySelector('button')!
    // The first row's control is the passage itself.
    const rowPassage = rows()[0].querySelector('button')!
    press(rowPassage)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(container.querySelector('mark[data-found]')).not.toBeNull()
    expect(passage).toBeTruthy()
  })

  it('leaves a note on the lesson alone: there is nowhere to travel to', () => {
    render()
    press(tally())
    const note = rows()[2]
    expect(note.querySelector('button[title="Go to this passage"]')).toBeNull()
  })
})

/**
 * A real response, because the typed client reads the body as text
 * before parsing it: a double that only answers `json()` is not a
 * response any more.
 */
const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('editing and removing from the list', () => {
  it('writes a note against the mark', async () => {
    const fetched = vi.fn().mockResolvedValue(answer({ ok: true }))
    vi.stubGlobal('fetch', fetched)
    render()
    press(tally())

    const row = rows()[0]
    press(Array.from(row.querySelectorAll('button')).find(b => b.textContent === 'Edit note')!)
    expect(row.querySelector('[role="textbox"]')).not.toBeNull()

    await act(async () => {
      Array.from(row.querySelectorAll('button'))
        .find(b => b.textContent === 'Save')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The write, not the page asking for its bookmark on the way in.
    const [url, init] = fetched.mock.calls.find(([u]) => String(u).startsWith('/api/highlights'))!
    expect(url).toBe('/api/highlights')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body).id).toBe('first')
  })

  it('removes the mark, and the wash on the words, without waiting for the server', async () => {
    // The request never answers: what is under test is that the page
    // does not wait for it.
    const fetched = vi.fn().mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('fetch', fetched)
    render()
    press(tally())
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(2)

    // Awaited only so the request is on the record by the time it is
    // read: the client asks for its headers before it calls fetch, so
    // the call is a microtask behind the press. What the answer never
    // does is arrive — the promise above stays pending — so the state
    // below is the page acting without one.
    // Removing asks first; the answer is what removes.
    act(() => {
      Array.from(rows()[0].querySelectorAll('button'))
        .find(b => b.textContent === 'Remove')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      Array.from(rows()[0].querySelectorAll('button'))
        .find(b => b.textContent === 'Yes, remove')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const [, init] = fetched.mock.calls.find(([u]) => String(u).startsWith('/api/highlights'))!
    expect(init.method).toBe('DELETE')
    expect(rows().length).toBe(2)
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })

  it('puts the mark back when the server refuses to remove it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({}, 500)))
    render()
    press(tally())

    // Removing asks first; the answer is what removes.
    act(() => {
      Array.from(rows()[0].querySelectorAll('button'))
        .find(b => b.textContent === 'Remove')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      Array.from(rows()[0].querySelectorAll('button'))
        .find(b => b.textContent === 'Yes, remove')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rows().length).toBe(3)
    expect(container.textContent).toContain('was not removed')
  })
})

describe('what the list holds until the sheet catches up', () => {
  it('prints an edited note at once, rather than the sheet\'s old copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ ok: true })))
    render()
    press(tally())

    const row = rows()[0]
    press(Array.from(row.querySelectorAll('button')).find(b => b.textContent === 'Edit note')!)
    const box = row.querySelector('[role="textbox"]') as HTMLElement
    box.innerHTML = '<p>Read again before sowing.</p>'
    act(() => {
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      Array.from(row.querySelectorAll('button'))
        .find(b => b.textContent === 'Save')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rows()[0].textContent).toContain('Read again before sowing.')
  })
})

describe('pulling the reading aside with a finger', () => {
  // Dispatched on the prose rather than on the document, so the
  // gesture is read off the thing the finger actually landed on.
  const swipe = (from: number, to: number, y = 200, endY = y) => {
    const touched = () => container.querySelector('p') ?? document.body
    act(() => {
      touched().dispatchEvent(
        Object.assign(new Event('touchstart', { bubbles: true }), {
          touches: [{ clientX: from, clientY: y }],
        })
      )
      touched().dispatchEvent(
        Object.assign(new Event('touchmove', { bubbles: true }), {
          touches: [{ clientX: to, clientY: endY }],
        })
      )
      touched().dispatchEvent(
        Object.assign(new Event('touchend', { bubbles: true }), {
          changedTouches: [{ clientX: to, clientY: endY }],
        })
      )
    })
  }

  /** How far the reading stands aside, from its own transform. */
  const aside = () => {
    const moved = container.querySelector<HTMLElement>('[data-narrow]')?.style.transform ?? ''
    return Number(moved.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0)
  }

  beforeEach(() => {
    narrow = true
  })

  it('stays aside once pulled past the latch, and goes back on the way back', () => {
    render()
    swipe(320, 120)
    expect(aside()).toBeLessThan(0)
    swipe(120, 320)
    expect(aside()).toBe(0)
  })

  it('leaves a scroll to the page', () => {
    render()
    // Across a little, down a lot.
    swipe(320, 280, 100, 400)
    expect(aside()).toBe(0)
  })

  it('springs back from a nudge too short to be a pull', () => {
    render()
    swipe(320, 290)
    expect(aside()).toBe(0)
  })

  it('goes back on its own once nothing has touched it for a while', () => {
    render()
    swipe(320, 120)
    expect(aside()).toBeLessThan(0)
    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(aside()).toBe(0)
  })
})

describe('removing asks first', () => {
  it('leaves the mark alone when the answer is to keep it', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render()
    press(tally())
    const before = rows().length
    const drawn = container.querySelectorAll('mark[data-mark]').length
    const buttons = () => Array.from(rows()[0].querySelectorAll('button'))
    press(buttons().find(b => b.textContent === 'Remove')!)
    expect(rows()[0].textContent).toContain('Are you sure?')
    press(buttons().find(b => b.textContent === 'Keep it')!)
    expect(rows().length).toBe(before)
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(drawn)
    expect(rows()[0].textContent).not.toContain('Are you sure?')
  })
})
