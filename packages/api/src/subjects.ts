import type { Api } from './client'
import type { Subject } from '@didactic/core/types'
import type { SubjectArea, Sowing } from '@didactic/core/shapes'

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
  warnings: string[]
}

/** What laying a bed out again answers with. No id: the bed already exists. */
export interface Resown {
  topicsCreated: number
  linked: number
  reading: boolean
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
  evidence?: Array<{ title: string; kind: string; url?: string; resourceId?: string }>
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
