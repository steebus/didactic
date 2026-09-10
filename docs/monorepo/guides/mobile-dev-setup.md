# Running and shipping the mobile app

For after Phase 4 of `PLAN.md`. Until then this is what the setup will be.

## Prerequisites

- Node 22 (as the web), npm 10.
- An Expo account and the EAS CLI: `npm i -g eas-cli && eas login`.
- iOS: Xcode with a simulator; Android: Android Studio with an emulator.
  The app uses native modules (Skia, Reanimated, SecureStore, the share
  intent), so it runs in a **development build**, not Expo Go.

## Environment

`apps/mobile/.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_API_URL=https://<your vercel domain>
```

Against a local web app: run `npm run dev -w @didactic/web` at the root,
find the machine's LAN address, and set `EXPO_PUBLIC_API_URL=http://<lan
ip>:3000`. The phone and the machine must share a network. The local
Supabase from `supabase start` works the same way with its LAN URL;
remember the anon key differs between local and hosted.

Never put `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` in this file.
`EXPO_PUBLIC_*` is compiled into the binary.

## First run

```
npm install                                   # at the root; installs every workspace
npx turbo run typecheck --filter=@didactic/mobile
cd apps/mobile
eas build --profile development --platform ios      # or android
```

Install the resulting build on the device or simulator, then:

```
npx expo start --dev-client
```

Sign in with the catalogue's one account. There is no claim flow on the
phone; claim from the web first.

## Day to day

| Task | Command |
| --- | --- |
| Start the dev server | `npx expo start --dev-client` in `apps/mobile` |
| Typecheck everything | `npx turbo run typecheck` at the root |
| Tests | `npx turbo run test` at the root; `npm test -w @didactic/mobile` for the phone alone |
| Lint | `npx turbo run lint` |
| Check for two Reacts | `npm ls react` at the root: one version, no nested copies under `apps/mobile` |
| Preview build for a tester | `eas build --profile preview --platform all` |
| Ship JavaScript to installed builds | `eas update --branch production --message "…"` (CI does this on `main`) |
| Ship a native change | tag `mobile-vX.Y.Z`; CI runs `eas build --profile production`; submit by hand with `eas submit` |

A change under `packages/**` reaches the phone through `eas update`
because the packages are source. A change that adds a native module, or
bumps the Expo SDK, needs a new build and a new store submission.

## Deep links

`didactic://topics/<id>` opens a topic. `https://<web domain>/topics/<id>`
opens the same topic in the app when it is installed, through associated
domains (iOS) and an intent filter with autoVerify (Android), which need
the `apple-app-site-association` and `assetlinks.json` files served by
the web app from `apps/web/public/.well-known/`.

## Share intent

Sharing a URL or text from another app opens the inbox with the field
filled. This uses `expo-share-intent` as a config plugin, which adds an
iOS share extension and an Android `SEND` intent filter at prebuild. It is
a native change: a new build after adding it.

## When something is off

- **Metro cannot find `@didactic/core`:** check the root `package.json`
  `workspaces` and that `packages/core/package.json` has `"main":
  "./src/index.ts"`. Expo's Metro config detects npm workspaces; a custom
  `metro.config.js` with `watchFolders` is the fallback.
- **"Invalid hook call" or two Reacts:** a package took `react` as a
  dependency instead of a peer. `npm ls react` shows where.
- **401 from every call:** the token is stale and the refresh did not
  run; check the `AppState` listener in `lib/supabase.ts` and that
  `EXPO_PUBLIC_SUPABASE_URL` matches the project the web uses.
- **The stock list reads but a write fails with a sentence about
  time:** the same Vercel function timeout the web meets; it is not the
  phone's.
