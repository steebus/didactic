import type { Api } from './client'
import type { Subject } from '@didactic/core/types'

/**
 * The bed in one call.
 *
 * The web's canvas asks `/api/topics` and `/api/subjects` separately and
 * merges them itself; this is that merge done server-side, for a client
 * on a worse connection.
 */
export interface Planting {
  topics: Array<{
    id: string
    title: string
    ability: number
    ability_confidence: number
    last_exposure_at: string | null
    primary_subject_id: string | null
    state: string
    subject_ids: string[]
  }>
  edges: Array<{ from_topic: string; to_topic: string; kind: string; weight: number }>
  resources: Array<{
    id: string
    title: string
    kind: string
    status: string
    topic_ids: string[]
  }>
  lessons: Array<{
    id: string
    title: string
    topic_id: string
    stage: string
    completed_at: string | null
    curriculum_id: string
  }>
  subjects: Array<Pick<Subject, 'id' | 'title' | 'colour'>>
}

export const graph = (api: Api) => ({
  read: () => api.get<Planting>('/api/graph'),
})
