// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Highlight } from '@didactic/core/types'

/**
 * The press beside every heading.
 *
 * The prose is HTML the renderer sets, so the presses are stood into it
 * rather than rendered by React where it would normally put them --
 * which is the part worth pinning down: that there is one per heading,
 * that they come back when the renderer sets the prose again, and that
 * what the reader writes there is never mistaken for the text by the
 * painter that draws marks on it.
 */
vi.mock('@didactic/api', () => ({ didactic: () => ({ mentions: { search: vi.fn() } }) }))

const { SectionSummaries } = await import('@/components/SectionSummaries')
const { paintMarks } = await import('@/lib/paintMarks')

const BODY = '# Custody\n\nThe broker holds it.\n\n## Settlement\n\nTwo days later.\n'
const HTML = '<h1>Custody</h1><p>The broker holds it.</p><h2>Settlement</h2><p>Two days later.</p>'

const summary = (section: string | null, note: string): Highlight => ({
  id: `s-${section}`,
  user_id: 'u',
  kind: 'summary',
  lesson_id: 'l',
  topic_id: null,
  quote: '',
  prefix: null,
  note,
  section,
  section_at: 0,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
})

let container: HTMLDivElement
let prose: HTMLDivElement
let root: Root

/** Let the watcher's animation frame run, and whatever it rendered. */
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30))
  })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  prose = document.createElement('div')
  prose.dataset.prose = ''
  prose.innerHTML = HTML
  container.appendChild(prose)
  document.body.appendChild(container)
  root = createRoot(document.createElement('div'))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount(summaries: Highlight[] = [], onSave = vi.fn().mockResolvedValue(true)) {
  act(() =>
    root.render(
      <SectionSummaries
        root={container}
        body={BODY}
        summaries={summaries}
        onSave={onSave}
        onRemove={vi.fn()}
      />
    )
  )
  return onSave
}

describe('SectionSummaries', () => {
  it('stands one press inside every heading, after its words', () => {
    mount()
    const presses = container.querySelectorAll('h1 button, h2 button')
    expect(presses).toHaveLength(2)
    expect(presses[0].getAttribute('aria-label')).toMatch(/Summarise “Custody”/)
    // The heading still says what it said: the press has no words.
    expect(container.querySelector('h1')!.textContent).toBe('Custody')
  })

  it('says which sections have been said back', () => {
    mount([summary('Settlement', 'Paid two days on.')])
    const [custody, settlement] = container.querySelectorAll<HTMLButtonElement>('h1 button, h2 button')
    expect(custody.dataset.said).toBeUndefined()
    expect(settlement.dataset.said).toBe('true')
    expect(settlement.getAttribute('aria-label')).toMatch(/Your summary of “Settlement”/)
  })

  it('opens the field under the heading, and keeps what is written against that section', async () => {
    const onSave = mount()
    const press = container.querySelector<HTMLButtonElement>('h2 button')!
    act(() => press.click())

    const panel = container.querySelector('h2 + [data-summary-host="panel"]')!
    expect(panel.querySelector('[role="group"]')).not.toBeNull()

    // The editor is a contenteditable box; type into it the way the
    // browser would report it.
    const box = panel.querySelector<HTMLElement>('[contenteditable]')!
    await act(async () => {
      box.innerHTML = '<p>Money and shares swap two days after the trade.</p>'
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const keep = Array.from(panel.querySelectorAll('button')).find(b => b.textContent === 'Keep it')!
    await act(async () => keep.click())

    expect(onSave).toHaveBeenCalledWith(
      'Settlement',
      1,
      expect.stringContaining('two days after the trade')
    )
  })

  it('stands the presses again when the renderer sets the prose afresh', async () => {
    mount()
    prose.innerHTML = HTML
    expect(container.querySelectorAll('h1 button, h2 button')).toHaveLength(0)
    await settle()
    expect(container.querySelectorAll('h1 button, h2 button')).toHaveLength(2)
  })

  it('is never read as the text a mark is searched for in', () => {
    mount([summary('Custody', 'The broker holds it.')])
    // Open the standing summary, so its words are on the page right
    // after the heading -- the same words as the sentence below.
    act(() => container.querySelector<HTMLButtonElement>('h1 button')!.click())
    expect(container.querySelector('[data-summary-host="panel"]')!.textContent).toContain(
      'The broker holds it.'
    )

    const drawn = paintMarks(
      container,
      [{ id: 'm', quote: 'The broker holds it.', prefix: null, hasNote: false }],
      () => {}
    )
    expect(drawn).toEqual(['m'])
    // Drawn on the prose, not on the summary that says the same thing.
    expect(container.querySelector('p > mark[data-mark="m"]')).not.toBeNull()
    expect(container.querySelector('[data-summary-host] mark')).toBeNull()
  })
})
