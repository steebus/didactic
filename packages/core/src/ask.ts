/**
 * What the ask agent is told about where the reader is.
 *
 * The value of asking from inside the app is the context nobody has to
 * type: which lesson, which section, which passage. This is that
 * context, and it is shared rather than web-only because the phone will
 * send the same thing.
 *
 * It is a record of a moment, not a live view. The copy stored on the
 * conversation is what was true when the question was asked, for the
 * same reason `highlights.quote` is kept verbatim: a section rewritten
 * afterwards does not make the record wrong.
 */

import { headingLines } from './sections'

export type AskRoute = 'lesson' | 'topic' | 'subject' | 'cards' | 'other'

const ROUTES: AskRoute[] = ['lesson', 'topic', 'subject', 'cards', 'other']

/** The fields that are optional strings, listed once so the guard and
 *  any future writer cannot drift apart. */
const OPTIONAL = ['entityId', 'title', 'sectionId', 'sectionText', 'quote', 'prefix'] as const

export interface AskContext {
  route: AskRoute
  /** The lesson, topic or subject on screen. Absent on `other`. */
  entityId?: string
  /** What it is called, so the preamble can say it. */
  title?: string
  /** The heading slug nearest the top of the viewport, from
   *  `lessonSections`. The fold inserts after this one. */
  sectionId?: string
  /** That section's prose. Sent so the common question needs no tool
   *  call; `read_lesson` fetches the rest when the talk widens. */
  sectionText?: string
  /** Set when the panel was opened from a selection. */
  quote?: string
  prefix?: string
}

/** A topic the agent offers. Nothing is created until it is accepted. */
export interface Proposal {
  kind: 'topic'
  name: string
  summary: string
}

/** Something the agent kept by itself -- a mark or a card -- recorded on
 *  the message that did it, so the panel can print what happened and
 *  offer the way back. */
export interface AgentWrite {
  kind: 'mark' | 'card'
  id: string
  /** What to print against the undo: the quote, or the question. */
  label: string
}

/**
 * Whether a value is a context we can act on.
 *
 * Checked at the route rather than trusted, because this arrives as JSON
 * from a client and is then stored and read back. A bad route would make
 * the preamble state something false about where the reader is, which is
 * the one thing this object exists to get right.
 */
export function isAskContext(value: unknown): value is AskContext {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (typeof c.route !== 'string') return false
  if (!ROUTES.includes(c.route as AskRoute)) return false
  for (const key of OPTIONAL) {
    if (c[key] !== undefined && typeof c[key] !== 'string') return false
  }
  return true
}

/**
 * The context as a line the model reads.
 *
 * Deliberately short. The section's prose is sent as its own message by
 * the caller; this is only the bearings.
 */
export function contextPreamble(c: AskContext): string {
  const where =
    c.route === 'other'
      ? 'somewhere in the app'
      : c.title
        ? `the ${c.route} "${c.title}"`
        : `a ${c.route}`

  const parts = [`The reader is looking at ${where}.`]
  if (c.sectionId) parts.push(`They are at the section "${c.sectionId}".`)
  if (c.quote) parts.push(`They selected this passage: "${c.quote}"`)
  return parts.join(' ')
}

/**
 * Put a folded discussion into a lesson body.
 *
 * It goes after the section the conversation was had at, which is the
 * nearest thing to where the reader was standing. Everything about this
 * function is arranged so that the lesson survives being wrong: an
 * unknown section, a body whose headings have all been rewritten, or no
 * heading at all appends rather than guesses, because a fold landing in
 * an odd place is a paragraph to move and a fold landing nowhere is the
 * conversation lost.
 *
 * Pure, and here rather than in the route, so the placement can be
 * tested without a model and the phone folds identically.
 */
export function foldInto(body: string, sectionId: string | undefined, section: string): string {
  const append = () => `${body.trimEnd()}\n\n${section.trim()}\n`
  if (!sectionId) return append()

  // One reading of what a heading is, shared with the contents rail.
  // The fold used to find its own headings with a plain line regex that
  // had no idea what a code fence was: a lesson with a ```sh block whose
  // comment happened to slug to the next heading's id took the folded
  // section *inside* the fence and broke every line after it. A second
  // opinion about what a heading is was the whole of that bug.
  const headings = headingLines(body)
  const index = headings.findIndex(h => h.id === sectionId)
  if (index === -1) return append()

  // The section ends where the next heading of the same level or
  // shallower begins; a deeper one is still part of it.
  const here = headings[index]
  const next = headings.slice(index + 1).find(h => h.level <= here.level)
  if (!next) return append()

  const lines = body.split('\n')
  const before = lines.slice(0, next.line).join('\n').trimEnd()
  const after = lines.slice(next.line).join('\n')
  return `${before}\n\n${section.trim()}\n\n${after}`
}

/**
 * How a list of conversations is arranged.
 *
 * Two questions get asked of a pile of old chats, and they want
 * different shapes. "What was I doing last week" wants them in the order
 * they happened. "Where is that conversation about compounding" wants
 * them gathered by what they were about. So the sort is a toggle rather
 * than a decision made here.
 */
export type ChatOrder = 'date' | 'subject'

/** A chat, as far as arranging them needs to know. */
export interface ChatLike {
  id: string
  startedAt: string
  context: { route: AskRoute; title?: string }
}

/** A run of chats printed under one heading. */
export interface ChatGroup<T> {
  /** What the heading says. */
  title: string
  /** Stable enough to key on and to remember which sections are shut. */
  key: string
  chats: T[]
}

/** The day a chat was had, as a heading: "Today", "Yesterday", or a date. */
function dayOf(iso: string, now: Date): string {
  const when = new Date(iso)
  const days = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(when.getFullYear(), when.getMonth(), when.getDate())) /
      86_400_000
  )
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'This week'
  if (days < 30) return 'This month'
  return when.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/**
 * Gather chats under headings.
 *
 * By date, the headings are the plain ones a person uses out loud --
 * today, yesterday, this week -- rather than a date on every row, which
 * is a wall of numbers to scan. By subject, the heading is whatever the
 * conversation was about, and everything asked from nowhere in
 * particular falls to the end under one heading rather than being
 * scattered as a dozen groups of one.
 *
 * Pure, and here rather than in the page, so the phone groups the same
 * list the same way and the arrangement can be tested without a screen.
 */
export function groupChats<T extends ChatLike>(
  chats: T[],
  order: ChatOrder,
  now: Date = new Date()
): Array<ChatGroup<T>> {
  const groups = new Map<string, ChatGroup<T>>()

  for (const chat of chats) {
    const title =
      order === 'date'
        ? dayOf(chat.startedAt, now)
        : (chat.context.title ?? 'Asked from elsewhere')

    const held = groups.get(title)
    if (held) held.chats.push(chat)
    else groups.set(title, { title, key: title.toLowerCase().replace(/\s+/g, '-'), chats: [chat] })
  }

  const out = [...groups.values()]

  // By date the map is already in order, because the rows arrive newest
  // first. By subject the headings are alphabetical, except the one that
  // means "no subject", which goes last wherever its name would sort.
  if (order === 'subject') {
    out.sort((a, b) => {
      if (a.title === 'Asked from elsewhere') return 1
      if (b.title === 'Asked from elsewhere') return -1
      return a.title.localeCompare(b.title)
    })
  }

  return out
}
