# Parity record

The one place that says where every feature stands on each platform. A
feature is not finished until its row here is right, and a row is changed
in the same commit as the code that changes it.

**Mobile runtime:** not yet scaffolded. When Phase 4 lands, record the Expo
SDK and React Native versions here.

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
| `/topics/[id]` | Topic | built | planned (5) | `core/shapes.TopicArea`, `core/scoring.viabilityFigure`, `core/stock`, `core/progress` | Band in the subject's own plate ink. |
| `/curriculum/[id]` | Curriculum | built | planned (5) | `core/curriculum.viewLessons`, `tierLessons` | Ultramarine band on both. |
| `/lesson/[id]` | Lesson | built | planned (5) | `core/blocks`, `core/sections`, `core/markAnchor` | See *Marks* below for the gap. |
| `/refresher/[topicId]` | Refresher | built | planned (5) | `core/blocks`, `core/sections` | Eyebrowless on both. |

## Capabilities

| Capability | Web | Mobile | Shared via | Notes |
| --- | --- | --- | --- | --- |
| Session: sign in, stay signed in, close | built (cookies) | planned (4) | `api/client` header provider | Bearer path in the gate is Phase 2.4. |
| Foot bar (five sheets) | planned (3) | planned (4) | `tokens.footBar`, the same five addresses | Replaces the running head's sheet links on both. |
| Running head: back, Sow, Close | built (with sheet links) | planned (4) | — | Slims to three items in Phase 3. |
| Inbox tally on the inbox link | built | planned (4) | `api/inbox.count` | Stamped mustard on ink, same wording. |
| Filed-under line | built | planned (5) | — | A breadcrumb or nothing; never invented. |
| Viability figure, with *about* under 0.4 confidence | built | planned (4) | `core/scoring.viabilityFigure` and the confidence rule | Italic, dimmed, caveat sentence, on both. |
| Condition bar: hatch, word, label | built | planned (4) | `core/stock` | Three carriers on both; colour is the fourth. |
| Emblems | built | planned (4) | `core/specimens` silhouettes | `react-native-svg` on the phone. Forms must read at 48px on both. |
| Roots gauge and specimen | built | planned (5) | `core/specimens` geometry, stage names | Stroke drawn on through dash offset on both. |
| Route progress chip and specimen | built | planned (5) | `core/progress` | Word is the carrier; tick and colour redundant. |
| Add a resource: link, book, note | built | planned (5) | `api/resources.add`, `api/books.search` | One field and one press for a link. |
| Share a URL into the inbox from another app | n/a (browser share target not built) | planned (5) | `api/resources.add` | The phone's reason to exist. A web share target is a possible follow-up. |
| Upload a PDF | built | planned (5) | `api/resources.upload` | Multipart on both. |
| Mark a resource consumed at a depth | built | planned (5) | `api/resources.patch`, `core/config.DEPTH_WEIGHTS` | |
| Adjudicate pending topics | built | planned (5) | `api/topics.decide` | Merge, split, keep. |
| Sow: qualifying questions answered during the form | built | planned (5) | `api/subjects.qualify` | |
| Draft, reshape, approve a curriculum | built | planned (5) | `api/curricula`, `core/curriculum` | |
| Write a lesson body; write it again | built | planned (5) | `api/lessons.writeBody` | |
| Complete a lesson at a depth | built | planned (5) | `api/lessons.patch` | |
| Lesson blocks: chart, check, compare, steps | built (SVG + DOM) | planned (5) | `core/blocks` payload types | Chart through `react-native-svg`; every plot ships its figures on both. |
| Contents band | built | planned (5) | `core/sections` | One column on the phone. |
| Marks: draw kept passages onto the prose | built (DOM walk) | planned (5) | quote matching in `core` (to extract from `paintMarks.ts`) | Native `Text` runs split at the quote. |
| Marks: select any range and keep it | built | planned (6), expected `partial` | — | D9: paragraph or sentence selection first. Record the gap here when it ships. |
| Marks: a note on the lesson with no passage | built | planned (5) | — | *A note on this lesson* wording shared. |
| Note editor with bold, italic, lists | built (`execCommand`) | planned (5) | markdown stays the stored form | Native editor writes markdown; same short allowlist. |
| Refresher generation | built | planned (5) | `api/refresher.write` | |
| Grub out a subject or topic; delete flows | built | planned (5) | `core/copy` confirmation wording | |
| Deep links to any address | built (they are URLs) | planned (4) | the address table in `ARCHITECTURE.md` §6 | Universal links on the web origin. |
| Galley loading states | built | planned (4) | — | Same three shapes: prose, rows, panel. |
| Motion: sheet and band arrive, feedback on controls | built | planned (4) | `tokens.motion`, `tokens.ease` | Reanimated on the phone; no reduced-motion guard on either, by decision. |
| Scroll memory across navigation | built | planned (5) | — | Native stacks keep it by construction. |
| Variable-font axes SOFT / WONK / opsz | built | n/a | — | Not available natively; static optical-size cuts stand in. See `guides/styling-on-mobile.md`. |
| Paper tooth texture | built | planned (4) | — | Tiled image or Skia shader; must read as threads, not noise. |
| Dark mode | n/a | n/a | — | By construction, `DESIGN.md` §1. |
| Reduced-motion guard | n/a | n/a | — | By decision, `DESIGN.md` §7. |

## Backend

| Item | Status | Notes |
| --- | --- | --- |
| Supabase project, migrations, edge functions | shared, unchanged | `supabase/` stays at the repo root. |
| API routes as the backend for both | built for web; bearer auth planned (2) | `guides/api-contract.md`. |
| Read endpoints for server-rendered sheets | planned (2) | `/api/home`, `/api/library`, `/api/inbox`, `/api/graph`, `…/area`, `…/sowing`. |
| Scoring maths in the Deno edge functions | duplicated | Edge functions keep their own copies until a Deno import map points at `packages/core/src`. Record any divergence here. |

## How to change this file

1. Find the row. If there is none, the feature is new: add a row with both
   platforms' status before writing code.
2. Move the status in the same commit as the code.
3. `partial` and `n/a` carry a reason in Notes, always.
4. Never leave a `planned` row pointing at a phase that has closed.
