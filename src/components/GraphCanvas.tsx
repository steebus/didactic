'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import styles from './GraphCanvas.module.css'

interface GraphNode {
  id: string
  title: string
  ability: number
  ability_confidence: number
  freshness: number
  cluster_id: string | null
  state: string
  last_exposure_at: string | null
}

interface GraphEdge {
  from_node: string
  to_node: string
  kind: string
  weight: number
}

interface Cluster {
  id: string
  title: string
  colour: string
}

const EDGE_KIND_LABEL: Record<string, string> = {
  prereq: 'sow first',
  related: 'grows with',
  specialises: 'variety of',
  alternative: 'instead of',
}

export function GraphCanvas({
  initialCluster,
  initialNode,
}: {
  initialCluster: string | null
  initialNode: string | null
}) {
  const holder = useRef<HTMLDivElement>(null)
  const sigma = useRef<Sigma | null>(null)

  const [data, setData] = useState<{
    nodes: GraphNode[]
    edges: GraphEdge[]
    clusters: Cluster[]
  } | null>(null)
  const [selected, setSelected] = useState<string | null>(initialNode)
  const [query, setQuery] = useState('')
  const [cluster, setCluster] = useState<string | null>(initialCluster)
  const [showDormantOnly, setShowDormantOnly] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/nodes').then(r => r.json()),
      fetch('/api/clusters').then(r => r.json()),
    ]).then(([graph, clusters]) => {
      setData({ ...graph, clusters: clusters.clusters ?? [] })
    })
  }, [])

  const colourFor = useCallback(
    (node: GraphNode) => {
      const c = data?.clusters.find(x => x.id === node.cluster_id)
      return c?.colour ?? '#7d6f5d'
    },
    [data]
  )

  useEffect(() => {
    if (!data || !holder.current) return

    const graph = new Graph()
    const visible = data.nodes.filter(n => {
      if (n.state !== 'active') return false
      if (query && !n.title.toLowerCase().includes(query.toLowerCase())) return false
      if (cluster && n.cluster_id !== cluster) return false
      if (showDormantOnly && n.freshness >= 0.25) return false
      return true
    })

    const visibleIds = new Set(visible.map(n => n.id))

    visible.forEach((n, i) => {
      const angle = (i / visible.length) * Math.PI * 2
      graph.addNode(n.id, {
        label: n.title,
        // Size by ability: a stronger holding is a larger seed.
        size: 5 + n.ability * 2.4,
        color: colourFor(n),
        // Dormancy dims the seed; the ring below keeps it legible
        // without relying on colour alone.
        alpha: 0.35 + n.freshness * 0.65,
        x: Math.cos(angle) * 100 + Math.random() * 10,
        y: Math.sin(angle) * 100 + Math.random() * 10,
        freshness: n.freshness,
        ability: n.ability,
      })
    })

    data.edges.forEach(e => {
      if (!visibleIds.has(e.from_node) || !visibleIds.has(e.to_node)) return
      if (graph.hasEdge(e.from_node, e.to_node)) return
      graph.addEdge(e.from_node, e.to_node, {
        size: 0.5 + e.weight,
        color: 'rgba(107, 92, 69, 0.35)',
        kind: e.kind,
      })
    })

    if (graph.order > 0) {
      forceAtlas2.assign(graph, {
        iterations: 220,
        settings: {
          gravity: 1.4,
          scalingRatio: 12,
          slowDown: 6,
          barnesHutOptimize: graph.order > 80,
        },
      })
    }

    const renderer = new Sigma(graph, holder.current, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelFont: 'var(--font-text-loaded), sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelColor: { color: '#241d16' },
      defaultDrawNodeHover: () => {},
      minCameraRatio: 0.2,
      maxCameraRatio: 4,
    })

    // Dormant seeds get a drawn ring rather than a colour shift, so the
    // state reads on a monochrome or sunlit screen.
    renderer.setSetting('defaultDrawNodeLabel', (context, nodeData, settings) => {
      const d = nodeData as unknown as {
        x: number; y: number; size: number; label: string; freshness: number
      }
      if (!d.label) return
      context.font = `500 ${settings.labelSize}px ${settings.labelFont}`
      context.fillStyle = d.freshness < 0.25 ? '#7d6f5d' : '#241d16'
      context.fillText(d.label, d.x + d.size + 4, d.y + settings.labelSize / 3)
    })

    renderer.on('clickNode', ({ node }) => setSelected(node))
    renderer.on('clickStage', () => setSelected(null))

    sigma.current = renderer
    return () => {
      renderer.kill()
      sigma.current = null
    }
  }, [data, query, cluster, showDormantOnly, colourFor])

  const selectedNode = data?.nodes.find(n => n.id === selected) ?? null

  return (
    <div className={styles.frame}>
      <div className={styles.controls}>
        <input
          className={styles.search}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find a subject"
          aria-label="Find a subject"
        />
        <select
          className={styles.select}
          value={cluster ?? ''}
          onChange={e => setCluster(e.target.value || null)}
          aria-label="Filter by section"
        >
          <option value="">All sections</option>
          {data?.clusters.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showDormantOnly}
            onChange={e => setShowDormantOnly(e.target.checked)}
          />
          Dormant only
        </label>
      </div>

      <div ref={holder} className={styles.canvas} />

      {!data && <p className={styles.pending}>Reading the bed…</p>}

      {data && data.nodes.filter(n => n.state === 'active').length === 0 && (
        <p className={styles.pending}>Nothing sown yet.</p>
      )}

      {selectedNode && (
        <NodePanel
          node={selectedNode}
          colour={colourFor(selectedNode)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function NodePanel({
  node,
  colour,
  onClose,
}: {
  node: GraphNode
  colour: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<{
    exposures: Array<{ id: string; reason: string; created_at: string; depth: string }>
    resources: Array<{ relevance: number; resources: { title: string; status: string } }>
    edges: Array<{ from_node: string; to_node: string; kind: string }>
  } | null>(null)

  useEffect(() => {
    setDetail(null)
    fetch(`/api/nodes/${node.id}`).then(r => r.json()).then(setDetail)
  }, [node.id])

  const viability = Math.max(0, Math.round(((node.ability - 1) / 4) * 100))
  const vague = node.ability_confidence < 0.4

  return (
    <aside className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        Close
      </button>

      <div className={styles.panelPlate} style={{ background: colour }} />

      <h2 className={styles.panelTitle}>{node.title}</h2>

      <dl className={styles.figures}>
        <dt>Viability</dt>
        <dd className={vague ? styles.figureVague : undefined}>
          {vague ? 'about ' : ''}{viability}
        </dd>
        <dt>Last tended</dt>
        <dd>
          {node.last_exposure_at
            ? new Date(node.last_exposure_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })
            : 'Never sown'}
        </dd>
      </dl>

      {vague && (
        <p className={styles.caveat}>
          Not much to go on yet — this figure is a guess.
        </p>
      )}

      <section className={styles.panelBlock}>
        <h3 className={styles.panelBlockTitle}>Why this figure</h3>
        {!detail ? (
          <p className={styles.muted}>Reading the record…</p>
        ) : detail.exposures.length === 0 ? (
          <p className={styles.muted}>
            Nothing recorded. The figure is the starting floor, not a measurement.
          </p>
        ) : (
          <ul className={styles.record}>
            {detail.exposures.slice(0, 6).map(e => (
              <li key={e.id}>
                <span>{e.reason}</span>
                <span className={styles.recordDate}>
                  {new Date(e.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail && detail.resources.length > 0 && (
        <section className={styles.panelBlock}>
          <h3 className={styles.panelBlockTitle}>Material</h3>
          <ul className={styles.record}>
            {detail.resources.map((r, i) => (
              <li key={i}>
                <span>{r.resources.title}</span>
                <span className={styles.recordDate}>{r.resources.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <a className={styles.tend} href={`/refresher/${node.id}`}>
        Tend it
      </a>
    </aside>
  )
}

export { EDGE_KIND_LABEL }
