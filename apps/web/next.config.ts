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
