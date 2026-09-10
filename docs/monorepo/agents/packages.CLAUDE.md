# packages

What both front ends share. Four packages; three shipped as TypeScript source, and the reader also built once for the phone.

- `core`: types, maths, state words, geometry, markdown block parsing,
  response shapes, copy. No platform: no `next`, `react`, `react-native`,
  DOM globals, `dompurify`, `jsdom`, or a live `@supabase/*` client. Type
  imports are fine. The ESLint rule in the package enforces this; do not
  disable it.
- `tokens`: the design tokens as values, with a test that they agree with
  `apps/web/src/app/globals.css`. Change both or neither.
- `api`: one typed function per route, through `readJson`, registered in
  `ENDPOINTS` with the tags it invalidates. Additive changes only; see
  `docs/monorepo/guides/api-contract.md`.
- `reader`: the prose, marks, blocks, contents and note editor, React DOM,
  imported by the web and bundled by Vite into one HTML file for the
  phone's WebView. It is the one package with a build; `react` and
  `react-dom` are peers. A change here is a change on both platforms.

Every export has a test beside it in `tests/`. A function that both apps
print from is the one place a wrong figure reaches both at once, so the
test is not optional.

A shared hook, if one is ever needed, takes `react` as a peer dependency,
never a dependency.
