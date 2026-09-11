import { describe, it, expect } from 'vitest'
import { markLabel, LABEL_CEILING } from '@/lib/graphMarks'

describe('naming a mark on the bed', () => {
  it('is what the reader wrote, not what they marked', () => {
    expect(markLabel('This is the bit that matters', 'a long quoted passage'))
      .toBe('This is the bit that matters')
  })

  it('falls back to the passage where nothing was written', () => {
    expect(markLabel(null, 'Settlement is when cash and ownership change hands'))
      .toBe('Settlement is when cash and ownership change hands')
  })

  it('prints the words of a tag rather than its address', () => {
    // A tag is a link, and the thing it names is a node of its own
    // with a line drawn to it. The label only needs the words.
    expect(markLabel('Really about [@Settlement](/topics/abc)', null))
      .toBe('Really about @Settlement')
  })

  it('prints emphasis as emphasised words rather than as asterisks', () => {
    expect(markLabel('The **whole** point', null)).toBe('The whole point')
  })

  it('cuts a long note at a word', () => {
    const label = markLabel(
      'Settlement is the part everybody skips and it is the part that actually moves the money',
      null
    )
    expect(label.length).toBeLessThanOrEqual(LABEL_CEILING + 1)
    expect(label.endsWith('…')).toBe(true)
    expect(label).not.toMatch(/ …$/)
  })

  it('trims a single long word rather than giving up on cutting', () => {
    const label = markLabel('x'.repeat(LABEL_CEILING + 20), null)
    expect(label).toBe(`${'x'.repeat(LABEL_CEILING)}…`)
  })

  it('still names a mark that says nothing printable', () => {
    expect(markLabel(null, null)).toBe('A mark')
    expect(markLabel('   ', '')).toBe('A mark')
  })
})
