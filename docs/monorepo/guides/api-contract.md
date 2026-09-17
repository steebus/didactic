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
| GET | `/api/subjects` | — | subjects | |
| GET | `/api/subjects/[id]` | — | subject with topics | |
| GET | `/api/subjects/[id]/area` | — | `SubjectArea` | The outline's data. 404 when the bed is not there. |
| GET | `/api/subjects/[id]/sowing` | — | `Sowing \| null` | The reading's data. Null for a bed sown before the sowing sheet existed, which the reading prints as *unstated*. |
| GET | `/api/topics` | — | the planting without its subjects: `{ topics, edges, resources, lessons }` | `getPlanting`, the same read `/api/graph` answers with the subjects added. |
| GET | `/api/topics/[id]` | — | topic, subjects, exposures, resources, edges, curricula with counts | |
| GET | `/api/topics/[id]/area` | — | `TopicArea` | What the topic sheet prints. `record` is additive: every exposure and every diary entry that moved nothing, newest first, each with what it moved (`core/figureRecord.FigureEvent`); `exposures` still answers with the newest eight. `FigureEvent.delta` and `.after` are **points to the hundredth**, not whole points — they are replayed from `core/scoring.unroundedAbility` rather than read off the stored tenth, which was rounding every marked passage and right answer to nothing. Same fields, finer figures; a client printing them as whole numbers is back where it started, so print `delta` through `core/figureRecord.impactLabel`. `neighbours` is one row per topic rather than one per edge, carrying the most definite relation of however many that pair holds. `LessonRow.opened_at` is additive (`036`), and the reader asks for the column and falls back to a read without it — the web build and the migration are not one transaction, and losing the column should cost one rung of a standing, not the whole route. `/api/topics/[id]` stays as it is: it answers the graph panel's question, and the two shapes differ on purpose. |
| GET | `/api/topics/loose` | — | `{ loose: LooseTopic[] }` | Every topic filed under no subject at all, newest first, with the same `TopicEvidence` the adjudication queue reads — here it says what a delete would destroy rather than whether two topics are one thing. `hasRoute` rides along because `044` refuses to change the level of a topic carrying a curriculum, and a control that is going to be refused should say so before it is pressed. Pending topics are excluded: one waiting on an adjudication is a question, not loose stock, and filing it here would settle by accident what the inbox is deliberately asking. |
| GET | `/api/topics/pending` | — | `PendingTopic[]` | Each row now carries `created_at` and a `TopicEvidence` for **both** sides — the subjects it is filed under, up to three of the resources it was drawn from by name, and counts of resources, lessons, marks and exposures. Additive. Two titles and at most one description could not answer the question the queue asks, and what tells two similar-sounding topics apart is what has actually been filed against each. Gathered in five reads over the whole queue rather than five per row: a long reading files fifty topics at once and a round trip each would be the slowest thing in the app. |
| GET | `/api/resources` | — | resources | |
| GET | `/api/curricula/[id]` | — | curriculum with lessons and prereqs | |
| GET | `/api/lessons/[id]` | — | lesson with body, and `neighbours`: the lessons either side of it in its route | `neighbours` is `{ previous, next }`, each `{ id, title }` or null, derived from the route's position order for the way on at the foot of the reading. Neither side is gated on completion: nothing here is locked. `answered` maps `questionKey` → whether it was got right, for the questions in this lesson the owner has already answered; `{}` for a request with no owner. `topic` and `requires` ride along on the curriculum and prereq reads as embeds rather than costing their own round trips, and `subject` -- the topic's own, for the Subject > Topic trail above the title -- rides one hop further along the same embed. A topic filed under none gives null, one filed under several gives the first. The handler is a thin wrapper over `lib/lesson.readLesson`, which the lesson sheet also calls when it renders on the server, so the shape served here and the shape the web prints are the same function. **`links` and `sources` have moved to `/api/lessons/[id]/links`** and are no longer sent here — both fan out across every topic that shares a subject, and holding the sheet behind them was the whole of its wait. See the deprecations table. |
| GET | `/api/lessons/[id]/links` | — | `links`: the lessons the body may point at, `sources`: the documents it may cite | What the body's `lesson:` and `source:` names resolve against, split off the lesson read because neither is needed to print a word of the prose and both are the expensive half of it. `links` resolves at read time so a reshaped route turns a link into a stub rather than a dead end; `sources` is `{ id, title, pageCount }` per document, for the same reason, and a page past `pageCount` is refused because a citation the writing agent invented reads exactly like one it did not. A client that has not asked yet prints both as stubs, which is the honest reading. `lessons.links(id)` is the typed call. |
| GET | `/api/highlights` | `q` | highlights, filtered when `q` is given | |
| GET | `/api/clozes` | `mode`, `subjectId`, `topicId`, `lessonId`, `limit` | `{ clozes: ClozeCard[] }` | The garden, read three ways off one handler, because the three questions differ only in a where clause and answer the same shape. `mode=due` (the default, and what an unrecognised mode falls back to) is what is due now or overdue, **chosen** oldest-first and capped at `limit` (40, max 100) — oldest because an overdue card is the one the schedule is most wrong about — and then **shuffled** before it is answered (046): cards planted together were read together, and answering them in that order is answering each with the last still in mind, which tells the scheduler the reader holds what they have only just read. `mode=random` is one card, due or not, drawn in the application over a page of ids rather than with `order by random()`. `mode=lesson` is every card against one lesson, oldest first — read both by the prose, which washes the ones carrying an anchor, and by *Tend this lesson*, which lists all of them — and requires `lessonId`. The three scope filters narrow any mode and stack; `subjectId` resolves through `topic_subjects` to a list of topic ids. An empty list is the answer to a scope holding nothing, never a 404: asking a subject with no clozes for one is an ordinary question. |
| GET | `/api/clozes/count` | — | `ClozeCount` | `{ due, total, next }`. Counts on `clozes_due_idx` with nothing read back, for the same reason `/api/inbox/count` is its own route: the Tend link prints this in the running head of every sheet. `next` is the earliest instant among those not yet due, which is what lets a sheet say *when* there will be something rather than only that there is nothing. |
| GET | `/api/books/search` | `q` | `BookMatch[]` from Open Library | Falls back to nothing silently. |
| GET | `/api/settings` | — | nothing yet | **Planned (3).** Exists so the sheet has somewhere to grow. |

### Writing

| Method | Path | Body | Invalidates | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/subjects` | subject, roots, depth, confident, gaps, evidence, qualifiers | subjects, topics, resources | Sowing. Takes up to a minute; expect 504 sentences. The bed is laid out simplest-first and the order is kept on `topic_subjects.position` (`033`; the subject reader asks for the column and falls back to a read without it, because the web build and the migration are not one transaction). Answers `first: { id, title, curriculumId } \| null` — the most introductory topic in it, skipping anything `pending`, with whatever route it already carries. Additive; a client that has never heard of it sows exactly as before. The route and the first lesson are **not** written here: each is about as long as the sowing already was, and three of them in one function is a timeout with a subject half built behind it. |
| POST | `/api/subjects/qualify` | subject, roots, confident, depth | — | The 5–10 questions, in difficulty order. |
| DELETE | `/api/subjects/[id]` | — | subjects, topics | Grub out the bed. |
| POST | `/api/subjects/[id]/topics` | title \| topicId \| topicIds | subjects, topics, pending | Add a topic to the bed, and place it in it. Answers `action`, `queriedBy` (which reading raised an adjudication), `placed` (edges drawn), `note`, `warnings`. `topicId` is additive and names a topic that already exists: nothing is resolved, because the caller has the row in its hand rather than a name that has to be read against the map, and it answers the topic's own `title` since the caller may not know it. It still **places** — a topic arriving in a bed with no edges into it prints as one more root at the foot of the outline and floats on the graph — which is why it is this route and not an insert into `topic_subjects`. Additive to the topic: it keeps every other subject it sits under, and a *move* is this followed by the DELETE below, in that order, so a failure leaves it filed somewhere rather than nowhere. `subjects.fileTopic(id, topicId)` is the typed call. `topicIds` is the bulk path for the loose stock sheet and is deliberately **unplaced**: placing one topic is a model call over the whole bed and placing thirty is thirty of them, which is minutes and past the platform's ceiling — a bulk file that timed out halfway would leave the reader with no idea which half landed. It answers `{ filed, skipped, placed: null, note }` where the note points at *Draw connections*, which asks the same question once for the whole bed. A topic that was loose also takes the new bed as its home, since a topic filed somewhere while claiming a home nowhere is the inconsistency `012` added the membership table to prevent. |
| DELETE | `/api/subjects/[id]/topics` | topicId | subjects, topics | Grub a topic out. |
| POST | `/api/subjects/[id]/relate` | — | topics | Draw the bed's connections. |
| POST | `/api/subjects/[id]/resow` | — | subjects, topics | Lay the bed out again from its answers. Answers `first` exactly as the sowing does. |
| PATCH | `/api/topics/[id]` | title, summary, primary_subject_id, add_subject_ids, remove_subject_ids | subjects, topics, highlights | Curation only; never ability. |
| DELETE | `/api/topics/[id]` | — | subjects, topics, highlights | |
| DELETE | `/api/topics/loose` | ids | subjects, topics, pending | Throw away loose topics, several at a time. **Scoped server-side to topics that are still filed under nothing**, which is a safety property rather than an implementation detail: the ids come from a sheet of checkboxes, and a stale one — filed somewhere in another tab since the sheet was drawn — must not be deletable by a press meant for loose stock. Those are skipped and counted back in `skipped` so the sheet can say what it did not do. |
| POST | `/api/topics/[id]/promote` | — | subjects, topics, pending | Promote a topic to a subject of its own. The topic and everything the outline hangs under it (walked over `prereq` and `specialises`, the same two kinds `core/subject` nests by) are filed into the new bed and take it as their home; old memberships are left alone, so it is additive and reversible with *Take out*. **The topic row survives**, which is forced rather than chosen: `exposures.topic_id` is not null and a subject is not something you can have read, so consuming the row to avoid a subject and a topic sharing a name would destroy the reading log. The colour is the next plate along from `@didactic/tokens.plates`. Refused (400) for a topic carrying a curriculum. |
| POST | `/api/topics/[id]/demote` | intoTopicId | subjects, topics, pending, highlights, clozes | Demote a topic into another topic's route, as a lesson in it. Everything it holds — material, reading log, marked passages, cloze cards — moves onto the target first and the row is then deleted, so the only thing lost is the name, and the name becomes the lesson's title. What it was read from becomes the lesson's own `lesson_resources`. Where the target has no route, a **draft** one is started: a route that came into being as a side effect of filing something is a proposal, not a plan. Cannot be undone. Refused (400) for a topic carrying a curriculum. |
| PATCH | `/api/topics/pending` | topicId, action, mergeInto? | topics, highlights, clozes | Merge, split, keep. A merge carries the duplicate's marked passages and cloze cards to the survivor as well (`043`) — they were `on delete set null` and were being cut loose — so the two sheets that print them are dropped with the map. A failure is said in the sheet's own words rather than passed through: the queue was printing *duplicate key value violates unique constraint "edges_from_node_to_node_kind_key"* at someone mid-decision. |
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
| PATCH | `/api/lessons/[id]` | action, depth, title, summary, body, stage, position, estimated_minutes | topics, subjects | `action: 'complete'` at a depth is an exposure. `action: 'open'` records that the reader has been here, and is additive: fired on every open and written only on the first (`opened_at is null` is in the update, so two sheets racing cannot move it), it answers `{ ok, first }` and drops cache only when `first` — the ordinary case is a no-op against an index, and re-reading every topic sheet on each open would cost more than the thing being recorded. `lessons.opened(id)` is the typed call. |
| DELETE | `/api/lessons/[id]` | — | topics | |
| POST | `/api/lessons/[id]/body` | regenerate? | topics, on the last round only | Write **one round** of the lesson, or start again with `regenerate`. Answers `{ body, cached, done, round, words, warning? }`. A lesson takes longer to generate than the function is allowed to run, so each call writes what fits, saves it with `body_finished` false, and says whether to come back. Resumable: a call on a lesson with an unfinished body carries on from it. Capped at six rounds, after which the lesson is called finished where it stands and `warning` says so. Only the last round drops cache — until then `has_body` is still false and no sheet prints anything different. The loop over the rounds is composed as `lessons.writeWhole(id, report)`, so the cap and the progress wording exist once for three callers rather than three times. |
| POST | `/api/lessons/[id]/answers` | key, correct | topics, subjects | Answer a question inside the lesson. `key` is `questionKey` of the question's own text. Answers `{ counted, exposureWritten, topicTitle, abilityBefore, abilityAfter }`. Only the first answer to a question counts — enforced by a unique index, not a read, so two presses racing cannot both pay — and a wrong one writes no exposure. Invalidates only when a figure actually moved. |
| POST | `/api/refresher/[topicId]` | — | — | |
| POST | `/api/highlights` | lessonId, quote, prefix, note | highlights, topics | A mark is the lightest exposure. What the note names is indexed from the note. |
| GET | `/api/mentions` | `q` | — | What an `@` in a note could mean: topics and lessons the owner holds, ranked for typing. Empty `q` offers the most recent. |
| PATCH | `/api/highlights` | id, note | highlights | |
| DELETE | `/api/highlights` | id | highlights, topics |
| POST | `/api/diary` | note, topicId | highlights, topics, subjects | A diary entry: a mark of kind `diary`, with no quote and no lesson. `topicId` is where the reader was standing, kept as a starting point; what the entry is *about* is what it names with `@`, indexed by the same path a note's names are. Writes no exposure — nothing has read it yet. |
| POST | `/api/diary/[id]/read` | — | highlights, topics, subjects | Reads the entry back against the topics it names and records what it shows. Its own call because it is a model call over prose and the reader has already walked away; driven from the bench. Re-reading replaces what the last read said rather than stacking a second opinion. |
| GET | `/api/diary/[id]/read` | — | — | What that entry wrote, for one opened long after. |
| DELETE | `/api/diary/exposures/[exposureId]` | — | highlights, topics, subjects | Takes back one claim a reading made. Scoped to `source = 'diary'`, so it can never reach an exposure written by reading a lesson or tending a card. |
| POST | `/api/clozes` | lessonId, kind?, text, blank, blankStart?, question, answer, note?, anchor?, hint? | clozes | A card made by hand: a passage the reader chose with words taken out of it, or a question and an answer they wrote, or a statement to judge. `kind` is `cloze` (the default, and what the maker in the reading sends), `qa` or `truefalse`; anything else reads as `cloze`. Belongs to no concept — naming one on their behalf would put a word in their mouth. `blankStart` is a hint that settles a word appearing twice in one sentence; the offsets are recomputed server-side rather than taken on trust, because a selection reports an offset into the rendered prose and not into the passage stored beside it. The `anchor` is checked against the lesson body and **dropped rather than refused** where it is not found — a card whose sentence is not in the body is perfectly answerable and simply is not washed on the prose — and the `prefix` is re-found from the same reading. The row is built by the same `cardColumns` the sowing uses, so a card made by hand and one written by the model are the same shape in the table. 400 with the sentence from `core/clozes.cardProblem` — the judgement both platforms share — for a passage too short or too long, a blank that is not in it or runs past five words, a question with no answer, a verdict that is neither `True` nor `False`, or a true-or-false with no reason given. Also for a card that hands over its own answer (047): a question containing it, or a cloze whose blanked words are left standing elsewhere in the same sentence. |
| POST | `/api/lessons/[id]/clozes` | more? (`regenerate` still read, same meaning) | clozes | Read a worked lesson and plant its trackers: two to four concepts, two to four cards under each, the model choosing each card's shape to suit the material. A model call over the whole body, so both front ends set it going on the bench (`clozes.tend`) rather than awaiting it — the reader has just marked the lesson worked and is walking away. **Idempotent**: a lesson whose concepts are already standing answers `already: true` and asks the model nothing, which is what stops marking worked, un-marking and marking again from filling the garden with duplicates. `more` is *Write some more* under the lesson, and it **adds** (046): the model is handed every front already standing and writes the ones that are missing, anything it writes anyway that matches one is dropped, and a concept it names that already exists is reused rather than written twice. **Nothing standing is ever deleted** — until 046 this flag was `regenerate` and replaced the agent's concepts and their cards outright, which meant the only way to better cards was to throw away the review history of the ones you had. The old name is still accepted and now means the new behaviour. A card no longer has to quote the lesson; its optional `anchor` does, and is checked verbatim and dropped rather than repaired, leaving the card standing and merely undrawn. A blank over four words, a question that gives away its own answer, a true-or-false with no reason, and a concept left with fewer than two answerable cards are all dropped. Drops no tags when nothing was planted. |
| POST | `/api/clozes/[id]/review` | rating | clozes | Answer a cloze. `rating` is 1–4 on FSRS's own scale (again, hard, good, easy), not a word of this app's: the weights were fitted against reviews graded this way, so the scale is the model's and not a thing a front end may reword. Both platforms offer all four; what travels is the number, so the words can change on one without the two schedules drifting. Answers `{ cloze, intervalDays, retrievability, wait }`, where `wait` is the next interval in words. Moves the row and appends to `cloze_reviews`, in that order — a missing log line costs a future refitting, a missing schedule move costs the reader the same card in a minute. Drops only `clozes`: answering a cloze is not an exposure and does not touch ability. |
| PATCH | `/api/clozes/[id]` | text?, blank?, blankStart?, question?, answer?, note?, anchor?, hint? | clozes | Rewrite a card: its passage, its blank, its question or its answer. Every field falls back to what is standing, so a reader fixing only the nudge sends only the nudge and the whole card is judged as it will be stored. **Never resets the schedule**: the reader is correcting a card, not declaring they have forgotten it, and its history is the only evidence of what they hold. **Never changes the kind** either — that is read off the standing row and a kind sent here is ignored: a question is not a passage with a hole in it, and the row the two would share is one `clozes_shape` refuses. Pull it up and write the other. The anchor is re-checked against the lesson and the prefix re-found with it, so a rewritten card no longer matching the body is still answerable and simply is not drawn on the prose. 400 with the sentence from `core/clozes.cardProblem`. |
| DELETE | `/api/clozes/[id]` | — | clozes | Pull one up. Its review log goes with it by cascade; the concept stays, because its other cards are still standing. | |

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
| 2026-09-14 | `GET /api/library` and `library.list()` | Read `GET /api/inbox`, which now serves the whole shelf | Gone. The library sheet was folded into the inbox — one list answered both "what is waiting" and "what do I have" — and no shipped mobile build ever read the route: its `PARITY.md` row was planned (5), never built. |
| 2026-09-14 | `links` and `sources` on `GET /api/lessons/[id]` | Read them from `GET /api/lessons/[id]/links` (`lessons.links(id)`) instead | Already gone from the response; the fields stay optional on `LessonDetail` until a mobile build that reads the new route has shipped |
