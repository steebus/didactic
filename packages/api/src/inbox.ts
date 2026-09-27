import type { Api } from './client'
import type { Inbox, InboxCount } from '@didactic/core/shapes'
import type { ShelfHit } from '@didactic/core/shelf'

/**
 * `count` stays separate from `read` and stays cheap: it is two counts
 * on an index for a figure in a nav, where `read` reads the rows and
 * runs a similarity search per pending topic.
 */
export const inbox = (api: Api) => ({
  read: () => api.get<Inbox>('/api/inbox'),
  count: () => api.get<InboxCount>('/api/inbox/count'),
  /** Where a search is found in the shelf's text and in what was
   *  written in it (058). Everything a row already carries is matched
   *  on the client, by `core/shelf.shelfMatches`. */
  search: (q: string) => api.get<{ hits: ShelfHit[] }>('/api/inbox/search', { q }),
})
