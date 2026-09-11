import { describe, it, expect } from 'vitest'
import {
  MAX_DOCUMENT_BYTES,
  MAX_PROXIED_BYTES,
  tooLarge,
  isPdf,
  documentPath,
  ownsPath,
  titleFromFilename,
  FIDELITIES,
  FIDELITY_RUNGS,
  DEFAULT_FIDELITY,
  rungFor,
  isFidelity,
} from '../src/documents'

const USER = '11111111-2222-3333-4444-555555555555'
const DOC = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('the ceilings', () => {
  it('lets a textbook through, which the proxied route never could', () => {
    expect(MAX_DOCUMENT_BYTES).toBeGreaterThan(MAX_PROXIED_BYTES)
  })

  it('keeps the proxied ceiling under what the platform will carry', () => {
    expect(MAX_PROXIED_BYTES).toBeLessThanOrEqual(4.5 * 1024 * 1024)
  })

  it('says how big the file was and how big it may be', () => {
    expect(tooLarge(60 * 1024 * 1024)).toBe('That file is 60 MB, and the ceiling is 50 MB.')
  })
})

describe('isPdf', () => {
  it('takes a PDF by type or by name', () => {
    expect(isPdf('handbook.pdf', 'application/pdf')).toBe(true)
    expect(isPdf('handbook.pdf', '')).toBe(true)
    expect(isPdf('HANDBOOK.PDF', null)).toBe(true)
    expect(isPdf('no-extension', 'application/pdf')).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isPdf('scan.png', 'image/png')).toBe(false)
    expect(isPdf('notes.txt', 'text/plain')).toBe(false)
  })
})

describe('the path in the bucket', () => {
  it('carries the owner', () => {
    expect(documentPath(USER, DOC)).toBe(`documents/${USER}/${DOC}.pdf`)
  })

  it('recognises its own paths', () => {
    expect(ownsPath(documentPath(USER, DOC), USER)).toBe(true)
  })

  it('refuses a path belonging to somebody else', () => {
    const other = '99999999-8888-7777-6666-555555555555'
    expect(ownsPath(documentPath(other, DOC), USER)).toBe(false)
  })

  it('refuses a path that is not one of ours', () => {
    expect(ownsPath('evidence/whatever.pdf', USER)).toBe(false)
    expect(ownsPath(`documents/${USER}/../../etc/passwd`, USER)).toBe(false)
    expect(ownsPath(`documents/${USER}/${DOC}.pdf.exe`, USER)).toBe(false)
  })
})

describe('titleFromFilename', () => {
  it('drops the extension and tidies the separators', () => {
    expect(titleFromFilename('rules_of_play.pdf')).toBe('rules of play')
    expect(titleFromFilename('Course-Handbook.PDF')).toBe('Course Handbook')
  })

  it('always gives something back', () => {
    expect(titleFromFilename('.pdf')).toBe('Uploaded document')
  })
})

describe('the fidelity rungs', () => {
  it('has a rung for every value, in closest-following order', () => {
    expect(FIDELITY_RUNGS.map(r => r.value)).toEqual([...FIDELITIES])
    expect(FIDELITY_RUNGS[0].value).toBe('verbatim')
  })

  it('gives every rung a label and a line about what it does', () => {
    for (const rung of FIDELITY_RUNGS) {
      expect(rung.label.length).toBeGreaterThan(0)
      expect(rung.hint.length).toBeGreaterThan(0)
    }
  })

  it('says on the sheet that verbatim still matches names to the map', () => {
    // The one caveat a reader has to be told before they pick it,
    // rather than discover afterwards and report as a bug.
    expect(rungFor('verbatim').hint).toMatch(/name|map|filed/i)
  })

  it('defaults to following rather than reproducing', () => {
    expect(DEFAULT_FIDELITY).toBe('follow')
  })

  it('recognises a rung off the wire and refuses anything else', () => {
    expect(isFidelity('verbatim')).toBe(true)
    expect(isFidelity('whatever')).toBe(false)
    expect(isFidelity(null)).toBe(false)
    expect(isFidelity(3)).toBe(false)
  })

  it('falls back to the middle rung rather than throwing', () => {
    expect(rungFor('nonsense' as never).value).toBe('follow')
  })
})
