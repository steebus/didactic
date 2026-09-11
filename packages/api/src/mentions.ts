import type { Api } from './client'
import type { Suggestion } from '@didactic/core/mentionSearch'

/**
 * What an `@` in a note could mean.
 *
 * Asked on a keystroke, so it is the one read worth keeping cheap: two
 * title searches against what the owner holds, ranked in
 * `core/mentionSearch` rather than in the database, because "what
 * starts with what you typed comes before what merely contains it" is
 * a rule about typing and belongs where both platforms can read it.
 *
 * An empty query is not an error. It is the moment the `@` was typed
 * and nothing after it, which is when a menu is most useful: it offers
 * what was worked on most recently.
 */
export const mentions = (api: Api) => ({
  search: (q?: string) => api.get<{ suggestions: Suggestion[] }>('/api/mentions', { q }),
})
