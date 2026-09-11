import type { Api } from './client'
import type { Inbox, InboxCount } from '@didactic/core/shapes'

/**
 * `count` stays separate from `read` and stays cheap: it is two counts
 * on an index for a figure in a nav, where `read` reads the rows and
 * runs a similarity search per pending topic.
 */
export const inbox = (api: Api) => ({
  read: () => api.get<Inbox>('/api/inbox'),
  count: () => api.get<InboxCount>('/api/inbox/count'),
})
