/**
 * Where a reader stopped, as words rather than as a position.
 *
 * A lesson is rewritten on demand and a resource's body is made again
 * when its importer changes, so a pixel offset or a character count
 * points somewhere else the next time either is read. The words at the
 * spot survive both -- the same reason a mark is kept as its quote and
 * the text before it rather than as an offset. So a place is the words
 * starting there, and a little of what came before them to tell two
 * identical runs apart; and, because a rewrite can take the words away
 * altogether, how far down the reading it was, as a fraction, to fall
 * back on.
 *
 * Everything here works on the reading's text flattened to one string
 * with its whitespace collapsed -- the web builds that from the page,
 * and the phone would build it from its own.
 */

/** How many characters of the reading a place holds, from the spot on. */
export const PLACE_WORDS = 60

/** How many characters before the spot it holds, to tell repeats apart. */
export const PLACE_PREFIX = 40

/** A place in a reading. */
export interface Place {
  /** The words starting at the spot. */
  words: string
  /** The words just before it; empty at the very start. */
  prefix: string
  /** How far down the reading it was, from 0 to 1. */
  at: number
}

/** The one bookmark a reader keeps in a lesson or a resource. */
export interface Bookmark extends Place {
  lesson_id: string | null
  resource_id: string | null
  updated_at: string
}

/**
 * The place at `index` in the flattened text.
 *
 * Moved back to the start of the word it lands in, so the place reads as
 * the start of something rather than the tail of a word, and the words
 * are cut at a space so a later rewrite that changes the next word does
 * not cost the whole match. `at` is the caller's -- it knows the height.
 */
export function placeAt(flat: string, index: number, at: number): Place {
  let from = Math.max(0, Math.min(index, flat.length))
  while (from > 0 && /\S/.test(flat[from - 1])) from--
  while (from < flat.length && flat[from] === ' ') from++

  let words = flat.slice(from, from + PLACE_WORDS)
  const cut = words.lastIndexOf(' ')
  if (from + PLACE_WORDS < flat.length && cut > PLACE_WORDS / 2) words = words.slice(0, cut)

  return {
    words: words.trim(),
    prefix: flat.slice(Math.max(0, from - PLACE_PREFIX), from),
    at: Math.min(1, Math.max(0, at)),
  }
}

/**
 * Where a place is in the flattened text, or -1.
 *
 * The prefix and the words together first, which is exact; the words
 * alone next, since the text before them may be what was rewritten; and
 * then the opening half of the words, which is what is left of a
 * sentence whose end was edited. Past that the words are gone, and the
 * caller falls back on `at`.
 */
export function findPlace(flat: string, place: Pick<Place, 'words' | 'prefix'>): number {
  const words = place.words.trim()
  if (!words) return -1

  if (place.prefix) {
    const anchored = flat.indexOf(place.prefix + words)
    if (anchored !== -1) return anchored + place.prefix.length
  }

  const alone = flat.indexOf(words)
  if (alone !== -1) return alone

  const half = words.slice(0, Math.ceil(words.length / 2)).trim()
  return half.length >= 12 ? flat.indexOf(half) : -1
}
