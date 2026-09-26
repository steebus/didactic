import { describe, it, expect } from 'vitest'
import {
  inSectionOrder,
  sectionKey,
  summaryGist,
  summaryLabel,
  summaryOf,
  summaryProblem,
  summaryTally,
  summaryDepth,
  SUMMARY_LIMIT,
  WHOLE,
} from '../src/summaries'

const summary = (
  id: string,
  section: string | null,
  section_at: number | null = null,
  created_at = '2026-09-01T00:00:00Z'
) => ({ id, note: `said back ${id}`, section, section_at, created_at })

describe('summaryProblem', () => {
  it('keeps an ordinary sentence', () => {
    expect(summaryProblem('Custody means the broker holds it for you.')).toBeNull()
  })

  it('refuses nothing, and whitespace that looks like something', () => {
    expect(summaryProblem('')).toMatch(/Write something/)
    expect(summaryProblem('   \n ')).toMatch(/Write something/)
  })

  it('refuses a word too short to say anything', () => {
    expect(summaryProblem('ok')).toMatch(/too short/)
  })

  it('refuses the section pasted back in whole', () => {
    expect(summaryProblem('x'.repeat(SUMMARY_LIMIT + 1))).toMatch(/more briefly/)
    expect(summaryProblem('x'.repeat(SUMMARY_LIMIT))).toBeNull()
  })
})

describe('sectionKey', () => {
  it('collapses the space a heading picks up between the markdown and the page', () => {
    expect(sectionKey('  The   hard part ')).toBe('The hard part')
  })

  it('reads an empty heading as the whole reading, not a section called nothing', () => {
    expect(sectionKey('')).toBeNull()
    expect(sectionKey('   ')).toBeNull()
    expect(sectionKey(null)).toBeNull()
    expect(sectionKey(undefined)).toBeNull()
  })
})

describe('summaryOf', () => {
  const all = [summary('a', 'Custody'), summary('whole', null), summary('b', 'Settlement')]

  it('finds a section by its heading', () => {
    expect(summaryOf(all, 'Settlement')?.id).toBe('b')
    expect(summaryOf(all, ' Settlement ')?.id).toBe('b')
  })

  it('finds the whole-reading summary under null', () => {
    expect(summaryOf(all, null)?.id).toBe('whole')
  })

  it('answers nothing for a section not said back', () => {
    expect(summaryOf(all, 'Margin')).toBeUndefined()
  })
})

describe('inSectionOrder', () => {
  it('runs in the order the reading does, with the whole last', () => {
    const all = [
      summary('whole', null),
      summary('third', 'C', 2),
      summary('first', 'A', 0),
      summary('second', 'B', 1),
    ]
    expect(inSectionOrder(all).map(s => s.id)).toEqual(['first', 'second', 'third', 'whole'])
  })

  it('puts a section with no recorded place after those with one, by when it was written', () => {
    const all = [
      summary('late', 'Z', null, '2026-09-03T00:00:00Z'),
      summary('early', 'Y', null, '2026-09-02T00:00:00Z'),
      summary('placed', 'A', 4),
    ]
    expect(inSectionOrder(all).map(s => s.id)).toEqual(['placed', 'early', 'late'])
  })

  it('does not reorder the list it was handed', () => {
    const all = [summary('b', 'B', 1), summary('a', 'A', 0)]
    inSectionOrder(all)
    expect(all.map(s => s.id)).toEqual(['b', 'a'])
  })
})

describe('summaryLabel', () => {
  it('names a section by its heading and the whole by what it is', () => {
    expect(summaryLabel('Custody')).toBe('Custody')
    expect(summaryLabel(null)).toBe(WHOLE)
  })
})

describe('summaryTally', () => {
  it('counts the sections said back, out of those the reading still has', () => {
    const all = [summary('a', 'A'), summary('gone', 'Rewritten away'), summary('w', null)]
    expect(summaryTally(all, ['A', 'B', 'C'])).toEqual({ said: 1, of: 3, whole: true })
  })

  it('counts a heading that appears twice once', () => {
    expect(summaryTally([summary('a', 'Recap')], ['Recap', 'Recap'])).toEqual({
      said: 1,
      of: 1,
      whole: false,
    })
  })
})

describe('summaryGist', () => {
  it('leaves a short summary whole', () => {
    expect(summaryGist('Short and sweet.')).toBe('Short and sweet.')
  })

  it('clips a long one at a word, with an ellipsis', () => {
    const long = 'word '.repeat(60)
    const gist = summaryGist(long, 40)
    expect(gist.endsWith('…')).toBe(true)
    expect(gist.length).toBeLessThanOrEqual(41)
    expect(gist).not.toMatch(/wor…$/)
  })

  it('reads nothing as nothing', () => {
    expect(summaryGist(null)).toBe('')
  })
})

describe('summaryDepth', () => {
  it('rewards the whole said back as working with it', () => {
    expect(summaryDepth(null)).toBe('applied')
    expect(summaryDepth('  ')).toBe('applied')
  })

  it('keeps a section light, so twelve headings are not twelve times the work', () => {
    expect(summaryDepth('Custody')).toBe('marked')
  })
})
