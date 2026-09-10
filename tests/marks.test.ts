import { describe, it, expect } from 'vitest'
import { inReadingOrder, isUnsaved, UNSAVED } from '@/lib/marks'
import type { Highlight as Mark } from '@/lib/types'

const mark = (id: string, quote = 'a passage'): Mark => ({
  id,
  user_id: 'u',
  lesson_id: 'l',
  topic_id: null,
  quote,
  prefix: null,
  note: null,
  created_at: '',
  updated_at: '',
})

describe('inReadingOrder', () => {
  it('puts the marks in the order the page drew them', () => {
    const marks = [mark('c'), mark('a'), mark('b')]
    expect(inReadingOrder(marks, ['a', 'b', 'c']).map(m => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps what was never drawn, after what was', () => {
    // A note on the lesson, and a passage whose words are gone: neither
    // has a place in the text to sit at.
    const marks = [mark('note', ''), mark('b'), mark('lost'), mark('a')]
    expect(inReadingOrder(marks, ['a', 'b']).map(m => m.id)).toEqual(['a', 'b', 'note', 'lost'])
  })

  it('leaves the order alone when nothing was drawn', () => {
    const marks = [mark('a'), mark('b')]
    expect(inReadingOrder(marks, []).map(m => m.id)).toEqual(['a', 'b'])
  })

  it('ignores an id the page drew but the sheet no longer has', () => {
    expect(inReadingOrder([mark('a')], ['gone', 'a']).map(m => m.id)).toEqual(['a'])
  })
})

describe('isUnsaved', () => {
  it('knows a mark the server has not answered for yet', () => {
    expect(isUnsaved(`${UNSAVED}abc`)).toBe(true)
    expect(isUnsaved('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(false)
  })
})
