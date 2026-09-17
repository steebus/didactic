// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Block } from '@/components/blocks/Block'
import { BLOCKS } from '@didactic/core/blocks'

/**
 * The sort block, as a board.
 *
 * Worth testing at all because until now it was not: every class it
 * named was missing from the stylesheet and nothing noticed, which is
 * the sort of thing a test that renders the example would have caught
 * the day it was written.
 *
 * What is under test is the moving. The grading is `core/answers` and
 * tested there; here the questions are whether a card goes where the
 * arrow says, whether it can be sent back, and whether the board
 * refuses to be checked while anything is still in hand.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const draw = (data: unknown) =>
  act(() => {
    root.render(<Block name="sort" data={data} />)
  })

const example = () => JSON.parse(BLOCKS.find(b => b.name === 'sort')!.example)

/** Every column on the board, by its heading, with the cards in it. */
function board(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const column of container.querySelectorAll('section[aria-label]')) {
    const name = column.getAttribute('aria-label')!
    out[name] = [...column.querySelectorAll('li')]
      .map(li => li.textContent?.trim() ?? '')
      .filter(Boolean)
  }
  return out
}

/** The arrow on the card holding this text, in one direction. */
function arrow(text: string, way: 'back' | 'on'): HTMLButtonElement | null {
  const card = [...container.querySelectorAll('li')].find(li =>
    li.textContent?.includes(text)
  )
  return card?.querySelector<HTMLButtonElement>(`button[data-way='${way}']`) ?? null
}

const press = (button: HTMLButtonElement | null) =>
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

const foot = () =>
  [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Check them'))

describe('the sort board', () => {
  it('draws a column for the holding pen and one for each group', () => {
    draw(example())
    const columns = Object.keys(board())
    expect(columns[0]).toBe('Not yet placed')
    expect(columns).toContain('Holds up the paint')
    expect(columns).toContain('Does not')
    expect(columns).toHaveLength(3)
  })

  it('starts every card in the holding column', () => {
    draw(example())
    const held = board()['Not yet placed']
    expect(held).toHaveLength(example().items.length)
    expect(board()['Holds up the paint']).toEqual([])
  })

  it('moves a card one column on', () => {
    draw(example())
    press(arrow('A stylesheet in the head', 'on'))
    expect(board()['Holds up the paint'].join(' ')).toContain('A stylesheet in the head')
    expect(board()['Not yet placed'].join(' ')).not.toContain('A stylesheet in the head')
  })

  it('moves it on again to the next column', () => {
    draw(example())
    press(arrow('A stylesheet in the head', 'on'))
    press(arrow('A stylesheet in the head', 'on'))
    expect(board()['Does not'].join(' ')).toContain('A stylesheet in the head')
  })

  it('sends a card back to the holding column', () => {
    draw(example())
    press(arrow('A stylesheet in the head', 'on'))
    press(arrow('A stylesheet in the head', 'back'))
    expect(board()['Not yet placed'].join(' ')).toContain('A stylesheet in the head')
  })

  it('will not push a card off either end of the board', () => {
    draw(example())
    expect(arrow('A stylesheet in the head', 'back')!.disabled).toBe(true)
    press(arrow('A stylesheet in the head', 'on'))
    press(arrow('A stylesheet in the head', 'on'))
    expect(arrow('A stylesheet in the head', 'on')!.disabled).toBe(true)
  })

  /* The whole point of the arrows being buttons: what they do is said
     in words, so it survives a reader who cannot see the board. */
  it('says where an arrow would put the card', () => {
    draw(example())
    expect(arrow('A stylesheet in the head', 'on')!.getAttribute('aria-label')).toBe(
      'Move “A stylesheet in the head” to Holds up the paint'
    )
  })

  it('refuses to be checked while a card is still in hand', () => {
    draw(example())
    expect(foot()!.disabled).toBe(true)
    expect(container.textContent).toContain('move each one out of')
  })

  it('can be checked once every card has been placed', () => {
    const data = example()
    draw(data)
    for (const item of data.items) press(arrow(item.text, 'on'))
    expect(foot()!.disabled).toBe(false)
  })

  it('marks the board and says where a wrong card belonged', () => {
    const data = example()
    draw(data)
    // Everything into the first group, which is wrong for some of them.
    for (const item of data.items) press(arrow(item.text, 'on'))
    press(foot()!)

    const wrong = data.items.filter((i: { group: string }) => i.group !== data.groups[0])
    expect(wrong.length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Belonged in')
    expect(container.textContent).toContain(wrong[0].why)
  })

  it('leaves a checked card where the reader put it', () => {
    const data = example()
    draw(data)
    for (const item of data.items) press(arrow(item.text, 'on'))
    press(foot()!)
    // Every card is still in the column it was put in, marked rather
    // than quietly corrected.
    expect(board()[data.groups[0]]).toHaveLength(data.items.length)
  })

  it('takes the arrows away once it has been checked', () => {
    const data = example()
    draw(data)
    for (const item of data.items) press(arrow(item.text, 'on'))
    press(foot()!)
    expect(arrow(data.items[0].text, 'on')).toBeNull()
  })

  it('stands down rather than printing a question nobody can answer', () => {
    // An item naming a group that does not exist.
    draw({
      question: 'Which?',
      groups: ['A', 'B'],
      items: [{ text: 'one', group: 'A' }, { text: 'two', group: 'C' }],
    })
    expect(container.textContent).toBe('')

    // One group is not a sort.
    draw({ question: 'Which?', groups: ['A'], items: [{ text: 'one', group: 'A' }] })
    expect(container.textContent).toBe('')
  })
})
