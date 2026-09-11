# apps/web

The Next.js catalogue, and the API both front ends use.

Read `node_modules/next/dist/docs/` (resolved from this directory) before
writing Next code; this Next is not the one in training data.

- Pages read through the `get…` readers in `src/lib`, which carry the
  cache and its tags. Client components call `@didactic/api`, never
  `fetch('/api/…')`.
- Every route handler checks the owner through `src/lib/auth.ts` (cookie
  or bearer, both verified) and calls `revalidateTag` for what it moved.
  API paths answer 401, never a redirect.
- Server-only code stays here: auth, the admin client, LLM calls,
  ingestion, sowing, scoring writes, the DOM purifier and walkers.
- Pure logic does not stay here. If a component computes a figure or a
  word the phone would also print, it belongs in `packages/core`.
- Surfaces follow `DESIGN.md`. Changing a rule means amending it in the
  same PR, and updating `.impeccable/design-tokens.json` and
  `packages/tokens` together: the agreement test fails otherwise.
- The foot bar is rendered from `layout.tsx` outside `main`; anything
  docked at the foot stands on `var(--foot-bar)`.

Checks before a push: `npm run lint`, `npx tsc --noEmit`, `npm test`, and
`npm run build` where the change could break one — from this directory, or
through turbo at the root.
