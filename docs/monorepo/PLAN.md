# Plan: one backend, two front ends

> **For agentic workers:** work this plan phase by phase and task by task.
> Each task names its files and its gate; a task is done when its gate
> passes, not when its code exists. Tick the checkbox in the commit that
> lands it. Do not start a phase while the previous phase's exit gate is
> red. Read `docs/monorepo/ARCHITECTURE.md` before Phase 1 and
> `docs/monorepo/guides/styling-on-mobile.md` before Phase 4.

**Goal:** Turn this repository into a monorepo holding the existing
Next.js web app and a new React Native (Expo) app, both against the same
Supabase project and the same API, sharing every line that can honestly be
shared, with a bottom navigation bar replacing the running head on both,
and a written parity record that says at all times where each feature
stands on each platform.

**Non-goals:** a second user, tenancy or row-level security (still out of
scope per `PRODUCT.md`); a redesign; dark mode; sharing rendered UI
components between DOM and native; moving the server-side work (LLM calls,
ingestion, scoring writes) out of the Next.js API.

**Stack, as decided here:** npm workspaces + Turborepo · Next.js (as
shipped) at `apps/web` · Expo with Expo Router at `apps/mobile` ·
TypeScript packages under `packages/` shipped as source · the existing
Supabase project, migrations and edge functions unchanged at `supabase/` ·
Vercel for web, EAS Build and EAS Update for mobile.

---

## 0. Decisions

Each is recorded with the alternative it beat, so the next person can
reopen it with the reasons in hand rather than from scratch.

### D1. The Next.js API is the backend for both apps

Mobile calls the same `/api/*` routes the web's client components call,
over HTTPS to the Vercel deployment, with a Supabase access token in an
`Authorization: Bearer` header. Nothing on the phone holds the service
role key, calls Anthropic, or writes to Postgres directly.

*Rejected:* mobile reading Supabase directly with the anon key. Without
row-level security the anon key in a shipped binary is a public read of the
whole catalogue, and turning RLS on is the tenancy work `PRODUCT.md` puts out
of scope. It would also mean running the `readHomeData` aggregation on the
phone, which is a second copy of the map's reading. The API already
expresses every write; it needs a handful of read endpoints added and a
second way of proving who is asking. See `guides/api-contract.md`.

### D2. Logic, types, tokens, copy and geometry are shared; rendered components are not

`packages/core` holds everything that is pure TypeScript today: types,
scoring maths, route progress, the outline order, sections, blocks, the
lesson view logic, config, cache tags, the state words and labels, and the
SVG path data for the specimens and the stock bar hatch. `packages/tokens`
holds the design tokens as a TypeScript module with a test that it agrees
with `globals.css`. `packages/api` holds one typed function per endpoint.
The web renders those with CSS modules and DOM; the phone renders them with
React Native and `react-native-svg`.

*Rejected:* `react-native-web` with one component tree for both. It would
mean rewriting every CSS module into style objects, losing Server
Components, `'use cache'` and the variable-font axes that carry the type
system (§2 of `DESIGN.md`), and shipping a web app that is worse than the
one that exists. The design world is carried by rules, and rules can be
followed twice; the sharing that pays is below the component line.

### D3. npm workspaces with Turborepo, not pnpm

The repo already uses npm and its lockfile. Expo's Metro config detects npm
workspaces and hoisting without extra settings, and pnpm's isolated
`node_modules` is the one layout React Native still fights. Turborepo is
added for task ordering and remote caching; Vercel recognises it.

### D4. Shared packages ship TypeScript source, not built output

`"main": "./src/index.ts"`. Next compiles them through `transpilePackages`,
Metro compiles everything anyway, Vitest reads source. No build step, no
stale `dist/`, no version to bump. The cost is that every consumer compiles
them; at this size that is seconds.

### D5. Shared packages depend on React only as a peer, and mostly not at all

`core`, `tokens` and `api` import no React. Any shared hook (there is one
candidate, `useLabour`) declares `react` as a peer dependency so each app
supplies its own copy. Two Reacts in one bundle is the classic monorepo
failure on native and it is avoided by construction.

### D6. The bottom bar carries five sheets; Sow and Close stay in the band

The five the screenshot shows on its first row: Stock list, The bed,
Library, Marked, Inbox. Sow is a form you go to on purpose and Close is the
one navigation that leaves; both print in the masthead's running head beside
the back link, on both platforms. Five is the ceiling a foot bar can carry at
390px in this label register. See `guides/bottom-nav.md`.

### D7. Expo Router mirrors the web's routes

`apps/mobile/app/topics/[id].tsx` is the same address as
`apps/web/src/app/topics/[id]/page.tsx`. Deep links (`didactic://topics/…`
and the universal link on the web domain) resolve to the same sheet on
either platform. A parity row is a path, and a path exists in both trees or
is recorded in `PARITY.md` as deliberately absent.

### D8. The graph is drawn natively, later

Sigma is WebGL on a DOM canvas and does not run in React Native. The phone
gets the bed through `@shopify/react-native-skia` with graphology and the
same ForceAtlas2 settings, in Phase 6. The encoding rules (size from
ability, fill faded by freshness, label side, dormant label ink) move to
`packages/core` first so the two beds cannot drift. A `WebView` hosting
`/graph` was considered for Phase 5 and rejected: it needs the session
cookie handed to a web view, which is a second auth path for a stopgap.

### D9. Marks on the phone start with paragraph selection

The web draws a kept passage back onto the prose by walking DOM text nodes
and lets any range be selected. React Native has no cross-platform selection
range event. Phase 5 ships existing marks drawn onto native `Text`, a note on
the lesson (no passage), and a long-press on a paragraph that offers the
paragraph or a sentence of it as the passage. Arbitrary ranges are Phase 6
and are recorded as such in `PARITY.md` rather than approximated silently.

### D10. Additive API changes only, because phones run old code

A web deploy replaces every client at once. A phone runs whatever build it
has until it updates. So an endpoint's response may gain fields and may not
lose or rename them without a deprecation row in `guides/api-contract.md`
and one release of overlap. EAS Update covers JavaScript-only changes in
hours; native changes wait for a store build.

---

## 1. Target layout

```
didactic/
  package.json                 workspaces: apps/*, packages/*; scripts run through turbo
  turbo.json                   build / lint / typecheck / test pipelines
  tsconfig.base.json           strict TS shared by every workspace
  vitest.workspace.ts          one `npm test` over every package that has tests
  CLAUDE.md, AGENTS.md         repo-wide agent rules (draft: docs/monorepo/agents/root.CLAUDE.md)
  PRODUCT.md, DESIGN.md        product and design truth, unchanged in role
  supabase/                    unchanged: migrations, functions, fixtures, config
  scripts/                     unchanged: seed, recompute, reembed, tune
  docs/                        unchanged, plus this directory
  .github/workflows/
    deploy-functions.yml       unchanged
    ci.yml                     new: turbo lint, typecheck, test on every push
    mobile.yml                 new: EAS build on tag, EAS update on main
  apps/
    web/                       everything that is src/, public/, tests/, next.config.ts today
      CLAUDE.md                (draft: docs/monorepo/agents/apps-web.CLAUDE.md)
      .impeccable/             moves with the stylesheets it reads
    mobile/                    Expo app
      app/                     Expo Router: the same paths as apps/web/src/app
      components/              native renderings of the shared specimens and furniture
      lib/                     session store, query client, share-intent handling
      CLAUDE.md                (draft: docs/monorepo/agents/apps-mobile.CLAUDE.md)
  packages/
    core/                      @didactic/core: types, maths, labels, geometry, markdown parsing
    tokens/                    @didactic/tokens: colours, scale, space, motion, as TS + a CSS agreement test
    api/                       @didactic/api: typed client for every route, with the tag each one invalidates
    CLAUDE.md                  (draft: docs/monorepo/agents/packages.CLAUDE.md)
```

Package names are `@didactic/core`, `@didactic/tokens`, `@didactic/api`.
Imports inside `apps/web` keep the `@/*` alias; it points at `apps/web/src`
as it points at `src` now.

---

## 2. Phases

Every phase ends with the web app deployed and behaving exactly as before,
except Phase 3, whose whole point is a visible change. Phases are sized so
that each is one to three pull requests.

### Phase 0. Decide and document — this pull request

- [x] Record decisions D1–D10 and the target layout (this file).
- [x] Describe the target architecture (`ARCHITECTURE.md`).
- [x] Write the parity record with every existing surface and capability at its current status (`PARITY.md`).
- [x] Write the working guides (`guides/`).
- [x] Draft the per-workspace agent instructions (`agents/`) and the parity skill (`.claude/skills/parity/SKILL.md`).
- [x] Point the root `CLAUDE.md` at this directory.

**Gate:** the documents exist, are linked from `docs/monorepo/README.md`,
and `npm test`, `npm run lint`, `npx tsc --noEmit` still pass (nothing
under `src/` changed).

### Phase 1. The monorepo shell — no behaviour change

**Model:** sonnet for the moves, opus for the Vercel cutover.

- [ ] **1.1 Move the web app.** `git mv` `src public tests next.config.ts next-env.d.ts eslint.config.mjs vitest.config.mts tsconfig.json tsconfig.tsbuildinfo .impeccable` into `apps/web/`. `git mv` keeps history; do not copy. Update `vitest.config.mts` paths (`./tests/setup.ts`, `./tests/restore-fixture.ts`) and `tests/local-db.ts` if it reaches for `supabase/` by relative path (it now lives two levels up).
- [ ] **1.2 Root workspace.** Root `package.json` becomes `{ "private": true, "workspaces": ["apps/*", "packages/*"] }` with `dev`, `build`, `lint`, `test`, `typecheck` delegating to `turbo run …`. `apps/web/package.json` keeps the app's dependencies and scripts, named `@didactic/web`. Add `turbo.json` with `build` depending on `^build`, `test` and `lint` with no outputs, `typecheck` running `tsc --noEmit`. Add `tsconfig.base.json`; `apps/web/tsconfig.json` extends it and keeps the Next plugin and `@/*` path.
- [ ] **1.3 Scripts.** `scripts/*.ts` import from `src/lib/…` today; point them at `../apps/web/src/lib/…` for now (they move to `packages/core` imports in Phase 2). `scripts/seed-dev.sh` and `dev-cloud.mjs`: check every relative path.
- [ ] **1.4 Vercel.** In the project settings set Root Directory to `apps/web` and leave the install command at the root (Vercel runs `npm install` at the repo root when it detects workspaces). Confirm with a preview deploy from this branch *before* merging.
- [ ] **1.5 CI.** `.github/workflows/ci.yml`: checkout, `npm ci`, `npx turbo run lint typecheck test`. The integration tests need the local Postgres (`tests/local-db.ts`); either start `supabase start` in CI or mark those files to skip when the database is absent, matching whatever the tests do today when it is missing. `deploy-functions.yml` is untouched: `supabase/` did not move.
- [ ] **1.6 Agent files.** Move `docs/monorepo/agents/root.CLAUDE.md` over the root `CLAUDE.md` (keep the `@AGENTS.md` line and the Next.js notice block; the notice's `node_modules/next/dist/docs/` path now resolves from `apps/web/`, so the root `AGENTS.md` should say so). Move `apps-web.CLAUDE.md` to `apps/web/CLAUDE.md`.

**Gate:** `npx turbo run lint typecheck test build` green at the root; a
Vercel preview of the branch serves every sheet; the edge-function
workflow's `paths` filter still matches. Merge, then confirm the production
deploy from `main` is green before starting Phase 2.

**Rollback:** revert the merge commit. Vercel's Root Directory goes back to
`.`. Nothing in Supabase changed.

### Phase 2. Extract what is shared, and open the API to a second client

**Model:** opus for `core` boundaries and the auth change; sonnet for the client.

- [ ] **2.1 `packages/tokens`.** `src/index.ts` exporting `colour`, `scale` (rem values *and* their px at 16), `space`, `motion`, `plates` (the six plate inks in assignment order), `reversed` (the paper-at-alpha steps), and `graph` (the graph-only inks), sourced from `apps/web/.impeccable/design-tokens.json` and `globals.css`. A Vitest test parses `apps/web/src/app/globals.css`'s `:root` block and asserts every `--` custom property in it has the same value in the module. This is what stops the phone's palette drifting.
- [ ] **2.2 `packages/core`.** Move, with their tests: `types.ts`, `config.ts`, `tags.ts`, `scoring.ts` (split: `computeAbility`, `computeFreshness`, `subjectAggregate`, `viabilityFigure` move; `recomputeAbility` and `recomputeAbilities` take a Supabase client and stay in `apps/web`), `progress.ts`, `outline.ts`, `sections.ts`, `blocks.ts`, `curriculum.ts` (the same split: `viewLessons`, `tierLessons`, `curriculumProgress`, `findPrereqCycle`, `linearPrereqs` move; `completeLesson`, `uncompleteLesson` stay), `http.ts`, `markAnchor.ts`, `books.ts` (`normaliseBooks`, `bookNote` move; the fetch stays), the `buildTopicTree` and `readVerdict` halves of `subject.ts`, and the interfaces of `home.ts`, `topic.ts`, `library.ts`, `pending.ts`, `subject.ts`. New in `core`: `stock.ts` (`stockState`, `STOCK_LABEL`, the hatch table from `StockBar.tsx`), `specimens.ts` (the path data and stage names from `Emblem.tsx` and `RootsSpecimen.tsx`, plus `slugify`), `graph.ts` (node size, fade, label ink and label-side rules from `GraphCanvas.tsx`), `copy.ts` (`LABOURS`, `DRAWINGS`, the edition date format, empty-state sentences that both apps print). Each web component then imports its geometry and words from `core` and keeps its rendering. Nothing in `core` may import `next`, `react`, `dompurify`, `jsdom` or `@supabase/*` except as `import type`; an ESLint `no-restricted-imports` rule in the package enforces it.
- [ ] **2.3 Read endpoints for the sheets the server renders.** Add `GET /api/home` returning `HomeData`, `GET /api/subjects/[id]/area` returning `SubjectArea`, `GET /api/subjects/[id]/sowing` returning `Sowing`, `GET /api/topics/[id]/area` returning `TopicArea` (the existing `GET /api/topics/[id]` stays as it is), `GET /api/library` returning `LibraryRow[]`, `GET /api/inbox` returning `{ pending: PendingTopic[], queued: Resource[] }`, `GET /api/graph` returning what `graph/page.tsx` assembles. Each calls the same `get…` function the page calls, so the cache and its tags are shared with the page. These are thin: a handler, an owner check, a `NextResponse.json`.
- [ ] **2.4 Bearer auth in the gate.** `getOwner()` in `apps/web/src/lib/auth.ts`: when the request carries `Authorization: Bearer <jwt>`, verify it with `createClient(url, anonKey).auth.getUser(jwt)` instead of the cookie client; `proxy.ts` does the same for API paths so a bearer request is neither redirected nor refreshed. The web keeps cookies. Add `tests/auth-bearer.test.ts`: a valid token passes, an expired one answers 401, a token with no header falls through to the cookie path. Document both modes in `guides/api-contract.md`.
- [ ] **2.5 `packages/api`.** One module per resource (`home.ts`, `subjects.ts`, `topics.ts`, `resources.ts`, `curricula.ts`, `lessons.ts`, `highlights.ts`, `inbox.ts`, `books.ts`, `refresher.ts`, `auth.ts`), each function typed with `core`'s interfaces, going through `readJson`. `createApi({ baseUrl, headers })` returns the bound set; the web passes `{ baseUrl: '' }` and the phone passes its origin and a header provider. Every function is registered in `ENDPOINTS` with `{ method, path, invalidates: Tag[] }`, read by the phone's query client to drop what a write moved (§ *Caching* in `ARCHITECTURE.md`).
- [ ] **2.6 The web's client components use the client.** Replace the raw `fetch('/api/…')` calls in `GraphCanvas`, `PendingQueue`, `AddResource`, `InboxTally`, `Highlighter`, `SignOut`, `DraftCurriculum`, `subjects/new/page`, `ProofOfRoots`, `MarkedSheet`, `curriculum/[id]/page`, `lesson/[id]/page`, `refresher/[topicId]/page` with `@didactic/api`. Behaviour identical; the diff is mechanical and the gate is the existing tests plus a click through every sheet.
- [ ] **2.7 Scripts and edge functions.** `scripts/*.ts` import from `@didactic/core`. Leave `supabase/functions` on their own copies of any maths for now and record the duplication in `PARITY.md` under *Backend*; a Deno import map pointing at `packages/core/src` is a follow-up, not a blocker.
- [ ] **2.8 Agent files.** `docs/monorepo/agents/packages.CLAUDE.md` to `packages/CLAUDE.md`.

**Gate:** every test that moved passes in its new home; `turbo run test`
runs `core`, `tokens`, `api` and `web`; `curl -H "Authorization: Bearer …"
https://<deploy>/api/home` returns the stock list and the same URL without
the header returns 401; the web deploy is green and reads identically.

**Rollback:** each task is its own commit and reverts on its own; 2.4 is
the one with a security surface and gets its own review.

### Phase 3. The foot bar on the web

**Model:** opus. This is the design change, and it touches `DESIGN.md`.

- [ ] **3.1 `FootBar` component** at `apps/web/src/components/FootBar.tsx` + `.module.css`, a client component reading `usePathname()`, rendered from `layout.tsx` outside `main` (the `sheetIn` transform on `main` would otherwise become the containing block for a fixed bar, §8 of `DESIGN.md`). Hidden on `/enter`. Built to `guides/bottom-nav.md`.
- [ ] **3.2 `SheetNav` slims to the running head:** back link on the left, `Sow` and `Close` on the right, the five sheet links removed. The `current` prop moves to `FootBar`. The inbox tally moves with the inbox link.
- [ ] **3.3 Room at the foot.** `--foot-bar: calc(3.25rem + env(safe-area-inset-bottom))` in `globals.css`; `body` gets `padding-bottom: var(--foot-bar)`; every docked panel, the offer, and the graph's bottom sheet stand on `bottom: var(--foot-bar)` rather than `0`; the graph canvas inset accounts for it.
- [ ] **3.4 Keyboard and reader.** The bar is a `<nav aria-label="Sheets">`; the current sheet is a `<span aria-current="page">`; tab order runs after the sheet's content. Focus ring uses the band's `--focus-ink`.
- [ ] **3.5 `DESIGN.md`.** Replace *The running head* in §4 with the text in `guides/bottom-nav.md` § *DESIGN.md amendment*; add the `--foot-bar` token to §3; amend §8's docked-panel rows and §10's `40rem` row. Update `.impeccable/design-tokens.json`.
- [ ] **3.6 Screenshots** at 390, 768 and 1280 of the stock list, a topic, a lesson with a docked mark panel, and the graph with its panel open; attach to the PR.

**Gate:** every sheet reachable from the bar and back; nothing hidden
behind it at 390px; `npm run lint`, `tsc`, `build` green; the user has seen
the screenshots (this is the one phase `CLAUDE.md`'s "anything they would
want to see before it is live" applies to).

### Phase 4. The mobile shell

**Model:** sonnet for scaffolding, opus for auth and fonts.

- [ ] **4.1 Scaffold.** `npx create-expo-app@latest apps/mobile --template blank-typescript`, then add Expo Router, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-reanimated`, `react-native-gesture-handler`, `expo-font`, `@expo-google-fonts/fraunces`, `@expo-google-fonts/archivo`, `expo-secure-store`, `@react-native-async-storage/async-storage`, `@supabase/supabase-js`, `@tanstack/react-query`, `expo-linking`, `expo-web-browser`. Package name `@didactic/mobile`. Pin the Expo SDK and record it at the top of `PARITY.md`. Confirm Metro resolves `@didactic/*` from the workspace without a custom `metro.config.js`; add one only if it does not.
- [ ] **4.2 Environment.** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` (the Vercel origin, or `http://<lan-ip>:3000` in development). `.env.example` at `apps/mobile`. No service role key, no Anthropic key, ever, in this app.
- [ ] **4.3 Session.** `lib/supabase.ts`: `createClient` with a storage adapter backed by SecureStore for the key and AsyncStorage for the encrypted session (the Supabase-documented pattern, because SecureStore caps an item at 2 KB), `autoRefreshToken` tied to `AppState`. `lib/api.ts`: `createApi` from `@didactic/api` with a header provider that reads the current access token. `app/enter.tsx`: the entry sheet, email and password, `signInWithPassword`; no claim flow on the phone. An unauthenticated app opens on `enter`; a 401 from any call returns to it.
- [ ] **4.4 Fonts and tokens.** `lib/theme.ts` from `@didactic/tokens`, with the type roles mapped to static Fraunces cuts per `guides/styling-on-mobile.md`. Fonts loaded before the first sheet; the splash holds until they are.
- [ ] **4.5 The foot bar and the band.** `app/(sheets)/_layout.tsx` as an Expo Router `Tabs` with a custom tab bar built to `guides/bottom-nav.md`; five tabs: `index` (stock), `graph`, `library`, `marked`, `inbox`. `components/Masthead.tsx`: the plate band with the running head (back, Sow, Close), the filed-under line, the title, the 5 pt mustard rule. `components/Sheet.tsx`: the paper ground with the tooth, at full width (a phone has no press bed to show around a sheet).
- [ ] **4.6 The stock list, read-only.** `app/(sheets)/index.tsx` printing `HomeData` from `GET /api/home`: the masthead with edition line, the stock rows with `Emblem` and `StockBar` drawn from `core`'s geometry through `react-native-svg`, the margin's blocks stacked beneath (the phone is always below `60rem`). Pull-to-refresh invalidates the `subjects` tag.
- [ ] **4.7 Deep links.** `scheme: "didactic"` in `app.json`; associated domains / intent filters for the web origin so `https://<web>/topics/<id>` opens the topic on the phone when installed. Route names match the web's paths exactly (D7).
- [ ] **4.8 Build.** `eas.json` with `development`, `preview`, `production` profiles; a development build installed on one iOS device and one Android device. `.github/workflows/mobile.yml`: `eas update --branch production` on push to `main` when `apps/mobile/**` or `packages/**` changed; `eas build` on a `mobile-v*` tag.
- [ ] **4.9 `PRODUCT.md` Platform** line becomes `web, mobile (iOS and Android)`. `docs/monorepo/agents/apps-mobile.CLAUDE.md` moves to `apps/mobile/CLAUDE.md`.

**Gate:** on both devices: opens on the entry sheet, signs in, prints the
stock list in the right inks and faces, the tally shows on the inbox tab,
a deep link to a topic lands on a (placeholder) topic sheet, `Close`
returns to the entry sheet. `PARITY.md` rows for *Entry*, *Stock list*,
*Foot bar* and *Session* read `built` for mobile.

### Phase 5. The sheets, in the order the phone is used

**Model:** sonnet per sheet, opus for the lesson and its marks.

`PRODUCT.md` calls the mobile session *incidental*: fire a link into the
inbox, mark something consumed, glance at the bed. That is the order.

- [ ] **5.1 Inbox.** `app/(sheets)/inbox.tsx`: `AddResource` (link, book with Open Library lookup through `GET /api/books/search`, note), `PendingQueue` (merge, split, or keep, through `PATCH /api/topics/pending`), the queued list. The `labour` phrases from `core` on the busy button.
- [ ] **5.2 Share intent.** `expo-share-intent` config plugin: a URL or text shared from any app opens the inbox with the field filled; one press files it. This is the phone's whole reason and it ships with the inbox, not after it.
- [ ] **5.3 Topic.** `app/topics/[id].tsx`: the band in the subject's own ink, viability figure (with the *about* rule), condition bar, the material list with *mark consumed* at a stated depth (`PATCH /api/resources/[id]`), neighbours, curricula cards with route progress, the marks filed against it, `AddResource` compact.
- [ ] **5.4 Subject bed and the reading.** `app/subjects/[id].tsx`: the fixed outline from `buildTopicTree` + `orderSubjectOutline`, the route chip, grub out, add topic, relate. `app/subjects/[id]/reading.tsx`: the two `RootsSpecimen` plates and the verdict.
- [ ] **5.5 Library and Marked.** Search, the duplicate offer and merge on the library; search and the note reader on marked.
- [ ] **5.6 Curriculum and lesson.** `app/curriculum/[id].tsx`: lessons tiered and availability derived by `viewLessons`. `app/lesson/[id].tsx`: markdown through `marked.lexer` after `parseBlocks`, rendered to native `Text` runs by a renderer in `apps/mobile/components/prose/`; the four blocks through `react-native-svg` (chart) and native views; contents band from `sections`; existing marks drawn as washed runs; *A note on this lesson*; long-press a paragraph to mark it (D9); complete the lesson at a depth.
- [ ] **5.7 Refresher and Sow.** `app/refresher/[topicId].tsx`. `app/subjects/new.tsx`: the whole sowing sheet including the roots gauge (a native slider driving the shared specimen, with the stem drawn on through `strokeDashoffset` under Reanimated), qualifying questions answered while the rest is filled in, proof of roots with `expo-document-picker` posting multipart to `/api/resources/upload`.
- [ ] **5.8 Grub out / delete flows** with the same wording as the web's confirmations.

**Gate per sheet:** its `PARITY.md` row moves to `built`, its screenshot
sits beside the web's at 390px in the PR, and the web sheet was not touched
(or the parity skill says why it was).

### Phase 6. The bed, full marks, and parity closure

**Model:** opus.

- [ ] **6.1 The graph.** `app/(sheets)/graph.tsx` on Skia: graphology graph from `GET /api/graph`, 400 settling iterations of ForceAtlas2 before first paint with the same constants, the running layout on an animation frame, pinch and pan through gesture-handler, tap a seed to open the panel as a bottom sheet, the panel's viability and condition from the same `core` functions. Encoding from `core/graph.ts`, so the two beds agree.
- [ ] **6.2 Arbitrary passage selection** on the lesson, if the platform allows it by then; otherwise the row stays *partial* with the reason.
- [ ] **6.3 Parity audit.** Every row in `PARITY.md` is `built`, `partial` with a reason, or `n/a` with a reason. No `planned` rows remain.
- [ ] **6.4 Store listing** assets and the first production build.

### Phase 7. Steady state

- The parity skill runs on every PR touching `apps/` or `packages/`.
- `guides/adding-a-feature.md` is the definition of done for a feature.
- Additive API rule (D10) enforced at review; deprecations recorded.

---

## 3. Risks, named

| Risk | Where it bites | What the plan does about it |
| --- | --- | --- |
| Vercel Root Directory cutover breaks the deploy | Phase 1.4 | Preview deploy from the branch before merge; revert is one commit and one setting. |
| Two copies of React in the native bundle | Phase 4 | D5: shared packages carry no React; `npm ls react` in CI for the mobile workspace must show one. |
| Variable-font axes are not available natively | Phase 4.4 | Static Fraunces cuts by optical size; the mapping is in `guides/styling-on-mobile.md`, and SOFT/WONK are recorded as a ceiling in `PARITY.md`. |
| The Vercel function timeout on sowing | Phase 5.7 | Unchanged from the web; `readJson`'s 504 sentence prints on the phone too. A move to a longer-lived worker is a backend change and out of scope here. |
| Marks cannot be selected as ranges natively | Phase 5.6 | D9: paragraph selection first, recorded as partial. |
| Old phone builds against a changed API | Always | D10, plus EAS Update for JS-only changes. |
| Integration tests need a local Postgres in CI | Phase 1.5 | Start `supabase` in CI or skip with a named reason; never delete the tests. |
| Duplicate maths in the Deno edge functions | Phase 2.7 | Recorded in `PARITY.md` under Backend; a Deno import map is the follow-up. |

## 4. What a phase's pull request carries

1. The task checkboxes it ticks, in this file.
2. The `PARITY.md` rows it moves, in the same commit as the code.
3. For anything visual: screenshots at 390px, and at 1280px on the web.
4. The checks: `npx turbo run lint typecheck test`, and `build` for the web
   whenever the change could break one.
5. For the mobile app: a development build installed and the sheet opened
   on a real device, said so in the PR.
