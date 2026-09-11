import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
