# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15 (App Router) + TypeScript, Supabase (Postgres, pgvector, Auth,
Storage, pgmq/pg_cron), Anthropic API, Cosmograph for the graph canvas.
Decided by the user during the design brainstorm; recorded in
`docs/superpowers/specs/2026-09-07-didactic-learning-map-design.md` §7.

## Users

A single user: a front-end developer who learns constantly and across a wide
spread — web and app development, databases, infrastructure, AI, and
non-technical subjects such as economic history and photography. They read
articles and books, build personal projects, and pick things up at work.

Two distinct sessions, both real:

- **Desktop, deep.** Exploring the graph, reading a refresher, thinking about
  where to go next. The large canvas is the point.
- **Mobile, incidental.** Firing a URL into the inbox, marking something
  consumed, and checking the graph while away from a desk. The graph must
  work on a phone, not merely degrade to a list.

## Product Purpose

Maintain a living map of what its owner is learning, so that a glance shows
which areas are being fed, which have gone cold, and where material has been
stockpiled but never read.

Success is the weekly return: opening the app after a week away and both
seeing the shape of recent attention and being able to act on a cold area in
one click.

The product is the map. Resource ingestion feeds it, and curricula are how a
cold or empty area gets worked deliberately rather than waiting for something
to wander into the inbox. Quizzing and open agent conversation are later
phases whose value depends entirely on the map feeling alive first.

## Positioning

Read-later tools store what you meant to read. Note tools store what you
wrote. Spaced-repetition tools drill what you chose to memorise. None of them
show the shape of your attention across subjects over time.

Didactic tracks **exposure**, not completion — and separates it from
**ability**, which the app estimates and owns. Saving a resource is intent;
only consuming it counts. That distinction is the mechanism: it makes the map
an honest record of what has actually been learned rather than a wishlist
that flatters its owner.

## Operating Context

- The map has four layers: a **subject** ("photography", "front-end
  development") holds **topics**, a topic holds **curricula**, and a
  curriculum holds **lessons**. Topics under one subject need not relate to
  each other — portrait and landscape photography are separate pursuits — and
  a topic belongs to every subject it genuinely sits under, not just the one
  it was first entered through.
- Resources arrive as URLs, PDFs, pasted notes, and book references — often
  captured on a phone mid-reading, processed later.
- Ingestion is asynchronous; a resource is filed into the graph on arrival,
  but no learning is recorded until the user marks it consumed and says how
  deeply.
- Subjects overlap heavily. Topics must be reused across subjects rather than
  duplicated per subject, which is why concept resolution runs through vector
  similarity on every write path, ingestion and skeleton seeding alike.
- The graph grows to thousands of topics; the home screen exists because a raw
  canvas at that size cannot be glanced at.
- A subject has its own sheet: the bed as a **fixed outline** — topics nested
  by what specialises or precedes what, with the material, curricula and
  lessons filed under each — where topics are added and removed. The graph is
  the other reading of the same data and is one press away from it.

## Capabilities and Constraints

- **Topic health has two channels:** ability (1–5, app-owned, with an explicit
  confidence) and freshness (time decay, computed at read time).
- **Ability is app-owned and not user-editable.** Topic detail explains its
  reasoning by listing the exposures behind it; there is no manual override
  and no pinning. A wrong score is corrected by feeding real evidence, not by
  setting the number. This is a confirmed product decision, not an
  implementation gap.
- **Sowing a subject is where its first figure comes from.** The user states
  their own depth on a 0–5 roots scale, says what has taken and where the
  ground is thin, says how far they want to take it, and may hand over proof
  — links, books, courses, qualifications, uploaded PDFs — which is filed as
  read material straight away. Naming the subject also sets the agent writing
  5–10 qualifying questions about the subject, in difficulty order, answered
  while the rest of the sheet is filled in. All of it is optional.
- **How far the user says they want to go sets the shape of the bed**, not
  just its labels: curiosity gets 6–10 broad topics, a working knowledge
  10–16, mastery 16–24 finely cut. This is the one input that changes what
  gets laid out rather than how it is scored.
- **Roots of nought writes nothing.** "No prior knowledge" is a stated fact,
  not a missing answer, so no exposure is recorded and the topics sit at the
  floor with no history and no confidence. The proof filed on the sheet does
  not write exposures either: it informs the stated estimate, and counting it
  twice would flatter the map.
- **Ability is a cache over an append-only exposure log**, never written
  directly, so every number is reconstructible and explainable.
- **Reading cannot produce expertise.** Consumption-only ability is capped at
  3.5 of 5; higher requires applied work, or later, quiz and agent evidence.
- **Ambiguous concepts are adjudicated by the user**, not silently merged or
  split. A wrong merge destroys information; a wrong split costs a click.
- Single user. Auth exists; sharing, tenancy, and row-level security do not.
- Full-book text ingestion is out of scope; books carry metadata and the
  user's own notes.
- **A curriculum is drafted with the agent and owned by the user.** The agent
  can lay one out from the subject and topic alone; the user steers it with a
  stated goal and with reference material they trust, and reshapes it before
  approving. A draft is a proposal and counts for nothing until approved.
- **Completing a lesson is an exposure like any other.** It goes through the
  append-only log at a depth the user states, so the consumption ceiling still
  holds: working the lessons of a curriculum by reading alone cannot pass 3.5.
- Deferred to later phases: quizzing, conversational agent, FSRS scheduling,
  blindspot suggestions.

## Brand Commitments

Name: **Didactic**.

The user named Obsidian, Zotero, developer-roadmap, and Google NotebookLM as
inspirations. These are reference points for behaviour and feel, recorded here
as stated; they are not a visual mandate and do not constrain the visual world.

## Evidence on Hand

- `docs/superpowers/specs/2026-09-07-didactic-learning-map-design.md` — the
  approved design spec.
- `docs/superpowers/plans/2026-09-07-didactic-v1.md` — the v1 implementation
  plan, 17 tasks.
- No code, no users, no usage data, no screenshots yet. There are no
  testimonials, benchmarks, or customers, and none may be invented.
- Real subject matter for early graphs, from the user's own brief: CDN
  distribution, PostgreSQL, Supabase, React, web development, app
  development, JavaScript, AI, auth, the history of capitalism, photography.

## Product Principles

1. **The map is the product.** Every feature either makes the map more
   accurate, more legible, or more actionable. Features that do none of those
   wait.
2. **Honest over flattering.** The app would rather show a small, cold,
   accurate map than a large, warm, aspirational one. Filing is not reading;
   reading is not understanding.
3. **Every number explains itself.** An app-owned score the user cannot
   interrogate is a score the user will stop trusting.
4. **Vagueness is a feature where confidence is low.** A coarse, visibly
   uncertain estimate is more truthful than a precise wrong one, and must
   look that way.
5. **The user always wins over the AI.** Generated structure is a proposal:
   renameable, mergeable, splittable, deletable.

## Accessibility & Inclusion

No user-specific requirement was established. The graph carries the general
constraint that colour alone cannot encode ability and freshness — the two
health channels need a non-colour reading (size, label, or explicit value) for
the map to be legible to anyone with reduced colour vision, and for the
"gone cold" signal to survive on a dim phone screen outdoors.
