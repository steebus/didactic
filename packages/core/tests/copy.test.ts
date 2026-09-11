import { describe, it, expect } from 'vitest'
import { LABOURS, DRAWINGS, WRITINGS, READINGS, labourPhrase, editionDate } from '../src/copy'

/** How often the waiting label advances, from `useLabour`. Kept here so
 *  a list can be checked against the wait it has to cover. */
const TICK_SECONDS = 2.6

const LISTS = { LABOURS, DRAWINGS, WRITINGS, READINGS }

describe('the waiting lists', () => {
  it('ends each on a phrase that can stay true for a while', () => {
    // The last one holds until the work lands, so it cannot be a step:
    // a label that stops advancing says nearly there, and a label that
    // claims to be doing something for thirty seconds says stuck.
    for (const [name, list] of Object.entries(LISTS)) {
      expect(list.at(-1), name).toMatch(/almost/i)
    }
  })

  it('never repeats a phrase within a list', () => {
    for (const [name, list] of Object.entries(LISTS)) {
      expect(new Set(list).size, name).toBe(list.length)
    }
  })

  it('writes every phrase as a step still under way', () => {
    for (const [name, list] of Object.entries(LISTS)) {
      for (const phrase of list) expect(phrase, `${name}: ${phrase}`).toMatch(/…$/)
    }
  })

  it('carries a sowing all the way, rather than holding half way through', () => {
    // Sowing runs to the better part of a minute (`BUDGET_MS` is 54s).
    // Twelve phrases wrapped in thirty-one seconds and left the reader
    // watching "Almost done" for the second half, which reads as stuck.
    expect(LABOURS.length * TICK_SECONDS).toBeGreaterThanOrEqual(54)
  })

  it('keeps the shorter waits shorter, because less is happening', () => {
    // Drawing connections is one model call, and writing a lesson one
    // or two. A list that outran its work would be describing steps
    // that are not taking place.
    expect(DRAWINGS.length).toBeLessThan(LABOURS.length)
    expect(WRITINGS.length).toBeLessThan(LABOURS.length)
  })

  it('gives reading a document its own register', () => {
    // Handling a book, not turning soil. A wait that describes the
    // wrong thing reads as the wrong button.
    expect(READINGS.some(p => /contents|headings|pages|string/i.test(p))).toBe(true)
    for (const phrase of READINGS) expect(LABOURS).not.toContain(phrase)
  })
})

describe('labourPhrase', () => {
  it('walks the list', () => {
    expect(labourPhrase(0)).toBe(LABOURS[0])
    expect(labourPhrase(3)).toBe(LABOURS[3])
  })

  it('holds on the last rather than cycling', () => {
    // Coming round a second time is what says broken.
    expect(labourPhrase(LABOURS.length + 50)).toBe(LABOURS.at(-1))
  })

  it('never falls off the front', () => {
    expect(labourPhrase(-4)).toBe(LABOURS[0])
  })

  it('reads whichever list it is given', () => {
    expect(labourPhrase(0, READINGS)).toBe(READINGS[0])
    expect(labourPhrase(99, WRITINGS)).toBe(WRITINGS.at(-1))
  })
})

describe('editionDate', () => {
  it('prints the masthead format', () => {
    expect(editionDate('2026-09-11T00:00:00Z')).toBe('11 September 2026')
  })

  it('takes a Date as readily as a string', () => {
    expect(editionDate(new Date('2026-01-05T12:00:00Z'))).toBe('5 January 2026')
  })
})
