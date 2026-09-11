import type { Api } from './client'

export const refresher = (api: Api) => ({
  write: (topicId: string) => api.post<{ id: string }>(`/api/refresher/${topicId}`),
})
