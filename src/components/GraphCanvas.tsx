'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import styles from './GraphCanvas.module.css'

interface GraphTopic {
  id: string
  title: string
  ability: number
  ability_confidence: number
  freshness: number
  /** The home subject, which is what the seed is coloured by. */
  primary_subject_id: string | null
  /** Every subject the topic is filed under, home included. */
  subject_ids: string[]
  state: string
  last_exposure_at: string | null
}

interface GraphEdge {
  from_topic: string
  to_topic: string
  kind: string
  weight: number
}

interface Subject {
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

/** Mix a hex plate colour toward the paper by the given amount. A
 *  dormant seed sits back into the bed rather than disappearing. */
function fade(hex: string, amount: number) {
  const paper = [239, 231, 214]
  const n = parseInt(hex.replace('#', ''), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const mixed = rgb.map((c, i) => Math.round(paper[i] + (c - paper[i]) * amount))
  return `rgb(${mixed.join(',')})`
}

export function GraphCanvas({
  initialSubject,
  initialTopic,
}: {
  initialSubject: string | null
  initialTopic: string | null
}) {
  const holder = useRef<HTMLDivElement>(null)
  const sigma = useRef<Sigma | null>(null)

  const [data, setData] = useState<{
    topics: GraphTopic[]
    edges: GraphEdge[]
    subjects: Subject[]
  } | null>(null)
  const [selected, setSelected] = useState<string | null>(initialTopic)
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<string | null>(initialSubject)
  const [showDormantOnly, setShowDormantOnly] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/topics').then(r => r.json()),
      fetch('/api/subjects').then(r => r.json()),
    ]).then(([graph, subjects]) => {
      setData({ ...graph, subjects: subjects.subjects ?? [] })
    })
  }, [])

  const colourFor = useCallback(
    (topic: GraphTopic) => {
      const s = data?.subjects.find(x => x.id === topic.primary_subject_id)
      return s?.colour ?? '#7d6f5d'
    },
    [data]
  )

  useEffect(() => {
    if (!data || !holder.current) return

    const graph = new Graph()
    const visible = data.topics.filter(t => {
      if (t.state !== 'active') return false
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false
      // Filter on the whole membership set, not the home subject:
      // exposure belongs to landscape photography even though portrait
      // is where it was first sown.
      if (subject && !t.subject_ids.includes(subject)) return false
      if (showDormantOnly && t.freshness >= 0.25) return false
      return true
    })

    const visibleIds = new Set(visible.map(t => t.id))

    visible.forEach((t, i) => {
      const angle = (i / visible.length) * Math.PI * 2
      graph.addNode(t.id, {
        label: t.title,
        // Size by ability: a stronger holding is a larger seed.
        size: 5 + t.ability * 2.4,
        // Dormancy is mixed into the fill itself. Sigma has no alpha
        // attribute, so a separate opacity key renders as nothing.
        color: fade(colourFor(t), 0.3 + t.freshness * 0.7),
        x: Math.cos(angle) * 100 + Math.random() * 10,
        y: Math.sin(angle) * 100 + Math.random() * 10,
        freshness: t.freshness,
        ability: t.ability,
      })
    })

    data.edges.forEach(e => {
      if (!visibleIds.has(e.from_topic) || !visibleIds.has(e.to_topic)) return
      if (graph.hasEdge(e.from_topic, e.to_topic)) return
      graph.addEdge(e.from_topic, e.to_topic, {
        size: 0.5 + e.weight,
        color: 'rgba(107, 92, 69, 0.35)',
        kind: e.kind,
      })
    })

    if (graph.order > 0) {
      forceAtlas2.assign(graph, {
        iterations: 400,
        settings: {
          // Strong gravity pulls the whole planting into frame; a low
          // scalingRatio keeps clumps from flinging to the corners.
          gravity: 8,
          scalingRatio: 3,
          slowDown: 12,
          adjustSizes: true,
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
      // Sigma hides labels that would collide; a larger grid cell means
      // it hides more of them rather than overprinting into mush.
      labelGridCellSize: 90,
      labelRenderedSizeThreshold: 7,
      minCameraRatio: 0.3,
      maxCameraRatio: 3,
    })

    // A dormant seed's label recedes with it, so the whole entry reads
    // as one state rather than a faded dot with black text beside it.
    renderer.setSetting('defaultDrawNodeLabel', (context, nodeData, settings) => {
      const d = nodeData as unknown as {
        x: number; y: number; size: number; label: string; freshness: number
      }
      if (!d.label) return

      context.font = `500 ${settings.labelSize}px ${settings.labelFont}`
      context.fillStyle = d.freshness < 0.25 ? '#8a7d68' : '#241d16'

      // Flip the label to the left of its seed when it would otherwise
      // run off the right edge. On a phone the graph is narrow enough
      // that a fixed right-hand offset clips most of the outer labels.
      const width = context.measureText(d.label).width
      const gap = d.size + 5
      const overflows = d.x + gap + width > context.canvas.width / window.devicePixelRatio
      const x = overflows ? d.x - gap - width : d.x + gap

      context.fillText(d.label, x, d.y + settings.labelSize / 3)
    })

    renderer.on('clickNode', ({ node }) => setSelected(node))
    renderer.on('clickStage', () => setSelected(null))

    // Sit the whole planting in frame rather than leaving the camera
    // wherever the layout happened to finish.
    renderer.getCamera().animatedReset({ duration: 0 })

    sigma.current = renderer
    return () => {
      renderer.kill()
      sigma.current = null
    }
  }, [data, query, subject, showDormantOnly, colourFor])

  const selectedTopic = data?.topics.find(t => t.id === selected) ?? null

  return (
    <div className={styles.frame}>
      <div className={styles.controls}>
        <input
          className={styles.search}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find a topic"
          aria-label="Find a topic"
        />
        <select
          className={styles.select}
          value={subject ?? ''}
          onChange={e => setSubject(e.target.value || null)}
          aria-label="Filter by subject"
        >
          <option value="">All subjects</option>
          {data?.subjects.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
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

      {data && data.topics.filter(t => t.state === 'active').length === 0 && (
        <p className={styles.pending}>Nothing sown yet.</p>
      )}

      {selectedTopic && (
        <TopicPanel
          // Remount on a new selection so the panel starts empty rather
          // than printing the last topic's record under this one's name.
          key={selectedTopic.id}
          topic={selectedTopic}
          colour={colourFor(selectedTopic)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function TopicPanel({
  topic,
  colour,
  onClose,
}: {
  topic: GraphTopic
  colour: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<{
    exposures: Array<{ id: string; reason: string; created_at: string; depth: string }>
    resources: Array<{ relevance: number; resources: { title: string; status: string } }>
    edges: Array<{ from_topic: string; to_topic: string; kind: string }>
    curricula: Array<{
      id: string
      title: string
      status: string
      shape: string
      lessonCount: number
      completedCount: number
    }>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/topics/${topic.id}`)
      .then(r => r.json())
      .then(d => !cancelled && setDetail(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [topic.id])

  const viability = Math.max(0, Math.round(((topic.ability - 1) / 4) * 100))
  const vague = topic.ability_confidence < 0.4

  return (
    <aside className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        Close
      </button>

      <div className={styles.panelPlate} style={{ background: colour }} />

      <h2 className={styles.panelTitle}>{topic.title}</h2>

      <dl className={styles.figures}>
        <dt>Viability</dt>
        <dd className={vague ? styles.figureVague : undefined}>
          {vague ? 'about ' : ''}{viability}
        </dd>
        <dt>Last tended</dt>
        <dd>
          {topic.last_exposure_at
            ? new Date(topic.last_exposure_at).toLocaleDateString('en-GB', {
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
        <h3 className={styles.panelBlockTitle}>Curriculum</h3>
        {!detail ? (
          <p className={styles.muted}>Reading the record…</p>
        ) : detail.curricula.length === 0 ? (
          <p className={styles.muted}>
            No route laid out yet.
          </p>
        ) : (
          <ul className={styles.record}>
            {detail.curricula.map(c => (
              <li key={c.id}>
                <a href={`/curriculum/${c.id}`}>{c.title}</a>
                <span className={styles.recordDate}>
                  {c.status === 'draft'
                    ? 'draft'
                    : `${c.completedCount}/${c.lessonCount}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <a className={styles.tend} href={`/topics/${topic.id}`}>
        Open the topic
      </a>
    </aside>
  )
}

export { EDGE_KIND_LABEL }
