import type { Api } from './client'
import type { Subject } from '@didactic/core/types'

/**
 * The bed in one call.
 *
 * The web's canvas asked `/api/topics` and `/api/subjects` separately
 * and merged them itself, which is two round trips before anything can
 * be drawn. Both routes read `getPlanting`, so this is that merge done
 * server-side and neither can drift from the other.
 */
export interface Planting {
  topics: Array<{
    id: string
    title: string
    ability: number
    ability_confidence: number
    /** Derived on read, never stored: the canvas fades and filters by it. */
    freshness: number
    last_exposure_at: string | null
    /** The home subject, which is what the seed is coloured by. */
    primary_subject_id: string | null
    /** Every subject the topic is filed under, home included. */
    subject_ids: string[]
    state: string
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
  /**
   * Kept passages, and what their notes name.
   *
   * `topic_id` is where the mark came from — the topic its lesson
   * teaches. The tagged ids are what the reader said it was *about*,
   * which is very often somewhere else: that is the whole reason for
   * naming things in a note. Newest `MARKS_ON_THE_BED` only.
   */
  marks: Array<{
    id: string
    /** A mark has no title, so `core/graphMarks` names it by what it says. */
    label: string
    topic_id: string | null
    lesson_id: string
    /** Whether anything was written, or only a passage kept. */
    noted: boolean
    topic_ids: string[]
    lesson_ids: string[]
  }>
  subjects: Array<Pick<Subject, 'id' | 'title' | 'colour'>>
}

export const graph = (api: Api) => ({
  read: () => api.get<Planting>('/api/graph'),
})
