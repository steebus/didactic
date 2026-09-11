import type { Api } from './client'
import type {
  ExposureDepth,
  Resource,
  ResourceKind,
  ResourceStatus,
} from '@didactic/core/types'

export interface AddResource {
  kind: ResourceKind
  url?: string
  title?: string
  text?: string
  topicId?: string
  /** Filed as already read. Filing is never an exposure on its own —
   *  the consumed transition is what writes one. */
  consumed?: boolean
}

export const resources = (api: Api) => ({
  list: () => api.get<{ resources: Resource[] }>('/api/resources'),
  add: (body: AddResource) => api.post<{ id: string; title: string }>('/api/resources', body),

  /**
   * The one multipart route. `consumed` marks a PDF as evidence of
   * something already done rather than an item on the reading list.
   */
  upload: (file: File | Blob, consumed = false) => {
    const form = new FormData()
    form.append('file', file)
    if (consumed) form.append('consumed', 'true')
    return api.upload<{ id: string; title: string; warning?: string }>(
      '/api/resources/upload',
      form
    )
  },

  /** The consumed transition is what writes the exposure. */
  patch: (id: string, body: { status?: ResourceStatus; depth?: ExposureDepth }) =>
    api.patch<{ ok: true }>(`/api/resources/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/api/resources/${id}`),

  /** Moves exposures; cannot be undone. */
  merge: (id: string, mergeId: string) =>
    api.post<{ ok: true }>(`/api/resources/${id}/merge`, { mergeId }),
})
