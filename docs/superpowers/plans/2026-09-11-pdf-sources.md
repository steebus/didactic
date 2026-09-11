# A PDF as the source for a subject

**Goal:** let the user hand a PDF over when sowing a subject (or steering a
curriculum), say how closely the bed should follow it, and have every lesson
written under that subject cite the document — with a citation that opens the
passage it came from.

**Status:** built, on `claude/pdf-subject-planning-kqx90m`. Written against
the tree at `34e78b9` and kept as the record of why the thing is shaped
the way it is.

**Three things this plan got wrong, corrected in the building:**

1. **The embeddings are 384-dimensional, not 1536.** The schema sketch
   below copied `match_nodes` from `007`, which still says 1536 —
   `015_local_embeddings` moved the whole map to gte-small's 384 and
   `match_nodes` is simply a stale function nobody calls. The shipped
   migration uses 384.
2. **A `data-page` attribute would NOT have been stripped.** DOMPurify
   passes `data-*` through by default (`ALLOW_DATA_ATTR`), which the
   existing `a[data-stub]` styling should have told me. The page still
   rides in the href's fragment, but because a citation ought to be a
   whole address — followable, middle-clickable, copyable — not to get
   round a restriction that was never there.
3. **The bookmark spike was not a spike.** `pdf-parse`'s `getInfo()`
   surfaces the outline directly, and `pdfjs-dist` — already underneath
   it — resolves a destination to a page index. It went in as the
   primary path, with the model reading the contents pages as the
   fallback. Naming `pdfjs-dist` explicitly costs nothing: same copy,
   same pinned version.

**And one thing it found:** testing `extractFromPdf` against a real PDF
for the first time showed that **no PDF had ever been ingested
successfully**. It asked for text and info in a `Promise.all`, and pdfjs
hands ownership of the backing array to its worker on the first call, so
the second always died with a `DataCloneError`. Nothing caught it because
the extractor's only fixture was an HTML article.

---

## The short answers

**OpenDataLoader: no, not on this stack.** It is a Java program. The Python
and Node packages are wrappers that spawn a JVM per call, and the docs are
explicit about needing Java 11+. There is nowhere on this stack to run a JVM:
Vercel functions are a Node runtime, and Supabase Edge Functions are Deno with
a 2-second CPU ceiling. Using it would mean standing up a container somewhere
(Fly, Cloud Run, a Lambda image) — a third deploy target alongside Vercel and
Supabase, with its own secrets, its own failure mode, and a network hop with a
50 MB file on it. That is a much larger change than the feature needs. See
*The parser* below for what we do instead, and what we give up.

**LangChain: no.** Everything we would import it for, this repo already has
its own version of, better fitted:

| LangChain gives | We already have |
| --- | --- |
| Document loaders | `lib/extract/pdf.ts`, `lib/extract/url.ts` |
| Text splitters | ~60 lines, and it belongs in `packages/core` with tests |
| Embeddings | `lib/embedding.ts`, a local model, `015_local_embeddings` |
| Vector store | pgvector direct, `match_nodes` in `007`, `lib/resolver.ts` |
| Chains / structured output | The Anthropic SDK with forced `tool_choice`, used in all six `lib/llm/*` modules |
| Retrievers | One `match_passages` RPC, copied from `match_nodes` |

It would also fight the monorepo rule that nothing under `packages/` imports
`next`, `react-native`, a DOM global or a live Supabase client — LangChain's
loaders reach for all of those. The chunking and retrieval code we actually
need is around 150 lines of pure functions, which is exactly the kind of thing
`packages/core` is for. Revisit only if we ever want multi-step agentic
retrieval, which this feature does not.

**What is realistically achievable:** all of it, in four phases, with one
genuine compromise (structure comes from the model reading the text, not from
the parser) and one pre-existing bug that has to be fixed first (uploads over
4.5 MB do not work on Vercel today).

---

## What already exists

More than I expected. This feature is mostly wiring, not new machinery.

- **PDF text extraction.** `pdf-parse` v2 is already a dependency and
  `lib/extract/pdf.ts` already uses it.
- **Storage.** The private `resources` bucket is created in `017_sowings`, and
  `lib/ingest.ts:28` already downloads from it.
- **A resource is already a first-class thing.** `resources` carries
  `storage_path`, `mime_type`, `file_size`, `raw_text`, `summary`.
- **Evidence at sow time already uploads a PDF.** `ProofOfRoots.tsx` has the
  file mode; `POST /api/resources/upload` files it and queues it.
- **Sow-time material already attaches to the subject.** `resource_subjects`
  (`023`) exists for exactly this.
- **Curriculum sources already exist.** `curriculum_sources` (`014`) has a
  `resource_id` and a `note` — "follow this order", "ignore chapter 4" — and
  `api/lessons/[id]/body/route.ts:98` already reads it into the writing
  prompt. The curriculum half of this feature is already half-built.
- **A resolve-at-read-time link scheme.** `packages/core/src/lessonLinks.ts`
  plus the `marked` link-renderer override at `lib/markdown.ts:79`. A citation
  is the same shape as a `lesson:` link and goes in beside it.
- **Long work in rounds.** `028_lesson_written_in_rounds` and the round cursor
  on `lessons`. This is the pattern a big PDF has to be parsed with.
- **A job bench.** `packages/core/src/jobs.ts` reports work the reader walked
  away from, site-wide.
- **An async ingestion queue.** pgmq + pg_cron + the `ingest` Edge Function.

What does **not** exist: any way to view a PDF, any signed URL (nothing calls
`createSignedUrl`), any per-page storage of a document, any chunk table.

---

## Three constraints that shape the whole design

These are not preferences. They decide the architecture.

**1. Vercel caps a request body at 4.5 MB.** The upload route accepts 15 MB
(`MAX_BYTES` in `api/resources/upload/route.ts`) and posts the file as
`formData` through a Next route. On Vercel anything over 4.5 MB returns a 413
before our code runs. **This is a live bug today**, not something this feature
introduces — it just happens that a sow-time certificate is usually small and
a textbook never is. The fix is to stop proxying the bytes: the browser asks
for a signed upload URL and PUTs straight to Supabase Storage, then tells the
API the file has landed. That has to be Phase 0 or nothing else works.

**2. A Vercel function gets 60 seconds.** Already known and already commented
at `api/lessons/[id]/body/route.ts:29` — it is the ceiling on the cheapest
plan, so asking for more is refused at deploy. A 400-page book cannot be
downloaded, parsed, chunked, embedded and structured inside one request. The
repo has solved this twice already (lesson rounds; `PLANTING_NEEDS_MS` and
`EDGES_NEED_MS` in `lib/sowing.ts`) and the answer is the same a third time:
**parse in rounds against a cursor, save each round, re-enqueue.**

**3. A Supabase Edge Function gets 2 seconds of CPU.** Wall clock is 400s but
CPU is 2000 ms, and PDF parsing plus local embedding is pure CPU. So the work
cannot be moved to the Edge Function to escape constraint 2. The Edge Function
stays what it is — a poller that calls back into the Next route.

---

## The parser

Use `pdf-parse` v2, which is already installed. It is pure TypeScript over
pdfjs, and it takes a page range: `getText({ partial: [n] })`, `first`/`last`
as an inclusive range, and `getInfo({ parsePageInfo: true })` for the page
count and per-page geometry. Page ranges are what makes rounds possible, and
page numbers are what makes a citation checkable. That is the whole
requirement.

**What we give up against OpenDataLoader:** reliable heading hierarchy, table
structure, and reading order on multi-column or heavily designed pages. We get
a page of text, not a document tree.

**Why that is survivable here:** we are not building a document converter. We
need to know what the chapters are, and we have a model that is good at
reading a table of contents. The first pages of almost every book, syllabus
and handbook *are* the table of contents. So: extract the text, hand the first
~15 pages plus every line that looks like a heading to Claude with a forced
tool call, and get back a chapter list with page ranges. That is the same
technique `lib/llm/concepts.ts` and `lib/llm/curriculum.ts` already use.

**One spike worth an hour (Phase 1):** most real PDFs carry an embedded
bookmark tree, and for a textbook that tree *is* the chapter list with exact
page targets — free, exact, no model call. pdfjs exposes it as `getOutline()`,
but `pdf-parse` does not appear to surface it. If `pdf-parse` bundles a
reachable pdfjs we get it for nothing; if not, adding `pdfjs-dist` directly is
a small, pure-JS dependency. Either way the model-reads-the-TOC path stays as
the fallback, because plenty of PDFs have no bookmarks. Do not block the
feature on this.

**Scanned PDFs:** out of scope. `extractFromPdf` already throws
`extract: no readable content` on an empty text layer. Keep that, and make the
sowing sheet say so plainly rather than failing late. OCR is a different
feature with a different cost.

---

## How closely to follow it

The user's framing was a spectrum from verbatim to source material. My
recommendation is **three named rungs, not a slider** — because each rung is a
genuinely different code path, and a slider would promise a smooth
interpolation that does not exist. The roots gauge is a slider because 0–5 is
one continuous claim about one person; this is a choice between three
behaviours.

| Rung | Stored | What actually happens |
| --- | --- | --- |
| **To the letter** | `verbatim` | The chapter list *is* the topic list, in its order, with sections nested under chapters. The model does not choose the set. |
| **Follow its order** | `follow` | Chapters seed the bed, and the model may merge, split, rename to canonical names, and add what the document obviously omits. |
| **For the ground it covers** | `source` | The bed is laid out as it is today. The document's coverage is context; its layout is a suggestion. |

Copy lives in `packages/core/src/copy.ts` beside `LABOURS` and `WRITINGS`.
Today's behaviour — a PDF filed as material with no influence on the bed — is
what you get by not handing one over, so it does not need a fourth rung.

**The wrinkle in `verbatim`, and it is a real one.** PRODUCT.md requires topics
to be reused across subjects rather than duplicated, which is why
`resolveConcept` runs on every write path. Chapter titles are terrible
canonical concept names — "Getting started", "Putting it together", "Where next".
A bed of those would be junk on the map and would never match anything.

So `verbatim` fixes the **set, the order and the nesting**, but each node still
goes through `embed` → `fetchCandidates` → `resolveConcept` like everything
else, against a *concept name the model derives from the chapter's content*,
with the chapter title kept alongside as the outline label. In other words: the
document decides the shape of the bed, the resolver still decides what each
topic *is*. Worth stating on the sowing sheet in one line, because a user who
picks "to the letter" and sees a renamed topic will otherwise think it is
broken.

The same three rungs apply to `curriculum_sources` — where `verbatim` means one
lesson per chapter in the document's order, which is a much cleaner mapping
than the subject case, because a lesson does not have to be a canonical
concept.

---

## Schema

Four migrations, all idempotent (`if not exists`, `drop policy … if exists`
then create), all safe to run twice, because a merge to `main` applies them.

```sql
-- 029: a document is read once, into passages.
-- NOTE: as sketched this said vector(1536), copied from match_nodes.
-- That was wrong; see the correction at the top. Shipped as 384.
create table if not exists resource_passages (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  ordinal int not null,              -- order within the document
  page_from int not null,            -- what a citation points at
  page_to int not null,
  heading text,                      -- the chapter/section it fell under
  content text not null,
  embedding vector(384),
  unique (resource_id, ordinal)
);

-- 030: the reading of the document's own structure.
create table if not exists resource_outline (
  resource_id uuid primary key references resources(id) on delete cascade,
  -- [{title, page_from, page_to, children: [...]}]
  chapters jsonb not null default '[]'::jsonb,
  source text not null,              -- 'bookmarks' | 'model' | 'none'
  page_count int
);

-- 031: how closely to follow it, on both join tables.
create type source_fidelity as enum ('verbatim', 'follow', 'source');
alter table resource_subjects   add column if not exists fidelity source_fidelity;
alter table curriculum_sources  add column if not exists fidelity source_fidelity;

-- 032: parsing in rounds needs a cursor, like lessons got in 028.
alter table ingestion_jobs add column if not exists pages_done int not null default 0;
alter table ingestion_jobs add column if not exists page_count int;
```

Plus a `match_passages(p_resource uuid, p_query vector, p_limit int)` RPC,
copied from `match_nodes` in `007`, and RLS policies in the shape `025` set.

`resource_passages` rather than `resource_chunks` because the app already calls
a span of text a passage (`markAnchor.ts`), and the vocabulary is load-bearing
in this codebase.

---

## Citations

**In the prose.** A citation is a link with a scheme, resolved when the lesson
is read — exactly the argument `lessonLinks.ts` already makes for `lesson:`,
and for the same reason: a body is written once and cached, and the rows under
it keep moving.

```
[the classic statement of it](source:rules-of-play#p112)
```

`lib/markdown.ts:79` already overrides `marked`'s `link` renderer to intercept
`lesson:`; `source:` slots in beside it. **Encode the page in the fragment, not
in an attribute** — though not for the reason given here when this was
written: `data-*` survives DOMPurify by default. It stays in the fragment
because a citation should be a whole address rather than an anchor plus a
number, so it can be followed, middle-clicked and copied like any link.

A `source:` name that no longer resolves prints as a stub, same as a dead
`lesson:` link. The resolution logic goes in `packages/core/src/sourceLinks.ts`
as pure functions with tests, next to its sibling.

**Making them true.** A citation is only worth anything if the model was
actually looking at the passage. So the lesson-writing prompt gets a retrieval
step: embed the lesson's topic and summary, `match_passages` against the
subject's or curriculum's sources, and put the top ~6 passages into the prompt
*with their page numbers and headings*, under an instruction to cite only from
what it was given and never to invent a page. This is the one place the feature
is genuinely RAG, and it is about 50 lines on top of `embed()` and pgvector.

Budget note: this lands inside `api/lessons/[id]/body`, which is already the
tightest 60 seconds in the app. Retrieval is one embed plus one indexed query —
tens of milliseconds — but the passages are real prompt tokens, so cap them
(~6 passages, ~400 words each) the way `LINKS_HERE`/`LINKS_OVER` caps the
neighbourhood in `lib/llm/curriculum.ts`.

---

## Opening a citation

Three tiers. **Ship tier 1, then judge whether tier 2 is worth it.** Tier 3 is
almost certainly not.

**Tier 1 — the excerpt. Recommended.** We already hold the passage text, its
page number and its heading in `resource_passages`. So a press on a citation
opens a panel, in the app's own type, printing the passage with "*page 112 of
Rules of Play*" and a way through to the whole document. No new dependency, no
PDF rendering, works identically in a WebView on the phone, and reuses the
marking furniture in `markAnchor.ts` that already knows how to place a panel
against a passage without covering it. It is also, honestly, the better reading
experience — the reader wanted the sentence, not a page of a PDF.

**Tier 2 — the page as an image.** `pdf-parse` has `getScreenshot({ partial:
[n], desiredWidth })`. Render page N to a PNG once, cache it in the bucket
beside the source, serve it with a signed URL. Shows the reader the real page —
the diagram, the table, the typography — and still works everywhere, including
the WebView, because it is just an image. Worth doing if tier 1 turns out to
feel thin, which I suspect it will for anything with figures in it.

**Tier 3 — a real PDF viewer with the excerpt highlighted.** Needs pdfjs in the
browser, a text layer, and coordinate mapping back to passages. Expensive,
heavy on a phone, and the first thing that will break in a WebView. The escape
hatch that makes it unnecessary: a signed URL to the file itself with
`#page=112`, opened in a new tab, handled by the browser's own viewer. One
line, covers "let me see the actual document", and degrades to "here is the
file" where the native viewer is poor.

`createSignedUrl` on a short expiry, from a route that checks ownership first —
the bucket is private and must stay that way.

---

## Phases

**Phase 0 — fix the upload path.** Signed upload URL from
`POST /api/resources/upload-url`; the browser PUTs to Storage directly; a
follow-up call files the row and enqueues. Raise `MAX_BYTES` for documents
(50 MB is a reasonable book). Without this nothing above 4.5 MB reaches the
stack at all. *Small, and it fixes a live bug regardless of this feature.*

**Phase 1 — read a document properly.** `029`/`030`/`032`. Parse in rounds
against `pages_done`, mirroring `028`: each call takes as many pages as the
budget allows, writes passages, advances the cursor, and says whether there is
more. Chunking in `packages/core/src/passages.ts` — pure, tested, no DOM. The
bookmark spike. Register it on the bench so a reader who walks off still learns
it finished. *The biggest phase, and the one with the most unknowns.*

**Phase 2 — the dial.** `031`, the three rungs on the sowing sheet, the
outline-to-bed mapping for each, and `verbatim` carrying the chapter title as
the outline label while the resolver still names the concept. Curriculum side
too, which is mostly already there.

**Phase 3 — citations.** `match_passages`, retrieval in the body route, the
`source:` scheme in `core`, the renderer hook, the excerpt panel. A citation
the model invented is the failure mode to test for: assert every emitted
`source:` name resolves to a passage that was in the prompt.

**Phase 4 — the page image**, if tier 1 proves thin. *Not built.* It was
conditional on the excerpt panel feeling thin in use, and that judgement
needs the thing in front of a reader first. `getScreenshot()` is there
when it is wanted.

Each phase moves its rows in `docs/monorepo/PARITY.md` in the same commit, adds
its routes to `docs/monorepo/guides/api-contract.md`, and keeps routes additive
— phones run the build they have.

---

## What I would watch

- **The 60 seconds is the whole risk.** A 600-page book at even a second a page
  is ten rounds. That is fine if rounds are honest and resumable and the bench
  says what is happening; it is miserable if a round can half-write and leave a
  document that looks parsed and is not. `028` has the answer already — the
  equivalent of `body_finished` is not optional.
- **`verbatim` will disappoint someone at least once.** A user who picks it and
  watches topics get renamed by the resolver needs to have been told, on the
  sheet, before they picked it.
- **A textbook is not a syllabus.** "Chapters become topics" is excellent for a
  course handbook and poor for a reference manual with 40 chapters of unequal
  weight. `follow` is probably the right default rung, not `verbatim`.
- **Cost.** A big PDF is a lot of embedding calls. Embedding is local
  (`015_local_embeddings`) so it is CPU rather than spend — which means it eats
  the 60 seconds rather than the budget. Worth measuring in Phase 1 before
  sizing the rounds.
