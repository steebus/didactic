import type { Api } from './client'
import type { Sprouting } from '@didactic/core/shapes'

/** What planting a sprout answers. */
export interface Planted {
  subjectId: string
  filed: number
  /** Says what was not done: the topics are filed but not placed. */
  note: string
}

/**
 * Sprouting subjects: subjects nobody sowed, read off what the material
 * keeps putting together. `read` is cached and cheap; `name` fills
 * kinship vectors and asks the model, so call it only when `read` says
 * something is unnamed or unembedded.
 */
export const sprouts = (api: Api) => ({
  read: () => api.get<Sprouting>('/api/sprouts'),
  name: () => api.post<Sprouting & { warnings: string[] }>('/api/sprouts/name'),
  plant: (id: string, title: string) => api.post<Planted>(`/api/sprouts/${id}/plant`, { title }),
  dismiss: (id: string) => api.post<{ ok: true }>(`/api/sprouts/${id}/dismiss`),
})
