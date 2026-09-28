import type { Api } from './client'
import type { HomeData } from '@didactic/core/shapes'
import type { ActivityDay } from '@didactic/core/activity'

/** The stock list, and the reader's year for the rule under its head.
 *  `activity` is additive: empty before `064`, and on an older server. */
export const home = (api: Api) => ({
  read: () => api.get<HomeData & { activity?: ActivityDay[] }>('/api/home'),
})
