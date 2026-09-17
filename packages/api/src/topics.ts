import type { Api } from './client'
import type { Curriculum, Exposure, Resource, Subject, Topic } from '@didactic/core/types'
import type { LooseTopic, PendingTopic, TopicArea } from '@didactic/core/shapes'
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

/**
 * What promoting a topic answers with.
 *
 * `filed` is read back from the new bed rather than predicted: which
 * topics come up with it is the database's own walk of the outline, and
 * the sheet should report what happened rather than what was asked for.
 */
export interface Promoted {
  subjectId: string
  title: string
  /** How many topics ended up in the new bed — the promoted one, and
   *  whatever the outline hung under it. Never fewer than one. */
  filed: number
}

/** What demoting answers with: the lesson that now stands where the
 *  topic did, and the route it joined. */
export interface Demoted {
  lessonId: string
  intoTopicId: string
  intoTitle: string | null
}

/** What a bulk delete of loose stock did, and what it declined to do. */
export interface LooseRemoved {
  removed: number
  /** Ids that had been filed under a subject since the sheet was drawn.
   *  Never deleted by a press meant for loose stock. */
  skipped: number
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

  /** Every topic filed under no subject, with what each one holds. */
  loose: () => api.get<{ loose: LooseTopic[] }>('/api/topics/loose'),

  /** Throw away loose topics, several at a time. Scoped server-side to
   *  topics that are still unfiled, so a stale checkbox cannot delete
   *  something that has since been filed. */
  removeLoose: (ids: string[]) =>
    api.del<LooseRemoved>('/api/topics/loose', { ids }),

  /**
   * Promote a topic to a subject of its own.
   *
   * The topic and everything the outline hangs under it are filed into
   * the new bed and take it as their home. The topic row survives — it
   * can be carrying a reading log, and a subject is not something you
   * can have read. Refused for a topic with a route through it.
   */
  promote: (id: string) => api.post<Promoted>(`/api/topics/${id}/promote`),

  /**
   * Demote a topic into another topic's route, as a lesson in it.
   *
   * Everything it holds moves to the target first; the row is then
   * deleted and its name survives as the lesson's title. Cannot be
   * undone. Refused for a topic with a route through it.
   */
  demote: (id: string, intoTopicId: string) =>
    api.post<Demoted>(`/api/topics/${id}/demote`, { intoTopicId }),

  pending: () => api.get<{ pending: PendingTopic[] }>('/api/topics/pending'),
  /**
   * `filed` rides along on a `confirm`: how many subjects the kept topic
   * was filed under from the bed it sits in. `commit_ingestion` refuses
   * to file a pending topic and this is what settles it, so the filing
   * it deferred happens here. Additive, and `0` is the ordinary answer
   * rather than a failure.
   */
  decide: (topicId: string, action: PendingAction, mergeInto?: string) =>
    api.patch<{ ok: true; filed?: number }>('/api/topics/pending', { topicId, action, mergeInto }),
})
