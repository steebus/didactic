'use client'

import { useMemo, useState } from 'react'
import dagre from '@dagrejs/dagre'
import {
  FLOW_NODE_WIDTH,
  flowGraph,
  flowNodeSize,
  flowPath,
  type FlowGraph,
  type FlowNode,
} from '@didactic/core/flowGraph'
import type { FlowStepData } from '@didactic/core/blocks'
import { Rich } from '../Rich'
import styles from './blocks.module.css'

export type FlowStep = FlowStepData

export interface FlowData {
  title?: string
  steps?: FlowStep[]
}

/** How far apart dagre sets things, in the figure's own units. */
const RANK_GAP = 52
const NODE_GAP = 34
const MARGIN = 6
/** Room reserved on an edge for the answer written along it. */
const LABEL_HEIGHT = 20
const LABEL_CHAR = 6.4

/**
 * A decision, drawn as a graph.
 *
 * Prose can say "if this, do that, unless the other" and a reader will
 * follow it once; a flow shows the shape of the decision, which is what
 * they need when they meet it again.
 *
 * Drawn rather than arranged, since 049. It was boxes in a flex column
 * with rules built out of pseudo-elements, on the reasoning that a
 * stack of boxes reads as a flow on a phone where routed arrows do not.
 * That reasoning was sound and the drawing was not: a rule cannot find
 * its way from the foot of one lane to the head of another when
 * neither knows where the other ended up, so the lines stopped short,
 * gathered at the wrong middle, and in the worst case pointed at
 * nothing. A flowchart whose lines do not meet the boxes is not a
 * quieter flowchart, it is a wrong one.
 *
 * So the positions come from dagre -- a layered graph layout, about
 * 40KB, and the whole of what it is asked for is coordinates. The
 * drawing is this app's: boxes in the sheet's own ink and type, edges
 * as printed rules with a head on them, the answers set in the label
 * register where every other small label in the catalogue sits.
 *
 * Laid out on the server as well as in the browser, like `chart` and
 * for the same reason -- a figure that arrives a beat late and shoves
 * the prose down the page is worse than one that is simply there. That
 * is what {@link flowNodeSize} is for: the boxes are given a fixed
 * width and a worked-out height rather than a measured one, so the
 * layout is the same arithmetic in both places and there is nothing to
 * correct after hydration.
 *
 * Pressing a box lights the way in and the way out of it. A reader
 * stopped in the middle of a decision is asking one of two questions --
 * how do I end up here, what happens if I do -- and there is no telling
 * which, so both are answered.
 */
export function Flow({ data }: { data: FlowData }) {
  const [held, setHeld] = useState<string | null>(null)

  const graph = useMemo(() => flowGraph(data.steps), [data.steps])
  const laid = useMemo(() => layout(graph), [graph])
  const lit = useMemo(() => flowPath(graph, held), [graph, held])

  if (!laid) return null

  const dim = held !== null

  return (
    <figure className={styles.figure}>
      {data.title && <figcaption className={styles.figureTitle}>{data.title}</figcaption>}

      <div className={styles.flowWrap}>
        <div
          className={styles.flow}
          style={{ width: laid.width, height: laid.height }}
          data-held={dim || undefined}
          /* A press anywhere off the boxes puts the flow back. The
             boxes are buttons, so this never swallows one of them. */
          onClick={() => setHeld(null)}
        >
          <svg
            className={styles.flowLines}
            width={laid.width}
            height={laid.height}
            viewBox={`0 0 ${laid.width} ${laid.height}`}
            aria-hidden="true"
          >
            <defs>
              {/* Two heads rather than one recoloured: a marker takes
                  its fill from the marker, not from the path it ends,
                  so an edge that lights up needs its own. */}
              {(['rest', 'lit'] as const).map(state => (
                <marker
                  key={state}
                  id={`flow-head-${state}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0.6 L 7.4 4 L 0 7.4 z"
                    fill={state === 'lit' ? 'var(--plate-plum)' : 'var(--rule-strong)'}
                  />
                </marker>
              ))}
            </defs>

            {laid.edges.map(edge => {
              const on = lit.edges.has(edge.key)
              return (
                <path
                  key={edge.key}
                  className={styles.flowLine}
                  d={edge.d}
                  data-lit={on || undefined}
                  markerEnd={`url(#flow-head-${on ? 'lit' : 'rest'})`}
                />
              )
            })}
          </svg>

          {laid.labels.map(label => (
            <p
              key={label.key}
              className={styles.flowLabel}
              style={{ left: label.x, top: label.y, width: label.width }}
              data-lit={lit.edges.has(label.key) || undefined}
            >
              {label.text}
            </p>
          ))}

          {laid.nodes.map(node => (
            <button
              key={node.id}
              type="button"
              className={styles.flowBox}
              style={{ left: node.left, top: node.top, width: node.width }}
              data-kind={node.kind}
              data-lit={lit.nodes.has(node.id) || undefined}
              data-held={node.id === held || undefined}
              aria-pressed={node.id === held}
              onClick={event => {
                event.stopPropagation()
                setHeld(was => (was === node.id ? null : node.id))
              }}
            >
              {node.kind === 'goes' ? (
                /* A destination rather than a step, and said as one:
                   the words are what stop a reader looking for the
                   line that would have gone there. */
                <span className={styles.flowText}>Go to “{node.text}”</span>
              ) : (
                <>
                  <Rich className={styles.flowText} text={node.text} />
                  {node.detail && <Rich className={styles.flowDetail} text={node.detail} />}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.flowNote}>
        {dim ? 'Press it again to put the whole flow back.' : 'Press a step to follow its path.'}
      </p>
    </figure>
  )
}

/* ------------------------------------------------------------ layout */

interface Laid {
  width: number
  height: number
  nodes: Array<FlowNode & { left: number; top: number; width: number }>
  edges: Array<{ key: string; d: string }>
  labels: Array<{ key: string; text: string; x: number; y: number; width: number }>
}

/**
 * Where everything goes.
 *
 * dagre is handed the graph and the sizes, and hands back centres for
 * the boxes and a run of points for each edge. Nothing else about the
 * drawing comes from it.
 */
function layout(graph: FlowGraph): Laid | null {
  if (graph.nodes.length === 0) return null

  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({
    rankdir: 'TB',
    ranksep: RANK_GAP,
    nodesep: NODE_GAP,
    marginx: MARGIN,
    marginy: MARGIN,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of graph.nodes) g.setNode(node.id, { ...flowNodeSize(node) })

  for (const edge of graph.edges) {
    // A labelled edge is told how much room the answer needs, so dagre
    // parts the lanes wide enough to print it rather than letting two
    // labels collide over the middle of the figure.
    const width = edge.label ? Math.min(FLOW_NODE_WIDTH, edge.label.length * LABEL_CHAR + 14) : 0
    g.setEdge(
      edge.from,
      edge.to,
      edge.label
        ? {
            label: edge.label,
            width,
            height: LABEL_HEIGHT,
            /* Beside the rule, not on it. Centred, dagre puts the
               label's anchor on the edge itself, and a label with a
               ground behind it then masks the very line it belongs to
               -- the rule appears to stop above the words and start
               again below them. Offset, the rule runs unbroken and the
               answer is written alongside it, which is where a label
               on a drawing goes. */
            labelpos: 'r',
            labeloffset: 8,
          }
        : { width: 0, height: 0 },
      key(edge.from, edge.to)
    )
  }

  dagre.layout(g)

  const size = g.graph()
  const width = Math.ceil(size.width ?? 0)

  /**
   * Which way round the branches came out.
   *
   * dagre orders each rank to minimise crossings, and where a parting
   * is symmetric -- two arms that rejoin, which is most of them -- both
   * orders cross equally and it is free to pick either. It reliably
   * picks the reverse of the order they were declared in, so *Yes*
   * lands to the right of *No* and the reader reads the decision
   * backwards. That is not a layout defect, and pinning it by handing
   * the branches over reversed would be a trick that works until dagre
   * settles a tie the other way.
   *
   * So it is read off the result instead: take the first question that
   * parts, and if its arms come out right to left, mirror the whole
   * drawing. Mirroring is exact -- every x becomes `width - x`, boxes,
   * rules and labels together -- and since the reversal is a property
   * of the ordering pass rather than of any one question, one mirror
   * puts every parting in the flow the right way round.
   */
  const backwards = (() => {
    for (const node of graph.nodes) {
      if (node.kind !== 'ask') continue
      const heads = graph.edges.filter(e => e.from === node.id).map(e => g.node(e.to)?.x)
      if (heads.length < 2 || heads.some(x => typeof x !== 'number')) continue
      return (heads as number[]).some((x, i, all) => i > 0 && x < all[i - 1])
    }
    return false
  })()

  const flip = (x: number) => (backwards ? width - x : x)

  const nodes = graph.nodes.map(node => {
    const at = g.node(node.id)
    return {
      ...node,
      left: Math.round(flip(at.x) - at.width / 2),
      top: Math.round(at.y - at.height / 2),
      width: Math.round(at.width),
    }
  })

  const edges: Laid['edges'] = []
  const labels: Laid['labels'] = []
  for (const edge of graph.edges) {
    const id = key(edge.from, edge.to)
    const drawn = g.edge({ v: edge.from, w: edge.to, name: id })
    if (!drawn?.points?.length) continue
    edges.push({ key: id, d: rule(drawn.points.map((pt: { x: number; y: number }) => ({ x: flip(pt.x), y: pt.y }))) })
    if (edge.label && typeof drawn.x === 'number' && typeof drawn.y === 'number') {
      const room = drawn.width || edge.label.length * LABEL_CHAR
      labels.push({
        key: id,
        text: edge.label,
        x: Math.round(flip(drawn.x) - room / 2),
        y: Math.round(drawn.y - LABEL_HEIGHT / 2),
        width: Math.ceil(room),
      })
    }
  }

  return { width, height: Math.ceil(size.height ?? 0), nodes, edges, labels }
}

const key = (from: string, to: string) => `${from}>${to}`

/**
 * A run of points, drawn as a printed rule.
 *
 * Straight runs with the corners taken off, rather than the bezier a
 * graph library would draw: this catalogue rules its lines, and a
 * flowing curve through a page of straight rules is the one mark on the
 * sheet that came from somewhere else. The radius is small and gives
 * way on a short segment, so a tight corner stays a corner instead of
 * bulging past the point it is meant to turn on.
 */
function rule(points: Array<{ x: number; y: number }>): string {
  const p = points.map(pt => ({ x: round(pt.x), y: round(pt.y) }))
  if (p.length < 3) return `M ${p[0].x} ${p[0].y} L ${p[p.length - 1].x} ${p[p.length - 1].y}`

  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) {
    const [from, at, to] = [p[i - 1], p[i], p[i + 1]]
    const r = Math.min(
      7,
      Math.hypot(at.x - from.x, at.y - from.y) / 2,
      Math.hypot(to.x - at.x, to.y - at.y) / 2
    )
    if (r < 1.5) {
      d += ` L ${at.x} ${at.y}`
      continue
    }
    const into = step(at, from, r)
    const outOf = step(at, to, r)
    d += ` L ${into.x} ${into.y} Q ${at.x} ${at.y} ${outOf.x} ${outOf.y}`
  }
  return `${d} L ${p[p.length - 1].x} ${p[p.length - 1].y}`
}

/** `distance` along the way from `at` towards `towards`. */
function step(
  at: { x: number; y: number },
  towards: { x: number; y: number },
  distance: number
): { x: number; y: number } {
  const span = Math.hypot(towards.x - at.x, towards.y - at.y) || 1
  return {
    x: round(at.x + ((towards.x - at.x) / span) * distance),
    y: round(at.y + ((towards.y - at.y) / span) * distance),
  }
}

/** Half a pixel, so a 1px rule lands on the pixel rather than across
 *  two of them and prints grey. */
const round = (n: number) => Math.round(n * 2) / 2
