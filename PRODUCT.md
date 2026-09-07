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

The product is the map. Resource ingestion feeds it. Quizzing, agent
conversation, and curriculum generation are later phases whose value depends
entirely on the map feeling alive first.

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

- Resources arrive as URLs, PDFs, pasted notes, and book references — often
  captured on a phone mid-reading, processed later.
- Ingestion is asynchronous; a resource is filed into the graph on arrival,
  but no learning is recorded until the user marks it consumed and says how
  deeply.
- Subjects overlap heavily. Nodes must be reused across topics rather than
  duplicated per subject, which is why concept resolution runs through vector
  similarity on every write path, ingestion and skeleton seeding alike.
- The graph grows to thousands of nodes; the home screen exists because a raw
  canvas at that size cannot be glanced at.

## Capabilities and Constraints

- **Node health has two channels:** ability (1–5, app-owned, with an explicit
  confidence) and freshness (time decay, computed at read time).
- **Ability is app-owned and not user-editable.** Node detail explains its
  reasoning by listing the exposures behind it; there is no manual override
  and no pinning. A wrong score is corrected by feeding real evidence, not by
  setting the number. This is a confirmed product decision, not an
  implementation gap.
- **Ability is a cache over an append-only exposure log**, never written
  directly, so every number is reconstructible and explainable.
- **Reading cannot produce expertise.** Consumption-only ability is capped at
  3.5 of 5; higher requires applied work, or later, quiz and agent evidence.
- **Ambiguous concepts are adjudicated by the user**, not silently merged or
  split. A wrong merge destroys information; a wrong split costs a click.
- Single user. Auth exists; sharing, tenancy, and row-level security do not.
- Full-book text ingestion is out of scope; books carry metadata and the
  user's own notes.
- Deferred to later phases: quizzing, conversational agent, FSRS scheduling,
  curriculum generation, blindspot suggestions.

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
