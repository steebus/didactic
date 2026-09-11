import type { Api } from './client'
import type { Subject } from '@didactic/core/types'
import type { SubjectArea, Sowing } from '@didactic/core/shapes'

/** What a sowing answers with. Takes the better part of a minute. */
export interface Sown {
  id: string
  title: string
  created: Array<{ id: string; title: string }>
  /** Existing topics filed under the bed rather than duplicated. */
  linked: number
  warnings: string[]
  dropped: string[]
  problem: string | null
}

export interface Qualifier {
  prompt: string
  level: number
}

export interface SowBody {
  subject: string
  roots?: number | null
  depth?: string | null
  confident?: string | null
  gaps?: string | null
  evidence?: Array<{ title: string; kind: string; url?: string; resourceId?: string }>
  qualifiers?: Array<{ prompt: string; level: number; answer: string }>
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
  }) => api.post<{ qualifiers: Qualifier[] }>('/api/subjects/qualify', body),

  remove: (id: string) => api.del<{ ok: true }>(`/api/subjects/${id}`),
  addTopic: (id: string, title: string) =>
    api.post<{ id: string; title: string }>(`/api/subjects/${id}/topics`, { title }),
  removeTopic: (id: string, topicId: string) =>
    api.del<{ ok: true }>(`/api/subjects/${id}/topics`, { topicId }),
  relate: (id: string) => api.post<{ edges: number }>(`/api/subjects/${id}/relate`),
  resow: (id: string) => api.post<Sown>(`/api/subjects/${id}/resow`),
})
