/**
 * The backend, typed, for both front ends.
 *
 * `didactic()` is given a base URL and a way to produce headers: the web
 * passes neither and relies on its cookies, the phone passes a bearer
 * token. Everything below that is the same on both, which is the point —
 * a path or a body shape that exists twice is one that can disagree.
 *
 * Nothing here throws on an HTTP error. Every call answers `Result<T>`,
 * because `readJson` already turns a timeout or a gateway's HTML into a
 * sentence worth showing, and a client that threw would make each caller
 * reinvent that.
 */

import { createApi, type Api, type ApiOptions } from './client'
import { auth } from './auth'
import { books } from './books'
import { clozes } from './clozes'
import { curricula } from './curricula'
import { graph } from './graph'
import { highlights } from './highlights'
import { home } from './home'
import { inbox } from './inbox'
import { lessons } from './lessons'
import { library } from './library'
import { mentions } from './mentions'
import { refresher } from './refresher'
import { resources } from './resources'
import { settings } from './settings'
import { subjects } from './subjects'
import { topics } from './topics'

export * from './client'
export * from './endpoints'
export type { Planting } from './graph'
export type {
  Drawn,
  FirstOfBed,
  Qualifier,
  Resown,
  SowBody,
  Sown,
  SubjectReckoning,
  TopicAdded,
  TopicUnfiled,
} from './subjects'
export type { PendingAction, TopicDetail, TopicPatch } from './topics'
export type { AddResource, Filed } from './resources'
export type { CurriculumDetail, CurriculumPatch, Drafted, NewLesson, Opened } from './curricula'
export type { Completion, LessonDetail, LessonPatch, Written, WrittenWhole } from './lessons'
export type { Kept, NewHighlight } from './highlights'
export type { ClozeEdit, ClozeScope, NewCloze, SownClozes, Tended } from './clozes'
export type { PriorResource, Refresher } from './refresher'

/** Every endpoint, grouped as `ARCHITECTURE.md` §4 lays them out. */
export function didactic(options: ApiOptions = {}) {
  const api: Api = createApi(options)
  return {
    api,
    auth: auth(api),
    books: books(api),
    clozes: clozes(api),
    curricula: curricula(api),
    graph: graph(api),
    highlights: highlights(api),
    home: home(api),
    inbox: inbox(api),
    lessons: lessons(api),
    library: library(api),
    mentions: mentions(api),
    refresher: refresher(api),
    resources: resources(api),
    settings: settings(api),
    subjects: subjects(api),
    topics: topics(api),
  }
}

export type Didactic = ReturnType<typeof didactic>
