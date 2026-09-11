import type { Api } from './client'
import type { HomeData } from '@didactic/core/shapes'

/** The stock list. */
export const home = (api: Api) => ({
  read: () => api.get<HomeData>('/api/home'),
})
