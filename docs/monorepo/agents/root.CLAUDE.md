@AGENTS.md

# This repository

Two front ends on one backend. `apps/web` is the Next.js catalogue,
deployed by Vercel from `main`. `apps/mobile` is the Expo app, shipped
through EAS. `packages/core`, `packages/tokens` and `packages/api` are what
they share. `supabase/` is the one backend both use. `PRODUCT.md` says what
the app is and `DESIGN.md` what it looks like; `docs/monorepo/` says how the
two front ends are kept as one product.

# Where work goes

- A number, word or shape both apps print: `packages/core`, with a test.
- A route: `apps/web/src/app/api/`, additive only, with its typed function
  in `packages/api` and its row in `docs/monorepo/guides/api-contract.md`.
- A web surface: `apps/web`, to `DESIGN.md`.
- A mobile surface: `apps/mobile`, to `docs/monorepo/guides/styling-on-mobile.md`.
- Every feature: its row in `docs/monorepo/PARITY.md`, moved in the same
  commit as the code. The parity skill checks this on a diff.

Nothing under `packages/` imports `next`, `react-native`, a DOM global or a
live Supabase client. Shared hooks take React as a peer.

# Shipping

Work lands on `main`. Commit and push after each impactful body of work —
a bug fixed, a feature finished, a refactor done — without being asked and
without waiting for the end of the session. Vercel builds the web from
`main`; EAS Update ships the phone's JavaScript from `main`. An unpushed
commit is work that does not exist yet.

Before the push, run what the repo runs: `npx turbo run lint typecheck
test`, and `npx turbo run build --filter=@didactic/web` where the change
could break one. A push that breaks the deploy costs more than the minute
the checks take. Say what was pushed, in the first line of the reply rather
than the last.

A mobile change is also opened on a device from a development build before
it is called done, and the reply says so.

The exceptions are the ordinary ones: work the user has said to hold, a
visible design change on the web, and anything else they would want to see
before it is live.

# The API and old phones

The web replaces every client on deploy; a phone runs the build it has. A
response may gain a field and may not lose or rename one without a row in
the deprecations table and one release of overlap. Ship the web first when
both change.
