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

  // The same question asked of two topics proposed together for one
  // subject, where the answer has to be different. Everything under
  // one subject shares a vocabulary, and this model reads shared
  // vocabulary as similarity: measured on a stock-market bed, the
  // siblings ran 0.80 to 0.87 against each other -- "Brokerage
  // Accounts and Custody" against "Equity Ownership Fundamentals" at
  // 0.832, "Short Selling Mechanics" at 0.828 -- all of them complements
  // rather than duplicates, and all of them above RESOLVER_AMBIGUOUS.
  // Judged by the ordinary bar a freshly sown bed sent nineteen of its
  // twenty topics to adjudication, which is not a queue anyone can
  // work through and not a question anyone can answer.
  //
  // So a sibling has to be a near restatement before it is worth
  // asking about. This sits above the observed sibling ceiling and
  // below MATCH, which leaves a narrow band for the genuine case: the
  // model proposing one topic twice under two names.
  RESOLVER_SIBLING_AMBIGUOUS: 0.9,

  // Two rows that are the same piece of material.
  //
  // A URL settles identity where there is one, and the database now
  // enforces that. What it cannot settle is the same book entered by
  // hand and later looked up, or entered twice with different
  // punctuation -- which is how one book came to sit in the library
  // four times. Measured on those rows: the same book scores 0.988 to
  // 0.989 across "The Little Book of Common Sense Investing - John C
  // Bogle" and "The little book of common sense investing — John C.
  // Bogle", while two different books by different authors score
  // 0.855. The gap is wide, so this sits well above the wrong pairs
  // and below the right ones.
  //
  // It only ever asks. Merging two resources moves exposures and
  // cannot be undone, so it is a suggestion on the shelf rather than
  // something done quietly.
  DUPLICATE_RESOURCE: 0.94,

  // How much each kind of engagement counts toward ability.
  //
  // A marked passage is the lightest thing that counts at all: it is
  // evidence you were there and thought something, not evidence you
  // read the piece. One is nearly nothing and they compound through
  // the log curve, but the weight has to stay small enough that a
  // spree of highlighting cannot out-score reading the thing --
  // measured at 0.05, ten highlights drew exactly level with one read,
  // which would make marking sentences the cheapest way to move the
  // map. At 0.01 it takes fifty of them to reach one read, and fifty
  // marked passages is a real amount of attention rather than a way
  // round the figure.
  //
  // A question answered correctly the first time is the next lightest.
  // It is worth more than a marked passage -- marking is evidence you
  // were there, answering is evidence you followed -- and much less
  // than a skim: a lesson with four questions in it, all answered
  // right, comes to one fifth of reading the lesson, which is about
  // what four right answers are worth against actually reading it.
  //
  // Only the first answer to a question is ever recorded (027), and a
  // wrong one scores nothing, so this cannot be farmed by re-answering
  // and cannot be lost by guessing.
  // Struggle is worth nothing, and is recorded anyway.
  //
  // A diary entry that says a topic is not landing is evidence, and the
  // app would be lying to leave it out. But you do not get better at a
  // thing by finding it hard, so it adds no ability: weight zero, which
  // contributes nothing to the curve.
  //
  // What it does instead is move the *confidence*. It is an exposure,
  // so it counts in the tally; it is a distinct depth, so it counts in
  // the diversity term. A topic with a struggle in its log reads as
  // less settled than one without -- which is true, and which is the
  // honest correction: the app knows less than it thought, rather than
  // the reader suddenly knowing less than they did. Reading that
  // genuinely happened is never erased.
  //
  // Below 0.4 the sheets print a topic as vague, and five surfaces
  // already draw that state. So this needed no new UI -- only the
  // truthful input the confidence channel was always waiting for.
  DEPTH_WEIGHTS: {
    struggled: 0,
    marked: 0.01,
    answered: 0.05,
    skim: 0.2,
    read: 0.5,
    applied: 1.0,
  },

  // How many of a loose topic's neighbours must sit in one subject
  // before the topic files itself there, and how much of what it
  // touches they have to be.
  //
  // A topic's subjects are settled when it is made and never revisited,
  // and its edges are drawn in a pass after that, so the bed holds
  // evidence nothing ever reads: a topic with five edges into one
  // subject and no membership in it. This is the bar for acting on that
  // evidence unasked.
  //
  // Measured on the real bed rather than assumed -- 108 active topics,
  // 23 of them filed under nothing:
  //
  //   5 agreeing   Price-to-Earnings Ratio, Value Investing     both right
  //   2 agreeing   thirteen topics, twelve of them right
  //                (Data Science -> Web Development is not)
  //   1 agreeing   seven topics, two of them wrong
  //                (Statistics, Database Normalization)
  //
  // The errors are all one shape: a broad topic that is genuinely its
  // own subject and merely adjacent to this one. They stop at three.
  // Three separate topics in one subject is a cluster; two is a pair of
  // edges, which is what a neighbouring subject looks like from
  // outside.
  //
  // The bar is set where the errors stop rather than where most of the
  // filing is, because the two mistakes do not cost the same. A topic
  // left loose is sitting on a sheet that exists to list it, asking to
  // be filed. A topic filed wrongly is quiet, and it is quiet inside a
  // bed somebody trusts. Below the bar the claim is printed with its
  // count and waits to be pressed, which costs one press and cannot be
  // wrong.
  FILING_SETTLED: 3,

  // Of the neighbours filed anywhere, the share that must agree. Inert
  // on this bed, where every loose topic's neighbours sat in one
  // subject and the share was 1.00 throughout. It is what will keep a
  // topic bridging two subjects out of whichever has one more edge.
  FILING_SHARE: 0.6,

  // You cannot read your way to expert.
  CONSUMPTION_CEILING: 3.5,

  // Under this, a figure is printed as a guess rather than a number.
  // Five surfaces draw that state and each carried its own 0.4; the
  // clamp below has to sit under the same line, so the line is named
  // here rather than in six places.
  CONFIDENT_ENOUGH: 0.4,

  // Where a struggle holds the figure until something answers it.
  // Below CONFIDENT_ENOUGH and not at zero: the app has not stopped
  // knowing anything about the topic, it has stopped being sure.
  STRUGGLING_CONFIDENCE: 0.35,

  FRESHNESS_HALF_LIFE_DAYS: 90,
} as const
