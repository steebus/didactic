# Didactic — Conversational Mode Design

**Date:** 2026-09-25
**Status:** Approved design, ready for implementation planning
**Scope:** v1 on the web, including fold-into-lesson; mobile named and deferred

---

## 1. Purpose

A reader in the middle of a lesson hits a paragraph they do not follow.
Today the only moves are to mark it, make a cloze of it, or leave. None of
those answers the question. This adds the move that does: a button in the
corner of every page that opens a conversation with an agent which already
knows what is on screen.

The agent is not a general chat window that happens to live in the app. Its
value is the context it does not have to be told — which lesson, which
section, which passage was selected — and its ability to turn the
conversation into the same material the app is made of: marks, cards,
topics, diagrams, questions, and in the end a section of the lesson itself.

### What this is not

Not a second writing agent. It proposes; it does not write to the map. Every
row it would create is offered and waits for a tap, which is the posture the
app already takes toward irreversible acts — merging a resource is "a
suggestion on the shelf rather than something done quietly".

Not a new rendering surface. It draws with the blocks lessons already use.

### Success criteria

Reading a section you do not understand, one press gets an answer about
*that* section without your having to say which. A discussion worth keeping
ends up either anchored in the lesson or folded into it, and is still there
next week.

---

## 2. Scope

### In (v1, web)

- A docked circle bottom-right on every page, rendered from `layout.tsx`.
- A chat panel: messages, streamed, with blocks rendered.
- Automatic context: route kind, entity id and title, visible section, and
  the selected quote when opened from a selection.
- "Ask more" as a third button in the lesson selection toolbar.
- Five tools: `propose_mark`, `propose_card`, `propose_topic`,
  `read_lesson`, `search_map`.
- Proposals accepted by tap, which is the only thing that writes a row.
- Agent-authored blocks from the existing `BLOCKS` registry.
- Persistence on the existing `conversations` / `messages` tables.
- An anchor in the lesson that reopens a discussion.
- Fold: an explicit action that writes a reformatted section into
  `lessons.body` near where the conversation started.

### Out (deferred)

- `apps/mobile`. The shared types are placed for it; the surface is a
  later commit and a later PARITY move.
- Voice.
- Conversations spanning more than one entity.
- Editing or deleting a folded section from the chat.

---

## 3. Architecture

Six units, each with one job.

| Unit | Location | Job |
|---|---|---|
| `AskButton`, `AskPanel` | `apps/web/src/components/` | The circle and the panel. Client. |
| `useAskContext` | `apps/web/src/lib/` | Assembles the context object. Client. |
| `ask.ts` | `packages/core/src/` | Context and proposal types plus validation. No platform. |
| `llm/ask.ts` | `apps/web/src/lib/llm/` | Prompt, tools, the turn. Server. |
| `POST /api/ask` | `apps/web/src/app/api/ask/` | Auth, persistence, one turn. |
| `POST /api/ask/[id]/accept`, `/fold` | same | The two acts that write. |

The agent loop stays in one server file beside the existing fifteen `llm/`
modules rather than spreading across the app. The context and proposal
shapes go in `packages/core` because the phone will need the same
vocabulary, and a types-and-validation module is exactly what that package
permits.

### Reused rather than rebuilt

- `BLOCKS` and `blockPromptSection()` — the agent's diagrams and questions.
- `parseBlocks()` — rendering them in chat.
- `toolList()` — reading every tool call, per that file's own instruction
  that the coercion lives in one place.
- `conversations` / `messages` — persistence.
- `lessonSections()` and `slugFor()` — anchors and the fold point.
- `highlights`' `quote`/`prefix` pair and `markAnchor` — re-finding an
  anchor in prose.
- The `--bench-stack` / `--mark-panel` custom-property convention —
  docking without hardcoded offsets.

---

## 4. Data model

One migration, `050_ask.sql`, additive and safe to run twice.

### Extending `conversations`

`conversation_kind` gains `'ask'`.

```sql
alter table conversations
  add column if not exists lesson_id uuid references lessons(id) on delete cascade,
  add column if not exists topic_id  uuid references topics(id)  on delete cascade,
  add column if not exists context   jsonb;
```

The existing `node_id` column references `nodes(id)`, which predates
`012_subjects_and_topics`. An ask conversation does not use it; it anchors
on `lesson_id` or `topic_id` instead.

`context` holds the `AskContext` as it was when the conversation opened —
route kind, entity, section id, and the selected quote where there was one.
Frozen rather than live, for the same reason `highlights.quote` is kept
verbatim: it is the record of where the question was asked, and a section
that has since been rewritten does not make the record wrong.

### Messages carry blocks with no schema change

`messages.content` stays `text`. The agent's diagrams live as fenced JSON
inside the markdown, exactly as a lesson body holds them, so `parseBlocks()`
renders them with no new column and no new component. This is the payoff
from reusing the registry, and it is what makes folding nearly free — the
discussion is already lesson-shaped.

### Proposals

```sql
alter table messages
  add column if not exists proposals jsonb;
```

A proposal is what a tool call produced and the reader has not accepted:
`[{ kind: 'mark', quote, note }, …]`, each gaining an `accepted_at` when
tapped. It sits on the message that offered it, so it survives a reload
without a table of its own. A separate table would earn its place if
proposals had to be queried across conversations; they do not.

### `ask_anchors`

```sql
create table if not exists ask_anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  conversation_id uuid not null references conversations(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  quote text not null,
  prefix text,
  created_at timestamptz not null default now()
);
```

Deliberately the same `quote`/`prefix` pair as `highlights`, so `paintMarks`
and `markAnchor.panelSpot` find it by the mechanism that already exists, and
a rewritten lesson degrades it the way it degrades a mark rather than in a
new way.

RLS on both, matching `025_row_level_security.sql`.

### Folding needs no schema

A fold reads the conversation, asks the model for a lesson-shaped section,
and writes `lessons.body`, inserting after the heading named in
`context.sectionId` via `lessonSections()`.

A finished lesson is only rewritten when `regenerate` is passed, which
blanks the body outright, so a folded section persists in normal use. The
regenerate path gains a warning that folded material will be lost. That is
the honest statement of the one case where it is, and it costs a line.

---

## 5. The agent

### Tools, and the asymmetry

| Tool | Effect |
|---|---|
| `propose_mark` | Returns a proposal. Writes nothing. |
| `propose_card` | Returns a proposal. Writes nothing. |
| `propose_topic` | Returns a proposal. Writes nothing. |
| `read_lesson` | Reads the body, or one named section. |
| `search_map` | Finds existing topics by name. |

The three write tools do not write. The agent loop has no write path at
all; a row appears only when the reader taps accept and
`POST /api/ask/[id]/accept` inserts it. The property worth having is that a
prompt injection carried in a lesson body can make the agent *suggest*
something and never create it.

`search_map` exists because of what `config.ts` already records: the
resolver went to considerable trouble not to create near-duplicate topics,
and an agent proposing "Virtual DOM Diffing" while "React" sits in the map
would undo that quietly. It searches first and proposes a link where
something matches.

### Blocks

The system prompt includes `blockPromptSection()` verbatim. A tenth block
added to `BLOCKS` is offered in chat with no edit here, which is the promise
that file already makes about the writing agent.

### Context in the prompt

The `AskContext` renders as a short preamble: page, entity, section, and the
selected quote where there is one. On a lesson the agent also receives the
current section's text, not the whole body — `read_lesson` fetches more if
the conversation widens. The common turn stays cheap while the primary
scenario, "I read this section and do not follow it", needs no tool call.

### Degrading

No gateway, no key, or a failed call returns a message saying so and keeps
the conversation, which is the posture `settleWithReading` already takes in
falling back rather than losing the work.

---

## 6. The surface

### The button

A circle matching `.folded` in `Player.module.css`: 2.75rem, `--paper`
ground, lifted shadow, `z-index: 50`. Bottom-right, which is empty today;
`.folded` is bottom-left, so nothing collides.

Rendered from `layout.tsx` outside `main`, per the rule in
`apps/web/CLAUDE.md` about anything docked at the foot. That is what makes
it site-wide from one place.

It stands on `max(--bench-stack, --mark-panel)` as `.folded` does, and
publishes its own `--ask-panel` height while open so that anything docked
later can stand on it. No hardcoded offsets.

On the lesson page it takes the lower slot in the right column, below the
existing circles. To be confirmed on screen rather than from the stylesheet.

### "Ask more"

A third button in the selection toolbar beside `Add mark` and `Make a
cloze` (`Highlighter.tsx`, the `offer` block). Same `styles.pin` treatment
with a third modifier. It opens the panel with `offer.quote` and
`offer.prefix` as context, reusing the pair the highlighter already computes
for anchoring.

### The panel

Docked bottom-right on a wide screen, full-width at `NARROW` (40rem, the
constant the highlighter already uses). Messages render through
`parseBlocks()`. Proposals render as cards with an accept button. On a
lesson the panel offers "keep this", which writes an `ask_anchor`, and "add
to lesson", which folds.

Follows `DESIGN.md`; any new rule is amended there in the same commit, with
`.impeccable/design-tokens.json` and `packages/tokens` kept in step.

### Mobile

Deferred. `packages/core/src/ask.ts` holds the shapes the phone will reuse,
and the API is additive, so an old build is unaffected. PARITY carries the
row as built / planned.

---

## 7. Testing

- `packages/core/src/ask.ts` — context and proposal validation, tests beside
  it in `tests/`, per the rule that every export in `packages/` has one.
- Block round-trip: the agent's fenced output parses back through
  `parseBlocks()` into the expected block. This is the test that catches
  chat and lessons drifting apart.
- The fold: given a body and a `sectionId`, the section lands after the
  right heading. A pure function over markdown, so it tests without a model.
- Routes: auth answers 401 and never a redirect; the proposal→accept path
  writes exactly one row.
- No test asserts model prose.

---

## 8. Open items

Two things to confirm on screen before calling the surface done:

1. The button's exact slot on the lesson page, against the existing circles.
2. That the panel clears the mark composer at phone width, where the
   composer covers the corner the bench is in.
