import { describe, it, expect } from 'vitest'
import { normaliseBooks, bookNote } from '@/lib/books'

const doc = (over: Record<string, unknown> = {}) => ({
  key: '/works/OL1W',
  title: 'Refactoring',
  author_name: ['Martin Fowler'],
  first_publish_year: 1999,
  edition_count: 3,
  subject: ['Software refactoring'],
  ...over,
})

describe('normaliseBooks', () => {
  it('turns a search response into rows the form can print', () => {
    const [book] = normaliseBooks({ docs: [doc()] })
    expect(book.title).toBe('Refactoring')
    expect(book.authors).toEqual(['Martin Fowler'])
    expect(book.year).toBe(1999)
    expect(book.label).toBe('Refactoring — Martin Fowler')
  })

  it('folds duplicate works together, keeping the fullest record', () => {
    // Open Library returns a work per edition cluster, so a well-known
    // book comes back several times under the same title and author.
    const books = normaliseBooks({
      docs: [
        doc({ key: '/works/OL1W', edition_count: 2 }),
        doc({ key: '/works/OL2W', edition_count: 40 }),
        doc({ key: '/works/OL3W', edition_count: 7 }),
      ],
    })
    expect(books).toHaveLength(1)
    expect(books[0].key).toBe('/works/OL2W')
  })

  it('keeps different books by the same author apart', () => {
    const books = normaliseBooks({
      docs: [doc(), doc({ key: '/works/OL9W', title: 'Patterns of Enterprise Application Architecture' })],
    })
    expect(books).toHaveLength(2)
  })

  it('drops anything with no title or no key to file it by', () => {
    const books = normaliseBooks({
      docs: [doc(), doc({ key: '/works/OL4W', title: '' }), { author_name: ['Nobody'] }],
    })
    expect(books.map(b => b.title)).toEqual(['Refactoring'])
  })

  it('survives a book with no author, year or subjects', () => {
    const [book] = normaliseBooks({
      docs: [{ key: '/works/OL5W', title: 'Anonymous' }],
    })
    expect(book.authors).toEqual([])
    expect(book.year).toBeNull()
    expect(book.subjects).toEqual([])
    expect(book.label).toBe('Anonymous')
  })

  it('caps the subject list, which runs to dozens on a popular book', () => {
    const [book] = normaliseBooks({
      docs: [doc({ subject: Array.from({ length: 60 }, (_, i) => `subject ${i}`) })],
    })
    expect(book.subjects).toHaveLength(12)
  })

  it('returns nothing rather than throwing on a response of the wrong shape', () => {
    expect(normaliseBooks(null)).toEqual([])
    expect(normaliseBooks({})).toEqual([])
    expect(normaliseBooks({ docs: 'nope' })).toEqual([])
  })

  it('honours the limit', () => {
    const docs = Array.from({ length: 20 }, (_, i) => doc({ key: `/works/OL${i}W`, title: `Book ${i}` }))
    expect(normaliseBooks({ docs }, 5)).toHaveLength(5)
  })
})

describe('bookNote', () => {
  it('writes what the app can honestly record about a book it does not hold', () => {
    const [book] = normaliseBooks({ docs: [doc()] })
    const note = bookNote(book)
    expect(note).toContain('Refactoring, by Martin Fowler')
    expect(note).toContain('1999')
    expect(note).toContain('Software refactoring')
  })

  it('leaves out what it does not know rather than printing gaps', () => {
    const [book] = normaliseBooks({ docs: [{ key: '/works/OL6W', title: 'Anonymous' }] })
    expect(bookNote(book)).toBe('Anonymous')
  })
})
