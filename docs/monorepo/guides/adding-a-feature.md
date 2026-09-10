# Adding a feature to both platforms

A feature lands on the web and the phone, or lands on one with the other's
absence written down. This is the order of work and the checklist a pull
request is held to. It is the definition of done once Phase 4 of
`PLAN.md` has shipped; before that, the mobile steps are recorded as
`planned` rows rather than built.

## The order

Work bottom-up through the layers in `ARCHITECTURE.md` §1, because each
layer's tests are cheapest at that layer and because the phone cannot
start until the layers under it exist.

1. **`PARITY.md` first.** Add or find the row. Write both platforms'
   intended status before any code. If the phone will not get it, say
   why now, not in review.
2. **Backend.** Migration under `supabase/migrations/` if the schema
   changes; the edge function if ingestion changes. Same as today.
3. **`packages/core`.** The types, the maths, the words. Every number,
   word or shape both apps will print is a function or constant here,
   with a test. If you find yourself writing it inline in a web
   component, stop and move it.
4. **The API route** under `apps/web/src/app/api/`. Owner check,
   `revalidateTag` for what it moved, a sentence in every error. Additive
   only (`guides/api-contract.md`).
5. **`packages/api`.** The typed function and its `ENDPOINTS` entry with
   `invalidates`. The web's client components and the phone both call
   this; neither calls `fetch` on a path directly.
6. **The web surface.** Server page reading through the `get…` function,
   or a client component through `@didactic/api`. CSS module following
   `DESIGN.md`. If `DESIGN.md` gains or changes a rule, amend it in the
   same PR.
7. **The mobile surface.** The screen at the same address under
   `apps/mobile/app/`, built to `guides/styling-on-mobile.md`, drawing
   from the same `core` functions. Query keys from the endpoint's tags.
8. **`PARITY.md` again.** Move the rows to their true status in the same
   commit as the code.

## What a pull request carries

- [ ] `PARITY.md` rows added or moved, in the commit with the code.
- [ ] Anything printed on both platforms comes from `@didactic/core`, and
      has a test there.
- [ ] Any new or changed route: additive; `revalidateTag` in the handler;
      the same tags in `ENDPOINTS`; a row in `guides/api-contract.md`.
- [ ] No `fetch('/api/…')` in an app; every call goes through
      `@didactic/api`.
- [ ] Nothing in `packages/` imports `next`, `react-native`, a DOM global,
      or a live Supabase client.
- [ ] `DESIGN.md` amended if a rule changed; `.impeccable/design-tokens.json`
      and `@didactic/tokens` updated together if a token changed (the
      agreement test will fail otherwise).
- [ ] Screenshots at 390px for both platforms of any surface touched, and
      at 1280px for the web.
- [ ] `npx turbo run lint typecheck test` green; `build` for the web when
      the change could break one.
- [ ] For a mobile change: opened on a device from a development build,
      and said so.
- [ ] The web was pushed before the phone, when both changed (D10).

## Two shapes of change that need care

**A change to how a figure is computed.** Ability, freshness, viability,
route progress, the outline order. It lives in `core`, so one edit moves
both platforms and the scripts. Its test is the only thing standing
between one wrong figure and a map that flatters its owner. Model tier:
opus, as the original plan says of the scoring maths.

**A change to a sheet's shape.** A new block, a moved panel, a new state
word. `DESIGN.md` first, then web and phone against it. The phone follows
the rule, not the stylesheet; if the rule cannot be followed natively,
`styling-on-mobile.md` and `PARITY.md` both say so.

## What does not need parity

- Server-side work: LLM prompts, ingestion, embedding, the resolver. One
  place, no counterpart.
- The claim flow, which is the web's alone.
- The share intent, which is the phone's alone.

These are `n/a` rows with reasons, not omissions.
