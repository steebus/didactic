import type { Api } from './client'
import type { Subject } from '@didactic/core/types'
import type { SubjectArea, Sowing } from '@didactic/core/shapes'
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
  removeTopic: (id: string, topicId: string) =>
    api.del<TopicUnfiled>(`/api/subjects/${id}/topics`, { topicId }),
  relate: (id: string) => api.post<Drawn>(`/api/subjects/${id}/relate`),
  resow: (id: string) => api.post<Resown>(`/api/subjects/${id}/resow`),
})
