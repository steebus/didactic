import type { Api } from './client'
import type { Curriculum, Exposure, Resource, Subject, Topic } from '@didactic/core/types'
import type { PendingTopic, TopicArea } from '@didactic/core/shapes'
import type { Planting } from './graph'

export interface TopicPatch {
  title?: string
  summary?: string | null
  primary_subject_id?: string | null
  add_subject_ids?: string[]
  remove_subject_ids?: string[]
}

/**
 * Merge folds one topic into another and cannot be undone; `confirm`
 * keeps it as it stands and `discard` drops it.
 *
 * These are the route's own words. A wrong merge destroys history
 * irrecoverably and a wrong keep costs one click, which is why the
 * resolver defers here at all.
 */
export type PendingAction = 'confirm' | 'merge' | 'discard'

/**
 * What the graph panel asks for: the topic and everything filed against
 * it. `area` answers the topic sheet's question instead, and the two
 * shapes differ on purpose — see the API contract.
 */
export interface TopicDetail {
  topic: Topic & { freshness: number }
  subjects: Array<Pick<Subject, 'id' | 'title' | 'colour'>>
  exposures: Exposure[]
  resources: Array<{ relevance: number; resources: Resource }>
  edges: Array<{ from_topic: string; to_topic: string; kind: string; weight: number }>
  curricula: Array<Curriculum & { lessonCount: number; completedCount: number }>
}

export const topics = (api: Api) => ({
  /**
   * The whole bed, minus its subjects.
   *
   * This and `/api/graph` both read `getPlanting`; the graph route adds
   * the subjects in one call, which is why the canvas prefers it.
   */
  list: () => api.get<Omit<Planting, 'subjects'>>('/api/topics'),

  get: (id: string) => api.get<TopicDetail>(`/api/topics/${id}`),
  area: (id: string) => api.get<TopicArea>(`/api/topics/${id}/area`),

  /** Curation only; never ability. */
  patch: (id: string, body: TopicPatch) => api.patch<{ ok: true }>(`/api/topics/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/api/topics/${id}`),

  pending: () => api.get<{ pending: PendingTopic[] }>('/api/topics/pending'),
  decide: (topicId: string, action: PendingAction, mergeInto?: string) =>
    api.patch<{ ok: true }>('/api/topics/pending', { topicId, action, mergeInto }),
})
