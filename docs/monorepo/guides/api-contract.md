# The API contract

The Next.js route handlers under `apps/web/src/app/api/` are the backend
for both the web and the phone. This guide is what a client can rely on
and what a change to a route has to respect.

## Who may call, and how they prove it

| Client | Proof | Handled by |
| --- | --- | --- |
| Web browser | Supabase session cookies (`@supabase/ssr`) | `proxy.ts` refreshes; `getOwner()` verifies with `auth.getUser()` |
| Mobile app | `Authorization: Bearer <supabase access token>` | `getOwner()` verifies with `auth.getUser(token)` on an anon client; `proxy.ts` passes bearer API requests through and answers 401 for a bad token |
| Queue worker | `/api/internal/*` with its own shared key | unchanged |

Row-level security (Phase 2.5) sits under all of this. The API's admin
client bypasses it, so the routes behave as before; what it governs is the
phone's own supabase-js client, which may read the owner's rows and
subscribe to Realtime with the owner's token and gets nothing without it.
Writes never go that way.

Rules:

- The owner id comes from the verified session, never the body.
- API paths answer `401 { error: 'not signed in' }`, never a redirect.
- A bearer request is never refreshed server-side; the phone refreshes its
  own token through supabase-js.
- Unauthenticated `GET /api/*` from a browser still redirects only for
  pages; `isApiPath` decides.

## Response shape

Every route answers JSON. Success is the resource or `{ ok: true }`.
Failure is `{ error: string }` with an HTTP status, and the string is a
sentence the user can be shown. Clients read responses through
`readJson` from `@didactic/core`, which turns an empty or non-JSON body
into a sentence about what probably happened (a timeout on sowing, a
gateway error, a dropped connection), so neither app ever prints
`Unexpected end of JSON input`.

## Endpoints

Methods and body fields as the routes read them today. Response types are
the interfaces in `@didactic/core` (`shapes.ts` after Phase 2). Tags are
what the write drops from the server cache and, through `ENDPOINTS`, from
the phone's query cache.

### Auth

| Method | Path | Body | Invalidates | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/claim` | email, password | — | Web only; first visit to an unclaimed installation. |
| POST | `/api/auth/sign-in` | email, password | — | Web only; sets cookies. Phone signs in against Supabase. |
| POST | `/api/auth/sign-out` | — | — | Web only. Phone calls `supabase.auth.signOut()`. |

### Reading the map

| Method | Path | Query / body | Returns | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/home` | — | `HomeData` | The stock list's own `getHomeData`, so the read shares its cache tags. |
| GET | `/api/graph` | — | `{ topics, edges, resources, lessons, subjects }` | The whole bed in one call, and what the web's canvas reads. It asked `/api/topics` and `/api/subjects` separately and merged them itself until 2.7; both read `getPlanting`, so they cannot drift. |
| GET | `/api/inbox` | — | `{ pending: PendingTopic[], queued: Resource[] }` | The sheet in one call. `/api/inbox/count` stays separate and stays cheap. |
| GET | `/api/inbox/count` | — | `{ decisions, waiting, total }` | Counts on an index; cheap enough for a nav. |
| GET | `/api/library` | — | `LibraryRow[]` | The library sheet's own `getLibrary`. |
| GET | `/api/subjects` | — | subjects | |
| GET | `/api/subjects/[id]` | — | subject with topics | |
| GET | `/api/subjects/[id]/area` | — | `SubjectArea` | The outline's data. 404 when the bed is not there. |
| GET | `/api/subjects/[id]/sowing` | — | `Sowing \| null` | The reading's data. Null for a bed sown before the sowing sheet existed, which the reading prints as *unstated*. |
| GET | `/api/topics` | — | the planting without its subjects: `{ topics, edges, resources, lessons }` | `getPlanting`, the same read `/api/graph` answers with the subjects added. |
| GET | `/api/topics/[id]` | — | topic, subjects, exposures, resources, edges, curricula with counts | |
| GET | `/api/topics/[id]/area` | — | `TopicArea` | What the topic sheet prints. `/api/topics/[id]` stays as it is: it answers the graph panel's question, and the two shapes differ on purpose. |
| GET | `/api/topics/pending` | — | `PendingTopic[]` | |
| GET | `/api/resources` | — | resources | |
| GET | `/api/curricula/[id]` | — | curriculum with lessons and prereqs | |
| GET | `/api/lessons/[id]` | — | lesson with body, `links`: the lessons it may point at, `sources`: the documents it may cite, and `neighbours`: the lessons either side of it in its route | `links` resolves the body's `lesson:` names at read time, so a reshaped route turns a link into a stub rather than a dead end. `neighbours` is `{ previous, next }`, each `{ id, title }` or null, derived from the route's position order for the way on at the foot of the reading. Neither side is gated on completion: nothing here is locked. `answered` maps `questionKey` → whether it was got right, for the questions in this lesson the owner has already answered; `{}` for a request with no owner. Both added, so a client that has never heard of either reads the lesson exactly as before. `sources` is `{ id, title, pageCount }` per document, resolved at read time for the same reason `links` is: a document taken off the shelf turns its citations into stubs rather than leaving them looking like citations that still reach something, and a page past `pageCount` is refused because a citation the writing agent invented reads exactly like one it did not. Additive too — a client that has never heard of it prints every citation as a stub, which is the honest reading for a client that cannot open one. |
| GET | `/api/highlights` | `q` | highlights, filtered when `q` is given | |
| GET | `/api/books/search` | `q` | `BookMatch[]` from Open Library | Falls back to nothing silently. |
| GET | `/api/settings` | — | nothing yet | **Planned (3).** Exists so the sheet has somewhere to grow. |

### Writing

| Method | Path | Body | Invalidates | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/subjects` | subject, roots, depth, confident, gaps, evidence, qualifiers | subjects, topics, resources | Sowing. Takes up to a minute; expect 504 sentences. The bed is laid out simplest-first and the order is kept on `topic_subjects.position` (`033`; the subject reader asks for the column and falls back to a read without it, because the web build and the migration are not one transaction). Answers `first: { id, title, curriculumId } \| null` — the most introductory topic in it, skipping anything `pending`, with whatever route it already carries. Additive; a client that has never heard of it sows exactly as before. The route and the first lesson are **not** written here: each is about as long as the sowing already was, and three of them in one function is a timeout with a subject half built behind it. |
| POST | `/api/subjects/qualify` | subject, roots, confident, depth | — | The 5–10 questions, in difficulty order. |
| DELETE | `/api/subjects/[id]` | — | subjects, topics | Grub out the bed. |
| POST | `/api/subjects/[id]/topics` | title | subjects, topics, pending | Add a topic to the bed, and place it in it. Answers `action`, `queriedBy` (which reading raised an adjudication), `placed` (edges drawn), `note`, `warnings`. |
| DELETE | `/api/subjects/[id]/topics` | topicId | subjects, topics | Grub a topic out. |
| POST | `/api/subjects/[id]/relate` | — | topics | Draw the bed's connections. |
| POST | `/api/subjects/[id]/resow` | — | subjects, topics | Lay the bed out again from its answers. Answers `first` exactly as the sowing does. |
| PATCH | `/api/topics/[id]` | title, summary, primary_subject_id, add_subject_ids, remove_subject_ids | subjects, topics, highlights | Curation only; never ability. |
| DELETE | `/api/topics/[id]` | — | subjects, topics, highlights | |
| PATCH | `/api/topics/pending` | topicId, action, mergeInto? | topics | Merge, split, keep. |
| POST | `/api/resources` | topicId?, kind, url?, title?, text? | resources, topics | Filing; never an exposure. |
| POST | `/api/resources/upload` | multipart: file, consumed? | resources, topics | The file passes through the function, so the platform's 4.5 MB request-body cap applies and the route now says so rather than advertising a ceiling it cannot keep. Kept for clients that have not been rebuilt; anything that might be a book goes through the two routes below. |
| POST | `/api/resources/upload-url` | filename, size?, contentType? | — | Permission to PUT straight into the bucket: answers `{ path, token, signedUrl }`. Writes no row, which is why it drops no tags — the shelf changes when the bytes land, not when the URL is signed. 415 for anything but a PDF, 413 over 50 MB. |
| POST | `/api/resources/uploaded` | path, filename, consumed? | resources, topics | The bytes landed; file them, read the document's structure, and queue the passages. The path is not taken on trust: it must be one of ours, carry the caller's own id, and have an object actually at it (400, then 404); the size is re-checked against the object rather than against what the client claimed. Answers `outline: { chapters, source, pageCount } \| null`, where `source` is `bookmarks | model | headings | none` — read here rather than on the queue because the queue is a once-a-minute cron and the reader is choosing a fidelity seconds later, so the answer always arrived after the question. `chapters: 0` is ordinary and not a failure: an article has none. |
| PATCH | `/api/resources/[id]` | status, depth | resources, topics, subjects | The consumed transition writes the exposure. |
| DELETE | `/api/resources/[id]` | — | resources, topics | |
| POST | `/api/resources/[id]/merge` | mergeId | resources, topics | Moves exposures; cannot be undone. |
| POST | `/api/curricula` | topicId, goal?, sourceResourceIds? | topics | Drafts with the agent. `curricula.draftAndOpen` composes this with `curricula.get` and `lessons.writeWhole` — draft a route through a topic and write its first lesson — so neither front end has to know the work does not fit in one request. |
| PATCH | `/api/curricula/[id]` | action, title, goal, shape, status, lessonOrder, prereqs | topics | Approve, reshape, archive. |
| DELETE | `/api/curricula/[id]` | — | topics | |
| POST | `/api/curricula/[id]/lessons` | title, summary, stage, position, estimated_minutes, requires, scaffolding | topics | |
| PATCH | `/api/lessons/[id]` | action, depth, title, summary, body, stage, position, estimated_minutes | topics, subjects | `action: 'complete'` at a depth is an exposure. |
| DELETE | `/api/lessons/[id]` | — | topics | |
| POST | `/api/lessons/[id]/body` | regenerate? | topics, on the last round only | Write **one round** of the lesson, or start again with `regenerate`. Answers `{ body, cached, done, round, words, warning? }`. A lesson takes longer to generate than the function is allowed to run, so each call writes what fits, saves it with `body_finished` false, and says whether to come back. Resumable: a call on a lesson with an unfinished body carries on from it. Capped at six rounds, after which the lesson is called finished where it stands and `warning` says so. Only the last round drops cache — until then `has_body` is still false and no sheet prints anything different. The loop over the rounds is composed as `lessons.writeWhole(id, report)`, so the cap and the progress wording exist once for three callers rather than three times. |
| POST | `/api/lessons/[id]/answers` | key, correct | topics, subjects | Answer a question inside the lesson. `key` is `questionKey` of the question's own text. Answers `{ counted, exposureWritten, topicTitle, abilityBefore, abilityAfter }`. Only the first answer to a question counts — enforced by a unique index, not a read, so two presses racing cannot both pay — and a wrong one writes no exposure. Invalidates only when a figure actually moved. |
| POST | `/api/refresher/[topicId]` | — | — | |
| POST | `/api/highlights` | lessonId, quote, prefix, note | highlights, topics | A mark is the lightest exposure. What the note names is indexed from the note. |
| GET | `/api/mentions` | `q` | — | What an `@` in a note could mean: topics and lessons the owner holds, ranked for typing. Empty `q` offers the most recent. |
| PATCH | `/api/highlights` | id, note | highlights | |
| DELETE | `/api/highlights` | id | highlights, topics | |

Body columns are the fields the routes destructure today; the route is
still the truth when they disagree. The typed signatures for all of them
now live in `@didactic/api` (Phase 2.6): one function per row above, each
returning `Result<T>` and never throwing on an HTTP error, with the tags
it drops registered in `ENDPOINTS`.

## Changing a route

The web replaces every client on deploy. A phone keeps running the build
it has. So:

1. **Add, do not rename.** A response may gain a field. It may not lose or
   rename one without a row in the *Deprecations* table below and one
   mobile release shipped that no longer reads it.
2. **A new required body field is a breaking change.** Give it a default
   for one release.
3. **New endpoint:** add the handler, the typed function in
   `@didactic/api` with its `invalidates`, the row above, and the
   `PARITY.md` row for whatever it serves, in one PR.
4. **Every write names what it moved.** `revalidateTag` in the handler
   and the same tags in `ENDPOINTS`. Erring wide is fine; forgetting one
   is a stale map on one platform.

## Deprecations

| Since | What | Stop reading it by | Removed |
| --- | --- | --- | --- |
| — | — | — | — |
