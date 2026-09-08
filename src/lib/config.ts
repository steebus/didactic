export const config = {
  // Resolver similarity bands, measured against gte-small on the real
  // topic set rather than assumed. Wrong merges are worse than wrong
  // splits: a merge destroys history, a split costs one click.
  //
  // This model's similarities sit far higher and closer together than
  // OpenAI's, and the bands genuinely overlap. Measured on the fixture:
  //
  //   distinct topics that must NOT merge   React / React Hooks   0.916
  //                                         JavaScript / TypeScript 0.870
  //   restatements that SHOULD merge        CDN Distribution /
  //                                         Content Delivery Network 0.852
  //
  // No cutoff separates those, so there is no honest auto-link band:
  // 0.92 would still merge "React" into "React Hooks", and anything
  // lower merges more. MATCH therefore sits above the highest observed
  // distinct pair, which means near-duplicates land in the ambiguous
  // band and reach the user instead of being silently merged.
  //
  // The lower band does separate. Measured on the same set, concepts
  // with no business in this graph top out at 0.802 (Ballet against
  // Composition; Bread Baking against Caching Strategy), while genuinely
  // adjacent ones run 0.833 and up (Monetary Policy / Keynesianism,
  // Redis Caching / Caching Strategy). AMBIGUOUS sits above the alien
  // ceiling so unrelated concepts are created outright instead of
  // filling the adjudication queue with noise.
  //
  // Re-measure with scripts/tune-thresholds.ts after the topic set
  // grows; these numbers describe one graph, not the model in general.
  RESOLVER_MATCH: 0.94,
  RESOLVER_AMBIGUOUS: 0.81,

  // How much each kind of engagement counts toward ability.
  DEPTH_WEIGHTS: { skim: 0.2, read: 0.5, applied: 1.0 },

  // You cannot read your way to expert.
  CONSUMPTION_CEILING: 3.5,

  FRESHNESS_HALF_LIFE_DAYS: 90,
} as const
