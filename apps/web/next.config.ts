import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Packages Next must not bundle: read them from `node_modules` at
   * runtime instead.
   *
   * pdfjs has no `DOMMatrix`, `Path2D` or `ImageData` to work with --
   * Node ships none of them -- so at load it reaches for
   * `@napi-rs/canvas` to polyfill them. That reach is a runtime
   * `require` of a native module, and a bundler cannot follow it: once
   * pdfjs is inlined into a server chunk the require resolves against
   * the chunk rather than against `node_modules`, fails, and the module
   * throws `ReferenceError: DOMMatrix is not defined` while it is still
   * being evaluated.
   *
   * Which is why no `try`/`catch` helps and why nothing showed up in
   * development: the failure is at import, not at call, and locally the
   * dev server resolves the native module perfectly well. It only
   * appears in a built, traced, deployed function.
   *
   * Next externalises a long list of awkward packages automatically and
   * none of these three is on it -- `canvas` is, `@napi-rs/canvas` is
   * not -- so they are named here. This has been wrong since the first
   * deploy that read a PDF: the queue worker's own ingestion hit the
   * same wall, quietly, where nobody was watching.
   *
   * This is half the story, and on its own it was not enough. Unbundled,
   * pdfjs sits in `node_modules` and still cannot find its canvas --
   * nothing statically imports that package, so file tracing has nothing
   * to follow and the native binary never reaches the function.
   * Declaring it as a dependency does not change that. The global it
   * wanted is supplied instead, in `lib/extract/pdfGlobals.ts`, which is
   * why `@napi-rs/canvas` is not needed here or anywhere.
   */
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],

  /**
   * Files the trace cannot find on its own.
   *
   * pdfjs does its parsing in a worker, and in Node it runs that worker
   * in-process by importing `pdf.worker.mjs` from beside itself. The
   * path is built at runtime, so nothing in the build ever sees the
   * specifier and the file is left out of the function -- which fails as
   * "Setting up fake worker failed: Cannot find module
   * /var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", from
   * inside `getDocument`, and reaches the sheet as a document that could
   * not be opened.
   *
   * This is the third time the same shape of problem has bitten here,
   * and it is worth naming: a runtime `require` or `import` of a path a
   * library computes for itself is invisible to file tracing. Being
   * installed is not being deployed. `pdfjs-dist` itself arrives because
   * our own code names it in an import; nothing names its worker.
   *
   * Only the two routes that open a document. The worker is two
   * megabytes and there is no reason for it to sit in a function that
   * draws a graph.
   *
   * Both spellings of the path, because they cost nothing and only one
   * of them is right: `pdfjs-dist` is hoisted to the monorepo root
   * rather than installed beside the app, and the value is resolved
   * against this directory.
   */
  outputFileTracingIncludes: {
    '/api/resources/uploaded': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
    '/api/internal/ingest': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
  },
  // The dev overlay badge sits over the page and lands in screenshots.
  devIndicators: false,
  // Next writes its own AGENTS.md/CLAUDE.md on build; this project keeps
  // its guidance in PRODUCT.md and the surface briefs.
  agentRules: false,
  // One user, and every write goes through this app's own routes, so
  // the cache can be trusted and invalidated exactly. Data is dynamic
  // by default; what is cached is stated per function, tagged, and
  // dropped by the route that changed it.
  cacheComponents: true,
  cacheLife: {
    // The structure of the catalogue, held until something says
    // otherwise.
    //
    // Everything cached in this app is derived from one user's own
    // writes, and every route that writes drops the tags it touched --
    // `tests/cache-invalidation.test.ts` fails the build if one does
    // not. So a timer re-reading the database is not a correctness
    // measure here, it is only a cost: the `default` profile threw the
    // map away every fifteen minutes and re-read three continents'
    // worth of round trips to rebuild, byte for byte, what it already
    // had. A sown subject's topics and a written lesson's prose
    // essentially never change on their own.
    //
    // So: no expiry on time. `revalidate` is a year rather than a
    // literal infinity because the option takes a number, and `expire`
    // is inherited from `default`, which is never. What drops a sheet
    // is `revalidateTag`, and nothing else.
    //
    // `stale` is the one figure deliberately left short. It governs the
    // browser's own router cache, which no tag can reach: only a
    // `router.refresh()` clears it, which every write on the web does.
    // A second client -- the phone, another tab -- cannot, so this is
    // the window in which those could show a figure this browser has
    // already moved on from. Five minutes is the framework default and
    // is the whole exposure.
    held: {
      stale: 300,
      revalidate: 60 * 60 * 24 * 365,
    },
  },
  // One reusable shell per route, prefetched, rather than one prefetch
  // per link in the viewport. Navigating between a topic and the bed it
  // sits in is the same two routes over and over, so the shells are
  // fetched once and reused for the rest of the session.
  partialPrefetching: true,
  experimental: {
    // How long the browser may reuse a page it has already been shown.
    //
    // The default is nought for anything not fully prefetched, which
    // means going back to a sheet you were on ten seconds ago is a
    // fresh request to a database on another continent, through a
    // session check that is itself a round trip. Half a minute is short
    // enough that nothing here goes visibly stale -- every write in
    // this app refreshes the router, which drops this cache -- and long
    // enough to cover reading a topic, looking at its bed, and coming
    // back.
    staleTimes: { dynamic: 30, static: 180 },
  },
}

export default nextConfig
