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
| GET | `/api/home` | — | `HomeData` | **Planned (2.3).** Same reader as the stock list page. |
| GET | `/api/graph` | — | topics, subjects, edges as the graph page assembles them | **Planned (2.3).** |
| GET | `/api/inbox` | — | `{ pending: PendingTopic[], queued: Resource[] }` | **Planned (2.3).** |
| GET | `/api/inbox/count` | — | `{ decisions, waiting, total }` | Counts on an index; cheap enough for a nav. |
| GET | `/api/library` | — | `LibraryRow[]` | **Planned (2.3).** |
| GET | `/api/subjects` | — | subjects | |
| GET | `/api/subjects/[id]` | — | subject with topics | |
| GET | `/api/subjects/[id]/area` | — | `SubjectArea` | **Planned (2.3).** The outline's data. |
| GET | `/api/subjects/[id]/sowing` | — | `Sowing` | **Planned (2.3).** The reading's data. |
| GET | `/api/topics` | — | topics | |
| GET | `/api/topics/[id]` | — | topic, subjects, exposures, resources, edges, curricula with counts | |
| GET | `/api/topics/[id]/area` | — | `TopicArea` | **Planned (2.3).** What the topic sheet prints. |
| GET | `/api/topics/pending` | — | `PendingTopic[]` | |
| GET | `/api/resources` | — | resources | |
| GET | `/api/curricula/[id]` | — | curriculum with lessons and prereqs | |
| GET | `/api/lessons/[id]` | — | lesson with body, and `links`: the lessons it may point at | `links` resolves the body's `lesson:` names at read time, so a reshaped route turns a link into a stub rather than a dead end. |
| GET | `/api/highlights` | `q` | highlights, filtered when `q` is given | |
| GET | `/api/books/search` | `q` | `BookMatch[]` from Open Library | Falls back to nothing silently. |
| GET | `/api/settings` | — | nothing yet | **Planned (3).** Exists so the sheet has somewhere to grow. |

### Writing

| Method | Path | Body | Invalidates | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/subjects` | subject, roots, depth, confident, gaps, evidence, qualifiers | subjects, topics, resources | Sowing. Takes up to a minute; expect 504 sentences. |
| POST | `/api/subjects/qualify` | subject, roots, confident, depth | — | The 5–10 questions, in difficulty order. |
| DELETE | `/api/subjects/[id]` | — | subjects, topics | Grub out the bed. |
| POST | `/api/subjects/[id]/topics` | title | subjects, topics | Add a topic to the bed. |
| DELETE | `/api/subjects/[id]/topics` | topicId | subjects, topics | Grub a topic out. |
| POST | `/api/subjects/[id]/relate` | — | topics | Draw the bed's connections. |
| POST | `/api/subjects/[id]/resow` | — | subjects, topics | Lay the bed out again from its answers. |
| PATCH | `/api/topics/[id]` | title, summary, primary_subject_id, add_subject_ids, remove_subject_ids | subjects, topics, highlights | Curation only; never ability. |
| DELETE | `/api/topics/[id]` | — | subjects, topics, highlights | |
| PATCH | `/api/topics/pending` | topicId, action, mergeInto? | topics | Merge, split, keep. |
| POST | `/api/resources` | topicId?, kind, url?, title?, text? | resources, topics | Filing; never an exposure. |
| POST | `/api/resources/upload` | multipart: file, consumed? | resources, topics | |
| PATCH | `/api/resources/[id]` | status, depth | resources, topics, subjects | The consumed transition writes the exposure. |
| DELETE | `/api/resources/[id]` | — | resources, topics | |
| POST | `/api/resources/[id]/merge` | mergeId | resources, topics | Moves exposures; cannot be undone. |
| POST | `/api/curricula` | topicId, goal?, sourceResourceIds? | topics | Drafts with the agent. |
| PATCH | `/api/curricula/[id]` | action, title, goal, shape, status, lessonOrder, prereqs | topics | Approve, reshape, archive. |
| DELETE | `/api/curricula/[id]` | — | topics | |
| POST | `/api/curricula/[id]/lessons` | title, summary, stage, position, estimated_minutes, requires, scaffolding | topics | |
| PATCH | `/api/lessons/[id]` | action, depth, title, summary, body, stage, position, estimated_minutes | topics, subjects | `action: 'complete'` at a depth is an exposure. |
| DELETE | `/api/lessons/[id]` | — | topics | |
| POST | `/api/lessons/[id]/body` | regenerate? | — | Write, or write again. |
| POST | `/api/refresher/[topicId]` | — | — | |
| POST | `/api/highlights` | lessonId, quote, prefix, note | highlights, topics | A mark is the lightest exposure. |
| PATCH | `/api/highlights` | id, note | highlights | |
| DELETE | `/api/highlights` | id | highlights, topics | |

Body columns are the fields the routes destructure today; the route is
still the truth when they disagree. Phase 2.5 replaces this table's
body columns with the client's typed signatures.

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
