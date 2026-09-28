import type { Api } from './client'
import type { Bookmark, Place } from '@didactic/core/bookmarks'

/** The reading a bookmark is kept in: a lesson, or a resource. */
export type BookmarkIn = { lessonId: string; resourceId?: never } | { resourceId: string; lessonId?: never }

export const bookmarks = (api: Api) => ({
  /** The bookmark in one reading, or null. */
  get: (of: BookmarkIn) =>
    api.get<{ bookmark: Bookmark | null }>('/api/bookmarks', {
      lessonId: of.lessonId,
      resourceId: of.resourceId,
    }),
  /** Drop it, or move it: there is only ever one per reading. */
  place: (of: BookmarkIn, place: Place) =>
    api.post<{ bookmark: Bookmark }>('/api/bookmarks', { ...of, ...place }),
  remove: (of: BookmarkIn) => api.del<{ ok: true }>('/api/bookmarks', of),
})
