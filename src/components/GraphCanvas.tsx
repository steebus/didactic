'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import FA2Supervisor from 'graphology-layout-forceatlas2/worker'
import { SheetNav } from './SheetNav'
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

    // Seed each subject in its own quarter of the bed. Most topics carry
    // no edges at all, and force layout can only group what is
    // connected — without this the planting settles into one ring with
    // photography sitting next to edge functions.
    const subjectIds = [...new Set(visible.map(t => t.primary_subject_id ?? 'loose'))]
    const seedAngle = new Map(
      subjectIds.map((id, i) => [id, (i / Math.max(1, subjectIds.length)) * Math.PI * 2])
    )

    visible.forEach((t, i) => {
      const home = t.primary_subject_id ?? 'loose'
      const base = seedAngle.get(home) ?? 0
      // Spread within the bed so members do not start stacked.
      const jitter = (i % 7) / 7 - 0.5
      const radius = 260 + ((i % 5) - 2) * 34
      graph.addNode(t.id, {
        label: t.title,
        // Size by ability: a stronger holding is a larger seed.
        size: 5 + t.ability * 2.4,
        // Dormancy is mixed into the fill itself. Sigma has no alpha
        // attribute, so a separate opacity key renders as nothing.
        color: fade(colourFor(t), 0.3 + t.freshness * 0.7),
        x: Math.cos(base + jitter * 0.8) * radius,
        y: Math.sin(base + jitter * 0.8) * radius,
        freshness: t.freshness,
        ability: t.ability,
      })
    })

    data.edges.forEach(e => {
      if (!visibleIds.has(e.from_topic) || !visibleIds.has(e.to_topic)) return
      if (graph.hasEdge(e.from_topic, e.to_topic)) return
      graph.addEdge(e.from_topic, e.to_topic, {
        size: 0.9 + e.weight * 1.4,
        // Printed rules, not hairlines: the earlier value vanished on a
        // sunlit phone screen.
        color: 'rgba(90, 76, 56, 0.62)',
        kind: e.kind,
      })
    })

    // Membership pulls too. Topics sharing a subject attract even with
    // no stated relationship, which is what makes the bed cluster by
    // subject rather than by whatever the LLM happened to connect.
    // These carry no weight in the render, only in the physics.
    const bySubject = new Map<string, string[]>()
    for (const t of visible) {
      for (const subjectId of t.subject_ids.length ? t.subject_ids : ['loose']) {
        bySubject.set(subjectId, [...(bySubject.get(subjectId) ?? []), t.id])
      }
    }
    for (const members of bySubject.values()) {
      // A ring through the members: enough to hold a bed together
      // without the density of connecting every pair.
      for (let i = 0; i < members.length; i++) {
        const a = members[i]
        const b = members[(i + 1) % members.length]
        if (a === b || graph.hasEdge(a, b)) continue
        graph.addEdge(a, b, { size: 0.4, color: 'rgba(90, 76, 56, 0.10)', kind: 'membership' })
      }
    }

    const layoutSettings = {
      // Lower gravity with a wider scalingRatio lets the beds
      // separate; strong gravity collapses them into one mass.
      gravity: 1.2,
      scalingRatio: 24,
      slowDown: 14,
      adjustSizes: true,
      barnesHutOptimize: graph.order > 80,
    }

    if (graph.order > 0) {
      // Settle the planting before the first paint, so it opens on a
      // readable bed rather than animating out of a seeded ring.
      forceAtlas2.assign(graph, { iterations: 400, settings: layoutSettings })
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

    // --- Live forces --------------------------------------------------
    //
    // The layout keeps running in a worker, so dragging a seed pushes
    // its neighbours out of the way and the bed settles again. A held
    // node is pinned: fixed while the drag lasts, released after, which
    // is what makes the planting feel like it has weight.
    // Running settings differ from the one-shot pass. Continuous
    // iteration with the settling values collapses the bed into a clump:
    // gravity keeps pulling while nothing pushes back hard enough. More
    // repulsion and far weaker gravity hold the beds open while a drag
    // still propagates through them.
    const supervisor = new FA2Supervisor(graph, {
      settings: {
        ...layoutSettings,
        gravity: 0.05,
        scalingRatio: 80,
        slowDown: 40,
      },
    })
    let dragging: string | null = null
    let settleTimer: ReturnType<typeof setTimeout> | undefined

    renderer.on('downNode', ({ node }) => {
      dragging = node
      graph.setNodeAttribute(node, 'highlighted', true)
      // Pin it where the hand is, or the forces fight the drag.
      graph.setNodeAttribute(node, 'fixed', true)
      if (!supervisor.isRunning()) supervisor.start()
    })

    renderer.on('moveBody', ({ event }) => {
      if (!dragging) return
      const position = renderer.viewportToGraph(event)
      graph.setNodeAttribute(dragging, 'x', position.x)
      graph.setNodeAttribute(dragging, 'y', position.y)
      // Stop the canvas panning under the finger while a seed is held.
      event.preventSigmaDefault()
      event.original.preventDefault()
      event.original.stopPropagation()
    })

    const release = () => {
      if (!dragging) return
      graph.removeNodeAttribute(dragging, 'highlighted')
      graph.removeNodeAttribute(dragging, 'fixed')
      dragging = null
      // Let the bed settle around where it was dropped, then rest.
      settleTimer = setTimeout(() => supervisor.stop(), 2500)
    }

    renderer.on('upNode', release)
    renderer.on('upStage', release)

    // Sit the whole planting in frame rather than leaving the camera
    // wherever the layout happened to finish.
    // ponytail: animatedReset restores Sigma's default camera rather
    // than fitting to the planting's bounding box, so the beds can sit
    // off-centre when the layout spreads them unevenly. Fitting properly
    // means computing the box and setting camera ratio and offset by
    // hand; not worth it until the framing actually gets in the way.
    renderer.getCamera().animatedReset({ duration: 0 })

    sigma.current = renderer
    return () => {
      clearTimeout(settleTimer)
      // kill() terminates the worker; stop() alone leaves it running.
      supervisor.kill()
      renderer.kill()
      sigma.current = null
    }
  }, [data, query, subject, showDormantOnly, colourFor])

  const selectedTopic = data?.topics.find(t => t.id === selected) ?? null

  return (
    <div className={styles.frame}>
      <div className={styles.controls}>
        <SheetNav back={{ href: '/', label: 'Stock list' }} current="bed" />
        <div className={styles.filters}>
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
