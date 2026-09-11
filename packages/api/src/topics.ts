import type { Api } from './client'
import type { Topic } from '@didactic/core/types'
import type { PendingTopic, TopicArea } from '@didactic/core/shapes'

export interface TopicPatch {
  title?: string
  summary?: string | null
  primary_subject_id?: string | null
  add_subject_ids?: string[]
  remove_subject_ids?: string[]
}

/** Merge folds one topic into another; split and keep resolve it as it stands. */
export type PendingAction = 'merge' | 'split' | 'keep'

export const topics = (api: Api) => ({
  list: () => api.get<{ topics: Topic[] }>('/api/topics'),

  /**
   * The graph panel's own question. `area` answers the topic sheet's,
   * and the two shapes differ on purpose — see the API contract.
   */
  get: (id: string) => api.get<Record<string, unknown>>(`/api/topics/${id}`),
  area: (id: string) => api.get<TopicArea>(`/api/topics/${id}/area`),

  /** Curation only; never ability. */
  patch: (id: string, body: TopicPatch) => api.patch<{ ok: true }>(`/api/topics/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/api/topics/${id}`),

  pending: () => api.get<{ pending: PendingTopic[] }>('/api/topics/pending'),
  decide: (topicId: string, action: PendingAction, mergeInto?: string) =>
    api.patch<{ ok: true }>('/api/topics/pending', { topicId, action, mergeInto }),
})
