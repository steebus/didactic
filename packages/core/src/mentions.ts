/**
 * Naming a topic or a lesson inside a note.
 *
 * A mark belongs to the lesson it was taken from and the topic that
 * lesson teaches. That is provenance, not aboutness: the thought a
 * passage leaves you with is very often about something a topic away,
 * and a note saying so was a sentence nothing could follow and nothing
 * could draw.
 *
 * So `@` in a note opens the map. What is chosen is written into the
 * note as an ordinary markdown link to the thing's own address --
 * `[@Settlement](/topics/<id>)` -- which is the whole trick: it needs
 * no new scheme, nothing added to the sanitiser's allowlist, and it
 * survives the round trip through the editor's serialiser, because an
 * anchor is the one inline element that already does. It reads as a
 * tag because of the `@` the reader can see, and it is a link because
 * that is what it is.
 *
 * Nothing here touches the DOM. Finding the `@` under a cursor and
 * reading the tags back out of a note are both string work, which is
 * what lets the awkward parts -- an email address, an id that is not
 * one, the same topic named twice -- be written down as tests.
 */

export type TagKind = 'topic' | 'lesson'

export interface Tag {
  kind: TagKind
  id: string
}

/** A name being typed: what has been typed, and where it sits. */
export interface Mention {
  /** What follows the `@`, which may be empty and may hold spaces. */
  query: string
  /** Where the `@` is, and where the cursor is. */
  from: number
  to: number
}

/**
 * How far past the `@` a name is still being typed.
 *
 * A title can be several words, so a space cannot end the name -- and
 * without some ceiling an `@` typed once leaves the menu open over the
 * rest of the paragraph.
 */
export const MENTION_CEILING = 48

/** What an `@` may follow and still be starting a name. */
const OPENS = /[\s([{"'‘“—-]/

/**
 * The name being typed at the cursor, if one is.
 *
 * Deliberately not anchored to a word character after the `@`: a bare
 * `@` is the moment the menu should open, before there is anything to
 * filter by.
 */
export function mentionAt(text: string, caret: number): Mention | null {
  if (caret < 0 || caret > text.length) return null

  const upto = text.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at === -1) return null

  // An address, a handle, a decorator: an `@` with a word against its
  // left side is part of that word and not the start of a name.
  if (at > 0 && !OPENS.test(upto[at - 1])) return null

  const query = upto.slice(at + 1)
  if (query.length > MENTION_CEILING) return null
  // A name is typed on one line. Past a break the reader has moved on.
  if (/[\n\r]/.test(query)) return null

  return { query, from: at, to: caret }
}

/** Where a tag of each kind points. The thing's own address, so the
 *  tag is a link anyone can follow and nothing has to resolve it. */
export function tagHref(kind: TagKind, id: string): string {
  return kind === 'topic' ? `/topics/${id}` : `/lesson/${id}`
}

/** A tag as it is written into the note. */
export function tagMarkdown(kind: TagKind, id: string, title: string): string {
  // A title carrying brackets would end the link early, and what the
  // reader picked from a menu is not markup.
  return `[@${title.replace(/[[\]]/g, '')}](${tagHref(kind, id)})`
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const TAG_HREF = new RegExp(`^/(topics|lesson)/(${UUID})$`)

/** The thing an href names, where it names one. */
export function readTagHref(href: string): Tag | null {
  const found = TAG_HREF.exec(href.trim())
  if (!found) return null
  return { kind: found[1] === 'topics' ? 'topic' : 'lesson', id: found[2].toLowerCase() }
}

const LINK = new RegExp(`\\]\\(\\s*(/(?:topics|lesson)/${UUID})\\s*\\)`, 'g')

/**
 * Everything a note names, in the order it names them.
 *
 * The note is the record and this is how the index is rebuilt from it,
 * so the two cannot drift: there is one reading, run by the one route
 * that writes notes. Naming the same thing twice in a note is one tag.
 */
export function tagsIn(markdown: string): Tag[] {
  const seen = new Set<string>()
  const tags: Tag[] = []

  for (const [, href] of markdown.matchAll(LINK)) {
    const tag = readTagHref(href)
    if (!tag) continue
    const key = `${tag.kind}:${tag.id}`
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }

  return tags
}
