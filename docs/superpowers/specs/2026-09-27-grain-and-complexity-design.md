# Grain and complexity: the adjusted design

27 September 2026. Adjusts *Didactic — Grain and Complexity Spec* (same
date), which is kept as the brief this answers. Where they differ, this
document is what was built. Each change says why.

## The idea, unchanged

The size of a thing is decided by deterministic, explainable signals. The
model names things and judges sameness; it does not decide how big they
are. A topic's **identity** (its row, exposures and edges) is stable and
changes only through a user action. How big it **looks** for this reader
(its effort to target, its lesson budget, whether it reads as lesson-,
topic- or subject-sized) is derived on read from their ability and target,
the way freshness is, and never stored as a decision.

## Review: what changed, and why

1. **Constants live in `packages/core/src/config.ts` (`GRAIN`), not a
   `grain_config` table.** The figures are printed by both apps from
   pure functions in `core`. Constants held in the database would sit
   outside those functions and their tests, and could differ between a
   phone build and the server. A code change deploys as quickly as a
   migration here, since both run on a push to `main`.

2. **C is the topic's own effort, with its prerequisites assumed.** The
   brief lets specialisation breadth push C up. Subject totals then add
   up C across topics, which counts a child's hours once in the child and
   again in its umbrella. So breadth is taken out of C. It becomes
   **span**: the topic plus its `specialises` varieties, counted once
   each. Span is what decides the display grain ("subject-sized for
   you"). The topic's own C is what decides its lesson budget.

3. **Prerequisite depth needs no transitive reduction.** The longest
   path in a DAG is the same with or without the shortcut edges a
   reduction removes. What it does need is cycle safety: model-drawn
   `prereq` edges can loop. It is computed cycle-safe. Each edge is
   weighted by who drew it: the reader's own count 1, the model's 0.5.
   That answers the brief's circularity concern (model edges feeding a
   figure meant to be deterministic) without dropping them.

4. **Concept yield is not in the first prior.** The concept count is
   thrown away once a piece is filed as one topic, so there is nothing
   to compute it from yet. It needs a stored count per resource.

5. **The C-ratio guard on linking is dropped.** A concept being resolved
   at ingestion has no edges and no material yet, so its prior C is the
   base figure for every concept, and a ratio against it is noise. The
   same-size question is already asked, by the evaluation model
   (`guardScope`).

6. **Taxonomy anchors are deferred.** Three reasons:
   - The sources could not be reached from the build environment.
     OpenAlex now needs an API key, which is free but has to be set in
     the environment. ACM refuses automated requests.
   - Research taxonomies fit a learner's topics poorly. "React Hooks"
     has no honest OpenAlex topic, and ANZSRC and ASCED are too coarse
     to tell a topic from a lesson.
   - Anchors would enter a prior whose weights are set by hand anyway.

   They come back as a pilot if a signal is shown to be missing: OpenAlex
   with a key, ACM CCS for computing, matched as topic sameness is.

7. **Calibration is deferred, and the brief's method would not work as
   written.** Ability does not respond to effort. An exposure's weight is
   its depth times its relevance, the same for a 500-word article as a
   10,000-word one. "Effort spent per unit of ability gained" therefore
   measures the length of the reader's material and the app's own
   weights, not the size of the topic.

   Calibration needs an outcome that measures mastery rather than
   volume, for example effort from a topic's first exposure to its first
   correct check or whole summary. It stays Open until that is designed.
   `effort_minutes` on exposures waits with it.

8. **The display-grain band is a pure function; its memory is
   deferred.** The display cannot flicker as things stand. H only falls
   as evidence lands, because ability rises and freshness is not in the
   model (see 11). It rises only when the graph or the target changes,
   and those are real changes. So there is nothing to oscillate yet.
   `displayGrain(lessons, previous)` takes the previous state now, and
   storing it waits for the thing that could make it oscillate:
   freshness or calibration.

9. **The target is new data.** "How far I want to go" is free text read
   by the sowing model. So `subjects.target_depth` and
   `topics.target_depth` are added (numeric, 2 to 5). An unset target
   falls back to **3, a working knowledge**, and the figure says it was
   assumed.

10. **Roots on the ability scale.** Roots run 0 to 5, and ability runs 1
    to 5. Roots are read as `max(1, roots)`, so "no prior knowledge" is
    the floor.

11. **Freshness does not discount a₀ yet** (the brief's first Open
    question). Doing so would make H move with no new evidence, which
    this model avoids everywhere else. Revisit with data.

12. **Promote already does most of what the brief asks.** The topic row,
    its exposures and its routes survive. The subject is added, and
    memberships are added, never taken away.

    It files the topic's `prereq` descendants as well as its
    `specialises` ones. That is kept, because the outline nests by both,
    and "everything under it in the outline" is what promote has always
    meant.

    What was missing is an undo. **Put it back** removes the subject and
    restores each topic's home exactly as it was (`subject_promotions`).
    It leaves exposures and edges untouched.

13. **Demote was irreversible, and worse than the brief feared.** It
    moves the child's material, exposures, marks, cards and memberships
    onto the parent, then deletes the row. Nothing records what moved.
    Deleting the row also set to null the topic of any lesson *in
    another route* that taught the child, so completing those lessons
    silently stopped moving the map.

    It becomes a **fold with a ledger** (`topic_folds`). The same moves
    are made, so the parent keeps the child's history. That is today's
    100% roll-up, which settles the brief's third Open question for now.
    Every moved row is recorded, and the child row is kept as a
    snapshot. Lessons elsewhere that taught the child are pointed at the
    parent rather than at nothing.

    **Unfold** puts every recorded row back, including the parent
    relevances the fold raised. It restores the row, its memberships and
    edges, and moves back any lesson exposures written against the fold
    since. It keeps the lesson the fold created if the reader has worked
    it, and drops it if not.

14. **Ask-proposed topics are read at accept, not before the card
    appears.** It gives the same protection for the map, at one reading
    per accepted topic rather than one per proposal. A proposal the
    reading takes to be an existing topic opens that topic. A doubtful
    one joins the adjudication queue with the reading kept. A new one is
    created and filed where the reading placed it (Ask topics used to
    arrive loose).

15. **Proposals (grow children, fold in, multi-resolution sprouting) are
    Phase 4, after the effort figure has been live.** Their thresholds
    are the brief's defaults, and they need `community_runs` history to
    show stability. They are specified below unchanged and not built.

## Verified in code

- [x] **Promote:** keeps the row, exposures, routes and old memberships.
  It adds a subject with the topic's title, files the topic and its
  `prereq`/`specialises` descendants into it, and makes it their home.
  It is refused for a topic with a route. There was no undo.
- [x] **Demote:** moves everything onto the target, creates a lesson in
  the target's route, and deletes the row. No undo. Other routes'
  lessons were unhooked.
- [x] **The sowing target:** free text (`subject_sowings.depth`), not a
  number.
- [x] **Effort:** lessons carry `estimated_minutes`. Readable bodies can
  be word-counted (`resource_bodies.words`, added and backfilled here).
  Exposures carry their `source` and `source_id`, which lead to both.
- [x] **Edge provenance:** `edges.created_by` (`ai`, `user`,
  `skeleton`).
- [x] **Route length:** fixed at "8 to 16 lessons" in the drafting
  prompt, about 20 minutes each.

## The model, as built

### Inherent complexity C (a topic's own hours from nothing to ability 3)

`log C = log 10 + Σ contributions`, each contribution stored with the
figure so the explanation adds up to it exactly.

| Signal | Contribution |
| --- | --- |
| Base | 10 hours: about one teaching week of a 150-hour unit (1 EFTSL ≈ 1,200 hours) |
| Prerequisite depth *d* | `0.10 × min(d, 5)`, with *d* the longest weighted chain of `prereq` edges into the topic (the reader's edges 1, the model's 0.5) |
| Focused material *w* | `0.12 × ln(1 + min(w, 50 000) / 2 500)`, with *w* the words of readable material filed under this topic alone |

Uncertainty is a flat `log sd = 0.7` (a factor of about two) until
calibration. Every C, and therefore every effort figure, prints as
"about …" for now, which is honest: nothing has checked it yet.

### Span

C plus the C of every `specialises` variety below it, each counted
once, cycle-safe. Used only for display grain.

### Applied complexity H (this reader's hours to their target)

`H = C × (r^a* − r^a₀) / (r³ − r¹)`, `r = 1.8`, and 0 when a₀ ≥ a*.

- **a₀:** the topic's ability. Below 0.4 confidence it is blended toward
  the subject's roots, weighted by `confidence ÷ 0.4`. With no roots it
  is ability alone.
- **a\*:** the topic's own target, else the highest target among its
  subjects, else 3. Roots come from the subject that supplied the
  target, or the highest roots among its subjects when the target is the
  topic's own.

### Lessons and display grain

- `L = ⌈H ÷ 1.25⌉`, the effort one lesson carries with its reading and
  practice.
- The **route budget** is L for the topic's own H, clamped to 3–24. The
  drafting model may go 20% either way and must say why; the reason is
  kept on the route.
- **Display grain** comes from L for the span:

| L | Shown as |
| --- | --- |
| 0 | at your target |
| 1 | lesson-sized for you |
| 2–12 | a topic |
| over 12 | subject-sized for you (entered above 12, left below 10 when a previous state is known) |

## Surfaces built now

| Sheet | What appears |
| --- | --- |
| **Topic** | A third figure in the band, **To target**: "about 14 h". Pressed, the slip explains the sentence "About 14 hours to depth 4 from where you are, about 12 lessons". It shows C's contributions, where a₀ came from, the target and where it came from, the cost curve, and the span when the topic has varieties. The target is set here. Folds made into this topic are listed with **Unfold**. |
| **Subject bed** | The bed's effort to its target, summed over its topics, with the target control. A promoted subject offers **Put it back**. |
| **Curriculum drafting** | The lesson budget, and the model's reason when it went outside it. |

Deferred surfaces:
- the home stock list's effort per bed;
- graph node sizing by C or H;
- the sowing form's estimate;
- the nested outline for subject-sized topics, and sub-routes. The
  subject bed was flattened on purpose, and re-nesting it is its own
  design.

## Phases

| Phase | Status |
| --- | --- |
| 1. Foundations | **Built** without anchors. C is computed on read (cached, held until topics change) rather than stored, so there is no `complexity_features` table until calibration needs history. |
| 2. Applied view | **Built:** targets, H, L, display grain, the effort figure, the route budget. Deferred surfaces are listed above. |
| 3. Safer identity actions | **Built:** fold and unfold, promote and put back, Ask read at accept. The C-ratio guard is dropped (review 5). |
| 4. Proposals | Not built. Grow children, fold in and multi-resolution sprouting as the brief specifies, with its hysteresis. |
| 5. Calibration | Not built, and blocked on an outcome measure (review 7). |

## Open questions

- Freshness in a₀ (review 11).
- Lesson-scale concepts as facets rather than topics.
- Whether *r* should vary by subject.
- The weekly cap on grain proposals.
- An outcome measure for calibration (review 7).
- Whether anchors earn their cost (review 6).

## Acceptance checks

- [x] H and L come from `core/grain`, so both apps print the same
  figures.
- [x] Every C explanation's contributions reconcile to the figure (a
  test).
- [x] Effort figures print as "about …", in italic and faded, while
  uncertain.
- [x] Fold then unfold, and promote then put back, leave exposure counts
  and edges unchanged (tested against Postgres).
- [x] Display grain holds inside the band when the previous state is
  given (a test). Stored memory is deferred (review 8).
- [x] Ask-proposed topics pass the sameness reading before a row is
  written.
- [x] Existing API responses are unchanged apart from new fields.
- [ ] Two recomputes with no new data yield identical proposals (Phase
  4).
- [ ] A recompute makes zero writes to identity without an accepted
  proposal (Phase 4; nothing recomputes identity yet).
