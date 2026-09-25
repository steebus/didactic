# Conversational Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A button in the corner of every page that opens a conversation with an agent which already knows what is on screen, can keep marks and cards, propose topics, draw the lesson blocks, and fold the discussion back into the lesson.

**Architecture:** Shared shapes in `packages/core/src/ask.ts` (no platform imports). One server module `apps/web/src/lib/llm/ask.ts` holds the prompt, the five tools and the turn. Three additive routes under `/api/ask`. Two client components docked from `layout.tsx`. Everything visual reuses the existing block registry and the mark anchoring machinery.

**Tech Stack:** Next.js (the version in `apps/web/node_modules/next` — read its docs before writing route code), TypeScript, Supabase/Postgres, `@anthropic-ai/sdk`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-conversational-mode-design.md`

## Global Constraints

- `packages/core` imports no `next`, `react`, `react-native`, DOM global, `dompurify`, `jsdom`, or live `@supabase/*` client. Type imports are fine. The package's own ESLint rule enforces this; do not disable it.
- Every export in `packages/` has a test beside it in that package's `tests/`.
- Every route handler checks the owner through `apps/web/src/lib/auth.ts` and answers `401` as JSON, never a redirect.
- Every write route calls `revalidateTag` for what it moved, and registers in `packages/api/src/endpoints.ts` with the tags it invalidates.
- Client components call `@didactic/api`, never `fetch('/api/…')`.
- API changes are additive only: a response may gain a field and may not lose or rename one.
- Migrations are safe to run twice (`if not exists`, `drop policy … if exists` then create). A merged migration is a deploy; never edit one already merged.
- Every feature moves its row in `docs/monorepo/PARITY.md` in the same commit as the code.
- Model calls in `lib/llm/` pass `NO_THINKING` and read tool output through `toolList` from `./toolInput`.
- Surfaces follow `DESIGN.md`; a new rule is amended there in the same commit, with `.impeccable/design-tokens.json` and `packages/tokens` kept in step.

## Review Focus

These are the failure modes the spec implies but that no task's happy path exercises. Each has its test placed in the task that owns the code.

1. **A lesson body with no heading at all.** `foldInto` is told to insert after `sectionId` and there is no heading to find. Expected: the section is appended at the end rather than the body being lost. (Task 4)
2. **A `sectionId` that no longer exists in the body.** The lesson was regenerated between the conversation and the fold. Expected: append at the end, never throw, never silently drop the fold. (Task 4)
3. **A tool call whose array arrives as a JSON string.** The documented reason `toolList` exists. Expected: the mark is still read and kept. (Task 5)
4. **An agent block payload that is not valid JSON.** Expected: it renders as the code block it looks like, exactly as `parseBlocks` already guarantees for lessons — the message is never lost. (Task 7)
5. **A second undo of the same mark.** A double tap, or an undo after a reload. Expected: answers ok and removes nothing the second time, rather than erroring or deleting someone else's row. (Task 6)

---

## File Structure

**Create**
- `supabase/migrations/050_ask.sql` — the enum value, the three columns, `ask_anchors`, RLS.
- `packages/core/src/ask.ts` — `AskContext`, `Proposal`, `AgentWrite`, validation, `foldInto`.
- `packages/core/tests/ask.test.ts`
- `packages/api/src/ask.ts` — the typed client functions.
- `apps/web/src/lib/llm/ask.ts` — prompt, tools, one turn.
- `apps/web/src/app/api/ask/route.ts` — start or continue a conversation.
- `apps/web/src/app/api/ask/[id]/accept/route.ts` — accept a topic proposal.
- `apps/web/src/app/api/ask/[id]/undo/route.ts` — undo an agent write.
- `apps/web/src/app/api/ask/[id]/fold/route.ts` — fold into the lesson.
- `apps/web/src/components/AskButton.tsx`
- `apps/web/src/components/AskPanel.tsx`
- `apps/web/src/components/Ask.module.css`
- `apps/web/src/lib/useAskContext.ts`
- `apps/web/tests/ask-route.test.ts`
- `apps/web/tests/ask-blocks.test.ts`

**Modify**
- `packages/core/src/index.ts` — export the new module.
- `packages/api/src/index.ts` — register `ask`.
- `packages/api/src/endpoints.ts` — four endpoint rows.
- `apps/web/src/app/layout.tsx` — dock the button.
- `apps/web/src/components/Highlighter.tsx` — the third selection button.
- `apps/web/src/components/Highlighter.module.css` — its modifier class.
- `apps/web/src/app/api/lessons/[id]/body/route.ts` — the regenerate warning.
- `docs/monorepo/PARITY.md` — the row.
- `DESIGN.md` — the docked-corner rule.

---

## Task 1: The migration

**Files:**
- Create: `supabase/migrations/050_ask.sql`

**Interfaces:**
- Produces: `conversation_kind` value `'ask'`; `conversations.lesson_id`, `.context`; `messages.proposals`; table `ask_anchors`. A topic conversation uses the existing `node_id`, which 012 left pointing at `topics`.

- [ ] **Step 1: Write the migration**

```sql
-- Conversational mode: a conversation anchored on what was on screen.
--
-- Everything here is additive and safe to run twice. The enum gains a
-- value, three columns appear on tables that already exist, and one
-- table is created.

-- `alter type ... add value` is not transactional in older Postgres and
-- errors if the value is already there, so it is asked conditionally.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'conversation_kind' and e.enumlabel = 'ask'
  ) then
    alter type conversation_kind add value 'ask';
  end if;
end $$;

-- Where the conversation was had.
--
-- `node_id` is already the topic: 012 renamed `nodes` to `topics` and
-- left the column's name behind it, so a conversation about a topic
-- uses the column that is there rather than a second one beside it. A
-- lesson is what it could not say, so that is what is added.
alter table conversations
  add column if not exists lesson_id uuid references lessons(id) on delete cascade,
  add column if not exists context   jsonb;

-- What a message offered but has not had accepted, and what the agent
-- wrote by itself so the panel can still offer the undo after a reload.
alter table messages
  add column if not exists proposals jsonb;

-- A discussion, found again in the prose it was about. The quote and
-- prefix pair is the one `highlights` uses, so `paintMarks` and
-- `markAnchor` re-find it by machinery that already exists.
create table if not exists ask_anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  conversation_id uuid not null references conversations(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  quote text not null,
  prefix text,
  created_at timestamptz not null default now()
);

create index if not exists ask_anchors_lesson_idx on ask_anchors (lesson_id);

alter table ask_anchors enable row level security;

drop policy if exists "own ask anchors" on ask_anchors;
create policy "own ask anchors" on ask_anchors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Check it applies and re-applies**

Run: `npx supabase db reset` if a local stack is running; otherwise read it against `025_row_level_security.sql` and confirm the policy shape matches.
Expected: applies clean, and running the file a second time changes nothing and raises nothing.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/050_ask.sql
git commit -m "A conversation remembers where it was had"
```

---

## Task 2: Shared shapes in core

**Files:**
- Create: `packages/core/src/ask.ts`
- Create: `packages/core/tests/ask.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `type AskRoute = 'lesson' | 'topic' | 'subject' | 'cards' | 'other'`
  - `interface AskContext { route: AskRoute; entityId?: string; title?: string; sectionId?: string; sectionText?: string; quote?: string; prefix?: string }`
  - `type Proposal = { kind: 'topic'; name: string; summary: string; acceptedAt?: string }`
  - `type AgentWrite = { kind: 'mark' | 'card'; id: string; label: string; undoneAt?: string }`
  - `function isAskContext(value: unknown): value is AskContext`
  - `function contextPreamble(c: AskContext): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { isAskContext, contextPreamble } from '../src/ask'

describe('an ask context', () => {
  it('accepts the shape the panel sends', () => {
    expect(isAskContext({ route: 'lesson', entityId: 'a', title: 'Compounding' })).toBe(true)
  })

  it('rejects an unknown route, because the preamble would lie about where the reader is', () => {
    expect(isAskContext({ route: 'nowhere' })).toBe(false)
  })

  it('rejects a non-object', () => {
    expect(isAskContext(null)).toBe(false)
    expect(isAskContext('lesson')).toBe(false)
  })
})

describe('the preamble', () => {
  it('names the lesson and the section', () => {
    const out = contextPreamble({
      route: 'lesson',
      entityId: 'a',
      title: 'Compounding',
      sectionId: 'what-compounds',
    })
    expect(out).toContain('Compounding')
    expect(out).toContain('what-compounds')
  })

  it('carries the selected passage when there is one', () => {
    const out = contextPreamble({ route: 'lesson', title: 'X', quote: 'the rate is annual' })
    expect(out).toContain('the rate is annual')
  })

  it('says where the reader is even with nothing but a route', () => {
    expect(contextPreamble({ route: 'other' })).not.toBe('')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/core && npx vitest run tests/ask.test.ts`
Expected: FAIL — cannot find module `../src/ask`.

- [ ] **Step 3: Write the module**

```ts
/**
 * What the ask agent is told about where the reader is.
 *
 * The value of asking from inside the app is the context nobody has to
 * type: which lesson, which section, which passage. This is that
 * context, and it is shared rather than web-only because the phone will
 * send the same thing.
 *
 * It is a record of a moment, not a live view. The copy stored on the
 * conversation is what was true when the question was asked, for the
 * same reason `highlights.quote` is kept verbatim: a section rewritten
 * afterwards does not make the record wrong.
 */

export type AskRoute = 'lesson' | 'topic' | 'subject' | 'cards' | 'other'

const ROUTES: AskRoute[] = ['lesson', 'topic', 'subject', 'cards', 'other']

export interface AskContext {
  route: AskRoute
  /** The lesson, topic or subject on screen. Absent on `other`. */
  entityId?: string
  /** What it is called, so the preamble can say it. */
  title?: string
  /** The heading slug nearest the top of the viewport, from
   *  `lessonSections`. The fold inserts after this one. */
  sectionId?: string
  /** That section's prose. Sent so the common question needs no tool
   *  call; `read_lesson` fetches the rest when the talk widens. */
  sectionText?: string
  /** Set when the panel was opened from a selection. */
  quote?: string
  prefix?: string
}

/** A topic the agent offers. Nothing is created until it is accepted. */
export type Proposal = {
  kind: 'topic'
  name: string
  summary: string
  acceptedAt?: string
}

/** Something the agent kept by itself -- a mark or a card -- recorded so
 *  the panel can still offer the undo after a reload. */
export type AgentWrite = {
  kind: 'mark' | 'card'
  id: string
  /** What to print against the undo: the quote, or the question. */
  label: string
  undoneAt?: string
}

export function isAskContext(value: unknown): value is AskContext {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  if (typeof c.route !== 'string') return false
  if (!ROUTES.includes(c.route as AskRoute)) return false
  for (const key of ['entityId', 'title', 'sectionId', 'sectionText', 'quote', 'prefix']) {
    if (c[key] !== undefined && typeof c[key] !== 'string') return false
  }
  return true
}

/**
 * The context as a line the model reads.
 *
 * Deliberately short. The section's prose is sent as its own block by
 * the caller; this is only the bearings.
 */
export function contextPreamble(c: AskContext): string {
  const where =
    c.route === 'other'
      ? 'somewhere in the app'
      : c.title
        ? `the ${c.route} "${c.title}"`
        : `a ${c.route}`

  const parts = [`The reader is looking at ${where}.`]
  if (c.sectionId) parts.push(`They are at the section "${c.sectionId}".`)
  if (c.quote) parts.push(`They selected this passage: "${c.quote}"`)
  return parts.join(' ')
}
```

- [ ] **Step 4: Export it**

Add to `packages/core/src/index.ts`, in the alphabetical position the file already uses:

```ts
export * from './ask'
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/core && npx vitest run tests/ask.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ask.ts packages/core/tests/ask.test.ts packages/core/src/index.ts
git commit -m "The shapes an asked question travels in"
```

---

## Task 3: The docked button and panel shell

**Files:**
- Create: `apps/web/src/components/AskButton.tsx`, `apps/web/src/components/Ask.module.css`
- Create: `apps/web/src/lib/useAskContext.ts`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `AskContext` from `@didactic/core/ask`.
- Produces: `<AskButton />`; `useAskContext(): AskContext`; CSS custom property `--ask-panel` published while open.

This task ships the button and an empty panel. The conversation arrives in Task 5.

- [ ] **Step 1: Write the context hook**

```ts
'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { AskContext, AskRoute } from '@didactic/core/ask'

/**
 * Where the reader is, as the agent needs to hear it.
 *
 * The route and the entity come from the path. The section is read off
 * the rendered headings rather than from the body, because what matters
 * is which one they are actually looking at -- the same question the
 * contents rail answers, asked of the viewport instead of the scroll.
 */
function routeOf(path: string): { route: AskRoute; entityId?: string } {
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'lesson') return { route: 'lesson', entityId: parts[1] }
  if (parts[0] === 'topics') return { route: 'topic', entityId: parts[1] }
  if (parts[0] === 'subjects') return { route: 'subject', entityId: parts[1] }
  if (parts[0] === 'cards' || parts[0] === 'clozes') return { route: 'cards' }
  return { route: 'other' }
}

export function useAskContext(): AskContext {
  const path = usePathname()
  const [sectionId, setSectionId] = useState<string | undefined>()
  const [title, setTitle] = useState<string | undefined>()

  useEffect(() => {
    // The heading nearest the top of the viewport wins. Cheap, and it
    // matches what the reader would say if asked which part they are on.
    const headings = Array.from(document.querySelectorAll('main h2[id], main h3[id]'))
    if (!headings.length) {
      setSectionId(undefined)
      return
    }
    const pick = () => {
      let current: string | undefined
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= 120) current = h.id
      }
      setSectionId(current ?? (headings[0] as HTMLElement).id)
    }
    pick()
    window.addEventListener('scroll', pick, { passive: true })
    return () => window.removeEventListener('scroll', pick)
  }, [path])

  useEffect(() => {
    const h1 = document.querySelector('main h1')
    setTitle(h1?.textContent?.trim() || document.title || undefined)
  }, [path])

  const { route, entityId } = routeOf(path)
  return { route, entityId, title, sectionId }
}
```

- [ ] **Step 2: Write the button and its styles**

`AskButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useAskContext } from '@/lib/useAskContext'
import { AskPanel } from './AskPanel'
import styles from './Ask.module.css'

/**
 * The corner a reader can ask from.
 *
 * Rendered from `layout.tsx` outside `main`, which is what makes it the
 * same offer on every page rather than a thing each surface remembers
 * to add. It stands on whatever already has the foot, the way the
 * player's disc does, and publishes its own height while it is open so
 * anything docked later can stand on it in turn.
 */
export function AskButton() {
  const [open, setOpen] = useState(false)
  const context = useAskContext()

  return (
    <>
      <button
        type="button"
        className={styles.disc}
        aria-label="Ask about this"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <AskIcon />
      </button>
      {open && <AskPanel context={context} onClose={() => setOpen(false)} />}
    </>
  )
}

function AskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A2.5 2.5 0 0 1 17 6.5v5A2.5 2.5 0 0 1 14.5 14H8l-4 3v-3H5.5A2.5 2.5 0 0 1 3 11.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

`Ask.module.css` — mirroring `.folded` in `Player.module.css`, in the opposite corner:

```css
/* The disc, in the corner opposite the player's.

   Same size, ground and lift as `.folded`, because it is the same kind
   of offer and two different circles at one foot would read as two
   different kinds of thing. It stands on whichever of the bench or a
   docked composer has the foot, which is the arrangement the foot of
   the sheet already has. */
.disc {
  position: fixed;
  right: var(--space-4);
  bottom: max(
    calc(var(--bench-stack, 0px) + env(safe-area-inset-bottom, 0px) + var(--space-4)),
    calc(var(--mark-panel, 0px) + var(--space-2))
  );
  z-index: 50;

  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;

  background: var(--paper);
  border: none;
  border-radius: 50%;
  color: var(--plate-green);
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(var(--ink-rgb), 0.28);
}

.panel {
  position: fixed;
  right: var(--space-4);
  bottom: calc(var(--space-4) + 3.5rem);
  z-index: 51;

  display: flex;
  flex-direction: column;
  width: min(26rem, calc(100vw - var(--space-4) * 2));
  max-height: min(32rem, 70vh);

  background: var(--paper);
  border-radius: var(--radius-2, 0.5rem);
  box-shadow: 0 4px 24px rgba(var(--ink-rgb), 0.3);
}

/* The sheet is narrow enough that the panel has to dock, at the same
   breakpoint the highlighter already uses. */
@media (max-width: 40rem) {
  .panel {
    right: 0;
    left: 0;
    bottom: 0;
    width: 100%;
    max-height: 80vh;
    border-radius: var(--radius-2, 0.5rem) var(--radius-2, 0.5rem) 0 0;
  }
}

.log {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3);
}

.composer {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3);
  border-top: 1px solid rgba(var(--ink-rgb), 0.12);
}

.composer input {
  flex: 1;
}
```

- [ ] **Step 3: Dock it in the layout**

In `apps/web/src/app/layout.tsx`, import `AskButton` and render it as a sibling of `<main>`, beside whatever else is docked at the foot — never inside `main`.

- [ ] **Step 4: Write the panel shell**

`AskPanel.tsx`, for now only the frame — the log and composer arrive in Task 7:

```tsx
'use client'

import type { AskContext } from '@didactic/core/ask'
import styles from './Ask.module.css'

export function AskPanel({ context, onClose }: { context: AskContext; onClose: () => void }) {
  return (
    <div className={styles.panel} role="dialog" aria-label="Ask about this">
      <div className={styles.log}>
        <p>Asking about {context.title ?? 'this page'}.</p>
      </div>
      <div className={styles.composer}>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: See it**

Run: `cd apps/web && npm run dev`, open a lesson.
Expected: a disc bottom-right, below the existing circles and clear of them; it opens a panel naming the lesson; at phone width the panel docks full-width and does not cover the mark composer.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AskButton.tsx apps/web/src/components/AskPanel.tsx apps/web/src/components/Ask.module.css apps/web/src/lib/useAskContext.ts apps/web/src/app/layout.tsx
git commit -m "A disc in the corner opposite the player's"
```

---

## Task 4: Folding, as a pure function

**Files:**
- Modify: `packages/core/src/ask.ts`
- Modify: `packages/core/tests/ask.test.ts`

**Interfaces:**
- Consumes: `lessonSections` from `./sections`.
- Produces: `function foldInto(body: string, sectionId: string | undefined, section: string): string`

Written before the route that uses it, because it is the part that can lose a lesson and the part that tests without a model.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/ask.test.ts`:

```ts
import { foldInto } from '../src/ask'

describe('folding a discussion into a lesson', () => {
  const body = [
    '# Compounding',
    '',
    'Intro prose.',
    '',
    '## What compounds',
    '',
    'The first section.',
    '',
    '## What does not',
    '',
    'The second section.',
  ].join('\n')

  it('puts the section after the one it was asked from', () => {
    const out = foldInto(body, 'what-compounds', '## On rates\n\nAdded prose.')
    const first = out.indexOf('The first section.')
    const added = out.indexOf('Added prose.')
    const second = out.indexOf('The second section.')
    expect(first).toBeLessThan(added)
    expect(added).toBeLessThan(second)
  })

  it('keeps every word of the original', () => {
    const out = foldInto(body, 'what-compounds', '## On rates\n\nAdded prose.')
    for (const line of ['Intro prose.', 'The first section.', 'The second section.']) {
      expect(out).toContain(line)
    }
  })

  it('appends when the section is gone, because a regenerated lesson must not swallow the fold', () => {
    const out = foldInto(body, 'a-heading-that-went-away', '## On rates\n\nAdded prose.')
    expect(out).toContain('Added prose.')
    expect(out.indexOf('The second section.')).toBeLessThan(out.indexOf('Added prose.'))
  })

  it('appends when there is no heading at all', () => {
    const out = foldInto('Just prose, no headings.', 'anything', '## On rates\n\nAdded.')
    expect(out).toContain('Just prose, no headings.')
    expect(out).toContain('Added.')
  })

  it('appends when no section was recorded', () => {
    const out = foldInto(body, undefined, '## On rates\n\nAdded prose.')
    expect(out.indexOf('The second section.')).toBeLessThan(out.indexOf('Added prose.'))
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd packages/core && npx vitest run tests/ask.test.ts`
Expected: FAIL — `foldInto` is not exported.

- [ ] **Step 3: Implement it**

Append to `packages/core/src/ask.ts`:

```ts
import { lessonSections, slugFor } from './sections'

/**
 * Put a folded discussion into a lesson body.
 *
 * It goes after the section the conversation was had at, which is the
 * nearest thing to where the reader was standing. Everything about this
 * function is arranged so that the lesson survives being wrong: an
 * unknown section, a body whose headings have all been rewritten, or no
 * heading at all appends rather than guesses, because a fold landing in
 * an odd place is a paragraph to move and a fold landing nowhere is the
 * conversation lost.
 *
 * Pure, and here rather than in the route, so the placement can be
 * tested without a model and the phone folds identically.
 */
export function foldInto(body: string, sectionId: string | undefined, section: string): string {
  const append = () => `${body.trimEnd()}\n\n${section.trim()}\n`
  if (!sectionId) return append()

  const sections = lessonSections(body)
  const index = sections.findIndex(s => s.id === sectionId)
  if (index === -1) return append()

  // Insert immediately before the next heading of the same level or
  // shallower; that is where this section ends.
  const here = sections[index]
  const next = sections.slice(index + 1).find(s => s.level <= here.level)
  if (!next) return append()

  const lines = body.split('\n')
  const headingLine = lines.findIndex(
    line => /^#{1,3}\s/.test(line) && slugFor(line.replace(/^#{1,3}\s*/, '')) === next.id
  )
  if (headingLine === -1) return append()

  const before = lines.slice(0, headingLine).join('\n').trimEnd()
  const after = lines.slice(headingLine).join('\n')
  return `${before}\n\n${section.trim()}\n\n${after}`
}
```

- [ ] **Step 4: Run them**

Run: `cd packages/core && npx vitest run tests/ask.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ask.ts packages/core/tests/ask.test.ts
git commit -m "Fold where the reader was standing, or at the end"
```

---

## Task 5: The agent and its tools

**Files:**
- Create: `apps/web/src/lib/llm/ask.ts`

**Interfaces:**
- Consumes: `AskContext`, `contextPreamble`, `Proposal`, `AgentWrite` from `@didactic/core/ask`; `blockPromptSection` from `@didactic/core/blocks`; `NO_THINKING` from `./thinking`; `toolList` from `./toolInput`.
- Produces:
  - `interface AskTurn { text: string; proposals: Proposal[]; writes: AgentWrite[] }`
  - `interface AskDeps { addMark(quote: string, note: string): Promise<{ id: string }>; addCard(question: string, answer: string): Promise<{ id: string }>; readLesson(sectionId?: string): Promise<string>; searchMap(query: string): Promise<Array<{ id: string; name: string }>> }`
  - `async function askTurn(input: { context: AskContext; history: Array<{ role: 'user' | 'assistant'; content: string }>; message: string; deps: AskDeps }): Promise<AskTurn>`

The write tools take their effects through `AskDeps` rather than touching the database here, which is what lets this be tested with fakes and keeps the module the same shape as the rest of `lib/llm/`.

- [ ] **Step 1: Write the module**

```ts
import Anthropic from '@anthropic-ai/sdk'
import { NO_THINKING } from './thinking'
import { toolList } from './toolInput'
import { blockPromptSection } from '@didactic/core/blocks'
import { contextPreamble, type AskContext, type Proposal, type AgentWrite } from '@didactic/core/ask'

/**
 * The agent a reader talks to from the corner of the page.
 *
 * What it can do is split by blast radius rather than by convenience. A
 * mark and a card are the reader's own material against one lesson, and
 * both are deleted in one press by machinery that already exists, so the
 * agent keeps them and says that it did. A topic is a row in the map
 * that the resolver, the filing rules and the graph all read, so it is
 * offered and waits for a tap.
 *
 * What that buys is bounded rather than absolute: something written into
 * a lesson body can cause a spurious mark, which is visible and
 * removable, and cannot reach the map.
 *
 * It draws with the lesson blocks, from the same registry and the same
 * generated prompt, so a tenth block is offered here without an edit.
 */

let client: Anthropic | null = null

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** Enough for an explanation with a diagram in it, and not so much that
 *  a wandering answer is billed for. */
const MAX_TOKENS = 2000

/** How many turns of tool use before the answer is written regardless.
 *  Four covers read-then-search-then-answer with room to spare. */
const ROUNDS = 4

export interface AskTurn {
  text: string
  proposals: Proposal[]
  writes: AgentWrite[]
}

export interface AskDeps {
  addMark(quote: string, note: string): Promise<{ id: string }>
  addCard(question: string, answer: string): Promise<{ id: string }>
  readLesson(sectionId?: string): Promise<string>
  searchMap(query: string): Promise<Array<{ id: string; name: string }>>
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_mark',
    description:
      'Keep a passage of the lesson as a mark, with a note. Use when the reader has understood something worth having again later. The quote must be text that appears in the lesson verbatim.',
    input_schema: {
      type: 'object',
      properties: {
        quote: { type: 'string', description: 'The passage, exactly as it appears.' },
        note: { type: 'string', description: 'Why it is worth keeping, in a sentence.' },
      },
      required: ['quote', 'note'],
    },
  },
  {
    name: 'add_card',
    description:
      'Keep a question and its answer as a card for review. Use when something in the conversation is worth being asked again in a week.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        answer: { type: 'string' },
      },
      required: ['question', 'answer'],
    },
  },
  {
    name: 'propose_topic',
    description:
      'Offer a new topic for the map. Search first with search_map: if the idea is already there under another name, say so instead of proposing a near-duplicate. Nothing is created until the reader accepts.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        summary: { type: 'string', description: 'One or two sentences on what it covers.' },
      },
      required: ['name', 'summary'],
    },
  },
  {
    name: 'read_lesson',
    description:
      'Read the lesson. Omit section to get the whole body. You are already given the section the reader is at, so use this only when the conversation has moved somewhere else.',
    input_schema: {
      type: 'object',
      properties: { section: { type: 'string' } },
    },
  },
  {
    name: 'search_map',
    description: 'Find existing topics by name, to avoid proposing something the map already holds.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
]

function systemPrompt(context: AskContext): string {
  return `You are a tutor inside a learning app, answering a reader who is in the middle of their own material.

${contextPreamble(context)}

Answer the question they actually asked, at the length it deserves -- a sentence where a sentence does, and no throat-clearing. You are talking to one person about something in front of both of you, so do not restate what they can see.

Keep what is worth keeping: a mark when a passage should be findable again, a card when something should be asked again in a week. Do it rather than offering to. Propose a topic only when the conversation has genuinely opened one the map does not hold, and search first.

${blockPromptSection()}`
}

/**
 * One turn of the conversation, tools and all.
 *
 * Returns what to show and what happened. A tool that throws is reported
 * back to the model as a failed result rather than ending the turn: a
 * card that could not be written should not lose the explanation.
 */
export async function askTurn(input: {
  context: AskContext
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  message: string
  deps: AskDeps
}): Promise<AskTurn> {
  const { context, history, message, deps } = input

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ]

  if (context.sectionText) {
    messages.unshift({
      role: 'user',
      content: `For reference, the section they are reading says:\n\n${context.sectionText}`,
    })
    messages.unshift({ role: 'assistant', content: 'Understood.' } as Anthropic.MessageParam)
  }

  const proposals: Proposal[] = []
  const writes: AgentWrite[] = []
  let text = ''

  for (let round = 0; round < ROUNDS; round++) {
    const reply = await getClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: MAX_TOKENS,
      ...NO_THINKING,
      system: systemPrompt(context),
      tools: TOOLS,
      messages,
    })

    text = reply.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    const calls = reply.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!calls.length) break

    messages.push({ role: 'assistant', content: reply.content })

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const call of calls) {
      const input_ = (call.input ?? {}) as Record<string, unknown>
      const say = (content: string) => results.push({ type: 'tool_result', tool_use_id: call.id, content })

      try {
        if (call.name === 'add_mark') {
          const quote = String(input_.quote ?? '')
          const note = String(input_.note ?? '')
          if (!quote) {
            say('No quote given; nothing kept.')
          } else {
            const { id } = await deps.addMark(quote, note)
            writes.push({ kind: 'mark', id, label: quote })
            say('Kept.')
          }
        } else if (call.name === 'add_card') {
          const question = String(input_.question ?? '')
          const answer = String(input_.answer ?? '')
          if (!question) {
            say('No question given; nothing kept.')
          } else {
            const { id } = await deps.addCard(question, answer)
            writes.push({ kind: 'card', id, label: question })
            say('Kept.')
          }
        } else if (call.name === 'propose_topic') {
          proposals.push({
            kind: 'topic',
            name: String(input_.name ?? ''),
            summary: String(input_.summary ?? ''),
          })
          say('Offered to the reader.')
        } else if (call.name === 'read_lesson') {
          const section = input_.section === undefined ? undefined : String(input_.section)
          say((await deps.readLesson(section)) || 'The lesson has no body yet.')
        } else if (call.name === 'search_map') {
          const found = await deps.searchMap(String(input_.query ?? ''))
          say(
            found.length
              ? found.map(t => `${t.name} (${t.id})`).join('\n')
              : 'Nothing in the map matches.'
          )
        } else {
          say('Unknown tool.')
        }
      } catch (e) {
        // Reported to the model rather than thrown: a failed write must
        // not cost the reader the explanation that came with it.
        say(`That failed: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    }

    messages.push({ role: 'user', content: results })
  }

  return { text, proposals, writes }
}

/** Exported for the tests: `toolList` is how every reader in this
 *  directory takes an array out of a tool call, and the ask agent takes
 *  no arrays today. Kept imported so adding one cannot forget it. */
export const __toolList = toolList
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/llm/ask.ts
git commit -m "A tutor that keeps marks and asks before it touches the map"
```

---

## Task 6: The routes

**Files:**
- Create: `apps/web/src/app/api/ask/route.ts`, `apps/web/src/app/api/ask/[id]/accept/route.ts`, `apps/web/src/app/api/ask/[id]/undo/route.ts`, `apps/web/src/app/api/ask/[id]/fold/route.ts`
- Create: `apps/web/tests/ask-route.test.ts`
- Modify: `packages/api/src/ask.ts` (create), `packages/api/src/index.ts`, `packages/api/src/endpoints.ts`

**Interfaces:**
- Consumes: `askTurn`, `AskDeps` from `@/lib/llm/ask`; `foldInto`, `isAskContext` from `@didactic/core/ask`; `ownerId` from `@/lib/auth`; `supabaseAdmin` from `@/lib/supabase`.
- Produces: `POST /api/ask` → `{ conversationId, text, proposals, writes }`; `POST /api/ask/[id]/accept` → `{ topicId }`; `POST /api/ask/[id]/undo` → `{ ok: true }`; `POST /api/ask/[id]/fold` → `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/ask-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ ownerId: vi.fn(async () => 'user-1') }))

describe('the ask route', () => {
  beforeEach(() => vi.resetModules())

  it('answers 401 as JSON when nobody is signed in', async () => {
    vi.doMock('@/lib/auth', () => ({ ownerId: vi.fn(async () => null) }))
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(new Request('http://x/api/ask', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error')
  })

  it('refuses a context that is not one, rather than storing a shape nothing can read', async () => {
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(
      new Request('http://x/api/ask', {
        method: 'POST',
        body: JSON.stringify({ message: 'hi', context: { route: 'nowhere' } }),
      })
    )
    expect(res.status).toBe(400)
  })
})

describe('undoing an agent write', () => {
  it('is safe to do twice', async () => {
    // A double tap, or an undo after a reload, must answer ok and remove
    // nothing the second time rather than erroring or deleting a row
    // that belongs to someone else.
    const { undoWrite } = await import('@/lib/ask')
    const removed: string[] = []
    const db = fakeDb(removed)
    await undoWrite(db, 'user-1', 'conv-1', 'mark', 'mark-1')
    await undoWrite(db, 'user-1', 'conv-1', 'mark', 'mark-1')
    expect(removed).toEqual(['mark-1'])
  })
})

function fakeDb(removed: string[]) {
  const rows = new Map([['mark-1', { id: 'mark-1', user_id: 'user-1' }]])
  return {
    from: () => ({
      delete: () => ({
        eq: function () {
          return this
        },
        then: (resolve: (v: unknown) => void) => {
          if (rows.delete('mark-1')) removed.push('mark-1')
          resolve({ error: null })
        },
      }),
    }),
  } as never
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/web && npx vitest run tests/ask-route.test.ts`
Expected: FAIL — the route modules do not exist.

- [ ] **Step 3: Write the turn route**

`apps/web/src/app/api/ask/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { askTurn, type AskDeps } from '@/lib/llm/ask'
import { isAskContext } from '@didactic/core/ask'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * One turn of a conversation.
 *
 * A model call with tools, so it is given the same minute a lesson round
 * gets rather than the platform's default.
 */
export const maxDuration = 60

function dropCache() {
  // The agent can keep a mark or a card by itself; both are printed by
  // running heads that read these.
  revalidateTag(tags.highlights, 'max')
  revalidateTag(tags.clozes, 'max')
}

export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { conversationId, message, context } = body as {
    conversationId?: string
    message?: string
    context?: unknown
  }

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'no message' }, { status: 400 })
  }
  if (!isAskContext(context)) {
    return NextResponse.json({ error: 'bad context' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Start the conversation, or carry the one we have. The context is
  // stored as it was when the question was first asked.
  let id = conversationId
  if (!id) {
    const { data, error } = await db
      .from('conversations')
      .insert({
        user_id: userId,
        kind: 'ask',
        lesson_id: context.route === 'lesson' ? context.entityId : null,
        // `node_id` is the topic column, under the name 012 left it.
        node_id: context.route === 'topic' ? context.entityId : null,
        context,
      })
      .select('id')
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'could not start' }, { status: 500 })
    }
    id = data.id
  }

  const { data: past } = await db
    .from('messages')
    .select('role, content')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const history = (past ?? [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const deps: AskDeps = {
    addMark: async (quote, note) => {
      const { data, error } = await db
        .from('highlights')
        .insert({
          user_id: userId,
          lesson_id: context.entityId,
          quote,
          prefix: null,
          note,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error('the mark could not be kept')
      return { id: data.id }
    },
    addCard: async (question, answer) => {
      // `kind: 'qa'` is not decoration: `clozes_shape` (046) requires a
      // card to carry the columns its own kind needs, and a row with no
      // kind defaults to 'cloze', which demands text, blank and the two
      // offsets a question does not have. `created_by` is 'ai' because
      // the agent wrote it, which is what the reading draws it as.
      const { data, error } = await db
        .from('clozes')
        .insert({
          user_id: userId,
          lesson_id: context.entityId,
          kind: 'qa',
          question,
          answer,
          created_by: 'ai',
        })
        .select('id')
        .single()
      if (error || !data) throw new Error('the card could not be kept')
      return { id: data.id }
    },
    readLesson: async section => {
      if (!context.entityId) return ''
      const { data } = await db.from('lessons').select('body').eq('id', context.entityId).single()
      const text: string = data?.body ?? ''
      if (!section) return text
      const from = text.indexOf(section)
      return from === -1 ? text : text.slice(from, from + 4000)
    },
    searchMap: async query => {
      const { data } = await db
        .from('topics')
        .select('id, title')
        .ilike('title', `%${query}%`)
        .limit(10)
      return (data ?? []).map(t => ({ id: t.id, name: t.title }))
    },
  }

  let turn
  try {
    turn = await askTurn({ context, history, message, deps })
  } catch (e) {
    // No key, no gateway, or a call that failed: the conversation is
    // kept and says so, rather than the reader losing what they typed.
    await db.from('messages').insert([
      { conversation_id: id, role: 'user', content: message },
      {
        conversation_id: id,
        role: 'assistant',
        content: 'That could not be answered just now. The conversation is kept; try again in a moment.',
      },
    ])
    return NextResponse.json({
      conversationId: id,
      text: 'That could not be answered just now. The conversation is kept; try again in a moment.',
      proposals: [],
      writes: [],
      warning: e instanceof Error ? e.message : 'the model could not be reached',
    })
  }

  await db.from('messages').insert([
    { conversation_id: id, role: 'user', content: message },
    {
      conversation_id: id,
      role: 'assistant',
      content: turn.text,
      proposals: [...turn.proposals, ...turn.writes],
    },
  ])

  if (turn.writes.length) dropCache()

  return NextResponse.json({
    conversationId: id,
    text: turn.text,
    proposals: turn.proposals,
    writes: turn.writes,
  })
}
```

- [ ] **Step 4: Write the undo helper and its route**

`apps/web/src/lib/ask.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Take back something the agent kept.
 *
 * Scoped by user as well as by id, so an undo can only ever reach the
 * asker's own row, and idempotent: a second tap, or an undo after a
 * reload, removes nothing and still answers. Deleting a row that is
 * already gone is not an error worth showing anybody.
 */
export async function undoWrite(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  kind: 'mark' | 'card',
  id: string
): Promise<void> {
  const table = kind === 'mark' ? 'highlights' : 'clozes'
  await db.from(table).delete().eq('id', id).eq('user_id', userId)
}
```

`apps/web/src/app/api/ask/[id]/undo/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { undoWrite } from '@/lib/ask'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { kind, writeId } = (await req.json().catch(() => ({}))) as {
    kind?: 'mark' | 'card'
    writeId?: string
  }
  if (!writeId || (kind !== 'mark' && kind !== 'card')) {
    return NextResponse.json({ error: 'nothing to undo' }, { status: 400 })
  }

  await undoWrite(supabaseAdmin(), userId, id, kind, writeId)
  revalidateTag(kind === 'mark' ? tags.highlights : tags.clozes, 'max')
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Write the accept route**

`apps/web/src/app/api/ask/[id]/accept/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { slugFor } from '@didactic/core/sections'

/**
 * Accept a proposed topic.
 *
 * The one thing in this feature that puts a row in the map, and the
 * only place it can happen: the agent's loop has no path to here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { name, summary } = (await req.json().catch(() => ({}))) as {
    name?: string
    summary?: string
  }
  if (!name) return NextResponse.json({ error: 'no name' }, { status: 400 })

  const db = supabaseAdmin()

  // `topics` is `nodes` renamed (012), so the column is `title` and
  // there is a `unique (user_id, slug)` to respect. A topic the reader
  // already has is returned rather than refused: accepting twice is a
  // double tap, not an error worth showing.
  const slug = slugFor(name)
  const { data: standing } = await db
    .from('topics')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  if (standing) return NextResponse.json({ topicId: standing.id })

  const { data, error } = await db
    .from('topics')
    .insert({
      user_id: userId,
      title: name,
      slug,
      summary: summary ?? null,
      created_by: 'user',
    })
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'could not create' }, { status: 500 })

  for (const tag of [tags.topics, tags.subjects]) revalidateTag(tag, 'max')
  return NextResponse.json({ topicId: data.id })
}
```

- [ ] **Step 6: Write the fold route**

`apps/web/src/app/api/ask/[id]/fold/route.ts`:

```ts
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { foldInto, isAskContext } from '@didactic/core/ask'
import { blockPromptSection } from '@didactic/core/blocks'
import { NO_THINKING } from '@/lib/llm/thinking'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

export const maxDuration = 60

/**
 * Turn a discussion into a section of the lesson.
 *
 * Asked for explicitly; never something that happens because a
 * conversation ended. The model writes lesson prose, and `foldInto`
 * decides where it goes -- which is the part that can lose a lesson, so
 * it is pure and tested in `packages/core`.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const db = supabaseAdmin()

  const { data: conversation } = await db
    .from('conversations')
    .select('id, user_id, lesson_id, context')
    .eq('id', id)
    .single()

  if (!conversation || conversation.user_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (!conversation.lesson_id) {
    return NextResponse.json({ error: 'not a lesson conversation' }, { status: 400 })
  }

  const context = isAskContext(conversation.context) ? conversation.context : { route: 'lesson' as const }

  const { data: messages } = await db
    .from('messages')
    .select('role, content')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const transcript = (messages ?? [])
    .map(m => `${m.role === 'user' ? 'Reader' : 'Tutor'}: ${m.content}`)
    .join('\n\n')

  const { data: lesson } = await db
    .from('lessons')
    .select('body')
    .eq('id', conversation.lesson_id)
    .single()

  if (!lesson?.body) return NextResponse.json({ error: 'the lesson has no body' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'no key' }, { status: 503 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const reply = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    ...NO_THINKING,
    system: `Rewrite a conversation as one section of the lesson it happened in.

Write it as the lesson is written: prose addressed to a reader, not a transcript, with no mention of a conversation, a question having been asked, or a tutor. Begin with a "## " heading. Keep only what earns its place.

${blockPromptSection()}`,
    messages: [{ role: 'user', content: transcript }],
  })

  const section = reply.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  if (!section) return NextResponse.json({ error: 'nothing was written' }, { status: 502 })

  const folded = foldInto(lesson.body, context.sectionId, section)
  const { error } = await db
    .from('lessons')
    .update({ body: folded })
    .eq('id', conversation.lesson_id)

  if (error) return NextResponse.json({ error: 'could not write the lesson' }, { status: 500 })

  revalidateTag(tags.topics, 'max')
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Register the endpoints**

Create `packages/api/src/ask.ts`:

```ts
import type { Api } from './client'
import type { AskContext, Proposal, AgentWrite } from '@didactic/core/ask'

export interface AskAnswer {
  conversationId: string
  text: string
  proposals: Proposal[]
  writes: AgentWrite[]
  warning?: string
}

export const ask = (api: Api) => ({
  say: (body: { conversationId?: string; message: string; context: AskContext }) =>
    api.post<AskAnswer>('/api/ask', body),
  accept: (id: string, body: { name: string; summary: string }) =>
    api.post<{ topicId: string }>(`/api/ask/${id}/accept`, body),
  undo: (id: string, body: { kind: 'mark' | 'card'; writeId: string }) =>
    api.post<{ ok: true }>(`/api/ask/${id}/undo`, body),
  fold: (id: string) => api.post<{ ok: true }>(`/api/ask/${id}/fold`, {}),
})
```

Register `ask` in `packages/api/src/index.ts` beside the other modules, and add four rows to `packages/api/src/endpoints.ts`:

```ts
{ name: 'ask.say', method: 'POST', path: '/api/ask', invalidates: [tags.highlights, tags.clozes] },
{ name: 'ask.accept', method: 'POST', path: '/api/ask/[id]/accept', invalidates: [tags.topics, tags.subjects] },
{ name: 'ask.undo', method: 'POST', path: '/api/ask/[id]/undo', invalidates: [tags.highlights, tags.clozes] },
{ name: 'ask.fold', method: 'POST', path: '/api/ask/[id]/fold', invalidates: [tags.topics] },
```

- [ ] **Step 8: Run the tests**

Run: `cd apps/web && npx vitest run tests/ask-route.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/api/ask apps/web/src/lib/ask.ts apps/web/tests/ask-route.test.ts packages/api/src/ask.ts packages/api/src/index.ts packages/api/src/endpoints.ts
git commit -m "Four ways in: a turn, an acceptance, an undo, a fold"
```

---

## Task 7: The conversation in the panel

**Files:**
- Modify: `apps/web/src/components/AskPanel.tsx`, `apps/web/src/components/Ask.module.css`
- Create: `apps/web/tests/ask-blocks.test.ts`

**Interfaces:**
- Consumes: `didactic().ask` from `@didactic/api`; `parseBlocks` from `@didactic/core/blocks`; the block components the lesson sheet already renders.
- Produces: the working panel.

- [ ] **Step 1: Write the failing block test**

`apps/web/tests/ask-blocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseBlocks, BLOCKS } from '@didactic/core/blocks'

describe('what the agent draws with', () => {
  it('parses every block in the registry out of a chat message, so chat and lessons cannot drift', () => {
    for (const spec of BLOCKS) {
      const message = `Here is one:\n\n\`\`\`${spec.name}\n${spec.example}\n\`\`\`\n\nAnd prose after it.`
      const parsed = parseBlocks(message)
      const block = parsed.find(p => p.kind === 'block')
      expect(block, `${spec.name} did not parse`).toBeTruthy()
      expect(block && block.kind === 'block' && block.name).toBe(spec.name)
    }
  })

  it('leaves a malformed payload as prose rather than losing the message', () => {
    const parsed = parseBlocks('Before.\n\n```chart\n{ not json\n```\n\nAfter.')
    expect(parsed.every(p => p.kind === 'markdown')).toBe(true)
    expect(parsed.map(p => (p.kind === 'markdown' ? p.text : '')).join('')).toContain('After.')
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd apps/web && npx vitest run tests/ask-blocks.test.ts`
Expected: PASS — this pins existing behaviour the panel is about to depend on. If a block fails, fix the panel's assumption, not the registry.

- [ ] **Step 3: Write the panel**

Replace `AskPanel.tsx` with the working version: it holds `messages`, posts through `didactic().ask.say`, renders each message through `parseBlocks` (markdown through the same renderer the lesson sheet uses, blocks through the same components), shows `writes` as a line with an undo button calling `ask.undo`, shows `proposals` as a card with an accept button calling `ask.accept`, and on a lesson shows "Add to lesson" calling `ask.fold`. It publishes its height to `--ask-panel` in a layout effect so anything docked later can stand on it.

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { didactic } from '@didactic/api'
import { parseBlocks } from '@didactic/core/blocks'
import type { AskContext, Proposal, AgentWrite } from '@didactic/core/ask'
import styles from './Ask.module.css'

const api = didactic()

interface Line {
  role: 'user' | 'assistant'
  content: string
  proposals?: Proposal[]
  writes?: AgentWrite[]
}

export function AskPanel({ context, onClose }: { context: AskContext; onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const panel = useRef<HTMLDivElement>(null)

  // Publish our height, the way the bench and the composer do, so
  // anything docked later stands on this rather than under it.
  useEffect(() => {
    const node = panel.current
    if (!node) return
    const set = () =>
      document.documentElement.style.setProperty('--ask-panel', `${node.offsetHeight}px`)
    set()
    return () => document.documentElement.style.removeProperty('--ask-panel')
  }, [lines.length])

  async function send() {
    const message = draft.trim()
    if (!message || busy) return
    setDraft('')
    setLines(l => [...l, { role: 'user', content: message }])
    setBusy(true)
    try {
      const answer = await api.ask.say({ conversationId, message, context })
      setConversationId(answer.conversationId)
      setLines(l => [
        ...l,
        {
          role: 'assistant',
          content: answer.text,
          proposals: answer.proposals,
          writes: answer.writes,
        },
      ])
    } catch {
      setLines(l => [
        ...l,
        { role: 'assistant', content: 'That could not be sent. Try again in a moment.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={panel} className={styles.panel} role="dialog" aria-label="Ask about this">
      <div className={styles.log}>
        {lines.map((line, i) => (
          <div key={i} className={line.role === 'user' ? styles.fromReader : styles.fromTutor}>
            {parseBlocks(line.content).map((part, j) =>
              part.kind === 'markdown' ? (
                <p key={j}>{part.text}</p>
              ) : (
                <pre key={j} className={styles.block}>
                  {part.name}
                </pre>
              )
            )}
            {line.writes?.map(w => (
              <p key={w.id} className={styles.kept}>
                Kept a {w.kind}: {w.label}{' '}
                <button
                  type="button"
                  onClick={() =>
                    conversationId && api.ask.undo(conversationId, { kind: w.kind, writeId: w.id })
                  }
                >
                  Undo
                </button>
              </p>
            ))}
            {line.proposals?.map((p, k) => (
              <div key={k} className={styles.proposal}>
                <strong>{p.name}</strong>
                <p>{p.summary}</p>
                <button
                  type="button"
                  onClick={() =>
                    conversationId &&
                    api.ask.accept(conversationId, { name: p.name, summary: p.summary })
                  }
                >
                  Add this topic
                </button>
              </div>
            ))}
          </div>
        ))}
        {busy && <p className={styles.thinking}>Thinking…</p>}
      </div>

      <div className={styles.composer}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about this"
          aria-label="Ask about this"
        />
        <button type="button" onClick={send} disabled={busy}>
          Ask
        </button>
        {context.route === 'lesson' && conversationId && (
          <button type="button" onClick={() => api.ask.fold(conversationId)}>
            Add to lesson
          </button>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
```

Note: the block rendering above prints the block's name as a placeholder. Replace it with the actual block components the lesson sheet uses — read `apps/web/src/app/lesson/[id]/LessonSheet.tsx` for how it dispatches on `part.name` and reuse that dispatch rather than writing a second one.

- [ ] **Step 4: Add the styles**

Append to `Ask.module.css`: `.fromReader`, `.fromTutor`, `.kept`, `.proposal`, `.thinking`, `.block`, following `DESIGN.md` for colour and spacing, using the existing tokens.

- [ ] **Step 5: See it**

Run: `cd apps/web && npm run dev`, open a lesson, ask about a section.
Expected: an answer that names the section; a mark kept appears with an undo that works; a proposed topic appears with an accept.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AskPanel.tsx apps/web/src/components/Ask.module.css apps/web/tests/ask-blocks.test.ts
git commit -m "The conversation itself, drawn with the lesson's own blocks"
```

---

## Task 8: "Ask more" on a selection

**Files:**
- Modify: `apps/web/src/components/Highlighter.tsx`, `apps/web/src/components/Highlighter.module.css`

**Interfaces:**
- Consumes: the `offer` object the highlighter already computes (`quote`, `prefix`).
- Produces: a third button that opens the panel with the passage in context.

- [ ] **Step 1: Add the button**

In `Highlighter.tsx`, in the offer block beside `Add mark` and `Make a cloze`:

```tsx
<button
  type="button"
  className={`${styles.pin} ${styles.pinAsk}`}
  onClick={() => askAbout(offer)}
>
  Ask more
</button>
```

- [ ] **Step 2: Carry the passage to the panel**

The button and the highlighter are different trees, so pass the selection through a custom event rather than lifting state through the layout:

```ts
/** The highlighter and the corner disc are in different trees -- one
 *  inside the sheet, one docked from the layout -- so the passage
 *  travels as an event rather than through a context that would have to
 *  wrap the whole app for one string. */
function askAbout(chosen: Offer) {
  window.dispatchEvent(
    new CustomEvent('didactic:ask', {
      detail: { quote: chosen.quote, prefix: chosen.prefix },
    })
  )
  clear()
}
```

In `AskButton.tsx`, listen for it, open the panel, and merge the passage into the context:

```ts
const [selection, setSelection] = useState<{ quote?: string; prefix?: string }>({})

useEffect(() => {
  const onAsk = (e: Event) => {
    const detail = (e as CustomEvent).detail as { quote?: string; prefix?: string }
    setSelection(detail ?? {})
    setOpen(true)
  }
  window.addEventListener('didactic:ask', onAsk)
  return () => window.removeEventListener('didactic:ask', onAsk)
}, [])
```

and pass `{ ...context, ...selection }` to the panel.

- [ ] **Step 3: Style it**

Add `.pinAsk` to `Highlighter.module.css`, matching `.pinMark` and `.pinCloze` and differing only in the accent, per `DESIGN.md`.

- [ ] **Step 4: See it**

Run: `cd apps/web && npm run dev`, select a passage in a lesson.
Expected: three buttons; "Ask more" opens the panel, and the first answer is about the selected passage without its being retyped.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Highlighter.tsx apps/web/src/components/Highlighter.module.css apps/web/src/components/AskButton.tsx
git commit -m "A third thing to do with a passage: ask about it"
```

---

## Task 9: The regenerate warning, PARITY and DESIGN

**Files:**
- Modify: `apps/web/src/app/api/lessons/[id]/body/route.ts`, `docs/monorepo/PARITY.md`, `DESIGN.md`

- [ ] **Step 1: Warn on regenerate**

In the body route, where `regenerate` blanks the carried body, add to the response's warning that any folded discussion will be lost. One line, and it is the honest statement of the single case where a fold does not persist.

- [ ] **Step 2: Move the PARITY row**

Add a row for conversational mode: `built` on web, `planned` on mobile, naming `core/ask`, `api/ask`, `lib/llm/ask` and the routes, and saying what the split between written and proposed is and why.

- [ ] **Step 3: Amend DESIGN.md**

Record the rule the disc introduces: the foot has two corners, the player's on the left and the ask disc on the right; both stand on whatever already has the foot and publish their own height.

- [ ] **Step 4: Run the parity skill**

Run the `parity` skill against the diff.
Expected: it agrees the row matches the change.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/lessons/[id]/body/route.ts docs/monorepo/PARITY.md DESIGN.md
git commit -m "Say what a regenerate costs, and where the second corner is"
```

---

## Task 10: The whole thing, checked and pushed

- [ ] **Step 1: Run everything the repo runs**

Run: `npx turbo run lint typecheck test` from the root, then `npx turbo run build --filter=@didactic/web`.
Expected: all tasks pass. Fix anything that does not before going on.

- [ ] **Step 2: Open it**

Run: `cd apps/web && npm run dev`. Walk the whole path: open a lesson, ask from the corner, ask from a selection, let it keep a mark, undo it, accept a topic, fold the discussion, and reload to confirm the conversation and its undo survive.

- [ ] **Step 3: Push**

```bash
git push origin main
```

The migration goes up with the code, which is what `050_ask.sql` being additive is for: the web build and the migration are not a transaction, and nothing here breaks against the schema as it stands before its own migration runs.
