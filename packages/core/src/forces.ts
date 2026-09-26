/**
 * The forces the bed is laid out by, as a simulation both platforms run.
 *
 * The web drew the bed with ForceAtlas2 and it settled strangely, for
 * reasons that were in the model rather than in the numbers:
 *
 * - FA2's gravity has the same magnitude at every distance. Balanced
 *   against a repulsion that falls off as 1/d, that gives a density
 *   that falls off as 1/r: a dense knot in the middle and a thin halo,
 *   with every pull turned off.
 * - FA2 weights repulsion and gravity by degree, so a well-joined topic
 *   shoved harder than a quiet one whatever the sliders said.
 * - *Link pull* set FA2's `edgeWeightInfluence`, which raises each
 *   edge's weight to that power -- and no edge carried a weight, so
 *   every one was 1 and the slider moved nothing. At 0 it would have
 *   meant "every edge at full strength", not "no pull".
 * - Subject membership pulled through a ring of invisible edges, which
 *   folds a subject into a loop or a chain and strung every loose topic
 *   onto one ring of its own, so the topics filed nowhere drew as one
 *   false cluster.
 *
 * So this is a different model, chosen for what it does when things are
 * turned off. Repulsion is the same for every seed and falls off as 1/d;
 * gravity is a spring, growing with distance. That pair has a known
 * equilibrium -- a 2D Coulomb gas in a harmonic trap settles as a disc
 * of even density -- so with every pull at nothing the bed is an evenly
 * spaced disc, and each pull is something added to that rather than a
 * correction to a lopsided start. Turning gravity off as well leaves
 * the disc expanding evenly until the simulation cools.
 *
 * Every force is scaled by the simulation's temperature, which decays,
 * so the bed comes to rest on its own; moving a slider warms it again.
 *
 * Here rather than in the canvas because the phone lays the bed out too,
 * and two beds laid out by two models disagree about where things are.
 */

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'

/** The five things a reader can turn, each 0 (off) upward. */
export interface Forces {
  /** How hard each seed pushes the others away. Sets the spacing. */
  spacing: number
  /** A spring toward the middle. Sets how tightly the whole bed sits. */
  gravity: number
  /** The pull along relations the map states: sow first, variety of. */
  linkPull: number
  /** The pull toward the middle of each subject a topic is filed under. */
  subjectPull: number
  /** The pull along kinship, which knows nothing about subjects. */
  kinshipPull: number
}

/** The bed as it opens: drawn by its subjects, kinship off. */
export const DEFAULT_FORCES: Forces = {
  spacing: 1,
  gravity: 1,
  linkPull: 1,
  subjectPull: 1,
  kinshipPull: 0,
}

/**
 * The bed drawn by kinship alone: subjects let go, so whatever clumps
 * is clumping because the material puts it together.
 */
export const KINSHIP_FORCES: Forces = {
  ...DEFAULT_FORCES,
  subjectPull: 0,
  kinshipPull: 1,
}

/** The sliders, in the order the panel sets them. */
export const FORCE_CONTROLS: ReadonlyArray<{
  key: keyof Forces
  label: string
  max: number
  step: number
}> = [
  { key: 'spacing', label: 'Spacing', max: 3, step: 0.1 },
  { key: 'gravity', label: 'Draw together', max: 3, step: 0.1 },
  { key: 'linkPull', label: 'Link pull', max: 3, step: 0.1 },
  { key: 'subjectPull', label: 'Subject pull', max: 3, step: 0.1 },
  { key: 'kinshipPull', label: 'Kinship pull', max: 3, step: 0.1 },
]

/**
 * The distance between neighbouring seeds with the defaults, in layout
 * units. A 2D Coulomb gas of charge q in a trap of stiffness k spaces
 * itself at sqrt(pi * q / k), so the two constants below are chosen
 * from this rather than the other way round.
 */
export const SPACING = 40

/** Charge per topic at spacing 1: d3 counts it as a velocity per tick. */
const CHARGE = 30
/** Trap stiffness at gravity 1, derived so the defaults space at SPACING. */
const STIFFNESS = (Math.PI * CHARGE) / (SPACING * SPACING)
/** Stiffness of each subject's own trap at subject pull 1. Stronger
 *  than gravity, or subjects blur into one disc rather than beds. */
const SUBJECT_STIFFNESS = STIFFNESS * 1.6
/** Link spring strength at link pull 1, before d3's degree damping. */
const LINK = 0.5
/** Kinship spring strength at kinship pull 1. */
const KINSHIP = 0.6
/** Material, lessons and marks push this much of a topic's charge. */
const SATELLITE_CHARGE = 0.25

/** A seed as the simulation holds it. */
export interface BedNode extends SimulationNodeDatum {
  id: string
  /** Its drawn radius, which the collision force keeps clear. */
  radius: number
  /** The subjects it is pulled toward. Empty for loose topics, which
   *  are pulled toward nothing rather than toward each other. */
  subjects: readonly string[]
  /** Material, lessons and marks: carried along by what they hang off. */
  satellite: boolean
}

/** A line the simulation pulls along. */
export interface BedLink extends SimulationLinkDatum<BedNode> {
  source: string | BedNode
  target: string | BedNode
  /** 0..1: how strong a claim the line makes. */
  weight: number
}

/**
 * Place seeds evenly on a disc before anything moves, each group in its
 * own wedge.
 *
 * Even, so that a bed with every pull off already looks like what it
 * will settle to, and the forces only ever add shape. Wedged by group so
 * a subject starts together and pulling it in is a short move rather
 * than a crossing of the whole bed. The radius is the square root of a
 * low-discrepancy sequence and the angle the golden-ratio sequence,
 * which is a Fibonacci lattice cut into sectors: even in area, and the
 * same every time the same bed is drawn.
 *
 * Satellites start beside their first anchor, found in `anchorOf`.
 */
export function seedBed(
  nodes: BedNode[],
  groupOf: (node: BedNode) => string,
  anchorOf: (node: BedNode) => string | null = () => null
): void {
  const topics = nodes.filter(n => !n.satellite)
  const radius = SPACING * Math.sqrt(Math.max(1, topics.length) / Math.PI)

  const groups = new Map<string, BedNode[]>()
  for (const node of topics) {
    const key = groupOf(node)
    const members = groups.get(key)
    if (members) members.push(node)
    else groups.set(key, [node])
  }

  // Largest first, then by key, so the arrangement does not depend on
  // the order the rows came back in.
  const ordered = [...groups.entries()].sort(
    ([a, am], [b, bm]) => bm.length - am.length || a.localeCompare(b)
  )

  const golden = (Math.sqrt(5) - 1) / 2
  let start = 0
  for (const [, members] of ordered) {
    const span = (members.length / topics.length) * Math.PI * 2
    members.forEach((node, k) => {
      const r = radius * Math.sqrt((k + 0.5) / members.length)
      const turn = ((k + 0.5) * golden) % 1
      const angle = start + span * turn
      node.x = Math.cos(angle) * r
      node.y = Math.sin(angle) * r
    })
    start += span
  }

  const at = new Map(topics.map(n => [n.id, n]))
  nodes.forEach((node, i) => {
    if (!node.satellite) return
    const anchor = at.get(anchorOf(node) ?? '')
    const angle = i * 2.399963 // the golden angle, so neighbours fan out
    node.x = (anchor?.x ?? 0) + Math.cos(angle) * SPACING * 0.5
    node.y = (anchor?.y ?? 0) + Math.sin(angle) * SPACING * 0.5
  })
}

/**
 * The pull toward the middle of each subject a topic sits in.
 *
 * A spring to the centroid, not edges between members: edges impose a
 * shape (a ring folds into a loop), where a centroid only says "these
 * belong together" and lets repulsion arrange them -- which, being the
 * same spring-and-charge pair as the whole bed, arranges each subject as
 * an even disc of its own. A topic in two subjects is pulled toward the
 * mean of both, which is what puts a bridge between the beds it joins.
 */
function subjectForce(): Force<BedNode, BedLink> & { strength(k: number): void } {
  let nodes: BedNode[] = []
  let stiffness = 0

  const force = (alpha: number) => {
    if (stiffness === 0) return
    const sums = new Map<string, { x: number; y: number; n: number }>()
    for (const node of nodes) {
      for (const s of node.subjects) {
        const acc = sums.get(s) ?? { x: 0, y: 0, n: 0 }
        acc.x += node.x ?? 0
        acc.y += node.y ?? 0
        acc.n += 1
        sums.set(s, acc)
      }
    }
    for (const node of nodes) {
      if (node.subjects.length === 0) continue
      let cx = 0, cy = 0
      for (const s of node.subjects) {
        const acc = sums.get(s)!
        cx += acc.x / acc.n
        cy += acc.y / acc.n
      }
      cx /= node.subjects.length
      cy /= node.subjects.length
      node.vx = (node.vx ?? 0) + (cx - (node.x ?? 0)) * stiffness * alpha
      node.vy = (node.vy ?? 0) + (cy - (node.y ?? 0)) * stiffness * alpha
    }
  }
  force.initialize = (n: BedNode[]) => { nodes = n }
  force.strength = (k: number) => { stiffness = k }
  return force
}

/** A bed laid out, with the handles a canvas needs to steer it. */
export interface BedLayout {
  simulation: Simulation<BedNode, undefined>
  nodes: BedNode[]
  /** Change what the reader has turned, and let the bed move to it. */
  configure(forces: Forces): void
  /** Replace the kinship lines, which arrive after the bed is drawn. */
  setKinship(links: BedLink[]): void
  /** Hold a seed where the hand is. */
  pin(id: string, x: number, y: number): void
  /** Let it go again. */
  release(id: string): void
  /** Run to rest now, with nothing drawn in between. */
  settle(): void
}

/**
 * Build the simulation for a bed.
 *
 * Three kinds of line: `stated` are the map's own relations (link
 * pull), `kinship` is the subject-blind reading (kinship pull), and
 * `attach` holds material, lessons and marks beside what they touch,
 * at a fixed strength no slider governs -- a paper drifting away from
 * the topics it covers would be a layout lying about what it is.
 *
 * Returned stopped when `live` is false, for tests and for readers who
 * prefer reduced motion; the caller then calls `settle`.
 */
export function layBed(
  nodes: BedNode[],
  lines: { stated: BedLink[]; attach: BedLink[]; kinship?: BedLink[] },
  forces: Forces,
  live = true
): BedLayout {
  const byId = new Map(nodes.map(n => [n.id, n]))
  // Copied, never used as given: d3 rewrites a link's ends into node
  // objects in place, so a list handed to two layouts in turn -- the
  // kinship lines survive a rebuild of the bed -- would leave the
  // second pulling on the first one's nodes, and do nothing visible.
  const own = (links: BedLink[]) =>
    links
      .map(l => ({ source: endId(l.source), target: endId(l.target), weight: l.weight }))
      .filter(l => byId.has(l.source) && byId.has(l.target) && l.source !== l.target)

  const charge = forceManyBody<BedNode>().distanceMin(4)
  const collide = forceCollide<BedNode>(n => n.radius + 3).strength(0.7)
  const pullX = forceX<BedNode>(0)
  const pullY = forceY<BedNode>(0)
  const subjects = subjectForce()

  const stated = forceLink<BedNode, BedLink>(own(lines.stated))
    .id(n => n.id)
    .distance(SPACING)
  const kinship = forceLink<BedNode, BedLink>(own(lines.kinship ?? []))
    .id(n => n.id)
    .distance(SPACING * 0.8)
  const attach = forceLink<BedNode, BedLink>(own(lines.attach))
    .id(n => n.id)
    .distance(SPACING * 0.45)
    .strength(0.6)

  const simulation = forceSimulation<BedNode>(nodes)
    .force('charge', charge)
    .force('collide', collide)
    .force('x', pullX)
    .force('y', pullY)
    .force('subjects', subjects)
    .force('stated', stated)
    .force('kinship', kinship)
    .force('attach', attach)

  if (!live) simulation.stop()

  // d3's own link strength damps hubs by 1/min(degree); kept, and
  // scaled by the claim's weight and the reader's slider. A slider at 0
  // is a strength of 0, which is no force at all.
  const degree = (links: BedLink[]) => {
    const count = new Map<string, number>()
    for (const l of links) {
      for (const end of [endId(l.source), endId(l.target)]) {
        count.set(end, (count.get(end) ?? 0) + 1)
      }
    }
    return (l: BedLink) =>
      Math.min(count.get(endId(l.source)) ?? 1, count.get(endId(l.target)) ?? 1)
  }

  let current = forces

  const apply = () => {
    const f = current
    charge.strength(n => -CHARGE * f.spacing * (n.satellite ? SATELLITE_CHARGE : 1))
    pullX.strength(STIFFNESS * f.gravity)
    pullY.strength(STIFFNESS * f.gravity)
    subjects.strength(SUBJECT_STIFFNESS * f.subjectPull)

    const statedDegree = degree(stated.links())
    stated.strength(l => (LINK * f.linkPull * (0.4 + 0.6 * clamp01(l.weight))) / statedDegree(l))

    const kinDegree = degree(kinship.links())
    kinship.strength(l => (KINSHIP * f.kinshipPull * clamp01(l.weight)) / Math.sqrt(kinDegree(l)))
  }
  apply()

  const warm = (alpha: number) => {
    simulation.alpha(Math.max(simulation.alpha(), alpha))
    if (live) simulation.restart()
  }

  return {
    simulation,
    nodes,
    configure(next) {
      current = next
      apply()
      warm(0.5)
    },
    setKinship(links) {
      kinship.links(own(links))
      apply()
      if (current.kinshipPull > 0) warm(0.5)
    },
    pin(id, x, y) {
      const node = byId.get(id)
      if (!node) return
      node.fx = x
      node.fy = y
      simulation.alphaTarget(0.2)
      if (live) simulation.restart()
    },
    release(id) {
      const node = byId.get(id)
      if (node) {
        node.fx = null
        node.fy = null
      }
      simulation.alphaTarget(0)
    },
    settle() {
      simulation.stop()
      const ticks = Math.ceil(
        Math.log(simulation.alphaMin() / Math.max(simulation.alpha(), simulation.alphaMin()))
        / Math.log(1 - simulation.alphaDecay())
      )
      simulation.tick(Math.max(0, ticks))
    },
  }
}

function endId(end: string | number | BedNode): string {
  return typeof end === 'object' ? end.id : String(end)
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5
}

/**
 * How evenly spread a set of points is: the coefficient of variation of
 * each point's distance to its nearest neighbour.
 *
 * Zero is a perfect lattice; points thrown at random score about 0.52.
 * Exported because it is the claim this module makes -- every pull off
 * settles evenly -- and a claim with no measure is a hope.
 */
export function unevenness(points: ReadonlyArray<{ x?: number; y?: number }>): number {
  if (points.length < 3) return 0
  const nearest = points.map((p, i) => {
    let best = Infinity
    points.forEach((q, j) => {
      if (i === j) return
      const d = Math.hypot((p.x ?? 0) - (q.x ?? 0), (p.y ?? 0) - (q.y ?? 0))
      if (d < best) best = d
    })
    return best
  })
  const mean = nearest.reduce((a, b) => a + b, 0) / nearest.length
  const variance = nearest.reduce((a, b) => a + (b - mean) ** 2, 0) / nearest.length
  return mean === 0 ? 0 : Math.sqrt(variance) / mean
}
