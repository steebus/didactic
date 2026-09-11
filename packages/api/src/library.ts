import type { Api } from './client'
import type { LibraryRow } from '@didactic/core/shapes'

export const library = (api: Api) => ({
  list: () => api.get<LibraryRow[]>('/api/library'),
})
