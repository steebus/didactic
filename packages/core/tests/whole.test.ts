import { describe, it, expect } from 'vitest'
import {
  asFiling,
  conceptsToFile,
  filingLine,
  refileAs,
  refiledSentence,
  refileLabel,
  REFILE_READ,
  WHOLE_CHOICE,
} from '../src/whole'

const parts = [
  { name: 'Hash Functions', description: null, relevance: 0.6 },
  { name: 'Bloom Filters', description: 'A probabilistic set.', relevance: 0.95 },
  { name: 'Set Membership Testing', description: null, relevance: 0.7 },
]
const bloom = { name: 'Bloom Filters', description: 'A probabilistic set.', relevance: 0.9 }

describe('conceptsToFile', () => {
  it('files a piece read as about one thing under that one thing, at full relevance', () => {
    expect(conceptsToFile(parts, bloom, null)).toEqual([{ ...bloom, relevance: 1 }])
  })

  it('files every concept where the reading found no one thing', () => {
    expect(conceptsToFile(parts, null, null)).toEqual(parts)
  })

  it('files by the parts when the reader said so, whatever the reading thought', () => {
    expect(conceptsToFile(parts, bloom, 'parts')).toEqual(parts)
  })

  it('stands the most central concept in when the reader said one thing and the reading named none', () => {
    expect(conceptsToFile(parts, null, 'whole')).toEqual([{ ...parts[1], relevance: 1 }])
  })

  it('has nothing to file where nothing was read', () => {
    expect(conceptsToFile([], null, 'whole')).toEqual([])
  })
})

describe('asFiling', () => {
  it('reads the two answers and treats anything else, or a missing column, as none', () => {
    expect(asFiling('whole')).toBe('whole')
    expect(asFiling('parts')).toBe('parts')
    expect(asFiling(undefined)).toBeNull()
    expect(asFiling('both')).toBeNull()
  })
})

describe('the resource sheet’s lines', () => {
  it('says how it is filed, and nothing when it is filed under nothing', () => {
    expect(filingLine(0)).toBeNull()
    expect(filingLine(1)).toBe('Filed as one topic.')
    expect(filingLine(5)).toMatch(/^Filed under 5 topics/)
  })

  it('offers the other way', () => {
    expect([refileLabel(1), refileAs(1)]).toEqual(['File it by its parts', 'parts'])
    expect([refileLabel(4), refileAs(4)]).toEqual(['File it as one topic', 'whole'])
  })

  it('says it is read again, and what went with the old filing', () => {
    expect(refiledSentence('whole', 0)).toBe('Reading it again as one topic; it will be filed in a minute or so.')
    expect(refiledSentence('parts', 1)).toMatch(/One topic that only it had brought in.*has gone\.$/)
    expect(refiledSentence('whole', 3)).toMatch(/3 topics .* have gone\.$/)
  })

  it('says why a read resource stays as it is, and what the add form offers', () => {
    expect(REFILE_READ).toMatch(/read into the record/)
    expect(WHOLE_CHOICE).toMatch(/one topic/)
  })
})
