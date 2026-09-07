import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The dev overlay badge sits over the page and lands in screenshots.
  devIndicators: false,
  // Next writes its own AGENTS.md/CLAUDE.md on build; this project keeps
  // its guidance in PRODUCT.md and the surface briefs.
  agentRules: false,
}

export default nextConfig
