/**
 * Sprouting subjects: communities in the kinship that no subject
 * already accounts for.
 *
 * `kinship` says which topics belong together with the subjects taken
 * out. This reads communities off those lines and asks of each one the
 * question the reader would: is this a subject I already have, one
 * article's worth of topics, or something new growing on its own?
 *
 * Pure and deterministic -- the same map reads the same way every time,
 * because a suggestion that changed between two visits with nothing
 * filed in between would be a suggestion nobody could trust.
 */

import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import type { KinLine, KinMark, KinMaterial, KinTopic } from './kinship'

export const SPROUTING = {
  /** Louvain runs, each from its own fixed seed. */
  RUNS: 12,
  /** The share of runs two joined topics must share a community in to
   *  be kept together. */
  TOGETHER: 0.8,
  /** The smallest set of topics worth calling a subject. */
  MIN_TOPICS: 4,
  /** Resources that must carry at least two of its topics. Fewer is one
   *  article's worth of topics, not a subject. */
  MIN_MATERIAL: 2,
  /** One subject's share of a community that makes it that subject. */
  WITHIN: 0.7,
  /** How much of a subject a community must hold to count as finding
   *  it again. */
  HOLDS: 0.5,
  /** Jaccard similarity at which a fresh reading is the same sprout as
   *  a kept decision. */
  MATCH: 0.5,
  /** Below this against the set its name was written for, a sprout is
   *  named again. */
  RENAME: 0.75,
} as const

/** A sprouting subject, as read. */
export interface Sprout {
  /** Stable for a given set of topics: a hash of the sorted ids. */
  key: string
  /** Its topics, the most tightly tied first. */
  topicIds: string[]
  /** `new`: mostly loose, from one subject at most. `across`: drawn
   *  from two or more subjects without being most of any. */
  kind: 'new' | 'across'
  /** How many of its topics sit under no subject at all. */
  loose: number
  /** The subjects its topics sit in, most first. */
  from: Array<{ subjectId: string; count: number }>
  /** What holds it together. */
  binding: {
    /** Resources carrying at least two of its topics, most first. */
    materials: string[]
    /** How many of those have been read. */
    read: number
    /** Marks joining at least two of its topics. */
    marks: number
  }
  /** The share of its topics' kinship that stays inside it, 0..1. */
  cohesion: number
  score: number
}

/** What a reading of the whole map finds. */
export interface SproutReading {
  sprouts: Sprout[]
  /** The subjects the same reading finds again, of those large enough
   *  to be found: the evidence that it can be believed about the rest. */
  found: { subjectIds: string[]; of: number }
}

export interface SproutInput {
  topics: readonly KinTopic[]
  lines: readonly KinLine[]
  materials: readonly KinMaterial[]
  marks: readonly KinMark[]
}

/**
 * Read the sprouting subjects off a map.
 */
export function readSprouts(input: SproutInput): SproutReading {
  const communities = stableCommunities(input.lines)
  const subjectsOf = new Map(input.topics.map(t => [t.id, t.subjects]))

  // Every subject's size among the topics being read, which is what
  // "holds half of it" is measured against.
  const subjectSize = new Map<string, number>()
  for (const t of input.topics) {
    for (const s of new Set(t.subjects)) subjectSize.set(s, (subjectSize.get(s) ?? 0) + 1)
  }

  const weightOf = new Map<string, number>()
  const strength = new Map<string, number>()
  for (const line of input.lines) {
    weightOf.set(pair(line.a, line.b), line.weight)
    strength.set(line.a, (strength.get(line.a) ?? 0) + line.weight)
    strength.set(line.b, (strength.get(line.b) ?? 0) + line.weight)
  }

  const found = new Set<string>()
  const sprouts: Sprout[] = []

  for (const members of communities) {
    if (members.length < SPROUTING.MIN_TOPICS) continue
    const inside = new Set(members)

    const counts = new Map<string, number>()
    let loose = 0
    for (const id of members) {
      const subjects = subjectsOf.get(id) ?? []
      if (subjects.length === 0) loose++
      for (const s of new Set(subjects)) counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    const from = [...counts]
      .map(([subjectId, count]) => ({ subjectId, count }))
      .sort((a, b) => b.count - a.count || a.subjectId.localeCompare(b.subjectId))

    const dominant = from[0]
    if (dominant && dominant.count / members.length >= SPROUTING.WITHIN) {
      if (dominant.count / (subjectSize.get(dominant.subjectId) ?? Infinity) >= SPROUTING.HOLDS) {
        found.add(dominant.subjectId)
      }
      continue
    }

    const binding = bindingOf(inside, input.materials, input.marks)
    if (binding.materials.length < SPROUTING.MIN_MATERIAL) continue

    // How tightly each topic is tied inside, which orders the members
    // and gives the cohesion.
    const tie = new Map<string, number>()
    let within = 0
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const w = weightOf.get(pair(members[i], members[j])) ?? 0
        within += w
        tie.set(members[i], (tie.get(members[i]) ?? 0) + w)
        tie.set(members[j], (tie.get(members[j]) ?? 0) + w)
      }
    }
    const total = members.reduce((sum, id) => sum + (strength.get(id) ?? 0), 0)
    // Each inside line is counted at both its ends in `total`.
    const cohesion = total === 0 ? 0 : (2 * within) / total

    const topicIds = [...members].sort(
      (a, b) => (tie.get(b) ?? 0) - (tie.get(a) ?? 0) || a.localeCompare(b)
    )

    sprouts.push({
      key: keyOf(members),
      topicIds,
      kind: from.length >= 2 ? 'across' : 'new',
      loose,
      from,
      binding,
      cohesion,
      score: cohesion * Math.sqrt(members.length) * Math.log2(1 + binding.materials.length),
    })
  }

  const large = [...subjectSize].filter(([, n]) => n >= SPROUTING.MIN_TOPICS).map(([s]) => s)

  return {
    sprouts: sprouts.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)),
    found: { subjectIds: large.filter(s => found.has(s)).sort(), of: large.length },
  }
}

/**
 * Communities that do not depend on the dice.
 *
 * Louvain is randomised, so it runs `RUNS` times from fixed seeds, and
 * two topics stay together only where a kinship line joins them and
 * they shared a community in `TOGETHER` of the runs. The communities are
 * the connected pieces of what is left. A topic with no line kept is in
 * no community, which is an answer rather than a failure.
 */
export function stableCommunities(lines: readonly KinLine[]): string[][] {
  if (lines.length === 0) return []

  const graph = new Graph({ type: 'undirected' })
  for (const line of lines) {
    if (!graph.hasNode(line.a)) graph.addNode(line.a)
    if (!graph.hasNode(line.b)) graph.addNode(line.b)
    if (!graph.hasEdge(line.a, line.b)) graph.addEdge(line.a, line.b, { weight: line.weight })
  }

  const runs = Array.from({ length: SPROUTING.RUNS }, (_, seed) =>
    louvain(graph, { getEdgeWeight: 'weight', rng: mulberry32(seed + 1) })
  )

  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let node = x
    while (parent.get(node) !== root) {
      const next = parent.get(node)!
      parent.set(node, root)
      node = next
    }
    return root
  }
  graph.forEachNode(n => parent.set(n, n))

  graph.forEachEdge((_, __, a, b) => {
    const shared = runs.filter(r => r[a] === r[b]).length
    if (shared / runs.length >= SPROUTING.TOGETHER) {
      const [ra, rb] = [find(a), find(b)]
      if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
    }
  })

  const groups = new Map<string, string[]>()
  graph.forEachNode(n => {
    const root = find(n)
    const held = groups.get(root)
    if (held) held.push(n)
    else groups.set(root, [n])
  })

  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => g.sort())
    .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

/** The resources and marks carrying at least two of a set's topics. */
function bindingOf(
  inside: ReadonlySet<string>,
  materials: readonly KinMaterial[],
  marks: readonly KinMark[]
): Sprout['binding'] {
  const held = materials
    .map(m => ({ m, n: new Set(m.topics.map(t => t.id).filter(id => inside.has(id))).size }))
    .filter(({ n }) => n >= 2)
    .sort((a, b) => b.n - a.n || Number(b.m.read) - Number(a.m.read) || a.m.id.localeCompare(b.m.id))

  return {
    materials: held.map(({ m }) => m.id),
    read: held.filter(({ m }) => m.read).length,
    marks: marks.filter(mark => new Set(mark.topics.filter(id => inside.has(id))).size >= 2).length,
  }
}

/** Jaccard similarity of two sets of ids: shared over all. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a), right = new Set(b)
  if (left.size === 0 && right.size === 0) return 1
  let shared = 0
  for (const id of left) if (right.has(id)) shared++
  return shared / (left.size + right.size - shared)
}

/**
 * Pair each fresh sprout with the kept decision it continues, if any.
 *
 * One to one, most overlap first, at `MATCH`: a sprout the reader
 * dismissed does not come back for having gained one topic, and one
 * that has grown past recognition is a new question. Answers a map
 * from sprout key to the kept row.
 */
export function matchKept<K extends { id: string; topicIds: readonly string[] }>(
  sprouts: readonly Pick<Sprout, 'key' | 'topicIds'>[],
  kept: readonly K[]
): Map<string, K> {
  const pairs: Array<{ key: string; row: K; score: number }> = []
  for (const sprout of sprouts) {
    for (const row of kept) {
      const score = jaccard(sprout.topicIds, row.topicIds)
      if (score >= SPROUTING.MATCH) pairs.push({ key: sprout.key, row, score })
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.key.localeCompare(y.key) || x.row.id.localeCompare(y.row.id))

  const matched = new Map<string, K>()
  const taken = new Set<string>()
  for (const { key, row } of pairs) {
    if (matched.has(key) || taken.has(row.id)) continue
    matched.set(key, row)
    taken.add(row.id)
  }
  return matched
}

/** Whether a name written for one set of topics still fits another. */
export function nameStillFits(current: readonly string[], namedFor: readonly string[] | null): boolean {
  return namedFor !== null && jaccard(current, namedFor) >= SPROUTING.RENAME
}

/**
 * The evidence as a sentence, counts first, because the counts are the
 * reasoning and the only thing that lets a reader disagree with it.
 */
export function bindingSentence(sprout: Pick<Sprout, 'topicIds' | 'binding'>): string {
  const topics = plural(sprout.topicIds.length, 'topic')
  const { materials, read, marks } = sprout.binding
  const material = `${materials.length} ${materials.length === 1 ? 'piece' : 'pieces'} of material`
  const readPart =
    read === 0 ? 'none of it read yet'
      : read === materials.length ? (materials.length === 1 ? 'read' : 'all of it read')
        : `${read} of ${materials.length === 1 ? 'it' : 'them'} read`
  const marksPart = marks > 0 ? `, and ${plural(marks, 'mark')}` : ''
  return `${topics}, held together by ${material}, ${readPart}${marksPart}.`
}

/** How the sheet reports the found-again check. */
export function foundSentence(found: SproutReading['found']): string | null {
  if (found.of === 0) return null
  const n = found.subjectIds.length
  if (n === found.of) {
    return found.of === 1
      ? 'Read the same way, the map finds your one subject again.'
      : `Read the same way, the map finds all ${found.of} of your subjects again.`
  }
  return `Read the same way, the map finds ${n} of your ${found.of} subjects again.`
}

/** What an unnamed sprout is called until it is named. */
export const UNNAMED = 'Not yet named'

/**
 * What kind of sprout it is, as a line above its name: new ground, or
 * the subjects it is drawn across, named in full because a colour chip
 * alone cannot say which subject it means.
 */
export function kindLine(sprout: { kind: 'new' | 'across'; from: ReadonlyArray<{ title: string }> }): string {
  if (sprout.kind === 'new' || sprout.from.length === 0) return 'New ground'
  const names = sprout.from.map(f => f.title)
  const listed = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Across ${listed}`
}

/** The sheet's standfirst: how many have come up. */
export function sproutingSentence(count: number): string {
  if (count === 0) return 'Nothing has come up on its own yet.'
  return count === 1
    ? 'One subject has come up on its own.'
    : `${count} subjects have come up on their own.`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function pair(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** FNV-1a over the sorted ids: a short key that is the same for the
 *  same set of topics however they were listed. */
export function keyOf(ids: readonly string[]): string {
  let hash = 0x811c9dc5
  for (const ch of [...ids].sort().join(',')) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** A small seeded generator, so each Louvain run is the same run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
