import { config } from '@didactic/core/config'
import { cosineSimilarity } from '@didactic/core/similarity'
import type { EdgeKind } from '@didactic/core/types'
import { askJev, type JevQuestion } from './jev'

/**
 * Typed relationships between new topics and what is around them.
 *
 * Asked of Jev one pair at a time rather than of a generative model all
 * at once. The weight an edge is drawn at used to be a number the model
 * wrote about itself; here it is the probability the reading put on
 * that relation, and a pair it is unsure of is not drawn at all
 * (`JEV_EDGE`).
 *
 * Jev must be handed its pairs, and every pair is a question, so the
 * embedding nominates: each new topic is asked about its `CANDIDATES`
 * nearest. A topic that carries no embedding ranks last, which is where
 * it would have been left anyway.
 */

export interface EdgeTopic {
  id: string
  title: string
  /** pgvector serialises as a JSON string; either is read. */
  embedding?: number[] | string | null
}

/** How many of its neighbours each new topic is asked about. */
const CANDIDATES = 8

/** The relation, read as running from `a` to `b`. */
const RELATIONS = {
  a_first: { kind: 'prereq', flip: false },
  b_first: { kind: 'prereq', flip: true },
  a_holds: { kind: 'specialises', flip: false },
  b_holds: { kind: 'specialises', flip: true },
  related: { kind: 'related', flip: false },
  alternative: { kind: 'alternative', flip: false },
} as const satisfies Record<string, { kind: EdgeKind; flip: boolean }>

function vectorOf(t: EdgeTopic): number[] | null {
  const raw = typeof t.embedding === 'string' ? JSON.parse(t.embedding) : t.embedding
  return Array.isArray(raw) && raw.length > 0 ? raw : null
}

export async function proposeEdges(newTopics: EdgeTopic[], neighbours: EdgeTopic[]) {
  if (newTopics.length === 0) return []

  const all = [...new Map([...newTopics, ...neighbours].map(t => [t.id, t])).values()]
  const vectors = new Map(all.map(t => [t.id, vectorOf(t)]))
  const near = (a: EdgeTopic, b: EdgeTopic) => {
    const va = vectors.get(a.id)
    const vb = vectors.get(b.id)
    return va && vb ? cosineSimilarity(va, vb) : -1
  }

  // Every pair touches a new topic, and each is asked once whichever
  // end nominated it.
  const pairs = new Map<string, [EdgeTopic, EdgeTopic]>()
  for (const a of newTopics) {
    const nearest = all
      .filter(b => b.id !== a.id)
      .sort((x, y) => near(a, y) - near(a, x))
      .slice(0, CANDIDATES)
    for (const b of nearest) {
      const key = [a.id, b.id].sort().join('|')
      if (!pairs.has(key)) pairs.set(key, [a, b])
    }
  }
  if (pairs.size === 0) return []

  const asked = [...pairs.values()]
  const questions: Record<string, JevQuestion> = Object.fromEntries(
    asked.map(([a, b], i) => [`p${i}`, {
      type: 'choice' as const,
      instructions: `On a map of what someone is learning, how does the topic "${a.title}" relate to the topic "${b.title}"?`,
      criteria: {
        a_first: `"${a.title}" must be learned before "${b.title}", which builds on it.`,
        b_first: `"${b.title}" must be learned before "${a.title}", which builds on it.`,
        a_holds: `"${b.title}" is a narrower case or one part of "${a.title}".`,
        b_holds: `"${a.title}" is a narrower case or one part of "${b.title}".`,
        related: 'Adjacent: worth knowing next to each other, but neither contains or precedes the other.',
        alternative: 'Competing choices for the same job: someone would normally reach for one or the other.',
        none: 'Not meaningfully related.',
      },
    }])
  )

  const answers = await askJev({ topics: all.map(t => t.title) }, questions)

  return asked.flatMap(([a, b], i) => {
    const answer = answers[`p${i}`]
    const relation = RELATIONS[answer?.choice as keyof typeof RELATIONS]
    const weight = answer?.choice ? answer.probabilities?.[answer.choice] ?? 0 : 0
    if (!relation || weight < config.JEV_EDGE) return []
    const [from, to] = relation.flip ? [b, a] : [a, b]
    return [{ from: from.id, to: to.id, kind: relation.kind as EdgeKind, weight }]
  })
}
