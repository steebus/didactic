// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Highlighter } from '@/components/Highlighter'

/**
 * The two ways into the composer.
 *
 * A mouse marks by dragging and letting go, so the release is the
 * decision. A finger cannot: the browser makes the selection on a
 * long-press and then hands the reader pins to widen it with, and
 * dragging those pins tells the page nothing. Opening the composer on
 * the first settled selection therefore took the passage over while it
 * was still one word long -- the bug this covers. Touch gets an offer
 * floated beside the selection instead, and nothing is taken until the
 * reader presses it.
 */

const PROSE = 'Seeds germinate when the soil is warm enough for them.'

let container: HTMLDivElement
let root: Root

/** jsdom lays nothing out, so a range is asked where it is and has no
 *  answer. One rectangle, mid-window, is enough for the placement to
 *  run. */
const RECT = { top: 300, bottom: 320, left: 40, right: 240 }

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()

  Range.prototype.getBoundingClientRect = () => RECT as DOMRect
  narrowScreen(false)

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

/** jsdom has no matchMedia, and the composer asks whether it is on a
 *  phone before it decides where to stand. */
function narrowScreen(narrow: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: narrow,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
}

function render() {
  act(() => {
    root.render(
      <Highlighter lessonId="lesson-1" existing={[]}>
        <p>{PROSE}</p>
      </Highlighter>
    )
  })
}

/** Select "germinate when the soil" inside the prose. */
function selectPassage() {
  const text = container.querySelector('p')!.firstChild as Text
  const range = document.createRange()
  range.setStart(text, 6)
  range.setEnd(text, 30)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

function press(type: string, pointerType: 'touch' | 'mouse') {
  const event = new MouseEvent(type, { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  act(() => {
    document.dispatchEvent(event)
  })
}

// Both are looked for in the whole document: the floating button, and
// a panel docked to the foot of the screen, are hung off the body
// rather than left in the prose.
const pin = () =>
  Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === 'Add mark')
const composer = () => document.body.querySelector('[role="dialog"]')

describe('Highlighter, marking with a finger', () => {
  it('offers to keep the passage rather than taking it over', () => {
    render()
    press('pointerdown', 'touch')
    selectPassage()
    press('pointerup', 'touch')
    act(() => {
      vi.advanceTimersByTime(400)
    })

    // The composer would have taken the selection; the offer leaves it
    // alone, so the pins are still the reader's to drag.
    expect(composer()).toBeNull()
    expect(pin()).toBeDefined()
    expect(window.getSelection()?.isCollapsed).toBe(false)
    // It floats over the page, so it is hung off the body rather than
    // left in the prose it is measured against.
    expect(container.contains(pin()!)).toBe(false)
  })

  it('follows the selection out as it is widened', () => {
    render()
    press('pointerdown', 'touch')
    selectPassage()
    press('pointerup', 'touch')
    act(() => {
      vi.advanceTimersByTime(400)
    })

    // Dragging a pin sends the page no events at all -- only the
    // selection changing says anything happened.
    const text = container.querySelector('p')!.firstChild as Text
    const wider = document.createRange()
    wider.setStart(text, 6)
    wider.setEnd(text, PROSE.length - 1)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(wider)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
      vi.advanceTimersByTime(400)
    })

    expect(composer()).toBeNull()
    act(() => {
      pin()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // What is kept is the whole widened passage, not the first word.
    expect(composer()?.querySelector('blockquote')?.textContent).toBe(
      PROSE.slice(6, PROSE.length - 1).trim()
    )
  })

  it('takes the offer away when the reader lets the selection go', () => {
    render()
    press('pointerdown', 'touch')
    selectPassage()
    press('pointerup', 'touch')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(pin()).toBeDefined()

    window.getSelection()?.removeAllRanges()
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
      vi.advanceTimersByTime(400)
    })

    expect(pin()).toBeUndefined()
  })
})

describe('Highlighter, marking with a mouse', () => {
  it('opens the composer on the release, with no button in between', () => {
    render()
    press('pointerdown', 'mouse')
    selectPassage()
    press('pointerup', 'mouse')

    expect(pin()).toBeUndefined()
    expect(composer()?.querySelector('blockquote')?.textContent).toBe(
      PROSE.slice(6, 30).trim()
    )
  })
})

describe('Highlighter, where the composer stands', () => {
  it('sets it against the passage on a wide screen', () => {
    render()
    press('pointerdown', 'mouse')
    selectPassage()
    press('pointerup', 'mouse')

    expect((composer() as HTMLElement).style.top).not.toBe('')
  })

  it('docks it on a phone, where a placed panel would hang off the sheet', () => {
    narrowScreen(true)
    render()
    press('pointerdown', 'mouse')
    selectPassage()
    press('pointerup', 'mouse')

    const panel = composer() as HTMLElement
    expect(panel.style.top).toBe('')
    expect(panel.style.left).toBe('')

    // Hung off the body: every sheet arrives under an animation on
    // `main` that leaves a transform behind, and a transformed ancestor
    // is what a fixed panel is fixed to -- inside the prose it would
    // dock to the foot of the article rather than the screen.
    expect(container.contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
  })
})
