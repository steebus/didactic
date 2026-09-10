// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Highlighter } from '@/components/Highlighter'
import { Prose } from '@/components/Prose'
import type { Highlight as Mark } from '@/lib/types'

const PROSE = 'Seeds germinate when the soil is warm enough for them.'

const KEPT: Mark[] = [
  {
    id: 'mark-1', user_id: 'u', lesson_id: 'l', topic_id: null,
    quote: 'germinate when the soil', prefix: 'Seeds ', note: null,
    created_at: '', updated_at: '',
  },
]

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

describe('painting marks back onto the prose', () => {
  it('paints marks that are there when the lesson first renders', () => {
    act(() => {
      root.render(<Highlighter lessonId="l" existing={KEPT}><p>{PROSE}</p></Highlighter>)
    })
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })

  it('paints marks that arrive after the body is on the page', () => {
    // What the lesson page actually does: the body renders, and the
    // marks come back from the API a moment later.
    act(() => {
      root.render(<Highlighter lessonId="l" existing={[]}><p>{PROSE}</p></Highlighter>)
    })
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(0)

    act(() => {
      root.render(<Highlighter lessonId="l" existing={KEPT}><p>{PROSE}</p></Highlighter>)
    })
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })

  it('says how many it drew', () => {
    act(() => {
      root.render(<Highlighter lessonId="l" existing={KEPT}><p>{PROSE}</p></Highlighter>)
    })
    expect(container.textContent).toContain('1 passage marked here')
  })
})

describe('painting onto a real lesson body', () => {
  // The shape a written lesson actually takes: headings, prose, and a
  // block lifted out of the middle of it.
  const BODY = [
    '## The two conditions',
    '',
    'Moisture and warmth are what a seed is counting, and it counts them',
    'together rather than separately.',
    '',
    '```check',
    '{"question":"Which pair?","options":[{"text":"Warmth and moisture","correct":true}]}',
    '```',
    '',
    '## Reading a viability figure',
    '',
    'The figure on the packet is a claim about a population, not about the',
    'seed in your hand.',
  ].join('\n')

  const marks = (quote: string, prefix: string | null): Mark[] => [
    { id: 'm', user_id: 'u', lesson_id: 'l', topic_id: null, quote, prefix, note: null, created_at: '', updated_at: '' },
  ]

  const render = (existing: Mark[]) =>
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={existing}>
          <Prose markdown={BODY} />
        </Highlighter>
      )
    })

  it('draws a passage from the prose before a block', () => {
    render(marks('Moisture and warmth are what a seed is counting', null))
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })

  it('draws a passage from the prose after a block', () => {
    render(marks('a claim about a population', null))
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })

  it('draws a passage that runs across the line breaks of the source', () => {
    render(marks('it counts them together rather than separately', null))
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })

  it('draws a passage anchored by the text before it', () => {
    render(marks('The figure on the packet', 'Reading a viability figure'))
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })
})

describe('a passage that crosses an element boundary', () => {
  // The case that sent readers looking for a mark that was not there:
  // marking across two bullets makes a range that straddles the list
  // items, and the old wrapping refused it outright.
  const LIST = [
    'What a seed is counting:',
    '',
    '- Moisture, which starts the radicle',
    '- Warmth, which spends the reserve',
    '- Time, which does both',
    '',
    'A bed watered once and then left is worse than one never watered.',
  ].join('\n')

  const mark = (quote: string): Mark[] => [
    { id: 'm', user_id: 'u', lesson_id: 'l', topic_id: null, quote, prefix: null, note: null, created_at: '', updated_at: '' },
  ]

  const render = (existing: Mark[], markdown = LIST) =>
    act(() => {
      root.render(
        <Highlighter lessonId="l" existing={existing}>
          <Prose markdown={markdown} />
        </Highlighter>
      )
    })

  it('draws a passage marked across two dot points', () => {
    render(mark('which starts the radicle Warmth, which spends the reserve'))
    const pieces = container.querySelectorAll('mark[data-mark]')
    expect(pieces.length).toBeGreaterThan(1)
    // One passage, however many pieces it took to draw it.
    expect(new Set(Array.from(pieces, p => (p as HTMLElement).dataset.mark)).size).toBe(1)
    expect(container.textContent).toContain('1 passage marked here')
  })

  it('draws one across the whole list', () => {
    render(mark('Moisture, which starts the radicle Warmth, which spends the reserve Time, which does both'))
    expect(container.querySelectorAll('mark[data-mark]').length).toBeGreaterThan(2)
    expect(container.textContent).not.toContain('no longer in this text')
  })

  it('draws one that runs out of a paragraph into a list', () => {
    render(mark('What a seed is counting: Moisture, which starts the radicle'))
    expect(container.querySelectorAll('mark[data-mark]').length).toBeGreaterThan(1)
  })

  it('draws one that spans two paragraphs', () => {
    const body = 'The first thing, said plainly.\n\nThe second thing, said after it.'
    render(mark('said plainly. The second thing'), body)
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(2)
  })

  it('leaves the gaps between the items alone', () => {
    render(mark('which starts the radicle Warmth, which spends the reserve'))
    for (const piece of Array.from(container.querySelectorAll('mark[data-mark]'))) {
      // Nothing wrapped is only the whitespace between two elements.
      expect(piece.textContent?.trim()).not.toBe('')
      // And nothing is wrapped outside the item it belongs to.
      expect(piece.closest('li, p')).not.toBeNull()
    }
  })

  it('opens the one mark from whichever piece is pressed', () => {
    render(mark('which starts the radicle Warmth, which spends the reserve'))
    const pieces = Array.from(container.querySelectorAll('mark[data-mark]'))
    // Only the first piece is a tab stop; every piece opens the panel.
    expect(pieces.filter(p => (p as HTMLElement).tabIndex === 0).length).toBe(1)

    act(() => {
      pieces[pieces.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('still draws a passage that sits inside one paragraph', () => {
    render(mark('A bed watered once and then left'))
    expect(container.querySelectorAll('mark[data-mark]').length).toBe(1)
  })
})
