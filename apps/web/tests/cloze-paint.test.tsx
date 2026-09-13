// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Highlighter } from '@/components/Highlighter'
import type { Highlight as Mark } from '@didactic/core/types'
import type { ClozeCard } from '@didactic/core/clozes'
import { Prose } from '@/components/Prose'

/**
 * The two layers on one page.
 *
 * The thing worth testing here is the requirement that the tended
 * passages must not interfere with mark making: a sentence can be both,
 * either can be drawn first, and neither may swallow the other or the
 * reader's selection.
 */

const PROSE = 'Seeds germinate when the soil is warm enough for them.'

const KEPT: Mark[] = [
  {
    id: 'mark-1', user_id: 'u', lesson_id: 'l', topic_id: null,
    quote: 'germinate when the soil', prefix: 'Seeds ', note: null,
    created_at: '', updated_at: '',
  },
]

function cloze(over: Partial<ClozeCard> = {}): ClozeCard {
  const text = over.text ?? PROSE
  const blank = over.blank ?? 'warm enough'
  const start = text.indexOf(blank)
  return {
    id: 'cloze-1', concept_id: null, lesson_id: 'l', topic_id: null,
    text, prefix: null, blank, blank_start: start, blank_end: start + blank.length,
    hint: null, created_by: 'ai',
    stability: null, difficulty: null, state: 'new', reps: 0, lapses: 0,
    due: '2026-09-12T09:00:00.000Z', last_reviewed_at: null,
    created_at: '', updated_at: '',
    concept: null, lesson: null, topic: null,
    ...over,
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })

describe('painting tended passages onto the prose', () => {
  it('draws nothing at all for a lesson with nothing tended', () => {
    act(() => {
      root.render(<Highlighter lessonId="l" existing={[]}><p>{PROSE}</p></Highlighter>)
    })
    expect(container.querySelectorAll('[data-cloze]').length).toBe(0)
  })

  it('reads exactly as before for a caller that passes no clozes', () => {
    // The refresher renders this same body and has never heard of the
    // garden. Its prose must come out untouched.
    act(() => {
      root.render(<Highlighter lessonId="l" existing={KEPT}><p>{PROSE}</p></Highlighter>)
    })
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
    expect(container.querySelectorAll('[data-cloze]').length).toBe(0)
  })

  it('draws the whole passage a cloze was cut from', () => {
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[cloze()]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })
    const drawn = container.querySelector('[data-cloze]')
    expect(drawn?.textContent).toBe(PROSE)
  })

  it('offers the passage as a control, once', () => {
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[cloze()]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })
    const buttons = container.querySelectorAll('[data-cloze][role="button"]')
    expect(buttons.length).toBe(1)
    expect(buttons[0].getAttribute('aria-label')).toMatch(/Tended/)
  })

  it('draws nothing for a passage no longer in the body', () => {
    // The lesson was written again and the sentence went with it. The
    // cloze is still due; it simply cannot be shown in its own lesson.
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[cloze({ text: 'Something else entirely.' })]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })
    expect(container.querySelectorAll('[data-cloze]').length).toBe(0)
  })

  it('keeps both carriers where a sentence is marked and tended', () => {
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={KEPT} clozes={[cloze()]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })
    // The mark is still drawn, on its own words, and the tended passage
    // is drawn too. Neither layer refused because the other was there.
    const marked = Array.from(container.querySelectorAll('mark[data-mark]'))
      .map(m => m.textContent)
      .join('')
    expect(marked).toBe('germinate when the soil')
    expect(container.querySelectorAll('[data-cloze]').length).toBeGreaterThan(0)

    // And the sentence still reads as itself: nothing was dropped,
    // duplicated or reordered by either painter.
    expect(container.querySelector('p')?.textContent).toBe(PROSE)
  })

  it('paints clozes that arrive after the body is on the page', () => {
    // What the lesson page actually does: the body renders, and the
    // garden comes back from its own request a moment later.
    act(() => {
      root.render(<Highlighter lessonId="l" existing={[]}><p>{PROSE}</p></Highlighter>)
    })
    expect(container.querySelectorAll('[data-cloze]').length).toBe(0)

    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[cloze()]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })
    expect(container.querySelectorAll('[data-cloze]').length).toBe(1)
  })

  it('takes a tended passage off the page when it is pulled up', () => {
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[cloze()]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })
    expect(container.querySelectorAll('[data-cloze]').length).toBe(0)
    expect(container.querySelector('p')?.textContent).toBe(PROSE)
  })

  it('draws a passage whose sentence carries an equation', () => {
    // The agent cuts its clozes from the lesson *source*, where the
    // equation is still `$2^x = 100$`; the page holds it set, where it
    // reads as its glyphs. Searched as stored it was never found, and
    // the plum was never drawn -- which is the bug this covers.
    const SOURCE = 'The equation $2^x = 100$ has no ordinary answer.'
    act(() => {
      root.render(
        <Highlighter
          lessonId="l"
          existing={[]}
          clozes={[cloze({ text: SOURCE, blank: 'ordinary' })]}
        >
          <Prose markdown={SOURCE} />
        </Highlighter>
      )
    })

    const drawn = container.querySelector('[data-cloze]')
    expect(drawn).not.toBeNull()
    // Drawn over the sentence as the page holds it -- the equation set,
    // not the dollar signs it was written with.
    expect(container.textContent).not.toContain('$')
    expect(container.querySelector('math')).not.toBeNull()
  })

  it('does not open a card on the press that ends a selection', () => {
    // Marking is: select the words, let go. Letting go inside a tended
    // sentence must not open a card over the selection being made.
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[cloze()]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })

    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      toString: () => 'germinate',
    } as unknown as Selection)

    const drawn = container.querySelector<HTMLElement>('[data-cloze]')!
    act(() => {
      drawn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    vi.restoreAllMocks()
  })

  it('opens the card when the passage is simply pressed', () => {
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={[]} clozes={[cloze()]}>
          <p>{PROSE}</p>
        </Highlighter>
      )
    })

    const drawn = container.querySelector<HTMLElement>('[data-cloze]')!
    act(() => {
      drawn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const panel = container.querySelector('[role="dialog"]')
    expect(panel).not.toBeNull()
    // Face down: the answer is not on the page until it is asked for.
    expect(panel?.textContent).not.toContain('warm enough')
    expect(panel?.textContent).toContain('Show it')
  })
})
