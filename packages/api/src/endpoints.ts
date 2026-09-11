import { tags } from '@didactic/core/tags'

/**
 * What every write drops.
 *
 * The server cache is dropped by `revalidateTag` in the route handler.
 * The phone's query cache is dropped by its mutation wrapper reading
 * this table. One list, read by both, because a write remembered on one
 * platform and forgotten on the other is a stale map — the single
 * failure this app cannot afford.
 *
 * The tags here are the ones the handlers actually call `revalidateTag`
 * with, read off the routes rather than reasoned about. Erring wide is
 * deliberate and matches them.
 */

export type Tag = string

export interface Endpoint {
  name: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** `[id]` marks a segment the caller fills in. */
  path: string
  /** Empty for a read, and for the writes that change nothing cached. */
  invalidates: Tag[]
}

const SOWING_WIDE = [tags.subjects, tags.topics, tags.resources, tags.pending]
const SUBJECT_DEEP = [tags.subjects, tags.topics, tags.resources, tags.highlights]
const BED = [tags.subjects, tags.topics, tags.pending]
const CURATION = [tags.subjects, tags.topics, tags.highlights]
const MATERIAL = [tags.resources, tags.topics]
const MARKS = [tags.highlights, tags.topics, tags.subjects]

export const ENDPOINTS = {
  /* auth — web only; the phone signs in against Supabase directly */
  'auth.claim': { name: 'auth.claim', method: 'POST', path: '/api/auth/claim', invalidates: [] },
  'auth.signIn': { name: 'auth.signIn', method: 'POST', path: '/api/auth/sign-in', invalidates: [] },
  'auth.signOut': { name: 'auth.signOut', method: 'POST', path: '/api/auth/sign-out', invalidates: [] },

  /* reading the map */
  'home.read': { name: 'home.read', method: 'GET', path: '/api/home', invalidates: [] },
  'graph.read': { name: 'graph.read', method: 'GET', path: '/api/graph', invalidates: [] },
  'inbox.read': { name: 'inbox.read', method: 'GET', path: '/api/inbox', invalidates: [] },
  'inbox.count': { name: 'inbox.count', method: 'GET', path: '/api/inbox/count', invalidates: [] },
  'library.list': { name: 'library.list', method: 'GET', path: '/api/library', invalidates: [] },
  'books.search': { name: 'books.search', method: 'GET', path: '/api/books/search', invalidates: [] },
  'settings.read': { name: 'settings.read', method: 'GET', path: '/api/settings', invalidates: [] },
  'subjects.list': { name: 'subjects.list', method: 'GET', path: '/api/subjects', invalidates: [] },
  'subjects.get': { name: 'subjects.get', method: 'GET', path: '/api/subjects/[id]', invalidates: [] },
  'subjects.area': { name: 'subjects.area', method: 'GET', path: '/api/subjects/[id]/area', invalidates: [] },
  'subjects.sowing': { name: 'subjects.sowing', method: 'GET', path: '/api/subjects/[id]/sowing', invalidates: [] },
  'topics.list': { name: 'topics.list', method: 'GET', path: '/api/topics', invalidates: [] },
  'topics.get': { name: 'topics.get', method: 'GET', path: '/api/topics/[id]', invalidates: [] },
  'topics.area': { name: 'topics.area', method: 'GET', path: '/api/topics/[id]/area', invalidates: [] },
  'topics.pending': { name: 'topics.pending', method: 'GET', path: '/api/topics/pending', invalidates: [] },
  'resources.list': { name: 'resources.list', method: 'GET', path: '/api/resources', invalidates: [] },
  'curricula.get': { name: 'curricula.get', method: 'GET', path: '/api/curricula/[id]', invalidates: [] },
  'lessons.get': { name: 'lessons.get', method: 'GET', path: '/api/lessons/[id]', invalidates: [] },
  'highlights.list': { name: 'highlights.list', method: 'GET', path: '/api/highlights', invalidates: [] },
  'mentions.search': { name: 'mentions.search', method: 'GET', path: '/api/mentions', invalidates: [] },

  /* writing */
  'subjects.sow': { name: 'subjects.sow', method: 'POST', path: '/api/subjects', invalidates: SOWING_WIDE },
  'subjects.qualify': { name: 'subjects.qualify', method: 'POST', path: '/api/subjects/qualify', invalidates: [] },
  'subjects.remove': { name: 'subjects.remove', method: 'DELETE', path: '/api/subjects/[id]', invalidates: SUBJECT_DEEP },
  'subjects.addTopic': { name: 'subjects.addTopic', method: 'POST', path: '/api/subjects/[id]/topics', invalidates: BED },
  'subjects.removeTopic': { name: 'subjects.removeTopic', method: 'DELETE', path: '/api/subjects/[id]/topics', invalidates: BED },
  'subjects.relate': { name: 'subjects.relate', method: 'POST', path: '/api/subjects/[id]/relate', invalidates: [tags.subjects, tags.topics] },
  'subjects.resow': { name: 'subjects.resow', method: 'POST', path: '/api/subjects/[id]/resow', invalidates: BED },

  'topics.patch': { name: 'topics.patch', method: 'PATCH', path: '/api/topics/[id]', invalidates: CURATION },
  'topics.remove': { name: 'topics.remove', method: 'DELETE', path: '/api/topics/[id]', invalidates: CURATION },
  'topics.decide': { name: 'topics.decide', method: 'PATCH', path: '/api/topics/pending', invalidates: [tags.pending, tags.topics, tags.subjects] },

  'resources.add': { name: 'resources.add', method: 'POST', path: '/api/resources', invalidates: MATERIAL },
  'resources.upload': { name: 'resources.upload', method: 'POST', path: '/api/resources/upload', invalidates: MATERIAL },
  'resources.uploadUrl': { name: 'resources.uploadUrl', method: 'POST', path: '/api/resources/upload-url', invalidates: [] },
  'resources.uploaded': { name: 'resources.uploaded', method: 'POST', path: '/api/resources/uploaded', invalidates: MATERIAL },
  'resources.patch': { name: 'resources.patch', method: 'PATCH', path: '/api/resources/[id]', invalidates: [tags.resources, tags.topics, tags.subjects] },
  'resources.remove': { name: 'resources.remove', method: 'DELETE', path: '/api/resources/[id]', invalidates: [tags.resources, tags.topics, tags.subjects] },
  'resources.merge': { name: 'resources.merge', method: 'POST', path: '/api/resources/[id]/merge', invalidates: MATERIAL },

  'curricula.create': { name: 'curricula.create', method: 'POST', path: '/api/curricula', invalidates: [tags.topics] },
  'curricula.patch': { name: 'curricula.patch', method: 'PATCH', path: '/api/curricula/[id]', invalidates: [tags.topics] },
  'curricula.remove': { name: 'curricula.remove', method: 'DELETE', path: '/api/curricula/[id]', invalidates: [tags.topics] },
  'curricula.addLesson': { name: 'curricula.addLesson', method: 'POST', path: '/api/curricula/[id]/lessons', invalidates: [tags.topics] },

  'lessons.patch': { name: 'lessons.patch', method: 'PATCH', path: '/api/lessons/[id]', invalidates: CURATION },
  'lessons.remove': { name: 'lessons.remove', method: 'DELETE', path: '/api/lessons/[id]', invalidates: CURATION },
  'lessons.writeBody': { name: 'lessons.writeBody', method: 'POST', path: '/api/lessons/[id]/body', invalidates: [tags.topics] },
  'lessons.answer': { name: 'lessons.answer', method: 'POST', path: '/api/lessons/[id]/answers', invalidates: [tags.topics, tags.subjects] },

  'refresher.write': { name: 'refresher.write', method: 'POST', path: '/api/refresher/[topicId]', invalidates: [tags.topics, tags.subjects] },

  'highlights.create': { name: 'highlights.create', method: 'POST', path: '/api/highlights', invalidates: MARKS },
  'highlights.patch': { name: 'highlights.patch', method: 'PATCH', path: '/api/highlights', invalidates: MARKS },
  'highlights.remove': { name: 'highlights.remove', method: 'DELETE', path: '/api/highlights', invalidates: MARKS },
} as const satisfies Record<string, Endpoint>

export type EndpointName = keyof typeof ENDPOINTS

/** The tags a write drops, for a cache that is not the server's. */
export function invalidatedBy(name: EndpointName): readonly Tag[] {
  return ENDPOINTS[name].invalidates
}
