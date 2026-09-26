# Didactic — Sprouting Subjects Design

**Date:** 2026-09-26
**Status:** Approved in conversation, built in the same change
**Scope:** web, with the shared maths in `packages/core`; mobile named and deferred

---

## 1. Purpose

Every subject on the map was named by someone before anything was put in
it. A subject is sown, and the topics are laid out under it. What the map
has never done is the opposite: notice that a handful of topics keep
turning up together in what the reader saves, belong to no subject, and
are one waiting to be named.

This adds that reading. A **sprouting subject** is a set of topics the
reader's own material keeps putting together, read off the map with the
subjects taken out, that no existing subject already accounts for. The
app finds them, names them, says why, and offers to give each one a bed.
The reader decides.

### What this is not

Not a reorganisation of the map. Nothing is filed, moved or renamed until
the reader presses for it. A sprouting subject is a proposal, like a
drafted route, and counts for nothing until accepted.

Not a taxonomy. An earlier idea rated every topic against a fixed list of
fields (arts, politics, history…) and clustered on the ratings. It was
set aside as the thing that *forms* clusters for two reasons: a fixed list
can only rediscover the fields it was given, which works against a
subject emerging on its own; and it cannot separate topics where most of
this map lives — web, databases, infrastructure and AI all sit at one
point marked "technology". It survives as a candidate *explanation*
layer (§11).

### Success criteria

Opening the bed with subject pull turned down and kinship pull turned up
shows clumps that are there because of the material, not because of the
filing. The sprouting sheet lists the clumps worth naming, says what
holds each one together in counts, and one press turns one into a subject.

---

## 2. The bed's forces, first

The clusters the bed drew before this change were partly its own doing,
so no reading of them could be trusted. Four faults, each in the model
rather than in the numbers:

1. **Gravity had one strength at every distance.** ForceAtlas2's default
   gravity is constant in magnitude. Against a repulsion falling as 1/d,
   that settles at a density falling as 1/r: a dense knot in the middle
   and a thin halo, with every pull off.
2. **Repulsion and gravity were weighted by degree.** FA2 gives each node
   a mass of one plus its weighted degree, so a well-joined topic shoved
   harder than a quiet one whatever the sliders said.
3. **Link pull did nothing.** It set `edgeWeightInfluence`, which raises
   each edge's weight to that power. No edge carried a `weight`
   attribute, so every weight was 1 and every power of it was 1. At 0 it
   would have meant "every edge at full strength", not "no pull".
4. **Subjects pulled through a ring of invisible edges.** A ring folds a
   subject into a loop or a chain, and every loose topic was threaded
   onto one ring of its own — so the topics filed nowhere, which are
   exactly the ones a new subject would sprout from, drew as one false
   cluster.

And the live forces ignored the sliders entirely (they ran on hardcoded
settings), while moving a slider tore the canvas down and laid it out
again from nothing.

### The replacement (`core/forces`)

A d3-force simulation, chosen for what it does when things are turned off:

| Force | Model | Slider |
| --- | --- | --- |
| Spacing | Charge, equal for every topic, falling as 1/d (Barnes–Hut). Material, lessons and marks carry a quarter. | Spacing |
| Draw together | A spring to the centre, growing with distance. | Draw together |
| Stated relations | Springs along `edges`, scaled by the claim's weight and damped by d3's 1/min(degree). | Link pull |
| Subjects | A spring from each topic to the centroid of each subject it sits in; a topic in two is pulled to the mean of both. Loose topics feel nothing. | Subject pull |
| Kinship | Springs along the kinship lines (§3). | Kinship pull |
| Attachment | Material, lessons and marks held beside what they touch, at a strength no slider governs. | — |
| Collision | Seeds kept clear of each other's drawn radius. | — |

Charge falling as 1/d balanced against a linear spring is a 2D Coulomb gas
in a harmonic trap, whose equilibrium is a disc of even density. So with
every pull at nothing the bed settles as an evenly spaced disc, and each
pull adds shape to that rather than correcting a lopsided start. With
gravity off as well, the disc expands evenly until the simulation cools.
The constants are derived from this: a charge *q* in a trap of stiffness
*k* spaces itself at √(πq/k), so the two are set to give `SPACING` (40
layout units) at the defaults.

Measured by the tests on a 150-topic bed: the coefficient of variation of
nearest-neighbour distance is 0.04 with every pull off (0 is a lattice,
random scatter is about 0.52), with and without gravity.

Seeds start on a Fibonacci lattice cut into one wedge per subject, so the
first frame is already even and pulling a subject in is a short move.

**The bed simulates on load.** It runs live from the seeded start and
cools to rest in about five seconds. Every force scales with the
simulation's temperature, so it stops on its own. A slider change warms it
again instead of rebuilding the canvas; a drag pins the held seed and
keeps the bed warm until it is let go. Under reduced motion it is settled
before the first paint, and a slider change settles again at once.

---

## 3. Kinship: what ties two topics, subjects aside

Four channels, each scored 0–1 per pair of active topics, none of which
reads `topic_subjects`:

| Channel | Source | Score | Weight |
| --- | --- | --- | --- |
| Material | `resource_topics` | Cosine between the two topics' occurrence vectors over resources. Each entry is `s × relevance / √(n−1)`: `s` is 1 for read material and 0.5 for unread, and `n` is how many topics the resource carries, so one long article counts for less per pair. Multiplied by `k/(k+1)` for `k` shared resources, so a pair seen together once scores half. | 1.0 |
| Marks | a mark's own topic plus every topic its note names | `1 − e^(−count)` over the marks joining the pair | 1.0 |
| Stated | `edges` | The strongest weight between the pair, either direction | 0.6 |
| Meaning | `topics.kin_embedding`, falling back to `embedding` | Cosine after subtracting the mean vector, kept only for each topic's 8 nearest; negative is 0 | 0.5 |

Unread material counts because this is a reading of **interest**, and
saving is intent. Ability is the opposite case, where only consumption
counts; the two do not conflict because this reading writes no figure.

Cosine damps hubs: a topic in fifty resources and a topic in two that
share both scores 0.2, not 1. Material is weighted highest because it is
the most organic signal: the reader's saving puts the topics together, not
a model. Stated edges score lower because ingestion only relates topics
from the same resource and sowing only within one bed, so they partly
repeat material and partly lean toward the subjects.

**Meaning, and why the mean is subtracted.** gte-small's similarities are
bunched high: `config.ts` records unrelated pairs reaching 0.80 and
adjacent ones starting at 0.83. A fixed cut cannot separate that. Taking
the mean vector out (the ordinary correction for an anisotropic embedding
space) spreads the distribution, and keeping only each topic's nearest
neighbours makes the channel rank-based rather than threshold-based.

**A second vector.** `embedding` is the topic's *title* alone
(`ingest.ts`), and the resolver's thresholds are calibrated on exactly
that, so it is left alone. `topics.kin_embedding` embeds `title — summary`
where a summary exists. A trigger nulls it when either changes, and it is
filled lazily in bounded batches whenever sprouting subjects are named, so
every write path is covered without touching any of them.
`scripts/reembed.ts --kin` backfills in one go.

The combined line is the weighted sum of the four channels, and the
kinship graph keeps each topic's 8 strongest lines (a line survives if
either end keeps it). Those lines are what kinship pull pulls along.

---

## 4. Reading communities

Louvain community detection over the kinship graph
(`graphology-communities-louvain`, the graph library the canvas already
uses). Chosen over k-means or HDBSCAN on vectors because the evidence is
mixed and naturally a graph, the number of subjects is not known, and a
topic can end up belonging to nothing.

**Stable, not stochastic.** Louvain is randomised. It runs twelve times
from fixed seeds, and two topics are kept together only where a kinship
line joins them and they shared a community in at least 80% of runs. The
communities are the connected components of those kept lines. The same map
therefore reads the same way every time, as the bed's order already does.

**Checked against what is already known.** Among the subjects with at
least four topics, the reading counts how many it finds again: a community
that is at least 70% one subject and holds at least half of it. The sheet
prints this — *read the same way, the map finds 3 of your 4 subjects* —
because it is the only honest evidence that the reading can be believed
about the topics nobody has filed.

---

## 5. When a community is a sprouting subject

For each stable community of at least **4** topics:

- **At least 70% one subject** → that subject found again (it counts
  toward §4's check) or a group within it. Not a sprout.
- **Held together by fewer than 2 resources** (resources carrying at least
  two of its topics) → one article's worth of topics. Not a sprout.
- Otherwise a sprout, of one of two kinds:
  - **New ground**: its topics come from at most one subject, mostly
    loose.
  - **Across** (a bridge): its topics come from two or more subjects
    without being most of any, e.g. data visualisation drawing on web
    development and statistics. Bridges count.

Ranked by *cohesion × √size × log₂(1 + resources)*, where cohesion is
the share of its members' kinship that stays inside it. Each carries its
evidence as counts: *6 topics, held together by 11 pieces of material, 4
of them read, and 2 marks.*

---

## 6. Naming

One model call names every unnamed sprout at once (at most six per call),
through a forced tool, as `lib/llm/grouping.ts` does. It is shown, per
sprout: each topic with its description, the titles of the resources that
bind it, and whether each topic is loose or which subject it sits in; and,
once, every existing subject's name so it does not propose one twice.

It answers per sprout: a title of two to four words, a paragraph on why
these belong together that names the material, the topics at its core, and
a verdict. **"Not a subject" is an allowed answer**, as "leave it
ungrouped" is for groups: a clump of unrelated topics that happen to share
a reading list should be passed over, not named.

---

## 7. What is kept

Clusters are computed on read and never stored. Only decisions are kept,
in `sprouts` (`052`):

| Column | |
| --- | --- |
| `topic_ids uuid[]` | Its topics as last read, which is what later readings match against |
| `named_topic_ids uuid[]` | Its topics when the name was written |
| `title`, `why`, `core_topic_ids` | The model's reading; null until named |
| `status` | `open`, `dismissed` (the reader said not this), `planted` (it became a subject), `passed` (the model said not a subject) |
| `subject_id` | The subject it became |

**Matching.** Each fresh reading is matched to kept rows one-to-one, most
overlap first, by Jaccard similarity of topic sets, at a bar of 0.5.
So a dismissed sprout does not come back because it gained one topic, and
a sprout that has grown past recognition is a new question. A matched open
sprout whose topics have drifted below 0.75 of the set its name was
written for is named again.

---

## 8. Surfaces

### The bed

- The forces panel gains **Subject pull** and **Kinship pull**. *Repel*
  becomes **Spacing**. *By kinship* sets subject pull to 0 and kinship
  pull to 1; *Reset* restores the defaults.
- A **Sprouting** toggle draws each open sprout as a dashed, unfilled
  outline around its visible topics, with its name in italic over it.
  Clicking inside an outline opens its panel: name, reasoning, evidence,
  topics, **Give it a bed** and **Not this**.
- Kinship lines are fetched only when something needs them (the toggle,
  or kinship pull above 0). They never draw; they only pull.

### The sheet, `/sprouting`

One entry per open sprout, strongest first: its name (or *not yet named*),
its kind (*New ground* / *Across Web Development and Statistics*), the
model's reasoning, the evidence line, its topics (core first, loose ones
marked), and the resources that bind it. **Give it a bed** takes an
editable title and makes the subject, filing every topic in it unplaced,
as the loose sheet's bulk file does, and pointing at *Draw connections*.
**Not this** dismisses it. The head carries §4's check. Arriving with
unnamed sprouts or topics missing their second vector starts the naming,
and the sheet says so while it runs.

### The subjects sheet

A **Sprouting subjects** entry under Loose stock, set as a holding with
its count, whenever there is at least one open sprout.

---

## 9. API (additive)

| Method | Path | Returns | Invalidates |
| --- | --- | --- | --- |
| GET | `/api/sprouts` | `Sprouting`: open sprouts, the kinship lines, the found-again check, counts of what is dismissed, unnamed and unembedded | — |
| POST | `/api/sprouts/name` | `Sprouting`, after filling missing vectors and naming | sprouts |
| POST | `/api/sprouts/[id]/plant` | `{ subjectId, filed, note }` | subjects, topics, pending, sprouts |
| POST | `/api/sprouts/[id]/dismiss` | `{ ok }` | sprouts |

`getSprouting` is `use cache`, tagged topics, subjects, resources,
highlights and a new `sprouts` tag, so the home count, the sheet and the
bed read one computation.

## 10. Deploy order

The migration and the web build land on the same push and are not a
transaction, so the code is written to stand either way round: a read
that asks for `kin_embedding` falls back to one without it, and a missing
`sprouts` table reads as no kept decisions, so nothing is named or
planted until it exists. The migration is safe to run twice: `if not
exists` throughout, policies dropped before they are created, and the
trigger replaced rather than added.

## 11. Later

- **The facet compass.** Embed a short description of each of a few dozen
  fields once, and read each sprout's centroid against them: *leans
  History, Economics*. The fixed-field idea is used here as an
  explanation, and costs no model call per topic.
- **Sprouting on arrival.** Reading after each ingestion, so the home
  count moves when a resource lands and not only when the bed or sheet is
  opened. Clusters are already computed on read, so what this adds is the
  naming call.
- **Scale.** The meaning channel is O(n²) in JavaScript. That is instant
  at hundreds of topics and seconds at a few thousand; past that, move the
  nearest-neighbour search into pgvector.
- **Mobile.** The forces and the reading are in `packages/core` for the
  phone's Skia bed; the surfaces are `planned` in `PARITY.md`.

## 12. Constants

Starting positions, taken from the shape of the decisions rather than
from rows, because no data was reachable when this was written. The
found-again check is what re-measures them.

| Name | Value | |
| --- | --- | --- |
| `UNREAD` | 0.5 | Unread material against read |
| `NEAREST` | 8 | Kinship lines kept per topic, and meaning neighbours |
| `RUNS` / `TOGETHER` | 12 / 0.8 | Louvain runs, and the share two topics must share |
| `MIN_TOPICS` | 4 | Smallest sprout |
| `MIN_MATERIAL` | 2 | Resources that must bind it |
| `WITHIN` | 0.7 | One subject's share that makes it that subject |
| `MATCH` / `RENAME` | 0.5 / 0.75 | Jaccard bars for keeping a decision and a name |
