// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Highlighter } from '@/components/Highlighter'

/**
 * The two ways to a selection, and the two verbs it is then offered.
 *
 * Nothing opens on its own. A selection could be a passage worth
 * keeping or a passage worth being asked back later, and presuming
 * either is wrong -- so both a mouse and a finger end at the same pair
 * of buttons floated beside the words, and the panel opens on the one
 * that is pressed.
 *
 * What still differs is when the page may believe the selection is
 * finished. A mouse says so by letting go. A finger cannot: the browser
 * makes the selection on a long-press and then hands the reader pins to
 * widen it with, and dragging those pins tells the page nothing -- so
 * a finger's selection is taken as finished only once it has stopped
 * changing for a moment. Acting on the first settled reading took the
 * passage over while it was still one word long, which is the bug the
 * touch cases here cover.
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
const button = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === label)
const pin = () => button('Add mark')
const clozePin = () => button('Make a cloze')
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
  it('offers both verbs on the release, and opens nothing on its own', () => {
    render()
    press('pointerdown', 'mouse')
    selectPassage()
    press('pointerup', 'mouse')

    // It used to open the note composer here and then, which was
    // defensible while marking was the only thing a selection could do.
    // With two verbs, presuming one of them is wrong -- and selecting a
    // sentence merely to copy it no longer throws a panel at you.
    expect(composer()).toBeNull()
    expect(pin()).toBeDefined()
    expect(clozePin()).toBeDefined()
  })

  it('opens the composer on the passage once a verb is pressed', () => {
    render()
    press('pointerdown', 'mouse')
    selectPassage()
    press('pointerup', 'mouse')
    act(() => {
      pin()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(composer()?.querySelector('blockquote')?.textContent).toBe(
      PROSE.slice(6, 30).trim()
    )
  })
})

describe('Highlighter, the two verbs a selection is offered', () => {
  /** Get to the offer the short way, by mouse. */
  function offer() {
    render()
    press('pointerdown', 'mouse')
    selectPassage()
    press('pointerup', 'mouse')
  }

  it('offers them as one group rather than as two loose buttons', () => {
    offer()
    const group = document.body.querySelector('[role="group"]')
    expect(group).not.toBeNull()
    expect(group!.contains(pin()!)).toBe(true)
    expect(group!.contains(clozePin()!)).toBe(true)
  })

  it('opens the maker, not the note composer, on the second verb', () => {
    offer()
    act(() => {
      clozePin()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const panel = composer()
    expect(panel).not.toBeNull()
    // The maker asks which words to take out; the note composer asks
    // what you thought. Pressing one must never open the other.
    expect(panel!.textContent).toContain('Press the words to take out')
    expect(panel!.querySelector('textarea')).toBeNull()
  })

  it('hands the maker the whole passage, word by word', () => {
    offer()
    act(() => {
      clozePin()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const words = Array.from(composer()!.querySelectorAll('button'))
      .map(b => b.textContent)
      // The panel's own furniture — the open-out control — carries no
      // text, so it is filtered out rather than counted as a word.
      .filter(w => w && PROSE.includes(w))
    expect(words.slice(0, 4)).toEqual(['germinate', 'when', 'the', 'soil'])
  })

  it('takes both away once a verb is pressed', () => {
    offer()
    act(() => {
      pin()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.body.querySelector('[role="group"]')).toBeNull()
  })
})

describe('Highlighter, where the composer stands', () => {
  /** Select, then take the offer: the composer stands where the offer
   *  measured, so it cannot be reached without pressing a verb. */
  function openComposer() {
    press('pointerdown', 'mouse')
    selectPassage()
    press('pointerup', 'mouse')
    act(() => {
      pin()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('sets it against the passage on a wide screen', () => {
    render()
    openComposer()

    expect((composer() as HTMLElement).style.top).not.toBe('')
  })

  it('docks it on a phone, where a placed panel would hang off the sheet', () => {
    narrowScreen(true)
    render()
    openComposer()

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
