/**
 * A resource about one thing, filed as one topic.
 *
 * The reading names every learnable concept in a piece, which is right
 * for a survey, a course or a book, and wrong for a tutorial on one
 * thing. "Bloom Filter in Python" is about Bloom filters; filed by its
 * concepts it became Hash Functions, Set Membership Testing,
 * Probabilistic Data Structures and the rest -- topics the reader never
 * set out to learn, each a bare name, half of them queued as doubtful
 * matches for things already on the map.
 *
 * So the reading also says whether a piece is about one thing (`whole`),
 * the reader can say so too (`Filing`), and a piece about one thing is
 * filed under that one topic and nothing else. Here because the phone
 * prints the same lines about it and offers the same press.
 */

/**
 * What the reader has said about a resource. `whole`: file it as one
 * topic. `parts`: file it by what it covers, even if the reading thinks
 * it is about one thing. Null: the reading decides.
 */
export type Filing = 'whole' | 'parts' | null

export interface ReadConcept {
  name: string
  description: string | null
  relevance: number
}

/**
 * The concepts a resource is filed under.
 *
 * - Said to be by its parts: every concept, whatever the reading thought.
 * - Read or said to be about one thing: that one thing, at full
 *   relevance. Where the reader said so and the reading named nothing,
 *   the concept it found most central stands in.
 * - Otherwise every concept, as ever.
 */
export function conceptsToFile(
  concepts: readonly ReadConcept[],
  whole: ReadConcept | null,
  filing: Filing
): ReadConcept[] {
  if (filing === 'parts') return [...concepts]
  const one =
    whole ??
    (filing === 'whole'
      ? [...concepts].sort((a, b) => b.relevance - a.relevance)[0] ?? null
      : null)
  return one ? [{ ...one, relevance: 1 }] : [...concepts]
}

/** Whether the reading was asked to find one thing, or told not to. */
export function asFiling(value: unknown): Filing {
  return value === 'whole' || value === 'parts' ? value : null
}

/** The line on a resource saying how it is filed. Null when it is filed
 *  under nothing yet, which the sheet already says its own way. */
export function filingLine(topics: number): string | null {
  if (topics <= 0) return null
  return topics === 1
    ? 'Filed as one topic.'
    : `Filed under ${topics} topics, one for each thing it covers.`
}

/** The press that files it the other way. */
export function refileLabel(topics: number): string {
  return topics === 1 ? 'File it by its parts' : 'File it as one topic'
}

/** Which way that press files it. */
export function refileAs(topics: number): Exclude<Filing, null> {
  return topics === 1 ? 'parts' : 'whole'
}

/** Said once the press has been made: it is read again, not rearranged. */
export function refiledSentence(as: Exclude<Filing, null>, cleared: number): string {
  const how = as === 'whole' ? 'as one topic' : 'by its parts'
  const gone =
    cleared === 0
      ? ''
      : ` ${cleared === 1 ? 'One topic' : `${cleared} topics`} that only it had brought in, and that nothing else was filed against, ${cleared === 1 ? 'has' : 'have'} gone.`
  return `Reading it again ${how}; it will be filed in a minute or so.${gone}`
}

/**
 * Why a resource that has been read cannot be filed again: its reading
 * is counted against the topics it was filed under, and moving the
 * material would leave that count resting on topics it no longer
 * explains -- the same reason a read resource cannot be deleted.
 */
export const REFILE_READ =
  'This has been read into the record against the topics it is filed under, so it stays filed as it is.'

/** The add form's choice. */
export const WHOLE_CHOICE = 'It is about one thing — file it as one topic'
