import { describe, it, expect } from 'vitest'
import { findPlace, placeAt, PLACE_WORDS } from '../src/bookmarks'

const text =
  'Caching happens at nearly every layer. Your browser remembers recent lookups, ' +
  'your operating system remembers them, and your resolver remembers them for everyone.'

describe('placeAt', () => {
  it('starts at the beginning of the word the spot lands in', () => {
    const place = placeAt(text, text.indexOf('rowser'), 0.5)
    expect(place.words.startsWith('browser remembers')).toBe(true)
    expect(place.prefix.endsWith('Your ')).toBe(true)
  })

  it('cuts the words at a space, and no longer than it keeps', () => {
    const place = placeAt(text, 0, 0)
    expect(place.words.length).toBeLessThanOrEqual(PLACE_WORDS)
    expect(text).toContain(place.words + ' ')
  })

  it('keeps how far down it was, held between 0 and 1', () => {
    expect(placeAt(text, 5, 1.4).at).toBe(1)
    expect(placeAt(text, 5, -2).at).toBe(0)
  })
})

describe('findPlace', () => {
  it('finds a place where it was left', () => {
    const index = text.indexOf('your operating')
    expect(findPlace(text, placeAt(text, index, 0.5))).toBe(index)
  })

  it('tells a repeated run of words apart by what came before it', () => {
    const repeated = 'one. remembers them for a while. two. remembers them for a while. three.'
    const second = repeated.lastIndexOf('remembers')
    expect(findPlace(repeated, placeAt(repeated, second, 0.5))).toBe(second)
  })

  it('still finds the words when the text before them was rewritten', () => {
    const place = placeAt(text, text.indexOf('your operating'), 0.5)
    const rewritten = text.replace('Your browser remembers recent lookups,', 'The browser keeps a few,')
    expect(findPlace(rewritten, place)).toBe(rewritten.indexOf('your operating'))
  })

  it('falls back on the opening of the words when their end was edited', () => {
    const place = placeAt(text, text.indexOf('your operating'), 0.5)
    const edited = text.replace('and your resolver remembers them for everyone.', 'and so on.')
    expect(findPlace(edited, place)).toBe(edited.indexOf('your operating'))
  })

  it('says so when the words are gone', () => {
    expect(findPlace('An entirely different lesson now.', placeAt(text, 40, 0.5))).toBe(-1)
  })
})
