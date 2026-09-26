/**
 * What ties two topics together, with their subjects taken out.
 *
 * Every other reading of the map starts from the subjects: the bed pulls
 * a subject's topics together, the filing claims read which subjects a
 * topic's neighbours sit in. That is right for reading the map as it was
 * sown, and useless for noticing a subject nobody sowed -- a reading
 * that starts from the filing can only find the filing again.
 *
 * So this reads four things that know nothing about subjects, each
 * scored 0..1 per pair, and adds them:
 *
 * - **material**: topics the reader's own saving keeps putting together.
 *   The most organic of the four, because nothing inferred it.
 * - **marks**: topics a kept passage joins -- where it was taken, and
 *   what its note says it is about. Asserted by the reader, and sparse.
 * - **stated**: the map's own relations. Weighted lower, because
 *   ingestion only relates topics that came in on one resource and
 *   sowing only within one bed, so these partly repeat the material and
 *   partly lean toward the subjects.
 * - **meaning**: what the embeddings say, for topics the other three
 *   have too little to say about.
 *
 * Pure, and here, because the phone draws kinship on its bed too and a
 * pull computed two ways is two different maps.
 */

/** A topic as kinship reads it. Its subjects are carried for the
 *  reading that follows, never used here. */
export interface KinTopic {
  id: string
  subjects: readonly string[]
  /** `title — summary` embedded, or the title alone; null if neither. */
  vector?: readonly number[] | null
}

/** A resource and the topics it touches. */
export interface KinMaterial {
  id: string
  /** Consumed. Unread still counts, at `KINSHIP.UNREAD`. */
  read: boolean
  topics: ReadonlyArray<{ id: string; relevance: number }>
}

/** A kept passage: every topic it joins, where it was taken included. */
export interface KinMark {
  topics: readonly string[]
}

/** One of the map's own relations. */
export interface KinEdge {
  from: string
  to: string
  weight: number
}

export interface KinshipInput {
  topics: readonly KinTopic[]
  materials: readonly KinMaterial[]
  marks: readonly KinMark[]
  edges: readonly KinEdge[]
}

/** Why two topics are kin, channel by channel, and how much in all. */
export interface KinLine {
  a: string
  b: string
  weight: number
  material: number
  marks: number
  stated: number
  meaning: number
}

export const KINSHIP = {
  /**
   * Unread material against read. It counts at all because this is a
   * reading of interest, and saving is intent -- the opposite of
   * ability, where only consumption counts. The two do not conflict
   * because this reading writes no figure.
   */
  UNREAD: 0.5,
  /** How much each channel adds to a line. */
  CHANNELS: { material: 1, marks: 1, stated: 0.6, meaning: 0.5 },
  /** Lines kept per topic, and meaning neighbours looked at per topic. */
  NEAREST: 8,
} as const

type Channel = 'material' | 'marks' | 'stated' | 'meaning'

/**
 * The text a topic's kinship vector is made from: its title, and its
 * summary where it has one. The title alone is what the resolver reads,
 * and "Composition" says far less about what a topic is than the
 * sentence written under it. Here because the script that backfills and
 * the route that fills lazily must embed the same text.
 */
export function kinText(title: string, summary: string | null | undefined): string {
  const said = summary?.trim()
  return said ? `${title.trim()} — ${said}` : title.trim()
}

/**
 * Every line of kinship worth keeping, strongest first.
 *
 * A line survives when either end counts it among its `NEAREST`
 * strongest, which keeps the graph sparse enough to read communities
 * off without letting a well-connected topic crowd out a quiet one's
 * only ties.
 */
export function kinship(input: KinshipInput): KinLine[] {
  const ids = new Set(input.topics.map(t => t.id))
  const lines = new Map<string, KinLine>()

  const add = (a: string, b: string, channel: Channel, score: number) => {
    if (a === b || !ids.has(a) || !ids.has(b) || !(score > 0)) return
    const [x, y] = a < b ? [a, b] : [b, a]
    const key = `${x}|${y}`
    const line = lines.get(key) ?? { a: x, b: y, weight: 0, material: 0, marks: 0, stated: 0, meaning: 0 }
    line[channel] = Math.max(line[channel], Math.min(1, score))
    lines.set(key, line)
  }

  for (const [a, b, score] of materialChannel(input.materials, ids)) add(a, b, 'material', score)
  for (const [a, b, score] of marksChannel(input.marks)) add(a, b, 'marks', score)
  for (const edge of input.edges) add(edge.from, edge.to, 'stated', clamp01(edge.weight))
  for (const [a, b, score] of meaningChannel(input.topics)) add(a, b, 'meaning', score)

  const c = KINSHIP.CHANNELS
  for (const line of lines.values()) {
    line.weight =
      c.material * line.material + c.marks * line.marks + c.stated * line.stated + c.meaning * line.meaning
  }

  return sparsify([...lines.values()], KINSHIP.NEAREST)
}

/**
 * Material: cosine between two topics' occurrence vectors over the
 * resources, shrunk by how many resources they actually share.
 *
 * Each entry is `s × relevance / √(n − 1)`: `s` is 1 read and `UNREAD`
 * unread, and `n` is how many topics the resource carries, so one long
 * article joining eight topics counts for less per pair than a short
 * one joining two. Cosine damps hubs: a topic in fifty resources and one
 * in two, sharing both, score 0.2 rather than 1. The shrinkage `k/(k+1)`
 * halves a pair seen together once, which is one article's say-so.
 */
function materialChannel(
  materials: readonly KinMaterial[],
  ids: ReadonlySet<string>
): Array<[string, string, number]> {
  const norm = new Map<string, number>()
  const dot = new Map<string, { a: string; b: string; sum: number; shared: number }>()

  for (const material of materials) {
    const present = dedupe(material.topics.filter(t => ids.has(t.id)))
    if (present.length === 0) continue
    const s = material.read ? 1 : KINSHIP.UNREAD
    const spread = Math.sqrt(Math.max(1, present.length - 1))
    const entries = present.map(t => ({ id: t.id, v: (s * clamp01(t.relevance)) / spread }))

    for (const e of entries) norm.set(e.id, (norm.get(e.id) ?? 0) + e.v * e.v)
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [x, y] = entries[i].id < entries[j].id ? [entries[i], entries[j]] : [entries[j], entries[i]]
        const key = `${x.id}|${y.id}`
        const acc = dot.get(key) ?? { a: x.id, b: y.id, sum: 0, shared: 0 }
        acc.sum += x.v * y.v
        acc.shared += 1
        dot.set(key, acc)
      }
    }
  }

  const out: Array<[string, string, number]> = []
  for (const { a, b, sum, shared } of dot.values()) {
    const denominator = Math.sqrt((norm.get(a) ?? 0) * (norm.get(b) ?? 0))
    if (denominator === 0) continue
    out.push([a, b, (sum / denominator) * (shared / (shared + 1))])
  }
  return out
}

/** The same topic listed twice on one resource is one occurrence, at
 *  its stronger relevance. */
function dedupe(topics: ReadonlyArray<{ id: string; relevance: number }>) {
  const best = new Map<string, number>()
  for (const t of topics) best.set(t.id, Math.max(best.get(t.id) ?? 0, t.relevance))
  return [...best].map(([id, relevance]) => ({ id, relevance }))
}

/** Marks: `1 − e^(−count)` over the marks joining a pair, so one mark
 *  is most of a tie and a second makes it nearly certain. */
function marksChannel(marks: readonly KinMark[]): Array<[string, string, number]> {
  const count = new Map<string, number>()
  for (const mark of marks) {
    const joined = [...new Set(mark.topics)].sort()
    for (let i = 0; i < joined.length; i++) {
      for (let j = i + 1; j < joined.length; j++) {
        const key = `${joined[i]}|${joined[j]}`
        count.set(key, (count.get(key) ?? 0) + 1)
      }
    }
  }
  return [...count].map(([key, n]) => {
    const [a, b] = key.split('|')
    return [a, b, 1 - Math.exp(-n)]
  })
}

/**
 * Meaning: cosine between embeddings once the mean vector is taken out,
 * kept for each topic's `NEAREST` only.
 *
 * gte-small's similarities are bunched high -- unrelated pairs reach
 * 0.80 and adjacent ones start at 0.83 (`config.ts`) -- because every
 * vector shares one large common direction. Subtracting the mean removes
 * it and spreads what is left, and keeping only the nearest makes the
 * channel a ranking rather than a threshold, which is what survives a
 * model whose absolute numbers mean little.
 */
function meaningChannel(topics: readonly KinTopic[]): Array<[string, string, number]> {
  const withVectors = topics.filter(
    (t): t is KinTopic & { vector: readonly number[] } => Array.isArray(t.vector) && t.vector.length > 0
  )
  if (withVectors.length < 3) return []
  const dims = withVectors[0].vector.length
  const usable = withVectors.filter(t => t.vector.length === dims)

  const mean = new Float64Array(dims)
  for (const t of usable) for (let d = 0; d < dims; d++) mean[d] += t.vector[d]
  for (let d = 0; d < dims; d++) mean[d] /= usable.length

  const centred = usable.map(t => {
    const v = new Float64Array(dims)
    let size = 0
    for (let d = 0; d < dims; d++) {
      v[d] = t.vector[d] - mean[d]
      size += v[d] * v[d]
    }
    size = Math.sqrt(size)
    if (size > 0) for (let d = 0; d < dims; d++) v[d] /= size
    return v
  })

  const k = KINSHIP.NEAREST
  const out: Array<[string, string, number]> = []
  for (let i = 0; i < centred.length; i++) {
    const best: Array<{ j: number; score: number }> = []
    for (let j = 0; j < centred.length; j++) {
      if (i === j) continue
      let score = 0
      const a = centred[i], b = centred[j]
      for (let d = 0; d < dims; d++) score += a[d] * b[d]
      if (score <= 0) continue
      if (best.length < k) {
        best.push({ j, score })
        best.sort((x, y) => y.score - x.score)
      } else if (score > best[k - 1].score) {
        best[k - 1] = { j, score }
        best.sort((x, y) => y.score - x.score)
      }
    }
    for (const { j, score } of best) out.push([usable[i].id, usable[j].id, score])
  }
  return out
}

/** Keep a line when either end counts it among its `k` strongest. */
function sparsify(lines: KinLine[], k: number): KinLine[] {
  const byTopic = new Map<string, KinLine[]>()
  for (const line of lines) {
    if (!(line.weight > 0)) continue
    for (const end of [line.a, line.b]) {
      const held = byTopic.get(end)
      if (held) held.push(line)
      else byTopic.set(end, [line])
    }
  }
  const kept = new Set<KinLine>()
  for (const held of byTopic.values()) {
    held.sort((x, y) => y.weight - x.weight || (x.a + x.b).localeCompare(y.a + y.b))
    for (const line of held.slice(0, k)) kept.add(line)
  }
  return [...kept].sort((x, y) => y.weight - x.weight || (x.a + x.b).localeCompare(y.a + y.b))
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}
