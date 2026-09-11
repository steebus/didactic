/**
 * What the API answers with.
 *
 * These are the shapes the route handlers return and both front ends
 * print. They lived in `apps/web/src/lib` beside the queries that build
 * them, which was the right place while the web was the only reader. It
 * stops being the right place once `@didactic/api` has to name a return
 * type: a package cannot import an app.
 *
 * The queries stay where they are — they need a Supabase client and the
 * cache, and neither belongs here. Only the shape moves, and each
 * `src/lib` module re-exports its own from here so no call site changed.
 */

import type {
  Curriculum,
  Highlight,
  Resource,
  Subject,
  Topic,
} from './types'
import type { SubjectTopicRow, TopicTreeNode } from './subject'

/* ---------------------------------------------------------------- home */

export interface SubjectCell {
  id: string
  title: string
  colour: string
  count: number
  queuedCount: number
  ability: number
  freshness: number
  /** Mean confidence across members. Drives how vaguely the sheet
   *  prints the viability figure — see PRODUCT.md principle 4. */
  confidence: number
  /** Most recent exposure across members, or null when no member has
   *  ever been tended. Null is what makes the 'unsown' state
   *  reachable for a populated subject. */
  lastExposureAt: string | null
}

export interface TopicSummary {
  id: string
  title: string
  ability: number
  confidence: number
  freshness: number
  primary_subject_id: string | null
}

/** An active curriculum with work left, and where to pick it up. */
export interface CurriculumInProgress {
  id: string
  title: string
  topicTitle: string
  completed: number
  total: number
  /** The next lesson whose ground has been covered, if any is open. */
  nextLesson: { id: string; title: string } | null
}

export interface HomeData {
  subjects: SubjectCell[]
  unfiled: TopicSummary[]
  hot: TopicSummary[]
  cold: TopicSummary[]
  queued: Resource[]
  pendingCount: number
  suggested: TopicSummary | null
  inProgress: CurriculumInProgress[]
  totals: { topics: number; subjects: number; resources: number }
}

/* ------------------------------------------------------------- library */

export interface LibraryRow extends Resource {
  /** The topics it is filed against, so a row says where it sits. */
  topics: Array<{ id: string; title: string }>
  /** Whether anything has been read out of it. A resource with
   *  exposures behind it cannot be deleted without rewriting history,
   *  so the sheet says so rather than offering an action that fails. */
  readInto: boolean
  /** Other rows that look like the same piece of material. Named on
   *  the shelf rather than merged quietly: merging moves exposures and
   *  cannot be undone. */
  sameAs: Array<{ id: string; title: string }>
}

/* ------------------------------------------------------------- pending */

export interface PendingTopic {
  id: string
  title: string
  summary: string | null
  nearest: {
    id: string
    title: string
    summary: string | null
    similarity: number
  } | null
}

/* ---------------------------------------------------------- highlights */

export interface HighlightRow extends Highlight {
  lesson: { id: string; title: string } | null
  topic: { id: string; title: string } | null
}

/* --------------------------------------------------------------- topic */

export interface TopicNeighbour {
  id: string
  title: string
  kind: string
  /** True when this topic comes before the one being viewed. */
  incoming: boolean
}

export interface LessonRow {
  id: string
  title: string
  summary: string | null
  position: number
  stage: string
  minutes: number | null
  completed_at: string | null
  /** How many passages were marked while reading it. A lesson you
   *  argued with is worth finding again. */
  marks: number
  /** Whether the body has been written. Derived in the database from
   *  `body` itself, so the sheet can print the state without carrying
   *  sixteen lessons' prose to answer one bit. */
  has_body: boolean
}

export interface CurriculumCard extends Curriculum {
  total: number
  complete: number
  fraction: number
  /** The lessons themselves, in the order they are meant to be worked.
   *  The topic sheet lists these directly: a topic has one route
   *  through it in practice, and printing the route's name above its
   *  own lessons was a level of indirection that said nothing. */
  lessons: LessonRow[]
}

export interface TopicArea {
  topic: Topic & { freshness: number }
  subjects: Subject[]
  curricula: CurriculumCard[]
  resources: Array<{ relevance: number; resource: Resource }>
  neighbours: TopicNeighbour[]
  exposures: Array<{ id: string; reason: string; depth: string; created_at: string }>
  /** Passages marked in this topic's lessons, newest first. The lesson
   *  they came from stops mattering quickly; the topic is what makes
   *  them worth keeping. */
  highlights: HighlightRow[]
}

/* ------------------------------------------------------------- subject */

/** The app's reading of the sowing answers, beside the user's own. */
export interface Assessment {
  level: number
  note: string
  shown: string[]
  missing: string[]
  answered: number
  asked: number
}

export interface Sowing {
  roots: number | null
  confident: string | null
  gaps: string | null
  depth: string | null
  qualifiers: Array<{ prompt: string; level: number; answer: string }>
  evidence: Array<{ title: string; kind: string }>
  assessment: Assessment | null
  created_at: string
}

export interface SubjectArea {
  subject: Subject
  tree: TopicTreeNode[]
  topics: SubjectTopicRow[]
  /** Resources filed against the subject as a whole rather than any one
   *  topic — sow-time evidence, mainly. Named here so the reader can see
   *  what a subject stands on and file it onto topics by hand. */
  resources: Array<Pick<Resource, 'id' | 'title' | 'kind' | 'status' | 'url'>>
  /** The subject's own figures, aggregated from its members. */
  ability: number
  freshness: number
  confidence: number
  lastExposureAt: string | null
  counts: {
    topics: number
    resources: number
    unread: number
    curricula: number
    /** Connections with both ends inside this bed. Nought on a bed the
     *  sowing never got to relate, which is what the sheet offers to
     *  put right. */
    edges: number
  }
  /** What the user said when they sowed it, if it was sown here. */
  sowing: Sowing | null
}

/* --------------------------------------------------------------- inbox */

export interface InboxCount {
  decisions: number
  waiting: number
  total: number
}

export interface Inbox {
  pending: PendingTopic[]
  queued: Resource[]
}
