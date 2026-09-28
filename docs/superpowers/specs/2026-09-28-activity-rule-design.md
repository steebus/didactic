# The activity rule — design

A year of the reader's activity, drawn where the mustard rule under the home
masthead now sits. Collapsed it *is* that rule, with a tick rising from it
for every day something was done. Pressed, it opens into a calendar heatmap.

## What was asked

- On the home sheet, in place of `.headRule` (`apps/web/src/app/page.module.css`).
- Collapsed: a thin timeline, one mark per day, no words. It can be grabbed and
  scrolled sideways, and on a phone only a sliver of it shows.
- Pressed: it expands to a full-height heatmap of days by weekday, in rounded
  cells.
- Colour comes from the subject's plate, and intensity from how much was done.
- Kinds of activity: marks, flashcards, lessons finished, resources read,
  inbox items added.

The paper background stays. It is two `repeating-linear-gradient`s on
`body`: no request, no decode and no animation, so a plain colour would save
nothing measurable.

## Decisions

- **One colour per day:** the subject with the most weighted activity that
  day. A tie goes to the subject with the lower id, which is stable and
  arbitrary. Activity with no subject counts towards the day's score but
  never towards its colour, unless it is all there is, in which case the
  mark is ink.
- **Weights** are `core/config.ACTIVITY_WEIGHT`:

  | Kind | Source | Weight |
  |---|---|---|
  | Lesson finished | `lessons.completed_at` | 5 |
  | Resource read | `resources.consumed_at` | 5 |
  | Mark | `highlights.created_at` | 1 |
  | Answer or diary entry | `exposures` with source `diary`, or depth `answered` | 1 |
  | Flashcard review | `cloze_reviews.reviewed_at` | 0.5 |
  | Inbox item added | `resources.created_at` | 0.5 |

  No other exposure is counted. The ones written when a lesson is finished,
  a resource read or a passage marked would count those events twice, since
  the table above reads each of them from its own row. An `answered`
  exposure counts whatever wrote it, because an answer has no row of its
  own.
- **The fold runs in SQL.** It happens where the rows are, in one round
  trip, and the phone will call the same function. Choosing the dominant
  subject and setting levels are rules, so they live in `core`, where they
  are tested.
- **Span:** 53 weeks, ending today. Days are cut in `ACTIVITY_TZ`
  (`Europe/London`), because the app has one owner and the database runs
  in UTC.

## Pieces

### `supabase/migrations/064_activity_days.sql`

`activity_days(p_since date, p_tz text)` returns
`table(day date, subject_id uuid, kind text, n int)`: the number of events of
each kind, per day and subject, since `p_since`.

- It is a `union all` over the six sources. Each is joined to a topic and then
  to that topic's `primary_subject_id`:
  - lessons through `lessons.topic_id`
  - resources through `resource_subjects`, taking the first subject
  - highlights, exposures and cloze reviews through their `topic_id`
- It is `security invoker`, with row-level security as the gate, the same
  way every other read works.
- `create or replace function` makes it safe to run twice.
- Weights are applied in `core`, not SQL. The function counts; `core` weighs,
  so changing a weight needs no migration.

### `packages/core/src/activity.ts`, with its test

- `ActivityCount = { day: string; subjectId: string | null; kind: ActivityKind; n: number }`
- `ActivityDay = { day: string; score: number; subjectId: string | null; counts: Partial<Record<ActivityKind, number>> }`
- `activityDays(rows, today)` returns all 371 days, with empty days filled
  in, oldest first.
- `activityLevel(score, scores)` returns 0–4. Zero is 0; the rest fall into
  quartiles of the reader's own non-zero days, so the strip reads against the
  reader's own habits.
- `activityTitle(day)` returns a label such as `12 March · 3 marks, 1 lesson`.
- The test covers weighting, choosing the dominant subject, ties, a day that
  is only unfiled, filling empty days, the edges of the level quartiles and an
  empty year.

`HomeData` in `core/shapes` gains `activity: ActivityDay[]`. The field is
additive.

### `apps/web/src/lib/home.ts`

Calls the function and folds the result with `activityDays`. **If the
function is missing or errors, it returns `[]`**, so a deploy that lands
before `064` has run leaves the plain rule where it was. `/api/home` passes
the field through, and gets a row in `api-contract.md`.

### `apps/web/src/components/ActivityRule.tsx` (client) and its `.module.css`

- The component is a `<button aria-expanded>` wrapping the strip. A press
  toggles it. A drag (the pointer moves more than 4px) scrolls and does not
  toggle.
- **Collapsed:**
  - The mustard rule stays as the baseline, at today's height.
  - Each active day is a 2px tick rising from it, taller at higher levels.
    It takes the colour of that day's plate (`@didactic/tokens` `plate`), or
    ink.
  - The strip is `overflow-x: auto` with the scrollbar hidden, dragged with
    the mouse through pointer events and natively by touch. On mount it
    scrolls to the right edge.
  - It is the same component at phone width, simply showing fewer weeks.
- **Expanded:**
  - A 7-row `grid` of rounded cells, one column per week. An empty cell is
    `--paper-deep`; a filled one is the plate at alpha for its level.
  - Month initials sit above the grid in the sheet's small caps.
  - It opens with the `grid-template-rows: 0fr → 1fr` transition, which is
    instant under `prefers-reduced-motion`.
- Each tick and cell carries a `title` from `activityTitle`.

### Docs

- `docs/monorepo/PARITY.md`: the `/` row notes the activity rule, with the
  phone planned.
- `docs/monorepo/guides/api-contract.md`: `/api/home` gains `activity`.

## Order of landing

The migration and the code go up together. The code tolerates the function
being absent, so their order does not matter. Checks: `npx turbo run lint
typecheck test` and the web build.

## Not doing

- Filtering by subject, a legend, or streaks.
- A per-subject breakdown inside a day, which the title already gives.
- Anything on the phone app, which does not exist yet.
