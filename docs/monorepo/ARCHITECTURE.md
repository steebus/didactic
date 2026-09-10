# Architecture: the shape the monorepo takes

This describes the target, not the present. `PLAN.md` says how the present
becomes it. Where a paragraph describes something that already exists in
the web app, it says so.

## 1. Three layers, one direction

```
                 apps/web (Next.js)            apps/mobile (Expo)
                 ───────────────────           ──────────────────
  render         CSS modules, DOM, RSC         React Native, react-native-svg, Skia
                        │                              │
  reading        @didactic/reader (React DOM) ◄────────┤  in a WebView, for the lesson body
                        │                              │
  client         @didactic/api ◄───────────────────────┘  writes and aggregated reads
                        │                              │
                        │              Supabase Realtime, RLS-scoped row reads ◄┘
                        │
  shared logic   @didactic/core, @didactic/tokens
                        │
  server         apps/web/src/lib (auth, supabase, llm, ingest, sowing, scoring writes)
                 apps/web/src/app/api/*  ◄──── both apps call these
                        │
  backend        Supabase: Postgres (RLS on every table), pgvector, Auth, Storage, pgmq, edge functions
```

Dependencies point down and never up. `core` and `tokens` import nothing
from an app or from `api`. `api` imports types from `core`. Each app imports
all three. The server code stays inside `apps/web` because the API *is* the
web app's route handlers; it is not a fourth package until something other
than Next needs to host it.

## 2. What "shared" means here

Shared means one source file, imported by both apps, tested once. It does
not mean one rendered component. The line is drawn at the point where DOM
and native stop being the same thing:

| Shared (packages) | Per platform (apps) |
| --- | --- |
| Types for every row and every API response | How a row is laid out |
| Ability, freshness, viability, route progress, the outline order | The stock row, the outline's rules and ticks |
| The state words: `STOCK_LABEL`, `ROUTE_LABEL`, stage names, the *about* rule | The condition bar's SVG element vs `react-native-svg` |
| Hatch parameters, specimen path data, emblem silhouettes, graph encoding | The drawing that uses them |
| Markdown block extraction (`parseBlocks`), sections, contents | — (the reader renders both) |
| The reader: prose, marks, the four blocks, contents, the note editor (`@didactic/reader`, React DOM) | Mounted in the page on web; mounted in a WebView on native, with the sheet's band and foot native |
| Copy: labour phrases, edition date format, empty-state sentences, confirmation wording | Where on the sheet it prints |
| Design tokens as values | CSS custom properties on web; style objects on native |
| The API client and what each call invalidates | Cookies on web, bearer on native; the router cache on web, TanStack Query on native |
| — | Realtime subscriptions on native only, scoped by RLS to the owner's rows |

Three rules keep the line honest:

1. **A number, a word or a shape that both apps print comes from `core`.**
   If a web component computes something inline that the phone would also
   need, the extraction is part of the phone's task, not a later cleanup.
2. **`core` has no platform.** No `next`, `react`, `react-native`, DOM
   globals, `dompurify`, `jsdom` or a live `@supabase/*` client. Type
   imports are fine. An ESLint rule enforces it in the package.
3. **A hook in a package is a peer of React, never a dependency.** D5 in
   `PLAN.md`. `reader` is the one package that is React DOM through and
   through, and it takes `react` and `react-dom` as peers for the same
   reason.

## 3. Packages

### `@didactic/core`

```
packages/core/src/
  index.ts          re-exports
  types.ts          rows and enums (from apps/web/src/lib/types.ts)
  config.ts         thresholds, weights, ceiling, half-life
  tags.ts           cache tag names
  scoring.ts        computeAbility, computeFreshness, subjectAggregate, viabilityFigure
  progress.ts       routeProgress, aggregateRoutes, ROUTE_LABEL, routeLevel, routeCaption
  outline.ts        orderSubjectOutline
  tree.ts           buildTopicTree, readVerdict (the pure half of subject.ts)
  curriculum.ts     viewLessons, tierLessons, curriculumProgress, findPrereqCycle, linearPrereqs
  sections.ts       headings, ids, contents
  blocks.ts         parseBlocks and the four block payload types
  stock.ts          stockState, STOCK_LABEL, HATCH (from StockBar.tsx)
  specimens.ts      emblem silhouettes by slug, slugify, roots specimen geometry and stage names
  graph.ts          nodeSize, fade, labelInk, labelSide, layout constants
  books.ts          normaliseBooks, bookNote
  markAnchor.ts     panelSpot, pinSpot
  http.ts           readJson
  copy.ts           LABOURS, DRAWINGS, editionDate, sentences both apps print
  shapes.ts         HomeData, SubjectArea, TopicArea, LibraryRow, PendingTopic, Sowing (response shapes)
packages/core/tests/  the tests those modules have today, moved with them
```

What stays in `apps/web/src/lib`: `auth.ts`, `auth-paths.ts`, `supabase.ts`,
the `get…`/`read…` readers (`home.ts`, `subject.ts`, `topic.ts`,
`library.ts`, `pending.ts`) because they hold a Supabase client and a
`cacheTag`, `highlights.ts`, `consume.ts`, `ingest.ts`, `sowing.ts`,
`resolver.ts`, `embedding.ts`, `extract/*`, `llm/*`, `markdown.ts` (DOM
purifier), `richText.ts` (DOM serialiser), `paintMarks.ts` (DOM walker),
`useScrollMemory.ts` (window), and the write halves of `scoring.ts` and
`curriculum.ts`.

### `@didactic/tokens`

```
packages/tokens/src/index.ts
  colour.paper, colour.ink, colour.plate.green …   hex strings
  scale['-2'] … scale[4]                           { rem: number, px: number } (step-4 carries its clamp bounds)
  space[1..6]                                      { rem, px }
  motion.feedback | state | settle                 ms
  ease.settle | exit                               cubic-bezier arrays
  reversed                                         [0.7, 0.75, 0.85, 0.88, 0.9]
  plates                                           ['green','terracotta','mustard','ultramarine','plum','olive']
  graph                                            unfiledSeed, edge, membershipEdge, label, labelDormant
  footBar                                          { height: { rem, px } }
packages/tokens/tests/agree.test.ts   parses globals.css :root and asserts agreement
```

The CSS stays the web's source of truth for the web; the module is the
phone's. The test is what makes them one system.

### `@didactic/api`

```
packages/api/src/
  client.ts     createApi({ baseUrl, headers?: () => Promise<Record<string,string>> })
  endpoints.ts  ENDPOINTS: { name, method, path, invalidates: Tag[] }
  home.ts       home()                                       GET  /api/home
  subjects.ts   list, sow, area, sowing, remove, addTopic, removeTopic, relate, resow, qualify
  topics.ts     list, get, area, patch, remove, pending, decide
  resources.ts  list, add, upload, patch, remove, merge
  curricula.ts  create, get, patch, remove, addLesson
  lessons.ts    get, patch, remove, writeBody
  highlights.ts list, create, patch, remove
  inbox.ts      count(), read()
  books.ts      search(q)
  refresher.ts  write(topicId)
  graph.ts      read()
  settings.ts   (nothing yet; the sheet exists so it can grow)
  auth.ts       signIn, signOut, claim   (web only; the phone signs in against Supabase directly)
```

Every function returns `Promise<Result<T>>` where `Result` is what
`readJson` gives back today: `{ ok, status, body, error }`. Nothing throws
on an HTTP error, because the sentences in `http.ts` are the ones the user
should see.

### `@didactic/reader`

```
packages/reader/src/
  Prose.tsx, Highlighter.tsx, Contents.tsx, NoteEditor.tsx, NoteText.tsx
  blocks/ Block, Chart, Check, Compare, Steps
  markdown.ts, richText.ts, paintMarks.ts
  index.ts            what apps/web imports
packages/reader/embed/
  main.tsx            mounts the reader on document.body and speaks the message protocol
  protocol.ts         the message types, exported for the native side
  fonts/              Fraunces variable and Archivo, inlined at build
packages/reader/dist/reader.html   one file, built by Vite, copied into apps/mobile/assets
```

The message protocol, both ways, is the whole native surface of the
reader: in, `load { body, marks, allowed, topicId }`; out, `height`,
`select { quote, prefix, rect }`, `mark { quote, prefix, note }`, `edit {
id, note }`, `delete { id }`, `open { href }`. The native lesson sheet
turns `mark`, `edit` and `delete` into `@didactic/api` calls and posts the
resulting mark list back with another `load`. Nothing in the reader knows
it is on a phone except the class the embed sets on `<html>`.

## 4. Auth, and who may read what

Two ways of proving who is asking, one account either way.

**Web (exists).** `@supabase/ssr` cookies. `proxy.ts` refreshes the token
on every request and turns unauthenticated traffic away; `getOwner()`
verifies with `auth.getUser()`.

**Mobile (Phase 2.4 + 4.3).** The phone signs in against Supabase Auth
directly with the anon key (`signInWithPassword`), keeps the session in
device storage through supabase-js's storage adapter, and refreshes it
itself. Every API call carries `Authorization: Bearer <access_token>`.
On the server, `getOwner()` sees the header and verifies the token with
`auth.getUser(token)` on an anon client; `proxy.ts` lets a bearer API
request through to the handler rather than redirecting it, and answers 401
itself when the token is bad. There is no claim flow on the phone: the
catalogue is claimed once, from the web.

**Row-level security (Phase 2.5).** Every table has RLS on with an owner
policy; the join tables reach their owner through the parent row. The web
and the edge functions use the service role and are unaffected. The phone's
supabase-js client, carrying the owner's token, may therefore read rows
directly and subscribe to Realtime, and gets nothing without the token.
Writes still go through the API without exception: a write has side
effects the server owns. Which reads go direct is a per-row decision in
`PARITY.md`; the default is the API.

The owner id every write is stamped with still comes from the verified
session, never from the request body (`PRODUCT.md`, *The account is also
the owner id*).

## 5. Caching, on both sides

**Server (exists).** `'use cache'` readers tagged with `tags.*`; every
route that writes calls `revalidateTag` for what it moved. Mobile writes go
through the same routes, so the web's cache is dropped by a phone's write
exactly as by a browser's.

**Web client (exists).** The router cache with `staleTimes`; writes call
`router.refresh()`.

**Mobile client (Phase 4).** TanStack Query with query keys `[tag, …]`.
`@didactic/api`'s `ENDPOINTS` says which tags each write invalidates, and
the phone's mutation wrapper invalidates those keys. One table of
invalidations, read by both caches, so a write cannot be forgotten on one
platform and remembered on the other.

**Realtime (Phase 5).** A change on `resources` or `topics` arriving over
Realtime invalidates the same tags a write to them would, so an ingestion
finishing on the server refreshes the tally and the inbox on the phone
without a poll. Realtime is a signal to refetch, never a second source of
truth.

## 6. Routes are addresses, and the same on both

| Address | Web | Mobile (Expo Router) |
| --- | --- | --- |
| `/` | `app/page.tsx` | `app/(sheets)/index.tsx` |
| `/graph` | `app/graph/page.tsx` | `app/(sheets)/graph.tsx` |
| `/library` | `app/library/page.tsx` | `app/(sheets)/library.tsx` |
| `/marked` | `app/marked/page.tsx` | `app/(sheets)/marked.tsx` |
| `/inbox` | `app/inbox/page.tsx` | `app/(sheets)/inbox.tsx` |
| `/enter` | `app/enter/page.tsx` | `app/enter.tsx` |
| `/subjects/new` | `app/subjects/new/page.tsx` | `app/subjects/new.tsx` |
| `/subjects/[id]` | `app/subjects/[id]/page.tsx` | `app/subjects/[id]/index.tsx` |
| `/subjects/[id]/reading` | `app/subjects/[id]/reading/page.tsx` | `app/subjects/[id]/reading.tsx` |
| `/settings` | `app/settings/page.tsx` | `app/(sheets)/settings.tsx` |
| `/topics/[id]` | `app/topics/[id]/page.tsx` | `app/topics/[id].tsx` |
| `/curriculum/[id]` | `app/curriculum/[id]/page.tsx` | `app/curriculum/[id].tsx` |
| `/lesson/[id]` | `app/lesson/[id]/page.tsx` | `app/lesson/[id].tsx` |
| `/refresher/[topicId]` | `app/refresher/[topicId]/page.tsx` | `app/refresher/[topicId].tsx` |

The `(sheets)` group is the six sheets the foot bar carries; everything
else is pushed on top of them with the band's back link as the way back.
A universal link to the web origin opens the same address in the app.

## 7. Environments

| Variable | Web | Mobile | Note |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` | yes | yes | Same project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | yes | Auth only, on the phone. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **never** | Server only. |
| `ANTHROPIC_API_KEY` | yes | **never** | Server only. |
| `EXPO_PUBLIC_API_URL` | – | yes | The Vercel origin, or a LAN address in development. |

`EXPO_PUBLIC_*` values are compiled into the binary and are public by
definition; the table is the list of what is allowed to be.

## 8. Testing

| Layer | Runner | Where |
| --- | --- | --- |
| `core`, `tokens`, `api` | Vitest | `packages/*/tests` |
| `reader` | Vitest with jsdom (the highlighter and mark-paint tests as today) | `packages/reader/tests` |
| Web unit and integration | Vitest (as today, with the local Postgres) | `apps/web/tests` |
| Web surface | Screenshots in the PR, `.impeccable` critique | `apps/web/.impeccable` |
| Mobile components | `jest-expo` + React Native Testing Library, for the prose renderer and the bar | `apps/mobile/__tests__` |
| Mobile flows | Maestro: sign in, share a link, mark consumed | `apps/mobile/.maestro` |

`vitest.workspace.ts` at the root runs the Vitest projects together;
Turborepo runs the rest.

## 9. Deployment

- **Web:** Vercel, Root Directory `apps/web`, builds from `main` as today.
- **Edge functions:** unchanged workflow, unchanged path filter.
- **Mobile JS:** `eas update` on push to `main` touching `apps/mobile/**`
  or `packages/**`; the reader bundle is rebuilt first, so a reader change
  reaches phones the same way.
- **Mobile native:** `eas build` on a `mobile-v*` tag; submitted by hand.

A change that touches `packages/api` or a route's response shape ships to
the web first and the phone second, and is additive (D10).
