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

export type AskRoute = 'lesson' | 'resource' | 'topic' | 'subject' | 'cards' | 'other'

const ROUTES: AskRoute[] = ['lesson', 'resource', 'topic', 'subject', 'cards', 'other']

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
 * A conversation opened from a chosen passage goes by the passage
 * instead, because that is the sentence the question was about. A short
 * fold -- a callout, a paragraph -- is set straight after the paragraph
 * holding it. One that opens with a heading is a deep dive, and closes
 * the passage's section rather than landing mid-way through it, where it
 * would take the rest of that section in under itself. A passage the
 * body no longer holds falls back to the section.
 *
 * Pure, and here rather than in the route, so the placement can be
 * tested without a model and the phone folds identically.
 */
export function foldInto(
  body: string,
  sectionId: string | undefined,
  section: string,
  quote?: string
): string {
  const append = () => `${body.trimEnd()}\n\n${section.trim()}\n`

  // One reading of what a heading is, shared with the contents rail.
  // The fold used to find its own headings with a plain line regex that
  // had no idea what a code fence was: a lesson with a ```sh block whose
  // comment happened to slug to the next heading's id took the folded
  // section *inside* the fence and broke every line after it. A second
  // opinion about what a heading is was the whole of that bug.
  const headings = headingLines(body)

  // The section ends where the next heading of the same level or
  // shallower begins; a deeper one is still part of it.
  const closing = (here: { line: number; level: number }) => {
    const next = headings.find(h => h.line > here.line && h.level <= here.level)
    if (!next) return append()
    const lines = body.split('\n')
    const before = lines.slice(0, next.line).join('\n').trimEnd()
    const after = lines.slice(next.line).join('\n')
    return `${before}\n\n${section.trim()}\n\n${after}`
  }

  const passage = quote ? findPassage(body, quote) : null
  if (passage) {
    if (/^#{1,6}\s/.test(section.trim())) {
      const line = body.slice(0, passage.start).split('\n').length - 1
      const here = headings.filter(h => h.line <= line).pop()
      return here ? closing(here) : append()
    }
    const at = passage.blockEnd
    return `${body.slice(0, at).trimEnd()}\n\n${section.trim()}\n\n${body.slice(at).trimStart()}`
  }

  if (!sectionId) return append()
  const here = headings.find(h => h.id === sectionId)
  return here ? closing(here) : append()
}

/**
 * Where a passage starts, and where the block holding it ends; null if
 * the body does not hold it.
 *
 * The passage is what the page printed, so the markdown under it may
 * carry emphasis or a line break the selection does not; those are
 * allowed between its characters. A passage inside a fence ends its
 * block after the fence, never in it -- the bug `headingLines` exists
 * to prevent.
 */
function findPassage(body: string, quote: string): { start: number; blockEnd: number } | null {
  const words = quote.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const mark = '[*_`~]*'
  const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = words.map(w => [...w].map(escape).join(mark)).join(`${mark}\\s+${mark}`)
  const found = new RegExp(pattern).exec(body)
  if (!found) return null

  const end = found.index + found[0].length
  const lines = body.split('\n')
  let offset = 0
  let fenced = false
  for (const line of lines) {
    const next = offset + line.length + 1
    if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced
    // The first blank line past the passage, outside a fence, is where
    // its block ends.
    if (offset >= end && !fenced && !line.trim()) return { start: found.index, blockEnd: offset }
    offset = next
  }
  return { start: found.index, blockEnd: body.length }
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

/** Where a conversation was begun, as a sheet heading it names it. */
export interface AskOrigin {
  kind: 'lesson' | 'resource' | 'topic' | 'subject' | 'cards'
  /** Absent for the cards, which are one place rather than one thing. */
  id?: string
  /** What it was called then. Falls back to the kind itself. */
  title: string
  /** The section of a lesson the reader was at. */
  sectionId?: string
}

/**
 * The page a conversation was begun from, or null when it was begun
 * from nowhere in particular.
 *
 * The context records it; the conversation row's own `lesson_id` and
 * `topic_id` stand in for an id the context lost. A lesson, topic or
 * subject with no id at all cannot be linked to and is not offered.
 */
export function askOrigin(
  c: AskContext,
  row: { lessonId?: string | null; topicId?: string | null } = {}
): AskOrigin | null {
  if (c.route === 'other') return null
  if (c.route === 'cards') return { kind: 'cards', title: c.title?.trim() || 'Your cards' }

  const id =
    c.entityId ||
    (c.route === 'lesson' ? row.lessonId : c.route === 'topic' ? row.topicId : null) ||
    undefined
  if (!id) return null

  return {
    kind: c.route,
    id,
    title: c.title?.trim() || `A ${c.route}`,
    ...(c.route === 'lesson' && c.sectionId ? { sectionId: c.sectionId } : {}),
  }
}

/* ------------------------------------------------ conversations kept */

/** A conversation as a list prints it. */
export interface ChatSummary {
  id: string
  startedAt: string
  /** What it was about, as the context recorded it. */
  context: AskContext
  /** The reader's first question, which is what names a conversation
   *  better than any title we could write for it. */
  opening: string
  /** How many turns were taken, the reader's and the agent's together. */
  said: number
  /** What it left behind: marks and cards kept, topics offered. */
  kept: { marks: number; cards: number; topics: number }
  /** Whether it has been written into its lesson. */
  folded: boolean
  /** The lesson or topic it hangs off, where there is one. */
  lessonId: string | null
  topicId: string | null
}

/** One message, as the reader of a single conversation prints it. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

/** One conversation, read back: what was said, and where it began. */
export interface Chat {
  messages: ChatMessage[]
  /** The lesson, topic or subject it was asked from, where there is one. */
  origin: AskOrigin | null
  /** Where it was asked, as it stood then -- the chosen passage with it. */
  context: AskContext
  /** Whether it has been written into its lesson. */
  folded: boolean
}

/**
 * The line under a conversation in a list of them: how long, what it
 * left, and whether it went into the lesson. Here so the phone's list
 * says the same thing about the same conversation.
 */
export function chatLine(chat: Pick<ChatSummary, 'said' | 'kept' | 'folded'>): string {
  const turns = Math.ceil(chat.said / 2)
  const parts = [`${turns} ${turns === 1 ? 'question' : 'questions'}`]
  const { marks, cards, topics } = chat.kept
  if (marks) parts.push(`${marks} ${marks === 1 ? 'mark' : 'marks'}`)
  if (cards) parts.push(`${cards} ${cards === 1 ? 'card' : 'cards'}`)
  if (topics) parts.push(`${topics} ${topics === 1 ? 'topic' : 'topics'} offered`)
  if (chat.folded) parts.push('in the lesson')
  return parts.join(' · ')
}

/**
 * What accepting a proposed topic came to. It is read against the map
 * first, as a concept from a resource is, so a proposal the reading takes
 * to be a topic already there opens that one instead of writing a second,
 * and one it is unsure of joins the queue rather than the map.
 */
export type Accepted =
  | { outcome: 'existing'; topicId: string; title: string }
  | { outcome: 'queued'; topicId: string }
  | { outcome: 'added'; topicId: string; filed: number }

/** What the proposal card says once it has been accepted. */
export function acceptedSentence(accepted: Accepted): string {
  switch (accepted.outcome) {
    case 'existing':
      return `Already on the map as ${accepted.title}.`
    case 'queued':
      return 'Close to a topic already on the map, so it is waiting in the inbox for your call.'
    case 'added':
      return accepted.filed > 0
        ? `Added to the map, and filed under ${accepted.filed === 1 ? 'the subject' : `${accepted.filed} subjects`} it reads as belonging to.`
        : 'Added to the map, filed under nothing yet.'
  }
}

/**
 * Where a turn has got to, as the panel's one working line says it.
 *
 * A turn is a minute of model calls and tool calls, and "Thinking…" for
 * the whole of it says nothing about whether anything is happening. The
 * route streams one of these as each step starts and the line is
 * rewritten in place -- never a log, because what the reader wants is
 * where it is now, not where it has been.
 *
 * A tool is named by what it does for the reader, not by its name in
 * the prompt: *Reading the map* rather than `search_map`.
 */
export type AskStage =
  | 'thinking'
  | 'reconsidering'
  | 'reading-lesson'
  | 'reading-map'
  | 'finding-pictures'
  | 'drawing'
  | 'keeping-mark'
  | 'making-card'
  | 'offering-topic'
  | 'checking-pictures'

const STAGE_LINES: Record<AskStage, string> = {
  thinking: 'Thinking…',
  reconsidering: 'Thinking it over…',
  'reading-lesson': 'Reading the lesson…',
  'reading-map': 'Reading the map…',
  'finding-pictures': 'Looking for a picture…',
  drawing: 'Drawing…',
  'keeping-mark': 'Keeping a mark…',
  'making-card': 'Making a card…',
  'offering-topic': 'Offering a topic…',
  'checking-pictures': 'Checking the pictures…',
}

/** The stage a tool call is, or null for a tool this does not know. */
export function toolStage(tool: string): AskStage | null {
  switch (tool) {
    case 'read_lesson':
      return 'reading-lesson'
    case 'search_map':
      return 'reading-map'
    case 'find_pictures':
      return 'finding-pictures'
    case 'draw_picture':
      return 'drawing'
    case 'add_mark':
      return 'keeping-mark'
    case 'add_card':
      return 'making-card'
    case 'propose_topic':
      return 'offering-topic'
    default:
      return null
  }
}

/** Whether a value off the wire is a stage this build knows. A newer
 *  server may name one an older client has never heard of. */
export function isAskStage(value: unknown): value is AskStage {
  return typeof value === 'string' && value in STAGE_LINES
}

/** The working line for a stage. Anything unknown reads as thinking. */
export function stageLine(stage: AskStage | null | undefined): string {
  return (stage && STAGE_LINES[stage]) || STAGE_LINES.thinking
}
