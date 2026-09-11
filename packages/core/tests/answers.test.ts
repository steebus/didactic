import { describe, it, expect } from 'vitest'
import {
  questionKey,
  sameAnswer,
  acceptsAnswer,
  allCorrect,
  parseBlanks,
} from '../src/answers'

describe('questionKey', () => {
  it('is the same for the same question', () => {
    expect(questionKey('What blocks rendering?')).toBe(questionKey('What blocks rendering?'))
  })

  it('ignores the whitespace and case a rewrite might change', () => {
    expect(questionKey('  What   blocks rendering? ')).toBe(
      questionKey('What blocks rendering?')
    )
    expect(questionKey('WHAT BLOCKS RENDERING?')).toBe(questionKey('What blocks rendering?'))
  })

  it('differs for different questions', () => {
    expect(questionKey('What blocks rendering?')).not.toBe(
      questionKey('What defers rendering?')
    )
  })

  it('is a fixed-width hex string, so a column can hold it', () => {
    for (const q of ['a', 'a much longer question about settlement and custody', '£€—']) {
      expect(questionKey(q)).toMatch(/^[0-9a-f]{8}$/)
    }
  })

  it('stays a 32-bit number however long the question is', () => {
    // The FNV step is written in shifts rather than a multiply for
    // exactly this: a plain multiply overflows into a double and the
    // key stops being the same number on every platform.
    const long = 'why does this matter? '.repeat(200)
    expect(questionKey(long)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('sameAnswer', () => {
  it('ignores case and surrounding space', () => {
    expect(sameAnswer('  CSSOM ', 'cssom')).toBe(true)
  })

  it('ignores the article people put in without thinking', () => {
    expect(sameAnswer('the critical path', 'critical path')).toBe(true)
    expect(sameAnswer('a stylesheet', 'stylesheet')).toBe(true)
  })

  it('ignores the punctuation a phone keyboard adds on its own', () => {
    expect(sameAnswer('render-blocking.', 'render blocking')).toBe(true)
    expect(sameAnswer('the browser’s cache', "the browsers cache")).toBe(true)
  })

  it('is still exact about the answer itself', () => {
    expect(sameAnswer('CSSOM', 'DOM')).toBe(false)
    expect(sameAnswer('first paint', 'first contentful paint')).toBe(false)
  })

  it('does not match an empty answer against a real one', () => {
    expect(sameAnswer('', 'CSSOM')).toBe(false)
    expect(sameAnswer('   ', 'CSSOM')).toBe(false)
  })
})

describe('acceptsAnswer', () => {
  it('takes any of the answers offered', () => {
    expect(acceptsAnswer('stylesheet', ['CSS', 'CSSOM', 'the stylesheet'])).toBe(true)
  })

  it('refuses one that is not among them', () => {
    expect(acceptsAnswer('javascript', ['CSS', 'CSSOM'])).toBe(false)
  })

  it('refuses everything when nothing is accepted', () => {
    expect(acceptsAnswer('anything', [])).toBe(false)
  })
})

describe('allCorrect', () => {
  it('needs every part right', () => {
    expect(allCorrect([true, true])).toBe(true)
    expect(allCorrect([true, false])).toBe(false)
  })

  it('is not true of a question with no parts', () => {
    // A block too broken to ask anything has not been got right.
    expect(allCorrect([])).toBe(false)
  })
})

describe('parseBlanks', () => {
  it('splits a sentence into its printed pieces and its gaps', () => {
    expect(parseBlanks('The {{1}} is built from the {{2}}.', 2)).toEqual([
      { kind: 'text', text: 'The ' },
      { kind: 'gap', at: 0 },
      { kind: 'text', text: ' is built from the ' },
      { kind: 'gap', at: 1 },
      { kind: 'text', text: '.' },
    ])
  })

  it('handles a gap at either end', () => {
    expect(parseBlanks('{{1}} blocks rendering', 1)).toEqual([
      { kind: 'gap', at: 0 },
      { kind: 'text', text: ' blocks rendering' },
    ])
    expect(parseBlanks('rendering is blocked by {{1}}', 1)).toEqual([
      { kind: 'text', text: 'rendering is blocked by ' },
      { kind: 'gap', at: 0 },
    ])
  })

  it('takes the gaps out of order, since the number says which is which', () => {
    const pieces = parseBlanks('{{2}} comes after {{1}}', 2)
    expect(pieces).toEqual([
      { kind: 'gap', at: 1 },
      { kind: 'text', text: ' comes after ' },
      { kind: 'gap', at: 0 },
    ])
  })

  it('refuses a gap with no answer behind it', () => {
    expect(parseBlanks('The {{1}} and the {{2}}.', 1)).toBeNull()
  })

  it('refuses an answer no gap asks for', () => {
    // Silently dropping it would mark the reader wrong for a question
    // they were never shown.
    expect(parseBlanks('The {{1}}.', 2)).toBeNull()
  })

  it('refuses the same gap asked twice', () => {
    expect(parseBlanks('The {{1}} and the {{1}}.', 1)).toBeNull()
  })

  it('refuses a sentence with no gaps at all', () => {
    expect(parseBlanks('Nothing is asked here.', 1)).toBeNull()
  })

  it('refuses a zeroth gap, since the payload counts from one', () => {
    expect(parseBlanks('The {{0}}.', 1)).toBeNull()
  })

  it('refuses an empty sentence or no answers', () => {
    expect(parseBlanks('', 1)).toBeNull()
    expect(parseBlanks('The {{1}}.', 0)).toBeNull()
  })
})
