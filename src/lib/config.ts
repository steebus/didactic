export const config = {
  // Resolver similarity bands. Tuned by observation, not theory —
  // see spec §4.3. Wrong merges are worse than wrong splits.
  RESOLVER_MATCH: 0.85,
  RESOLVER_AMBIGUOUS: 0.70,

  // How much each kind of engagement counts toward ability.
  DEPTH_WEIGHTS: { skim: 0.2, read: 0.5, applied: 1.0 },

  // You cannot read your way to expert.
  CONSUMPTION_CEILING: 3.5,

  FRESHNESS_HALF_LIFE_DAYS: 90,
} as const
