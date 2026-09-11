/**
 * How alike two embeddings are.
 *
 * The one piece of the resolver that is pure arithmetic: no client, no
 * config, no thresholds. It lives here because the phone will compare
 * vectors too, and because a similarity computed two slightly different
 * ways is two different maps.
 *
 * The vectors are expected to be the same length and normalised; the
 * zero-magnitude guard is for the degenerate case rather than for
 * vectors of different sizes, which is a caller's bug.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}
