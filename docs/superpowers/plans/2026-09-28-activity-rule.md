# Activity rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mustard rule under the home masthead with a year of the
reader's activity: ticks when collapsed, a heatmap when pressed.

**Architecture:** An SQL function counts events by day, subject and kind.
`core/activity` weighs them, picks each day's dominant subject and sets
levels. `lib/activity` reads the function without caching, and the page
streams it in behind `Suspense`. `ActivityRule` is a client component that
draws it.

**Tech Stack:** Postgres (Supabase), TypeScript, vitest, Next.js 16 with
cacheComponents, CSS modules.

**Spec:** `docs/superpowers/specs/2026-09-28-activity-rule-design.md`

## Global Constraints

- Nothing under `packages/` imports `next`, `react-native`, the DOM or Supabase.
- The migration is safe to run twice (`create or replace`), and the web
  tolerates the function not existing yet.
- `/api/home` is additive only: it gains `activity`.
- Weights: lesson 5, resource read 5, mark 1, answer or diary 1, flashcard
  0.5, inbox item added 0.5.
- Span: 371 days ending today in `Europe/London`.

## Deviation from the spec

The activity is **not** folded into the cached `getHomeData`. That read is
tagged `subjects`, `topics` and `resources` and held for a year, and a
flashcard review, a mark or a lesson answer does not drop those tags, so
the strip would go stale. `getActivity()` is an uncached single RPC,
streamed in behind `Suspense` so the stock list never waits on it.
`/api/home` returns `{ ...home, activity }`.

## Review Focus

- A reader with no activity at all should see the plain mustard rule, not
  an empty grid.
- Before `064` has run, the RPC errors; the page should render the plain
  rule, not throw.
- A day near midnight should fall on the London date, not the UTC one
  (SQL `at time zone`).
- A drag on the strip should scroll it and not toggle it open.
- A day with only unfiled activity should draw in ink and not crash on a
  missing subject.

---

### Task 1: `core/activity` and its test

**Files:** create `packages/core/src/activity.ts` and
`packages/core/tests/activity.test.ts`; modify `packages/core/src/config.ts`.

**Produces:**

```ts
type ActivityKind = 'lesson' | 'read' | 'mark' | 'answer' | 'card' | 'added'
ActivityCount = { day: string; subjectId: string | null; kind: ActivityKind; n: number }
ActivityDay = { day: string; score: number; subjectId: string | null; counts: Partial<Record<ActivityKind, number>> }
activityDays(rows: ActivityCount[], today: string): ActivityDay[]  // 371 days, oldest first
activityLevel(score: number, scores: number[]): 0 | 1 | 2 | 3 | 4
activityTitle(day: ActivityDay): string
ACTIVITY_WEIGHT, ACTIVITY_DAYS = 371, ACTIVITY_TZ = 'Europe/London'  // in config
```

- [ ] Write the tests: weighting, dominant subject, a tie going to the
  lower id, an unfiled-only day, empty days filled, level quartiles, an
  empty year, and titles.
- [ ] Run `npx vitest run tests/activity.test.ts` in `packages/core` and
  confirm it fails.
- [ ] Implement.
- [ ] Run it and confirm it passes.

### Task 2: migration `064_activity_days.sql`

`activity_days(p_since date, p_tz text)` returns
`table(day date, subject_id uuid, kind text, n int)`. It is a `union all`
over `lessons.completed_at`, `resources.consumed_at`,
`resources.added_at`, `highlights.created_at`, `exposures` (source
`diary` or depth `answered`) and `cloze_reviews.reviewed_at`. Each joins to
a topic's `primary_subject_id`; resources join to their first
`resource_subjects` row. It is `create or replace`, `stable` and
`security invoker`.

- [ ] Write it, then parse-check it by running it against local Postgres
  if one is available; otherwise review it against the schema.

### Task 3: web read, route and component

**Files:** create `apps/web/src/lib/activity.ts`,
`apps/web/src/components/ActivityRule.tsx` and `ActivityRule.module.css`;
modify `apps/web/src/app/page.tsx`, `page.module.css`,
`apps/web/src/app/api/home/route.ts` and `packages/api/src/home.ts`.

- `getActivity(): Promise<ActivityDay[]>` returns `[]` when the RPC errors.
- The page replaces `<div className={styles.headRule} />` with
  `<Suspense fallback={<div className={styles.headRule} />}><ActivityEntry colours={…} /></Suspense>`.
- `ActivityRule({ days, colours })` renders the collapsed ticks and the
  expanded grid, as the spec describes.

- [ ] Implement.
- [ ] Run `npx turbo run lint typecheck test` and
  `npx turbo run build --filter=@didactic/web`.
- [ ] Check it in a browser at desktop and phone widths.

### Task 4: docs, then commit and push to main

- [ ] Update the `/` row in PARITY, the `/api/home` row in `api-contract`,
  and the spec note.
- [ ] Commit, merge to `main` and push.
