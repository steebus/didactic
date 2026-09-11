/**
 * A lesson pointing at the document it was written from.
 *
 * The same argument as `lessonLinks`, for the same reason: a body is
 * written once and cached on the row, and everything around it keeps
 * moving. A document can be removed from the library, or merged into
 * another copy of itself, long after a lesson quoted it. So the prose
 * carries a name, not a URL, and the name is resolved when the lesson
 * is read. A name that resolves is a citation. A name that does not is
 * still printed -- the sentence still needs the words -- and marked as
 * pointing at something no longer on the shelf.
 *
 * The page rides in the fragment rather than in an attribute, which is
 * not cosmetic: the sanitiser allows `href` and `title` and nothing
 * else, so a `data-page` would be stripped on the way out and every
 * citation would lose the one thing that makes it checkable.
 *
 *     [the classic statement of it](source:rules-of-play#p112)
 *
 * Nothing here touches the DOM or the database.
 */

import { slugFor } from './sections'

/** A document a lesson can cite. */
export interface SourceLink {
  id: string
  title: string
  /** How many pages it has, where known. A citation past the end is a
   *  citation the model invented, and is caught rather than printed. */
  pageCount?: number | null
}

/** Where a citation goes, once it is resolved. */
export interface SourceTarget {
  href: string
  /** What it says on hover: the document, and the page. */
  label: string
  page: number | null
}

/**
 * How a document is named in prose: `source:` and the slug of its
 * title, with the page after a hash.
 *
 * The page is optional because not everything worth citing has one --
 * a document whose text layer gave no page breaks, or a citation of
 * the work as a whole rather than of a passage in it.
 */
export const SOURCE_SCHEME = /^source:([a-z0-9][a-z0-9-]*)(?:#p(\d+))?$/i

/** The name a document is reached by. Slugged the same way a heading
 *  and a lesson are, so the model can write it from the title it was
 *  shown and two readings always agree. */
export function sourceSlug(title: string): string {
  return slugFor(title)
}

/**
 * Name every document within reach.
 *
 * Two documents of one name is ordinary -- the same handbook filed
 * twice, a second edition beside a first -- and the first given wins,
 * because the caller orders what it hands over and the nearest is the
 * one it puts first.
 */
export function sourceRoster(sources: SourceLink[]): Map<string, SourceLink> {
  const roster = new Map<string, SourceLink>()
  for (const source of sources) {
    const slug = sourceSlug(source.title)
    if (!roster.has(slug)) roster.set(slug, source)
  }
  return roster
}

/**
 * Where `source:<name>#p<page>` goes, or null when nothing answers.
 *
 * A page beyond the end of the document is refused rather than linked.
 * The model is given the passages it may cite and told to cite only
 * from them, but "told to" is not "cannot", and a citation pointing at
 * page 900 of a 300-page book is worse than no citation at all: it
 * reads as a source and is not one. Printed as a stub, it reads as
 * what it is.
 */
export function resolveSource(
  roster: Map<string, SourceLink>,
  slug: string,
  page: number | null
): SourceTarget | null {
  const found = roster.get(slug.toLowerCase())
  if (!found) return null

  if (page !== null && (page < 1 || (found.pageCount != null && page > found.pageCount))) {
    return null
  }

  return {
    href: page === null ? `/source/${found.id}` : `/source/${found.id}?page=${page}`,
    label: page === null ? found.title : `${found.title}, page ${page}`,
    page,
  }
}

/** What a citation nothing answers to says on hover. */
export const CITATION_STUB = 'This source is no longer on the shelf'

/**
 * Every citation a body makes, as written.
 *
 * Used to check a freshly written lesson against what it was actually
 * shown. A model given six passages and asked to cite them will
 * usually do exactly that, and will occasionally cite a seventh that
 * sounded right -- so the lesson is read back and any citation naming
 * a page nobody handed it is reported rather than trusted.
 */
export function citationsIn(markdown: string): Array<{ slug: string; page: number | null }> {
  const found: Array<{ slug: string; page: number | null }> = []
  const links = markdown.matchAll(/\]\(\s*(source:[^\s)]+)\s*\)/gi)

  for (const [, href] of links) {
    const match = SOURCE_SCHEME.exec(href)
    if (match) found.push({ slug: match[1].toLowerCase(), page: match[2] ? Number(match[2]) : null })
  }

  return found
}
