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
}

export default nextConfig
