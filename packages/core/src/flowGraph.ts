/**
 * A `flow` block, turned from a nest of steps into a graph.
 *
 * The block's JSON is written as a tree, because that is the shape a
 * model can hold in its head: a lane of steps, and a step that parts
 * carries the lanes it parts into. What a reader needs is a graph --
 * nodes joined by edges, where the edges after a parting converge back
 * onto whatever came next. The tree says that convergence implicitly,
 * by the branches simply ending; this module says it out loud, because
 * a line has to be drawn from each of those ends to the same place.
 *
 * Pure, and here rather than in the web app, for the ordinary reason:
 * the phone draws the same flows out of the same lessons, and a graph
 * built twice is two graphs that can come to disagree about where a
 * branch rejoins.
 *
 * What this module does not do is lay the graph out. Positions come
 * from dagre in the browser, off the sizes {@link flowNodeSize}
 * estimates -- see `apps/web/src/components/blocks/Flow.tsx`.
 */

import type { FlowStepData } from './blocks'
import { straightenFlow } from './blocks'

/** What a node is, which is what it is drawn as. */
export type FlowNodeKind =
  /** A step: something that happens. */
  | 'step'
  /** A step that parts: something that is asked. */
  | 'ask'
  /** A branch that leaves the drawing, naming where it goes. */
  | 'goes'

export interface FlowNode {
  id: string
  kind: FlowNodeKind
  text: string
  detail?: string
  /** How deep in the branching this node sits. 0 is the trunk. */
  depth: number
}

export interface FlowEdge {
  from: string
  to: string
  /** The answer that takes you down this edge: "Yes", "Under 100ms". */
  label?: string
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/**
 * The graph a flow block describes.
 *
 * Walks the tree once. A lane returns the ids that are left dangling at
 * its foot -- its own last step, or, when that step parted, every end
 * of every branch under it -- and the caller joins all of them to
 * whatever comes next. That is the whole of the convergence rule, and
 * it is why the branches do not each repeat what happens afterwards.
 *
 * Ids are positional (`0`, `0.1.2`) rather than derived from the text.
 * Two steps in a flow can say the same words -- "Leave it alone" under
 * either arm of a question -- and keying on the text would silently
 * weld them into one node with two parents.
 */
export function flowGraph(steps: FlowStepData[] | undefined): FlowGraph {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  /**
   * One lane, top to bottom.
   *
   * `enters` are the nodes that must point at this lane's first step,
   * and `label` is the answer that got them here -- carried in rather
   * than written on the branch, because the label belongs to the edge
   * out of the question and not to the lane.
   *
   * Returns the lane's loose ends.
   */
  function lane(
    steps: FlowStepData[],
    path: string,
    depth: number,
    enters: string[],
    label: string | undefined
  ): string[] {
    const clean = straightenFlow(steps.filter(s => s?.text))
    let above = enters
    let edgeLabel = label

    for (const [i, step] of clean.entries()) {
      const id = path ? `${path}.${i}` : `${i}`
      nodes.push({
        id,
        kind: (step.branches ?? []).some(b => (b.steps ?? []).some(s => s?.text))
          ? 'ask'
          : 'step',
        text: (step.text ?? '').trim(),
        ...(step.detail?.trim() ? { detail: step.detail.trim() } : {}),
        depth,
      })
      for (const from of above) edges.push({ from, to: id, ...(edgeLabel ? { label: edgeLabel } : {}) })
      // The label is spent on the first step of the lane it labels.
      edgeLabel = undefined

      const branches = (step.branches ?? []).filter(b => (b.steps ?? []).some(s => s?.text))
      if (branches.length > 0) {
        above = branches.flatMap((branch, b) =>
          lane(branch.steps ?? [], `${id}.${b}`, depth + 1, [id], branch.label?.trim() || undefined)
        )
      } else if (step.goes?.trim()) {
        // A step that names where it goes ends here. The node says so,
        // and nothing descends from it: an arrow drawn across the page
        // to its destination is the thing `goes` exists to avoid.
        const away = `${id}.goes`
        nodes.push({ id: away, kind: 'goes', text: step.goes.trim(), depth })
        edges.push({ from: id, to: away })
        above = []
      } else {
        above = [id]
      }
    }

    return above
  }

  lane(steps ?? [], '', 0, [], undefined)
  return { nodes, edges }
}

/* ------------------------------------------------------ highlighting */

/**
 * The node pressed, and everything the flow says about how it is
 * reached and what follows from it.
 *
 * Both directions, because a reader pressing a box in the middle of a
 * decision is asking one of two questions and there is no telling
 * which: *how do I end up here* and *what happens if I do*. Lighting
 * only the way forward answers half of it.
 *
 * Edges are returned as `from>to` keys rather than as objects, so a
 * caller can ask about one in constant time while drawing.
 */
export function flowPath(
  graph: FlowGraph,
  id: string | null
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>()
  const edges = new Set<string>()
  if (!id || !graph.nodes.some(n => n.id === id)) return { nodes, edges }

  nodes.add(id)

  const walk = (from: string, forward: boolean) => {
    for (const edge of graph.edges) {
      const near = forward ? edge.from : edge.to
      const far = forward ? edge.to : edge.from
      if (near !== from || nodes.has(far)) continue
      nodes.add(far)
      edges.add(`${edge.from}>${edge.to}`)
      walk(far, forward)
    }
  }

  // Seeded separately in each direction: an edge is lit because it is
  // on the way in or on the way out, never because both its ends
  // happen to be lit for unrelated reasons.
  const seed = (forward: boolean) => {
    for (const edge of graph.edges) {
      if ((forward ? edge.from : edge.to) !== id) continue
      const far = forward ? edge.to : edge.from
      edges.add(`${edge.from}>${edge.to}`)
      if (!nodes.has(far)) {
        nodes.add(far)
        walk(far, forward)
      }
    }
  }
  seed(true)
  seed(false)

  return { nodes, edges }
}

/* ------------------------------------------------------------ sizing */

/**
 * How big a node's box will be, worked out rather than measured.
 *
 * The flow is laid out on the server as well as in the browser -- like
 * `chart`, and for the same reason: a figure that arrives a beat after
 * the prose and shoves it down the page is worse than one that is
 * simply there. Measuring needs a DOM, so nothing is measured. The box
 * is given a fixed width, the text is wrapped against that width at an
 * average character, and the height follows from the line count.
 *
 * The width being fixed is what makes this safe rather than merely
 * approximate: the browser wraps the same words in the same box, so the
 * only thing that can be wrong is the number of lines. `WIDE` is
 * deliberately pessimistic about how much fits on one line, so when
 * this is wrong the box is a little roomy rather than overflowing.
 */
export const FLOW_NODE_WIDTH = 210

/** Rough advance of one character, as a fraction of the font size. */
const WIDE = 0.55

const TEXT_SIZE = 14
const DETAIL_SIZE = 12.5
const LINE = 1.4
const PAD_Y = 18
const GAP = 3

export function flowNodeSize(node: FlowNode): { width: number; height: number } {
  const inner = FLOW_NODE_WIDTH - 24
  const lines = (text: string, size: number) =>
    wrapCount(text, Math.max(1, Math.floor(inner / (size * WIDE))))

  let height = PAD_Y + lines(node.text, TEXT_SIZE) * TEXT_SIZE * LINE
  if (node.detail) height += GAP + lines(node.detail, DETAIL_SIZE) * DETAIL_SIZE * LINE

  return { width: FLOW_NODE_WIDTH, height: Math.ceil(height) }
}

/**
 * How many lines this many words take at this many characters a line.
 *
 * Greedy, like every line breaker: a word that does not fit starts the
 * next line, and a word longer than the whole line takes as many lines
 * as it needs rather than looping forever.
 */
export function wrapCount(text: string, perLine: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1

  let lines = 1
  let used = 0
  for (const word of words) {
    if (word.length > perLine) {
      // Starts its own line and runs over onto more of them.
      if (used > 0) lines += 1
      lines += Math.ceil(word.length / perLine) - 1
      used = word.length % perLine
      continue
    }
    const needs = used === 0 ? word.length : used + 1 + word.length
    if (needs > perLine) {
      lines += 1
      used = word.length
    } else {
      used = needs
    }
  }
  return lines
}
