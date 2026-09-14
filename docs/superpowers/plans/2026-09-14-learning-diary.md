# Learning diary

A freeform entry, written from anywhere, tagged with what it is about,
read back by the app for what it says about the topics it names — and a
Marked page that becomes the timeline of the whole journey.

Decided with the user on 2026-09-14. Four decisions, all recorded here
because three of them close off an option that looked reasonable.

## What this is

Today a note is something you write *at* a lesson: the Highlighter's desk
rail writes a mark with no quote, filed against the lesson you are reading
and the topic that lesson teaches. That is the right shape for a thought
about a passage. It is the wrong shape for "I shipped an RLS policy at work
this week and finally understood what the `using` clause was for" — which is
about three topics, none of which is the lesson you happen to have open, and
which is the strongest evidence the app will ever get about your ability.

The diary is that second thing. It writes the same row.

## The four decisions

### 1. A diary entry is a mark, not a new table

`highlights` already carries a nullable quote (020) and a nullable lesson
(022, so a mark outlives the lesson it came from). A diary entry is a
highlight with no quote, no lesson, and `kind = 'diary'`.

What this buys, all of it already written and tested:

- `highlight_tags` (024) — the topics and lessons a note names, indexed off
  the note text by the one route that writes notes. The diary's tagging is
  the diary's tagging; there is no second parser.
- `searchHighlights` — the Marked page's server-side search over quote and
  note, which becomes the timeline's search unchanged.
- `NoteEditor` and its mention affordance, `NoteText` and its markdown
  rendering.
- The RLS owner policy, the cache tags, the API surface.

The rejected option was a `diary_entries` table with a `diary_entry_tags`
beside it. It is cleaner on a whiteboard and it duplicates the mention
parser, the search path, and the tag index — and then needs a union query to
put the two back in one timeline, which is the entire point of the feature.

**Migration:** `040_diary.sql` — `alter table highlights add column kind text
not null default 'mark'` with a check for `('mark','diary')`. Existing rows
are marks, which they are. Safe to run twice.

### 2. Struggle is a weightless depth plus a confidence clamp

The user asked that a diary entry be able to lower a topic's standing, not
only raise it. The obvious implementation is a negative `ability_delta`.
That does not work, and the reason is worth writing down:

**`ability_delta` is stored on every exposure and read by nothing.**
`computeAbility` derives ability entirely from `depth` via
`config.DEPTH_WEIGHTS`. The column is a record of what a write intended, not
an input to the score. Writing a negative number into it would change no
figure on any sheet.

So struggle has to be something the scorer sees. It is a sixth depth:

```
DEPTH_WEIGHTS: { struggled: 0, marked: 0.01, answered: 0.05, skim: 0.2, read: 0.5, applied: 1.0 }
```

Weight 0 alone was **not** enough, and finding out why changed the design.
Recorded here because the first version of this plan asserted the opposite:

> Weight 0 does the right three things... the topic goes vague, not down.

That was wrong, and the test written to prove it proved the reverse. A
`struggled` exposure at weight 0 is still *one more exposure of one more
depth*, so it lifts both terms of the confidence formula: recording a
struggle made the app **more** sure, not less. Exactly backwards.

So the depth does half the job and a clamp does the other half:

- **Ability does not rise.** Weight 0 contributes nothing to `totalWeight`.
  A topic cannot be lifted off the floor by struggling with it.
- **Reading is never erased.** Ability is untouched by the clamp, so a
  month of genuine reading survives a bad week. This is the assertion that
  rules out the subtract-from-weight design.
- **Confidence is held under the vague line** while a struggle is the most
  recent real thing the topic has to say — `STRUGGLING_CONFIDENCE` (0.35)
  against `CONFIDENT_ENOUGH` (0.4), both now named in `core/config` rather
  than the 0.4 being hard-coded across five surfaces.
- **It clears itself.** "Most recent" is read in date order, so reading the
  thing again, applying it, or skimming it retires the struggle with no
  "mark as resolved" anywhere. Writing another entry that says it still is
  not landing clamps it again. A *marked passage does not clear it* —
  keeping a sentence is evidence you were there, not that you have got it —
  and neither does one answered question; a skim is the lightest thing that
  counts.
- **It is legible.** The topic sheet lists the exposures behind its figure,
  so a `struggled` row prints there with your own sentence as its reason.
  Principle three, for free.

The topic goes **vague, not down**. `confidence < 0.4` already renders a
distinct uncertain state on five surfaces (`/`, `/subjects/[id]`,
`SubjectBed`, `/topics/[id]`, `GraphCanvas`). Nothing new is designed.

Rejected: a penalty term subtracting from `totalWeight`. It lets one bad
week erase a month of genuine reading, which is dishonest in the opposite
direction from flattering.

**Where this is load-bearing.** If the user later wants struggle to visibly
*drop* a number rather than hold it open, that is a change to
`computeAbility` and its tests and nothing else — the depth, the write path
and the UI all stay as they are.

### 3. `applied` finally has an input

`DEPTH_WEIGHTS.applied` is 1.0 and is the only depth that breaks the 3.5
consumption ceiling. **Nothing in the app currently writes it.** Ability is
capped at 3.5 for everything, forever, by construction.

The diary is the input it was built for. "Things I'm doing at work that
relate, how I've implemented my learning" is the definition of applied work.
This is not a new mechanism; it is the missing half of one that shipped.

### 4. The parse is a bench job, and it is undoable

Async, on the queue, the way ingestion and tending already work. A fifth
`JobKind`: `reading` — the app reading your entry back. It reports on the
bench like the other four, and the entry saves instantly regardless.

**The risk this creates, stated plainly:** an LLM reading freeform prose
decides what touches the map, with no confirm step. A wrong `struggled` on a
topic you are actually fine at makes it vague across five surfaces; a wrong
`applied` pushes a figure past a ceiling that exists to be hard to pass.

So the undo is not optional and is not a toast:

- The entry itself shows what the parse wrote against it, permanently —
  each tagged topic, the depth chosen, and the sentence it was drawn from.
- Any one of them can be revoked from the entry, at any time. Revoking
  deletes that exposure and lets ability recompute.
- The exposure's `reason` is the entry's own sentence, so the topic sheet
  explains itself without anyone opening the diary.

This keeps the fifth principle (the user always wins over the AI) on the one
write path where losing it costs most, without making you confirm a dialog
every time you write three sentences about your week.

## 5. The editor writes full markdown

Added 2026-09-14 at the user's request: headings, bullets, links to the
app's own entities, code blocks and LaTeX.

Most of this already exists and is switched off for notes rather than
missing. What is actually there today:

- **Bold, italic, bulleted and numbered lists** — `NoteEditor`'s four
  `execCommand` controls, with nesting handled by the serialiser.
- **Linking to our own entities** — `useMentions` and
  `@didactic/core/mentions`. `@` names a topic or a lesson and writes a link
  to its address; `highlight_tags` is the index over exactly those links.
  This *is* the entity linking, and it is the same mechanism the diary's
  tagging rides on.
- **LaTeX** — `lib/maths.ts` is a `marked` extension that typesets `$…$`
  and `$$…$$` through KaTeX to **MathML**, and `MATHML_TAGS` is already in
  `NOTE_TAGS`. A note can already carry a formula. KaTeX is already a
  dependency.
- **Code, inline** — `` ` `` round a term, already serialised.
- **Headings and code blocks in the renderer** — `PROSE_TAGS` carries
  `h1`–`h6` and `pre`, and `Prose.module.css` already sets them.

So the work is three narrow things, not a new editor:

1. **`NOTE_TAGS` gains `h1`–`h6`, `pre`, `blockquote`, `hr`.** The comment
   there says "a remark that needs an `<h2>` is a lesson" — true of a note
   on a passage, false of a diary entry, which is a page about a week.
   The allowlist widens for both; the alternative is a third allowlist and
   a second render path for a distinction the reader does not draw.
2. **The serialiser learns headings and fences.** `BLOCKS` already walks
   `h1`–`h6` but `paragraph()` drops the level; `pre` is unhandled
   entirely, so a code block round-trips into flattened prose. Both are
   additions to `block()`/`inline()` in `lib/richText.ts`.
3. **The toolbar gains the controls.** Heading level, code block, quote.
   `formatBlock` is the same deprecated-but-universal `execCommand` the
   existing four use; no new machinery.

**Not doing:** syntax highlighting in code blocks (Shiki/highlight.js is a
dependency and a theme for something nobody has asked to read back in
colour), and a markdown *source* mode. The box stays WYSIWYG over stored
markdown, which is what `richText.ts` exists for.

**The paste path stays plain-text.** `onPaste` deliberately strips markup.
Widening the allowlist does not widen what a paste can inject, which is the
property that comment is protecting.

## The new-note button

Persistent in the app chrome, inside `Bench` (which is already above the
router, so it survives navigation). What it writes depends on where you
press it:

- On a lesson: unchanged. The Highlighter's existing `noteOnLesson`.
- Anywhere else: a diary entry, pre-tagged with whatever the address is
  about — the topic on `/topics/[id]`, the subject on `/subjects/[id]`, the
  lesson's topic on `/lesson/[id]`.

Pre-tagged, not fixed: the tags are in the note text as mentions, so they
are editable prose like every other tag in the app. Pressing it on a topic
sheet and then writing about something else entirely means deleting a
mention, not fighting a form.

## The timeline

`/marked` becomes one date-ordered scrollable stream: marks with quotes,
marks without, and diary entries, newest first.

**First ship is marks + diary only.** The event toggles the user described —
subject sown, lesson opened, lesson read — are a second pass. They need
their own read paths unioned into the stream and they are the part of the
feature that is nice rather than load-bearing. The rows they would add are
already recorded (`036_lesson_opened`, sowings, exposures), so nothing is
being thrown away by waiting.

The search stays in the URL. The page keeps its current server-search
behaviour exactly.

## Work

| # | What | Where |
| --- | --- | --- |
| 1 | `kind` column, `struggled` enum value | `supabase/migrations/040_diary.sql` |
| 2 | `struggled: 0` in DEPTH_WEIGHTS, + scoring test | `packages/core/src/config.ts`, `tests/scoring.test.ts` |
| 3 | Diary create/read, tag rewrite reusing the mention path | `apps/web/src/lib/highlights.ts` |
| 4 | `POST /api/diary`, `DELETE /api/diary/[id]/exposures/[exposureId]` | `apps/web/src/app/api/diary/`, typed fn in `packages/api` |
| 5 | The parse — prose → per-topic depth + reason | `apps/web/src/lib/diary.ts` |
| 6 | `reading` job kind, bench copy | `packages/core/src/jobs.ts`, `copy.ts` |
| 7 | The button, address-aware | `apps/web/src/components/` inside `Bench` |
| 8 | Timeline render, marks + diary | `apps/web/src/app/marked/` |
| 9 | Rows moved, api-contract row for the two routes | `docs/monorepo/PARITY.md`, `guides/api-contract.md` |
| 10 | `NOTE_TAGS` widened; headings + fences in the serialiser; toolbar controls | `apps/web/src/lib/markdown.ts`, `lib/richText.ts`, `components/NoteEditor.tsx` |

Design passes through `impeccable` at steps 7 and 8 — the button is
persistent chrome in a world that has none, and the timeline is a rebuild of
a shipped sheet.

## What is deliberately not here

- **Event toggles** (sown / opened / read). Second pass; data already exists.
- **A confirm step on the parse.** Replaced by permanent, per-exposure undo
  on the entry.
- **Books and resources as tag targets.** `highlight_tags` has a
  one-end check over `topic_id` and `lesson_id`. Adding resource and book
  ends is a third and fourth nullable column and a wider check — real work,
  and not needed to find out whether the diary is a thing the user writes
  in. Books are mentioned in the prose meanwhile, which is where they read
  anyway.
- **Editing an entry re-running the parse.** First ship: the parse runs
  once, on save. Re-running on every edit means reconciling exposures
  against a changed reading, which is a whole design. Revoke and rewrite.
