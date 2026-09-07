# Didactic — Learning Map Design

**Date:** 2026-09-07
**Status:** Approved design, ready for implementation planning
**Scope:** v1 (phases 1–2), with phases 3–4 named but not specified

---

## 1. Purpose

A single-user web app that maintains a living graph of what its owner is
learning. Resources go in; the graph grows, links itself, and shows which
areas are hot, which have gone cold, and where material has been stockpiled
but not read.

The product is the map. Ingestion feeds it. Everything else is later.

### What this is not

Not a scoring system. The ability estimate exists to make the map legible,
not to grade the user. It is deliberately coarse, always explainable, and
capped in ways that prevent it from overstating what reading alone proves.

### Success criteria

The app succeeds if, opening it after a week away, the owner can see at a
glance what they have been feeding and what they have starved, and can act
on a cold area in one click. If the map does not feel alive, later phases
will not rescue it.

---

## 2. Scope

### In (v1)

- Graph of nodes (subtopics) and edges (typed relationships), grouped into
  clusters (topics)
- Two-channel node health: **ability** (1–5, app-owned, with confidence) and
  **freshness** (time decay)
- Resource inbox with lifecycle: `queued → reading → consumed`, plus
  `abandoned`
- AI ingestion: URL, PDF, pasted text → concepts → matched or attached to
  graph nodes
- Consumption emits an exposure event, which nudges ability and resets
  freshness
- Optional skeleton seeding (developer-roadmap JSON, Wikipedia categories)
- Manual curation: rename, merge, split, delete nodes and edges
- Home: cluster overview cells plus hot / cold / queued / suggested panels
- Full-screen graph view with search and filter
- Refresher engine: picker plus generated content plus resurfaced own
  resources
- Score audit trail: every ability change records its cause

### Out (deferred)

| Deferred | Phase | Why it waits |
|---|---|---|
| Quiz generation and grading | 3 | Needs a populated graph to quiz against |
| Conversational agent debrief | 3 | Same; also the largest single subsystem |
| FSRS scheduling | 4 | v1 decay is a drop-in replacement point |
| Curriculum generation | 4 | Meaningless before the graph has shape |
| Blindspot / alternative suggestions | 4 | Needs `alternative` edges to exist in volume |
| Multi-user, sharing, RLS | — | Single user for now |
| EPUB / full-book text ingestion | — | Legal and practical friction; books get metadata plus notes |

### Decomposition

This design covers phases 1–2 only. Phases 3 and 4 each warrant their own
spec, written after v1 has been used for long enough to know whether the map
feels alive.

---

## 3. Data model

Postgres via Supabase. pgvector enabled.

### `clusters`

A topic — a group of related nodes.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `title` | text | |
| `colour` | text | assigned on creation, stable |
| `created_at` | timestamptz | |

Aggregate health is computed at read time, never stored.

### `nodes`

A subtopic. The unit of the graph.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `title` | text | |
| `slug` | text unique | |
| `summary` | text | short, AI-written, user-editable |
| `embedding` | vector(1536) | load-bearing; see §4.3 |
| `cluster_id` | uuid fk nullable | null while unassigned |
| `ability` | numeric(2,1) | 1.0–5.0, **cached rollup** of `exposures` |
| `ability_confidence` | numeric(3,2) | 0–1 |
| `last_exposure_at` | timestamptz nullable | |
| `state` | enum | `active` \| `pending` |
| `created_by` | enum | `ai` \| `user` \| `skeleton` |
| `created_at` | timestamptz | |

Freshness is **not stored**. It is computed from `last_exposure_at` at read
time, avoiding a nightly decay job.

`state = 'pending'` marks a node the resolver was unsure about; it awaits
user adjudication and is excluded from scoring rollups until confirmed.

Index: HNSW on `embedding` for cosine distance.

### `edges`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `from_node` | uuid fk | |
| `to_node` | uuid fk | |
| `kind` | enum | `prereq` \| `related` \| `specialises` \| `alternative` |
| `weight` | numeric(3,2) | 0–1 |
| `created_by` | enum | `ai` \| `user` \| `skeleton` |

Directed. Unique on `(from_node, to_node, kind)`.

`alternative` is unused in v1 but present in the enum — it is what phase 4
blindspot suggestions read, and adding an enum value later is a migration
for no benefit.

### `resources`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `url` | text nullable | |
| `title` | text | |
| `kind` | enum | `article` \| `pdf` \| `book` \| `note` |
| `status` | enum | `queued` \| `reading` \| `consumed` \| `abandoned` |
| `raw_text` | text nullable | extracted, for the LLM |
| `summary` | text nullable | |
| `storage_path` | text nullable | Supabase Storage key for the original file |
| `mime_type` | text nullable | |
| `file_size` | bigint nullable | |
| `added_at` | timestamptz | |
| `consumed_at` | timestamptz nullable | |

Adding a resource does **not** imply exposure. Only the transition to
`consumed` emits an exposure event. Queued resources surface on the map as a
pending signal, showing where material has been stockpiled but not read.

### `resource_nodes`

| Column | Type | Notes |
|---|---|---|
| `resource_id` | uuid fk | |
| `node_id` | uuid fk | |
| `relevance` | numeric(3,2) | 0–1 |

Primary key `(resource_id, node_id)`. One resource touches several nodes at
different depths.

### `exposures`

The event log. The source of truth for ability.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `node_id` | uuid fk | |
| `source` | enum | `resource` \| `quiz` \| `agent` \| `manual` |
| `source_id` | uuid nullable | resource id, or message id when `source = 'agent'` |
| `depth` | enum | `skim` \| `read` \| `applied` |
| `ability_delta` | numeric(3,2) | |
| `reason` | text | human-readable, shown in node detail |
| `created_at` | timestamptz | |

`quiz` and `agent` are valid from day one so phases 3–4 add rows, not
migrations.

### `conversations` / `messages`

| `conversations` | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `kind` | enum | `refresher` \| `exposure_debrief` \| `quiz` |
| `node_id` | uuid fk nullable | |
| `started_at` | timestamptz | |

| `messages` | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `conversation_id` | uuid fk | |
| `role` | enum | `user` \| `assistant` \| `system` |
| `content` | text | |
| `token_count` | int nullable | |
| `created_at` | timestamptz | |

v1 writes refreshers through these tables as a `refresher` conversation with
a single assistant message, and reads them back rather than regenerating.
There is no chat UI in v1 — this is persistence only. Phase 3 chat reuses the
same tables, and `exposures.source_id` then points at the message that caused
a score change, completing the audit trail without a backfill.

### `ingestion_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `resource_id` | uuid fk | |
| `state` | enum | `pending` \| `running` \| `failed` \| `done` |
| `attempts` | int default 0 | |
| `error` | text nullable | |
| `updated_at` | timestamptz | |

### Two deliberate calls

**Ability is a cache, not a source of truth.** It is a rollup over
`exposures`, recomputed on write. This costs a little work and buys two
things: every number can answer "why do you think that?" with real events,
and the scoring formula can be revised later by recomputing rather than by
losing history.

**pgvector is load-bearing.** Embedding search is the dedup mechanism that
keeps one canonical node per concept. If it works, the graph stays coherent.
If it does not, nothing else in the app matters.

---

## 4. Ingestion

### 4.1 Pipeline

Paste URL, upload PDF, or write a note → row in `resources` with
`status: queued` → job enqueued → worker runs:

1. **Fetch and extract.** URL → Readability for clean article text. PDF →
   `pdf-parse`, original stored in Supabase Storage with `storage_path` set.
   Book → metadata lookup only, no text. Note → already text.
2. **Summarise and extract concepts.** One LLM call with structured output:
   a summary, plus candidate concepts each with a relevance score. Concepts
   are candidates, not yet nodes.
3. **Resolve concepts against the graph.** See §4.3.
4. **Propose edges.** LLM suggests typed relationships between new nodes and
   their nearest existing neighbours. Written with `created_by: 'ai'`.
5. **Assign clusters.** A new node joins the cluster of its strongest
   neighbours. With no strong neighbours, it starts a new cluster.
6. **Stop.** `status` remains `queued`. No exposure event is written.

### 4.2 Consumption

When the user marks a resource consumed, the app asks one question: **skim,
read, or applied?** That writes one `exposures` row per linked node, with
`ability_delta` proportional to `relevance × depth_weight`, then recomputes
ability and sets `last_exposure_at`.

### 4.3 The resolver

For each candidate concept: embed it, cosine-search `nodes`.

| Similarity | Action |
|---|---|
| > 0.85 | Existing node. Link; do not create. |
| 0.70 – 0.85 | Ambiguous. Create with `state: 'pending'` for user adjudication. |
| < 0.70 | New concept. Create with `state: 'active'`. |

The thresholds are starting guesses, not science. They live in config and are
expected to be tuned after observing real ingestion.

The `pending` band is the safety valve. **Wrong merges are worse than wrong
splits:** a bad merge destroys information irrecoverably, while a bad split is
one click to fix. When uncertain, the resolver asks.

Skeleton imports run through steps 3–5 unchanged, so seeding a topic from
developer-roadmap JSON cannot fragment the graph either.

### 4.4 Queue and failure

Supabase `pgmq` with `pg_cron` invoking an Edge Function worker. The queue
sits next to the data, survives redeploys, and provides retries and a
dead-letter queue. Ingesting a long article is three to four LLM calls — well
past a serverless request timeout, so a queue is not optional.

Jobs retry three times with exponential backoff. A permanently failed job
leaves its resource `queued` with the error visible in the inbox; the user can
retry it or convert it to a manual note.

**Node and edge creation happens in a single transaction at the end of the
pipeline.** A crash mid-run leaves no orphaned nodes.

---

## 5. Scoring

### 5.1 Ability

A rollup over `exposures`, recomputed on write.

- Each exposure contributes `relevance × depth_weight`, where skim = 0.2,
  read = 0.5, applied = 1.0.
- **Diminishing returns.** Contributions follow a log curve, so the tenth
  article on a node moves it far less than the first.
- **Consumption ceiling: 3.5 of 5.** Reading alone cannot produce a score
  above 3.5. Reaching 4–5 requires `applied` depth, or later, quiz or agent
  evidence. This is the mechanism that keeps an app-owned number honest.
- `ability_confidence` rises with the count and diversity of exposures. A
  single skim yields a low-confidence 2, not a confident one. The UI renders
  low confidence as visibly vague — soft edges, hedged language — rather than
  as a precise figure.
- Onboarding self-declaration seeds ability as a low-confidence prior, which
  real exposures overwrite.

### 5.2 Freshness

`freshness = exp(-days_since_exposure / half_life)`, computed at read time.

Half-life defaults to 90 days and scales with ability: better-known material
fades more slowly. This function is the FSRS hook — replacing it with real
FSRS later touches one function and nothing else.

### 5.3 Cluster aggregates

- **Ability:** relevance-weighted mean of member nodes.
- **Freshness:** mean weighted toward the *worst* members, so a cluster
  cannot appear healthy because two hot nodes mask twenty cold ones.

Nodes with `state: 'pending'` are excluded from both.

---

## 6. Surfaces

**Home.** Cluster overview cells — size by node count, colour by aggregate
ability, glow by aggregate freshness — beside four panels: hot now, gone cold,
queued unread, suggested next. Clicking a cell opens the graph zoomed to that
cluster.

**Graph.** Full-screen WebGL canvas. Search, and filter by cluster, ability,
and freshness. Clicking a node opens its detail.

**Node detail.** Ability with its reasoning — the exposure list, in plain
language — plus linked resources, neighbours, and a "refresh me" action.

**Inbox.** Resources grouped by status, the consume prompt, and the
pending-node adjudication queue.

**Refresher.** For one cold node: generated content, with the user's own
previously consumed resources on that node resurfaced beneath it. Persisted as
a `refresher` conversation. Quiz-based refresh joins this surface in phase 3.

**New topic.** The user names a topic ("React"). The app asks three to five
questions to gauge current understanding, generates the subtopic graph through
the resolver (optionally seeded by a skeleton), and writes one `manual`
exposure per node carrying the self-declared prior at low confidence. This is
the only place ability is user-supplied, and real exposures overwrite it.

Visual direction is set separately using the impeccable skills; this document
specifies structure and behaviour only.

---

## 7. Stack

| Concern | Choice | Reasoning |
|---|---|---|
| App | Next.js + TypeScript on Vercel | Server routes for ingestion and LLM calls; one deploy |
| Data | Supabase Postgres + pgvector | Graph as tables; vector search for dedup |
| Auth | Supabase Auth | One line now; painful retrofit later |
| Files | Supabase Storage | PDF originals |
| Queue | Supabase pgmq + pg_cron + Edge Function | Queue beside the data; retries and DLQ included |
| LLM | Anthropic API | Extraction, summarisation, refreshers |
| Graph canvas | Cosmograph (WebGL) | Comfortable at 10k+ nodes; Sigma.js is the fallback |
| Extraction | Readability, pdf-parse | Boring and sufficient |

A graph database was considered and rejected: this graph is thousands of
nodes, not billions, it needs neighbourhoods rather than deep traversal, and
Neo4j would cost a second service, a second auth story, and pgvector.

---

## 8. Testing

- **The resolver** is the component that must not break. A fixture set of
  concept/node pairs with known-correct outcomes, run as a real suite. This
  is where regressions destroy graph coherence silently.
- **Scoring maths** gets unit tests: diminishing returns, the 3.5 ceiling,
  confidence growth, decay, cluster aggregation.
- **Ingestion** gets one end-to-end test against a saved HTML fixture. No
  live network in tests.
- Everything else is verified manually for a single-user v1.

---

## 9. Build order

1. Schema, migrations, Supabase project
2. Resolver plus its fixture suite — before anything depends on it
3. Ingestion pipeline and queue
4. Scoring rollups
5. Graph view
6. Home and inbox
7. Refresher engine

The resolver comes second deliberately: it is the highest-risk component, and
everything downstream assumes it works.
