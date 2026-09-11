# Parity record

The one place that says where every feature stands on each platform. A
feature is not finished until its row here is right, and a row is changed
in the same commit as the code that changes it.

**Mobile runtime:** not yet scaffolded. When Phase 4 lands, record the Expo
SDK and React Native versions here.

**Shared packages, as at 2026-09-11:** `@didactic/core` (24 modules) and
`@didactic/tokens` exist and are read by `apps/web`. The *Shared via*
column below names where a row's logic will live; for rows whose module
has shipped, it now names something real rather than something planned.

## Status words

| Word | Meaning |
| --- | --- |
| `built` | Shipped and working on that platform. |
| `partial` | Shipped with a stated gap. The gap is in the Notes column, not implied. |
| `planned (n)` | Not built; scheduled for Phase *n* of `PLAN.md`. |
| `n/a` | Deliberately absent on that platform, with the reason in Notes. |

The *Shared via* column names the package module that both platforms read,
or `—` when a row is rendering only.

## Surfaces

| Address | Surface | Web | Mobile | Shared via | Notes |
| --- | --- | --- | --- | --- | --- |
| `/enter` | Entry sheet | built | planned (4) | `api/auth` types | Phone signs in against Supabase directly; no claim flow on the phone. |
| `/` | Stock list | built | planned (4) | `core/shapes.HomeData`, `core/scoring`, `core/stock`, `core/specimens`, `core/copy.editionDate` | Margin blocks stack under the list on the phone (always below 60rem). |
| `/graph` | The bed | built (Sigma) | planned (6) | `core/graph` encoding and layout constants | Skia + graphology on the phone. Panel is a bottom sheet on both below 40rem. |
| `/library` | Library | built | planned (5) | `core/shapes.LibraryRow`, `core/config.DUPLICATE_RESOURCE` | Duplicate offer and merge included. |
| `/marked` | Marked | built | planned (5) | `core/shapes` highlight rows, `core/sections` | Note reader renders markdown natively. |
| `/inbox` | Inbox | built | planned (5) | `core/shapes.PendingTopic`, `core/copy.LABOURS` | First mobile sheet after the stock list. |
| `/subjects/new` | Sow a subject | built | planned (5) | `core/specimens` roots geometry, stage names; `core/books` | Roots gauge is a native slider driving the shared specimen. PDF proof via document picker. |
| `/subjects/[id]` | Subject bed (outline) | built | planned (5) | `core/tree.buildTopicTree`, `core/outline`, `core/progress` | Grub out, add topic, relate, resow. |
| `/subjects/[id]/reading` | The reading | built | planned (5) | `core/tree.readVerdict`, `core/specimens` | Two plates at the same size in the subject's ink. |
| `/settings` | Settings | planned (3) | planned (4) | — | Holds Close to begin with; a sheet that can grow. |
| `/topics/[id]` | Topic | built | planned (5) | `core/shapes.TopicArea`, `core/scoring.viabilityFigure`, `core/stock`, `core/progress`, `core/lessonState` | Band in the subject's own plate ink. Lessons carry a standing stamp and the route's *Up next* mark. |
| `/curriculum/[id]` | Curriculum | built | planned (5) | `core/curriculum.viewLessons`, `tierLessons` | Ultramarine band on both. |
| `/lesson/[id]` | Lesson | built | planned (5) | `reader` (the whole body), `core/blocks`, `core/sections` | The body is the same reader on both, in a WebView on the phone. |
| `/refresher/[topicId]` | Refresher | built | planned (5) | `reader` | Eyebrowless on both. |

## Capabilities

| Capability | Web | Mobile | Shared via | Notes |
| --- | --- | --- | --- | --- |
| Session: sign in, stay signed in, close | built (cookies and bearer) | planned (4) | `api/client` header provider | The gate takes either; the phone sends `Authorization: Bearer <jwt>` and is never redirected or refreshed server-side. |
| Foot bar (five sheets + Settings, with glyphs) | planned (3) | planned (4) | `core/specimens` glyph paths, `tokens.footBar`, the same six addresses | Replaces the running head's sheet links on both. Word under every glyph. |
| Running head: back, Sow | built (with sheet links and Close) | planned (4) | — | Slims to two items in Phase 3; Close moves to Settings. |
| Inbox tally on the inbox link | built | planned (4) | `api/inbox.count` | Stamped mustard on ink, same wording. |
| Filed-under line | built | planned (5) | — | A breadcrumb or nothing; never invented. |
| Viability figure, with *about* under 0.4 confidence | built | planned (4) | `core/scoring.viabilityFigure` and the confidence rule | Italic, dimmed, caveat sentence, on both. |
| Condition bar: hatch, word, label | built | planned (4) | `core/stock` | Three carriers on both; colour is the fourth. |
| Emblems | built | planned (4) | `core/specimens` silhouettes | `react-native-svg` on the phone. Forms must read at 48px on both. |
| Roots gauge and specimen | built | planned (5) | `core/specimens` geometry, stage names | Stroke drawn on through dash offset on both. |
| Route progress chip and specimen | built | planned (5) | `core/progress` | Word is the carrier; tick and colour redundant. |
| Lesson standing stamp, and *Up next* | built | planned (5) | `core/lessonState` | The route chip's question asked one level down: **Not written**, **Ready**, **Started**, **Worked**, least-worked first, on the route chip's own colour ladder. Word is the carrier; tick and colour redundant. `started` rests on marks, which under-reports by construction, so *Up next* — the first unworked lesson in the route — is what answers "where am I", from position and completion alone. A draft route has no next. `has_body` is a stored generated column (026), so the sheet never carries sixteen lesson bodies to print one bit each. |
| Add a resource: link, book, note | built | planned (5) | `api/resources.add`, `api/books.search` | One field and one press for a link. |
| Share a URL into the inbox from another app | n/a (browser share target not built) | planned (5) | `api/resources.add` | The phone's reason to exist. A web share target is a possible follow-up. |
| Upload a PDF | built | planned (5) | `api/resources.upload` | Multipart on both. |
| Mark a resource consumed at a depth | built | planned (5) | `api/resources.patch`, `core/config.DEPTH_WEIGHTS` | |
| Adjudicate pending topics | built | planned (5) | `api/topics.decide` | Merge, split, keep. |
| Add a topic by name, placed in the bed it was added to | built | planned (5) | `api/subjects.topics` | Two readings: the resolver against the whole map, then an LLM sort against this bed, which draws the edges that put it under something. The sort may raise an adjudication and may never settle one. |
| Sow: qualifying questions answered during the form | built | planned (5) | `api/subjects.qualify` | |
| Draft, reshape, approve a curriculum | built | planned (5) | `api/curricula`, `core/curriculum` | |
| Write a lesson body; write it again | built | planned (5) | `api/lessons.writeBody`, `core/copy.WRITINGS` | Written on first open, and askable from the topic sheet for any lesson standing at **Not written** — two presses, because it is a minute of compute that cannot be taken back. The reader need not watch it; the body is stored on the row and the sheet re-reads when it lands. The tab has to stay open, because the body is saved in one piece at the end. |
| Complete a lesson at a depth | built | planned (5) | `api/lessons.patch` | |
| Lesson blocks: chart, check, compare, steps, flow, picture | built (SVG + DOM) | planned (5) | `reader` | The same components inside the reader; every plot ships its figures on both. |
| Contents band | built | planned (5) | `reader`, `core/sections` | One column on the phone. Travelling to a section writes the hash without a navigation; see `lib/hash.ts`. |
| Lesson links out to other lessons | built | planned (5) | `reader`, `core/lessonLinks` | Named `lesson:<slug>` in the body, resolved when it is read against the topic and the topics its subjects hold. |
| The way on at the foot of a lesson | built | planned (5) | `core/lessonState.lessonNeighbours` | Previous on the left, next on the right, each naming the lesson it goes to. Past the reading and past saying how it went, which is the order the two happen in. Neither side is gated on completion — nothing here is locked, and a lesson that builds on uncovered ground says so at its own top instead. `neighbours` on `lessons.get`, derived from the route's position order. A native stack header gives the phone the back half; the forward half is the sheet's own. |
| A named lesson that does not exist prints as a stub | built | planned (5) | `core/lessonLinks` | Faint ink and a dotted rule, no href, `title` saying so. Colour is not the carrier. |
| Marks: draw kept passages onto the prose | built (DOM walk) | planned (5) | `reader/paintMarks` | The same walker, in the WebView. Removing a mark takes the wash off the words on the press, from the panel and the list alike: both go through one removal that holds the id in `gone` until the sheet has caught up, or the next repaint draws the removed mark straight back. |
| Marks: select any range and keep it, across elements | built | planned (5) | `reader/Highlighter` | Full parity through the reader (D9). The per-paragraph native fallback would be `partial` and is not the plan. |
| Marks: a note on the lesson with no passage | built | planned (5) | — | *A note on this lesson* wording shared. |
| Marks: name a topic or a lesson in a note with `@` | built | planned (5) | `core/mentions`, `core/mentionSearch` | Suggestions as you type, from `api/mentions`. What is chosen is written in as a link to that thing's own address, so it needs no scheme and survives the editor's round trip. |
| Marks on the bed, with what they are about | built | planned (6) | `core/graphMarks` | A layer like material and lessons, off until asked for. Two kinds of line: faint to the topic it was marked in, stronger to everything the note names. Newest 500. |
| Marks: the list beside the reading, in the lesson's order | built | planned (5) | `reader/MarkList`, `core/marks.inReadingOrder` | `DESIGN.md` *The marks beside the reading*. Sorted by where `paintMarks` landed each mark, never by when it was kept. Pressing a passage travels to it. On a phone it is over the reading and puts itself away first; the swipe that opens it is the WebView's to carry (D9). |
| Note editor with bold, italic, lists | built (`execCommand`) | planned (5) | `reader/NoteEditor` | The same editor, inside the reader; the soft keyboard is the native side's to handle. |
| Refresher generation | built | planned (5) | `api/refresher.write` | |
| Grub out a subject or topic; delete flows | built | planned (5) | `core/copy` confirmation wording | |
| Deep links to any address | built (they are URLs) | planned (4) | the address table in `ARCHITECTURE.md` §6 | Universal links on the web origin. |
| Realtime: tally and inbox refresh when an ingestion lands | n/a (the web refetches on navigation) | planned (5) | `api/endpoints` tags | Scoped by RLS; a signal to refetch, never a source of truth. |
| Direct row reads from Supabase | n/a | none yet | — | Now enforced by RLS rather than only permitted by it. Allowed per row with a reason; the API is the default. Add a row per read taken. |
| Galley loading states | built | planned (4) | — | Same three shapes: prose, rows, panel. |
| Motion: sheet and band arrive, feedback on controls | built | planned (4) | `tokens.motion`, `tokens.ease` | Reanimated on the phone; no reduced-motion guard on either, by decision. |
| Scroll memory across navigation | built | planned (5) | — | Native stacks keep it by construction. |
| Variable-font axes SOFT / WONK / opsz | built | partial | `reader` fonts | Available inside the reader (a browser engine), so the lesson body has them; the native sheets use static optical-size cuts. See `guides/styling-on-mobile.md`. |
| Paper tooth texture | built | planned (4) | — | Tiled image or Skia shader; must read as threads, not noise. |
| Dark mode | n/a | n/a | — | By construction, `DESIGN.md` §1. |
| Reduced-motion guard | n/a | n/a | — | By decision, `DESIGN.md` §7. |

## Backend

| Item | Status | Notes |
| --- | --- | --- |
| Supabase project, migrations, edge functions | shared, unchanged | `supabase/` stays at the repo root. |
| API routes as the backend for both | built | `guides/api-contract.md`. Cookie or bearer, both verified in `getOwner()`. |
| Row-level security on every table | built; applied per project | `024_row_level_security.sql`: all 18 tables under `public`, owner policy on the nine carrying `user_id` (`highlights` kept its own from 020), join tables through their parent. Storage's `resources` bucket joins back through `resources.storage_path`, because upload paths carry no owner id. Service role unaffected. Every step is idempotent, because a project that was already live when this was written takes it by hand: a migration in the tree is not a migration on a database, and this one was found missing on the remote project while the local stack had it. Check with a publishable-key `select` on `topics` — it must return nothing. |
| Realtime publication for `resources` and `topics` | built | For the phone's tally and inbox. A publication is not a grant: RLS still decides what a subscriber sees. |
| Read endpoints for server-rendered sheets | built | `/api/home`, `/api/library`, `/api/inbox`, `/api/graph`, `…/area`, `…/sowing`. |
| Server cache held until invalidated | built | The six `use cache` readers in `src/lib` run the `held` profile from `next.config.ts`: a year's `revalidate`, no expiry, so only `revalidateTag` re-reads the database. Safe because every mutating route drops its tags, which `tests/cache-invalidation.test.ts` enforces both ways — a write that drops nothing fails, and so does a cached reader that states no lifetime. `stale` stays at five minutes: it governs the browser's own router cache, which no tag can reach. The phone's query cache should hold on the same terms. |
| Typed API client (`@didactic/api`) | built | One function per route, `Result<T>` from `readJson`, never throws on an HTTP error. `ENDPOINTS` names the tags each write drops, read by the server cache and the phone's query cache both. `mentions.search` is the one read asked on a keystroke; it drops a stale answer rather than aborting, because the client takes no signal and a menu only needs the newest. |
| Scoring maths in the Deno edge functions | none duplicated | Checked at 2.8: neither function holds any. `embed` runs gte-small and answers a vector; `ingest` claims a queue message and calls `/api/internal/ingest`, where the maths already lives. A Deno import map at `packages/core/src` is only needed if one ever computes a figure of its own. |

## How to change this file

1. Find the row. If there is none, the feature is new: add a row with both
   platforms' status before writing code.
2. Move the status in the same commit as the code.
3. `partial` and `n/a` carry a reason in Notes, always.
4. Never leave a `planned` row pointing at a phase that has closed.
