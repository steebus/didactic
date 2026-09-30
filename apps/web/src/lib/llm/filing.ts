import { cosineSimilarity } from '@didactic/core/similarity'
import type { Reading } from '@didactic/core/resolution'
import type { EdgeKind } from '@didactic/core/types'
import { judgeWithJev, NOMINATED } from './jev'
import { proposeEdges } from './edges'

/**
 * Where a topic added by hand belongs in the bed it was added to.
 *
 * The resolver reads a title against the map through an embedding and
 * a threshold, and that is the right first pass -- it is cheap, it
 * runs on every write path, and it catches "Postgres" against
 * "PostgreSQL". What it cannot do is read a bed. It compares one title
 * against the nearest titles anywhere on the map, one pair at a time,
 * and gte-small scores "HTTP methods" and "REST verbs" as two
 * different things while scoring every sibling in a tightly worded
 * subject as nearly the same one.
 *
 * So a topic typed into a subject landed filed but unplaced: a node
 * with no edges, which the outline prints as another root at the
 * bottom of the bed and the graph draws floating beside it. The bed
 * around it was never consulted, and the bed is the thing that says
 * where the topic goes.
 *
 * This is that reading, and it is the two readings ingestion already
 * makes, pointed at one bed: `judgeWithJev` for whether it is one of
 * these already, and `proposeEdges` for what it sits under or before.
 * It does not write anything -- the caller decides what a claim of
 * sameness is worth, which is the point: a reading of "same" where the
 * embedding said "different" is a question for the user, never a merge.
 */

/** A topic already in the bed, as the sort is shown it. */
export interface BedTopic {
  id: string
  title: string
  summary?: string | null
  embedding?: number[] | string | null
}

export interface Sorted {
  /**
   * An existing topic this may be a restatement of: whatever the reading
   * did not clear as its own topic. Never acted on as a merge on its
   * own: it is the second opinion the adjudication queue exists for.
   */
  sameAs: string | null
  /** What the reading put on that answer, 0-1. */
  confidence: number
  /** The reading itself, for the queue to keep (`059`). */
  reading: Reading | null
  /** Where the topic sits: edges between it and the bed. */
  edges: Array<{ from: string; to: string; kind: EdgeKind; weight: number }>
  /** One line the sheet can print about what it did. */
  note: string | null
}

function vectorOf(raw: BedTopic['embedding']): number[] | null {
  const v = typeof raw === 'string' ? JSON.parse(raw) : raw
  return Array.isArray(v) && v.length > 0 ? v : null
}

/**
 * Read a new topic against the bed it was added to.
 *
 * Null where there is no bed to read against. Throws where the reading
 * failed, and the caller files the topic unplaced with a warning: a
 * sameness that could not be read must not be taken as a clearance.
 */
export async function sortIntoBed(input: {
  subjectTitle: string
  topic: { id: string; title: string; embedding?: number[] | null }
  bed: BedTopic[]
}): Promise<Sorted | null> {
  const own = input.topic.embedding ?? null
  const near = (t: BedTopic) => {
    const v = vectorOf(t.embedding)
    return own && v ? cosineSimilarity(own, v) : -1
  }
  const bed = input.bed
    .filter(t => t.id !== input.topic.id)
    .sort((a, b) => near(b) - near(a))
  if (bed.length === 0) return null

  const titleOf = new Map(bed.map(t => [t.id, t.title]))

  const [verdicts, edges] = await Promise.all([
    judgeWithJev({
      resourceTitle: input.subjectTitle,
      concepts: [{
        key: 'new',
        name: input.topic.title,
        description: null,
        nearest: bed.slice(0, NOMINATED).map(t => ({
          id: t.id,
          title: t.title,
          summary: t.summary ?? null,
          similarity: near(t),
          subjects: [input.subjectTitle],
        })),
      }],
      subjects: [],
    }),
    proposeEdges([input.topic], bed),
  ])

  const reading = verdicts?.get('new')?.reading ?? null
  const sameAs =
    reading?.action === 'link' ? reading.topicId
    : reading?.action === 'pending' ? reading.nearestId
    : null

  const parent = edges
    .filter(e => e.to === input.topic.id && (e.kind === 'specialises' || e.kind === 'prereq'))
    .sort((a, b) => b.weight - a.weight)[0]

  return {
    sameAs,
    confidence: reading?.probability ?? 0,
    reading,
    edges,
    note: sameAs
      ? `Read as possibly ${titleOf.get(sameAs)} under another name.`
      : parent
        ? `Placed under ${titleOf.get(parent.from)}.`
        : null,
  }
}
