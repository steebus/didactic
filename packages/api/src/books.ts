import type { Api } from './client'
import type { BookMatch } from '@didactic/core/books'

/** Open Library, through the app. Falls back to nothing silently. */
export const books = (api: Api) => ({
  search: (q: string) => api.get<{ books: BookMatch[] }>('/api/books/search', { q }),
})
