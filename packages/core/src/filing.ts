import { config } from './config'

/**
 * Where a topic filed under nothing belongs, read off the company it
 * keeps.
 *
 * A topic's subjects are decided once, when it is made, and the two
 * rules that decide them both look at something other than the bed:
 * the reading of its own description, or the subjects the resource's
 * matches already sat in (`045`, and `039` before it). Neither reads
 * the edges -- and the edges are drawn in a later pass, because the
 * model needs real ids to relate, so the evidence that would settle it
 * does not exist yet at the only moment anything looks. A topic can
 * end up with five edges into one subject and no membership in it,
 * which is what the bed draws: a pale node hanging off a coloured
 * hull, joined to it five times over and belonging to nothing.
 *
 * So this is the third reading, and the one the graph was already
 * holding the answer to.
 *
 * Shared, because the phone prints the same claim and a bar that stood
 * in two places would file a topic on one platform and offer it on the
 * other.
 */

/** One subject a topic's neighbours point at. */
export interface FilingClaim {
  subjectId: string
  /** How many of its neighbours sit in this subject. */
  agreeing: number
  /** Of the neighbours filed anywhere, the share sitting in this one.
   *  One neighbour in each of two subjects is 0.5 twice. */
  share: number
  /**
   * `settled` is a claim strong enough to act on unasked. `unclear` is
   * one worth putting in front of someone and not worth acting on:
   * printed on the loose sheet with the count, so the reasoning is
   * visible and the press is theirs.
   */
  standing: 'settled' | 'unclear'
}

/**
 * What a loose topic's neighbours say about where it goes, strongest
 * first.
 *
 * Takes one entry per neighbour: the subjects that neighbour is filed
 * under, which is empty for a neighbour that is loose itself. A loose
 * neighbour is not evidence either way and is not counted in the
 * share -- half this bed's loose topics are joined to each other, and
 * counting them against a claim would hold down exactly the clusters
 * that most need filing.
 *
 * Every subject that clears the bar is returned, not just the winner.
 * Membership has been many-to-many since `012`: a topic genuinely
 * sitting in two subjects should land in both rather than in whichever
 * had one more edge.
 */
export function filingClaims(
  neighbourSubjects: ReadonlyArray<readonly string[]>
): FilingClaim[] {
  const placed = neighbourSubjects.filter(subjects => subjects.length > 0)
  if (placed.length === 0) return []

  const agreeing = new Map<string, number>()
  for (const subjects of placed) {
    // A neighbour in two subjects is one voice in each, never two in
    // one: the same neighbour listed twice would let a single edge
    // clear a bar meant to need three.
    for (const subjectId of new Set(subjects)) {
      agreeing.set(subjectId, (agreeing.get(subjectId) ?? 0) + 1)
    }
  }

  return [...agreeing]
    .map(([subjectId, count]) => ({
      subjectId,
      agreeing: count,
      share: count / placed.length,
      standing: settled(count, count / placed.length) ? 'settled' as const : 'unclear' as const,
    }))
    .sort((a, b) => b.agreeing - a.agreeing || a.subjectId.localeCompare(b.subjectId))
}

/**
 * Whether a claim files itself.
 *
 * Both tests, and the second one does nothing yet. Measured on this
 * bed -- 108 topics, 23 of them loose -- every loose topic's filed
 * neighbours sat in one subject and nowhere else, so the share was
 * 1.00 across the board and the count was the only figure that
 * separated anything. It is in the rule anyway, because the share is
 * what will stop a topic bridging two subjects from being filed under
 * whichever of them happened to have one more edge, and that is a bed
 * this one has not grown into rather than a case that cannot happen.
 */
function settled(agreeing: number, share: number): boolean {
  return agreeing >= config.FILING_SETTLED && share >= config.FILING_SHARE
}

/**
 * The claim as a sentence, with the neighbour named by the reader.
 *
 * The counts are the claim, not decoration on it -- "2 of its 3" is the
 * whole of the reasoning and the only thing that lets anyone disagree
 * with it, so the sentence is built around them rather than around a
 * verdict. It ends on the subject, which the sheet sets as a link.
 *
 * Here rather than in the sheet because the phone prints the same line,
 * and because a sentence assembled from counts is exactly the sort that
 * reads "its 1 filed neighbours" the first time it meets a one.
 */
export function claimSentence(claim: Pick<FilingClaim, 'agreeing'>, ofFiled: number): string {
  if (ofFiled === 1) return 'Its only filed neighbour sits in'
  if (claim.agreeing === ofFiled) return `Every one of its ${ofFiled} filed neighbours sits in`
  if (claim.agreeing === 1) return `One of its ${ofFiled} filed neighbours sits in`
  return `${claim.agreeing} of its ${ofFiled} filed neighbours sit in`
}
