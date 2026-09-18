import type { Api } from './client'
import type { Subject } from '@didactic/core/types'
import type { SubjectArea, Sowing } from '@didactic/core/shapes'
import type { TopicGroup } from '@didactic/core/groups'
import type { Fidelity } from '@didactic/core/documents'

/**
 * Where a freshly laid bed is meant to be started: its most
 * introductory topic, and whatever route that topic already carries.
 *
 * The bed is laid out simplest-first and the order is kept, so this is
 * the first of it — skipping anything waiting on an adjudication, since
 * a topic that may turn out to be a duplicate is not somewhere to send
 * a reader. Null for a bed with nothing active in it.
 *
 * Additive: a client that has never heard of it sows exactly as before
 * and offers nothing to start.
 */
export interface FirstOfBed {
  id: string
  title: string
  /** A route it already has. Null means there is none to follow yet. */
  curriculumId: string | null
}

/**
 * What a sowing answers with. Takes the better part of a minute.
 *
 * Read off the route rather than reasoned about: it answers with the id
 * of the bed it wrote and counts of what went into it, not the rows
 * themselves. `reading` is what decides where the sheet goes next — a
 * reading exists only when the sower gave the app something to read.
 */
export interface Sown {
  subjectId: string
  topicsCreated: number
  /** Existing topics filed under the bed rather than duplicated. */
  linked: number
  reading: boolean
  /**
   * Where the bed starts. The route and the first lesson are not
   * written here — each is about as long as the sowing already was, and
   * three of them in one function is a timeout with a subject half
   * built behind it — so the client sets that going itself.
   */
  first?: FirstOfBed | null
  warnings: string[]
}

/**
 * What grouping a bed answers with.
 *
 * `grouped` counts the topics that landed in a box, which is never the
 * whole bed: leaving a topic out is a real answer, and the difference
 * between it and the bed's size is what sits loose between the boxes.
 * `note` carries the one case worth a sentence -- a bed that does not
 * divide into anything meaningful is left as one list and says so.
 */
export interface Grouped {
  groups: TopicGroup[]
  grouped: number
  note: string | null
}

/** What laying a bed out again answers with. No id: the bed already exists. */
export interface Resown {
  topicsCreated: number
  linked: number
  reading: boolean
  /** The same as a first sowing: where the bed starts. */
  first?: FirstOfBed | null
  warnings: string[]
}

/** What drawing a bed's connections answers with. */
export interface Drawn {
  drawn: number
  considered: number
  warnings: string[]
}

/**
 * What adding a topic by name answers with.
 *
 * The resolver decides what actually happened, and the sheet says so:
 * the difference between a map the reader trusts and one that quietly
 * merges things behind them.
 */
export interface TopicAdded {
  topicId: string
  action: 'created' | 'linked' | 'already-filed' | 'pending'
  /** The topic's own name. Answered when the caller filed it by id and
   *  so may not know it; absent on the by-name path, where the caller
   *  typed it. */
  title?: string
  /**
   * Which reading raised the question, where one was raised. The
   * resolver reads the title against the whole map by embedding; the
   * sort reads the topic against this bed. They say different things
   * and "waiting for you" reads differently depending on which spoke.
   */
  queriedBy?: 'resolver' | 'sort' | null
  /** Edges drawn between the new topic and the bed it was added to. */
  placed?: number
  /** One line about what the sort did, where it ran. */
  note?: string | null
  warnings?: string[]
}

/** What filing several topics at once did. `placed` is always null: the
 *  bulk path does not sort, and says so rather than answering nought. */
export interface TopicsFiled {
  filed: number
  skipped: number
  placed: null
  note: string
}

/** Unfiling a topic, and whether it is now loose stock. */
export interface TopicUnfiled {
  ok: true
  loose: boolean
}

export interface Qualifier {
  prompt: string
  level: number
  /**
   * What a good answer would show. Never printed — under the question
   * it read as a crib and half of them gave the answer away. It is sent
   * back with the answers as the rubric the marking reads against.
   */
  probes: string
}

export interface SowBody {
  subject: string
  roots?: number | null
  depth?: string | null
  confident?: string | null
  gaps?: string | null
  evidence?: Array<{
    title: string
    kind: string
    url?: string
    resourceId?: string
    /** How closely the bed should follow this document. Only ever set
     *  on a PDF that has been read; absent means it steers nothing. */
    fidelity?: Fidelity
  }>
  qualifiers?: Array<{ prompt: string; level: number; probes?: string; answer: string }>
}

/** The counts a grubbing-out would destroy, for the confirmation. */
export interface SubjectReckoning {
  title: string
  topics: number
  topicsKeptElsewhere: number
  curricula: number
  lessons: number
  marks: number
  exposures: number
  resources: number
}

export const subjects = (api: Api) => ({
  list: () => api.get<{ subjects: Subject[] }>('/api/subjects'),
  get: (id: string) => api.get<SubjectReckoning>(`/api/subjects/${id}`),
  area: (id: string) => api.get<SubjectArea>(`/api/subjects/${id}/area`),
  sowing: (id: string) => api.get<Sowing | null>(`/api/subjects/${id}/sowing`),

  sow: (body: SowBody) => api.post<Sown>('/api/subjects', body),

  /** The five to ten questions, in difficulty order. */
  qualify: (body: {
    subject: string
    roots?: number | null
    confident?: string | null
    depth?: string | null
  }) => api.post<{ questions: Qualifier[] }>('/api/subjects/qualify', body),

  remove: (id: string) => api.del<{ ok: true }>(`/api/subjects/${id}`),
  addTopic: (id: string, title: string) =>
    api.post<TopicAdded>(`/api/subjects/${id}/topics`, { title }),

  /**
   * File a topic that already exists into this subject, and place it in
   * the bed.
   *
   * The difference from `addTopic` is who decides which topic: there,
   * the resolver reads a typed name against the whole map and may land
   * on a neighbour; here the caller has the row in its hand and nothing
   * is inferred. Which is what makes it safe to build *move* out of --
   * a name round-tripped through an embedding is not guaranteed to come
   * back as the topic you were looking at.
   *
   * Additive to the topic: it keeps every other subject it sits under.
   */
  fileTopic: (id: string, topicId: string) =>
    api.post<TopicAdded>(`/api/subjects/${id}/topics`, { topicId }),

  /**
   * File several existing topics into this bed at once, **unplaced**.
   *
   * Placing one topic is a model call over the whole bed; placing thirty
   * is thirty of them, which is minutes and past the platform's ceiling.
   * So the bulk path does the certain part and says what it has not
   * done — `relate(id)` is what works out what follows what, in one pass
   * over the bed, and the answer's `note` points at it.
   */
  fileTopics: (id: string, topicIds: string[]) =>
    api.post<TopicsFiled>(`/api/subjects/${id}/topics`, { topicIds }),
  removeTopic: (id: string, topicId: string) =>
    api.del<TopicUnfiled>(`/api/subjects/${id}/topics`, { topicId }),
  /**
   * Propose the bed's groups with one model call, and write them.
   *
   * Replaces every group the subject has: proposing is laying the bed
   * out again, not adding a second set of boxes. Takes about as long as
   * relating a bed, so expect the same 504 sentences.
   */
  groupBed: (id: string) => api.post<Grouped>(`/api/subjects/${id}/groups`),

  /**
   * Every hand edit to the boxes, in one call.
   *
   * The fields stack and are applied in a fixed order, so one call can
   * make a group and put a topic into it. `into: null` is a real
   * destination -- it is how a topic is taken out of a group and left
   * loose in the bed -- so it is sent rather than omitted.
   */
  editGroups: (
    id: string,
    body: {
      create?: string
      groupId?: string
      title?: string
      groupOrder?: string[]
      topicId?: string
      into?: string | null
      topicOrder?: string[]
    }
  ) => api.patch<{ groups: TopicGroup[] }>(`/api/subjects/${id}/groups`, body),

  /** Take a box away. Its topics stay in the bed and become loose. */
  removeGroup: (id: string, groupId: string) =>
    api.del<{ groups: TopicGroup[] }>(`/api/subjects/${id}/groups`, { groupId }),

  relate: (id: string) => api.post<Drawn>(`/api/subjects/${id}/relate`),
  resow: (id: string) => api.post<Resown>(`/api/subjects/${id}/resow`),
})
