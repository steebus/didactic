# apps/mobile

The Expo app. It is the same catalogue on a phone, not a companion.

- Every screen is an address that exists on the web
  (`docs/monorepo/ARCHITECTURE.md` §6). A new screen without a web
  counterpart needs an `n/a` row in `docs/monorepo/PARITY.md` with a
  reason.
- All data comes through `@didactic/api` over `EXPO_PUBLIC_API_URL` with a
  bearer token. Never a direct table read from Supabase, never the service
  role key, never an Anthropic key. Supabase-js is used here for auth only.
- Query keys are the tags in `ENDPOINTS`; a mutation invalidates the tags
  the endpoint declares, nothing invented.
- Figures, words and geometry come from `@didactic/core`; colours, scale
  and space from `@didactic/tokens` through `lib/theme.ts`. Do not write a
  hex, a size or a font name inline.
- Styling follows `docs/monorepo/guides/styling-on-mobile.md`, which is
  `DESIGN.md` translated. Where a rule cannot be followed natively, record
  it there and in `PARITY.md` rather than approximating.
- The foot bar is the custom tab bar in `app/(sheets)/_layout.tsx`, built
  to `docs/monorepo/guides/bottom-nav.md`.
- No dark mode, no reduced-motion guard, by the same decisions as the web.

Checks before a push: `npx turbo run lint typecheck test
--filter=@didactic/mobile`, `npm ls react` showing one React, and the
screen opened on a device from a development build. Native changes (a new
module, an SDK bump) need a new EAS build; say so in the reply.
