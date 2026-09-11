import { NextResponse } from 'next/server'
import { ownerId } from '@/lib/auth'
import { normaliseBooks } from '@didactic/core/books'

const OPEN_LIBRARY = 'https://openlibrary.org/search.json'

/** Only the fields the form prints, plus the subjects the ingester
 *  reads. The full record is large and most of it is bibliographic. */
const FIELDS = 'key,title,author_name,first_publish_year,edition_count,subject'

/** Long enough for a cold cache, short enough that a typist does not
 *  wait on it: the manual field is right there. */
const TIMEOUT_MS = 6000

/**
 * Book lookup for the evidence field, through Open Library.
 *
 * Proxied rather than called from the browser so the request carries no
 * credentials, cannot be shaped by the page, and fails in one place. It
 * is a convenience over the manual field, never a requirement: every
 * failure here returns an empty set and lets the user type the title.
 */
export async function GET(req: Request) {
  if (!(await ownerId())) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  // Two characters match half the catalogue and are always a typist
  // mid-word.
  if (q.length < 3) return NextResponse.json({ books: [] })

  const url = `${OPEN_LIBRARY}?q=${encodeURIComponent(q)}&limit=20&fields=${FIELDS}`

  try {
    const res = await fetch(url, {
      headers: {
        // Open Library asks for a way to identify the caller.
        'user-agent': 'didactic/1.0 (personal learning map)',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      return NextResponse.json(
        { books: [], error: `Open Library answered ${res.status}.` },
        { status: 200 }
      )
    }
    return NextResponse.json({ books: normaliseBooks(await res.json()) })
  } catch {
    // A timeout or a network failure is not an error the user needs to
    // act on: the field they are typing in still works.
    return NextResponse.json({ books: [], error: 'Could not reach Open Library.' })
  }
}
