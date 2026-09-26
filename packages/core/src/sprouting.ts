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
  /**
   * The grains the map is read at, finest first. A community that fails
   * at one grain -- one article's worth of topics, most often -- is read
   * again coarser, where it may join the other articles on its theme.
   * Only topics a finer reading has not already accounted for (as a
   * subject found again, or as a sprout) are carried down, so coarsening
   * can never swallow a subject into something bigger.
   */
  GRAINS: [1, 0.7, 0.5],
  /** A kinship line this strong between two resources' topics joins the
   *  two resources, for the test that the material holding a sprout is
   *  itself held together. */
  JOIN: 0.15,
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

/**
 * A set of topics the reading looked at and did not offer, and why. The
 * answer to "nothing is sprouting, but I can see a clump": the clump is
 * here, with the reason in words.
 */
export interface SetAside {
  key: string
  topicIds: string[]
  /**
   * `one-resource`: every topic in it came in on one piece of material,
   * which is fertile ground rather than a subject. `unjoined`: two or
   * more resources carry it, but nothing ties those resources to each
   * other -- two unrelated readings that happen to sit side by side.
   * `no-material`: nothing the reader has saved carries two of its topics
   * at all; only drawn relations and what the names mean hold it.
   */
  reason: 'one-resource' | 'unjoined' | 'no-material'
  /** Resources carrying at least two of its topics. */
  materials: string[]
}

/**
 * How one of the reader's own subjects came out of a reading that never
 * looked at the subjects -- the check on whether it can be believed, one
 * subject at a time, with what it had to go on.
 *
 * - `whole`: one community, most of it this subject, holds at least half
 *   of it.
 * - `parts`: no one community does, but at least half of it sits in
 *   communities that are each mostly this subject -- the reading agrees
 *   where its edge is and sees sub-themes inside it. Counted as found.
 * - `mixed`: most of it fell in with another subject's topics, or with
 *   loose ones.
 * - `thin`: most of it is tied to nothing the reading kept.
 */
export interface SubjectReading {
  subjectId: string
  /** Its topics among those read. */
  size: number
  verdict: 'whole' | 'parts' | 'mixed' | 'thin'
  /** Its topics in communities that are mostly it. */
  own: number
  /** Those communities' shares of it, largest first. */
  parts: number[]
  /** Where the rest went: another subject, or `null` for loose topics. */
  with: Array<{ subjectId: string | null; count: number }>
  /** Its topics in no community at all. */
  alone: number
  /** Its topics with a relation drawn to another of its own. */
  related: number
  /** Its topics carried by any material. */
  withMaterial: number
}

/** What a reading of the whole map finds. */
export interface SproutReading {
  sprouts: Sprout[]
  /** The subjects the same reading finds again, of those large enough
   *  to be found: the evidence that it can be believed about the rest.
   *  `inParts` are found as sub-themes rather than whole. */
  found: { subjectIds: string[]; of: number; inParts: string[] }
  /** How each subject large enough to be found came out, largest first. */
  subjects: SubjectReading[]
  /** Clumps of loose or mixed topics looked at and not offered, with why. */
  setAside: SetAside[]
}

export interface SproutInput {
  topics: readonly KinTopic[]
  lines: readonly KinLine[]
  materials: readonly KinMaterial[]
  marks: readonly KinMark[]
}

/**
 * Read the sprouting subjects off a map.
 *
 * Grain by grain, finest first. At each, every stable community is
 * judged on the topics no finer reading has accounted for: most of it one
 * subject is that subject found again; a set held by fewer than
 * `MIN_MATERIAL` resources, or by resources nothing ties together, is
 * set aside and carried to the next grain; anything else is a sprout.
 */
export function readSprouts(input: SproutInput): SproutReading {
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

  const sprouts: Sprout[] = []
  const accounted = new Set<string>()
  const setAsideFinest: SetAside[] = []
  const finest = stableCommunities(input.lines, SPROUTING.GRAINS[0])

  SPROUTING.GRAINS.forEach((grain, g) => {
    for (const community of g === 0 ? finest : stableCommunities(input.lines, grain)) {
      const members = community.filter(id => !accounted.has(id))
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
        for (const id of members) accounted.add(id)
        continue
      }

      const binding = bindingOf(inside, input.materials, input.marks)
      const reason =
        binding.materials.length === 0 ? 'no-material' as const
          : binding.materials.length < SPROUTING.MIN_MATERIAL ? 'one-resource' as const
          : joinedMaterials(inside, binding.materials, input.materials, weightOf) < SPROUTING.MIN_MATERIAL
            ? 'unjoined' as const
            : null
      if (reason) {
        if (g === 0) {
          setAsideFinest.push({ key: keyOf(members), topicIds: [...members].sort(), reason, materials: binding.materials })
        }
        continue
      }

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

      sprouts.push({
        key: keyOf(members),
        topicIds: [...members].sort(
          (a, b) => (tie.get(b) ?? 0) - (tie.get(a) ?? 0) || a.localeCompare(b)
        ),
        kind: from.length >= 2 ? 'across' : 'new',
        loose,
        from,
        binding,
        cohesion,
        score: cohesion * Math.sqrt(members.length) * Math.log2(1 + binding.materials.length),
      })
      for (const id of members) accounted.add(id)
    }
  })

  const subjects = readSubjects(input, finest, subjectsOf, subjectSize)
  const found = subjects.filter(r => r.verdict === 'whole' || r.verdict === 'parts')

  return {
    sprouts: sprouts.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)),
    found: {
      subjectIds: found.map(r => r.subjectId).sort(),
      of: subjects.length,
      inParts: found.filter(r => r.verdict === 'parts').map(r => r.subjectId).sort(),
    },
    subjects,
    // What was set aside at the finest grain and never taken up by a
    // coarser one: a clump that joined its kin in a sprout has an answer.
    setAside: setAsideFinest.filter(a => !a.topicIds.some(id => accounted.has(id))),
  }
}

/**
 * How each of the reader's subjects came out of the finest reading.
 *
 * Read off the whole communities, not what was left of them after
 * subjects were accounted for: this is the question of where the
 * reading drew a subject's edge, asked of every subject large enough to
 * have one.
 */
function readSubjects(
  input: SproutInput,
  finest: readonly string[][],
  subjectsOf: ReadonlyMap<string, readonly string[]>,
  subjectSize: ReadonlyMap<string, number>
): SubjectReading[] {
  const communityOf = new Map<string, number>()
  finest.forEach((c, i) => c.forEach(id => communityOf.set(id, i)))

  // Each community's make-up: how many of its topics sit in each
  // subject, and how many are loose (the `null` key).
  const makeUp = finest.map(c => {
    const t = new Map<string | null, number>()
    for (const id of c) {
      const subjects = new Set(subjectsOf.get(id) ?? [])
      if (subjects.size === 0) t.set(null, (t.get(null) ?? 0) + 1)
      for (const s of subjects) t.set(s, (t.get(s) ?? 0) + 1)
    }
    return t
  })

  const related = new Map<string, Set<string>>()
  for (const line of input.lines) {
    if (!(line.stated > 0)) continue
    const a = subjectsOf.get(line.a) ?? [], b = new Set(subjectsOf.get(line.b) ?? [])
    for (const s of a) {
      if (!b.has(s)) continue
      const held = related.get(s) ?? new Set<string>()
      held.add(line.a)
      held.add(line.b)
      related.set(s, held)
    }
  }
  const carried = new Set(input.materials.flatMap(m => m.topics.map(t => t.id)))

  return [...subjectSize]
    .filter(([, n]) => n >= SPROUTING.MIN_TOPICS)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([subjectId, size]) => {
      const members = input.topics.filter(t => t.subjects.includes(subjectId)).map(t => t.id)

      const parts: number[] = []
      const partner = new Map<string | null, number>()
      finest.forEach((c, i) => {
        const mine = makeUp[i].get(subjectId) ?? 0
        if (mine === 0) return
        if (mine / c.length >= SPROUTING.WITHIN) {
          parts.push(mine)
          return
        }
        // Mostly something else: whatever else there is most of.
        let best: string | null = null
        let most = -1
        for (const [label, n] of makeUp[i]) {
          if (label === subjectId) continue
          if (n > most || (n === most && String(label) < String(best))) {
            best = label
            most = n
          }
        }
        partner.set(best, (partner.get(best) ?? 0) + mine)
      })
      parts.sort((a, b) => b - a)

      const own = parts.reduce((a, b) => a + b, 0)
      const alone = members.filter(id => !communityOf.has(id)).length
      const bar = SPROUTING.HOLDS * size
      const verdict: SubjectReading['verdict'] =
        (parts[0] ?? 0) >= bar ? 'whole'
          : own >= bar ? 'parts'
            : alone >= bar ? 'thin'
              : 'mixed'

      return {
        subjectId,
        size,
        verdict,
        own,
        parts,
        with: [...partner]
          .map(([id, count]) => ({ subjectId: id, count }))
          .sort((a, b) => b.count - a.count || String(a.subjectId).localeCompare(String(b.subjectId))),
        alone,
        related: related.get(subjectId)?.size ?? 0,
        withMaterial: members.filter(id => carried.has(id)).length,
      }
    })
}

/**
 * How many of a set's binding resources hang together: the largest group
 * of them joined by sharing one of its topics, or by a kinship line of at
 * least `JOIN` between their topics.
 *
 * Two essays on one theme that filed different topics are joined by what
 * their topics mean. A photography article and an economics one that
 * happen to share a neighbourhood are not, and are not one subject.
 */
function joinedMaterials(
  inside: ReadonlySet<string>,
  binding: readonly string[],
  materials: readonly KinMaterial[],
  weightOf: ReadonlyMap<string, number>
): number {
  const byId = new Map(materials.map(m => [m.id, m]))
  const held = binding.map(id => [...new Set((byId.get(id)?.topics ?? []).map(t => t.id).filter(t => inside.has(t)))])

  const parent = held.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let a = 0; a < held.length; a++) {
    for (let b = a + 1; b < held.length; b++) {
      if (find(a) === find(b)) continue
      const joined = held[a].some(x => held[b].some(y => x === y || (weightOf.get(pair(x, y)) ?? 0) >= SPROUTING.JOIN))
      if (joined) parent[find(b)] = find(a)
    }
  }
  const sizes = new Map<number, number>()
  for (let i = 0; i < held.length; i++) sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1)
  return Math.max(0, ...sizes.values())
}

/**
 * Communities that do not depend on the dice.
 *
 * `resolution` is Louvain's: below 1 it prefers fewer, larger
 * communities. Louvain is randomised, so it runs `RUNS` times from fixed seeds, and
 * two topics stay together only where a kinship line joins them and
 * they shared a community in `TOGETHER` of the runs. The communities are
 * the connected pieces of what is left. A topic with no line kept is in
 * no community, which is an answer rather than a failure.
 */
export function stableCommunities(lines: readonly KinLine[], resolution = 1): string[][] {
  if (lines.length === 0) return []

  const graph = new Graph({ type: 'undirected' })
  for (const line of lines) {
    if (!graph.hasNode(line.a)) graph.addNode(line.a)
    if (!graph.hasNode(line.b)) graph.addNode(line.b)
    if (!graph.hasEdge(line.a, line.b)) graph.addEdge(line.a, line.b, { weight: line.weight })
  }

  const runs = Array.from({ length: SPROUTING.RUNS }, (_, seed) =>
    louvain(graph, { getEdgeWeight: 'weight', rng: mulberry32(seed + 1), resolution })
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

/**
 * Why a clump was looked at and not offered, as the sheet prints it. The
 * counts lead, as in `bindingSentence`, and the one-resource case says
 * what would change the answer: a second piece of material.
 */
export function setAsideSentence(item: Pick<SetAside, 'topicIds' | 'reason' | 'materials'>): string {
  const topics = plural(item.topicIds.length, 'topic')
  if (item.reason === 'one-resource') {
    return `${topics} that came in on one piece of material and have turned up nowhere else yet. One reading is fertile ground rather than a subject; it sprouts when other material on the same theme joins it.`
  }
  if (item.reason === 'no-material') {
    return `${topics} that no material you have saved puts together: they are held only by the relations drawn between them and what their names mean, which is not enough to say they are a subject of their own.`
  }
  return `${topics} carried by ${item.materials.length} pieces of material that nothing else ties together, so nothing says they are one subject.`
}

/**
 * How one subject came out of the reading, as the sheet prints it beside
 * its name. The counts carry the reasoning; where the reading had little
 * to go on, it says what would give it more.
 */
export function subjectSentence(r: SubjectReading, titleOf: (subjectId: string) => string): string {
  const of = `of its ${r.size}`
  const hint = () => {
    if (r.related * 2 >= r.size && r.withMaterial > 0) return ''
    const relations = r.related === 0 ? 'None of its topics has' : `Only ${r.related} ${of} topics have`
    const material = r.withMaterial === 0 ? ' and none has any material,' : ','
    return ` ${relations} a relation drawn to another of its own${material} so the reading had little but their names to go on. Draw connections on its bed gives it more.`
  }

  if (r.verdict === 'whole') return `${r.parts[0]} ${of} topics read together, as one.`
  if (r.verdict === 'parts') {
    const sizes = r.parts.length === 2 ? `${r.parts[0]} and ${r.parts[1]}` : `${r.parts.slice(0, -1).join(', ')} and ${r.parts[r.parts.length - 1]}`
    return `Read as ${r.parts.length} sub-themes of ${sizes} topics, each still its own: ${r.own} ${of} in all.`
  }
  if (r.verdict === 'thin') return `${r.alone} ${of} topics are tied to nothing the reading kept.${hint()}`

  const went = r.with.slice(0, 2).map(w =>
    w.subjectId === null ? `${w.count} with loose topics` : `${w.count} with ${titleOf(w.subjectId)}'s`
  )
  return `Read together with other topics: ${went.join(', and ')}.${hint()}`
}

/** A subject's verdict as a word or two, for the sheet's list. */
export const SUBJECT_VERDICT: Record<SubjectReading['verdict'], string> = {
  whole: 'Found',
  parts: 'Found in parts',
  mixed: 'Read with others',
  thin: 'Too little to read',
}

/** How the sheet reports the found-again check. */
export function foundSentence(found: SproutReading['found']): string | null {
  if (found.of === 0) return null
  const n = found.subjectIds.length
  const parts = found.inParts?.length ?? 0
  const inParts = parts === 0 ? '' : parts === n && n === 1 ? ', in parts' : `, ${parts === 1 ? 'one' : parts} of them in parts`
  if (n === found.of) {
    return found.of === 1
      ? `Read the same way, the map finds your one subject again${inParts}.`
      : `Read the same way, the map finds all ${found.of} of your subjects again${inParts}.`
  }
  return `Read the same way, the map finds ${n} of your ${found.of} subjects again${inParts}.`
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
