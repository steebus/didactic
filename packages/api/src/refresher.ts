import type { Api } from './client'

/** What the reader already read on this topic, printed beneath. */
export interface PriorResource {
  title: string
  summary: string | null
  url: string | null
}

/**
 * A refresher, or the reason there is not one.
 *
 * The route answers 502/503 with `resources` still filled in: no model
 * wrote anything, but the reader's own material is still worth having,
 * so a failure here is a missing section rather than an empty sheet.
 */
export interface Refresher {
  content: string
  resources: PriorResource[]
  cached: boolean
}

export const refresher = (api: Api) => ({
  write: (topicId: string) => api.post<Refresher>(`/api/refresher/${topicId}`),
})
