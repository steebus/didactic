'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import FA2Supervisor from 'graphology-layout-forceatlas2/worker'
import { SheetNav } from './SheetNav'
import styles from './GraphCanvas.module.css'
import { Setting } from '@/components/Setting'
import {
  EDGE_KIND_LABEL,
  fade,
  nodeSize,
  edgeSize,
  nodeFade,
  hullFade,
  labelInk,
  LABEL_INK,
} from '@didactic/core/graph'

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

interface GraphResource {
  id: string
  title: string
  kind: string
  status: string
  /** Every topic it touches: a paper on retrieval reaches into both
   *  embeddings and vector search. */
  topic_ids: string[]
}

interface GraphLesson {
  id: string
  title: string
  topic_id: string
  stage: string
  completed_at: string | null
  curriculum_id: string
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
    resources: GraphResource[]
    lessons: GraphLesson[]
  } | null>(null)
  const [selected, setSelected] = useState<string | null>(initialTopic)
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<string | null>(initialSubject)
  const [showDormantOnly, setShowDormantOnly] = useState(false)
  const [showForces, setShowForces] = useState(false)
  // The bed is topics by default. Material and lessons are layers over
  // it, off until asked for, or the planting is unreadable.
  const [showResources, setShowResources] = useState(false)
  const [showLessons, setShowLessons] = useState(false)
  // The forces, exposed the way Obsidian exposes them: pulling these
  // around is how you find the arrangement that reads for you, and no
  // single default suits every planting.
  const [repel, setRepel] = useState(24)
  const [centre, setCentre] = useState(1.2)
  const [linkDistance, setLinkDistance] = useState(1)

  // Bumped when the bed changes under us -- grubbing a topic out takes
  // its node and every edge into it, so the planting has to be read
  // again rather than patched.
  const [reload, setReload] = useState(0)

  useEffect(() => {
    Promise.all([
      fetch('/api/topics').then(r => r.json()),
      fetch('/api/subjects').then(r => r.json()),
    ]).then(([graph, subjects]) => {
      setData({ ...graph, subjects: subjects.subjects ?? [] })
    })
  }, [reload])

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

    // One pass over the lessons, so the ring is cheap to draw.
    const lessonTally = new Map<string, { total: number; worked: number }>()
    for (const lesson of data.lessons) {
      if (!lesson.topic_id) continue
      const tally = lessonTally.get(lesson.topic_id) ?? { total: 0, worked: 0 }
      tally.total += 1
      if (lesson.completed_at) tally.worked += 1
      lessonTally.set(lesson.topic_id, tally)
    }

    visible.forEach((t, i) => {
      const home = t.primary_subject_id ?? 'loose'
      const base = seedAngle.get(home) ?? 0
      // Spread within the bed so members do not start stacked.
      const jitter = (i % 7) / 7 - 0.5
      const radius = 260 + ((i % 5) - 2) * 34
      graph.addNode(t.id, {
        label: t.title,
        // Size by ability: a stronger holding is a larger seed.
        size: nodeSize(t.ability),
        // Dormancy is mixed into the fill itself. Sigma has no alpha
        // attribute, so a separate opacity key renders as nothing.
        color: fade(colourFor(t), nodeFade(t.freshness)),
        x: Math.cos(base + jitter * 0.8) * radius,
        y: Math.sin(base + jitter * 0.8) * radius,
        freshness: t.freshness,
        ability: t.ability,
        // The lessons on this topic, tallied for the ring drawn around
        // it. Counts rather than rows: the ring only needs to know how
        // many and how many are done.
        lessonsTotal: lessonTally.get(t.id)?.total ?? 0,
        lessonsWorked: lessonTally.get(t.id)?.worked ?? 0,
      })
    })

    data.edges.forEach(e => {
      if (!visibleIds.has(e.from_topic) || !visibleIds.has(e.to_topic)) return
      if (graph.hasEdge(e.from_topic, e.to_topic)) return
      graph.addEdge(e.from_topic, e.to_topic, {
        size: edgeSize(e.weight),
        // Printed rules, not hairlines: the earlier value vanished on a
        // sunlit phone screen.
        color: 'rgba(90, 76, 56, 0.62)',
        kind: e.kind,
      })
    })

    // --- Material and lessons, when asked for -------------------------
    //
    // Smaller and in ink rather than plate colour: these are not things
    // you know, they are things that touch what you know. A resource
    // reaches into every topic it covers, which is how the canvas shows
    // one paper feeding several subjects at once.
    if (showResources) {
      for (const r of data.resources ?? []) {
        const attached = r.topic_ids.filter(id => visibleIds.has(id))
        if (attached.length === 0) continue

        const nodeId = `resource:${r.id}`
        graph.addNode(nodeId, {
          label: r.title,
          size: 4.5,
          // Read material is inked; unread is outlined by being paler,
          // matching the sheet's own unsown/sown distinction.
          color: r.status === 'consumed' ? '#6b5c45' : '#c3b393',
          x: 0,
          y: 0,
          freshness: 1,
          kindOfThing: 'resource',
          resourceId: r.id,
        })

        for (const topicId of attached) {
          graph.addEdge(nodeId, topicId, {
            size: 0.7,
            color: 'rgba(107, 92, 69, 0.35)',
            kind: 'covers',
          })
        }
      }
    }

    if (showLessons) {
      for (const l of data.lessons ?? []) {
        if (!visibleIds.has(l.topic_id)) continue

        const nodeId = `lesson:${l.id}`
        graph.addNode(nodeId, {
          label: l.title,
          size: 3.5,
          color: l.completed_at ? '#2f5233' : '#a8b394',
          x: 0,
          y: 0,
          freshness: 1,
          kindOfThing: 'lesson',
          lessonId: l.id,
        })

        graph.addEdge(nodeId, l.topic_id, {
          size: 0.6,
          color: 'rgba(47, 82, 51, 0.3)',
          kind: 'teaches',
        })
      }
    }

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
      // Centre force pulls the planting together; repulsion pushes the
      // beds apart. Both are the user's to set.
      gravity: centre,
      scalingRatio: repel,
      edgeWeightInfluence: linkDistance,
      slowDown: 14,
      adjustSizes: true,
      barnesHutOptimize: graph.order > 80,
    }

    // Drag physics stay live under reduced motion: they are a direct
    // response to the hand, which is feedback rather than decoration.
    if (graph.order > 0) {
      // Settle fully before the first paint. Cutting this short to let
      // the bed visibly take root was tried and reverted: the running
      // forces need a resolved starting state, and from a half-settled
      // one they leave seeds clumped and overlapping instead of
      // spreading. A legible bed beats an entrance.
      forceAtlas2.assign(graph, { iterations: 400, settings: layoutSettings })
    }

    const renderer = new Sigma(graph, holder.current, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelFont: 'var(--font-text-loaded), sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelColor: { color: LABEL_INK },
      // Sigma hides labels that would collide; a larger grid cell means
      // it hides more of them rather than overprinting into mush.
      labelGridCellSize: 90,
      labelRenderedSizeThreshold: 7,
      // Wide enough to pull right back and read the beds as beds, or
      // push in until a single planting fills the frame.
      minCameraRatio: 0.15,
      maxCameraRatio: 6,
    })

    // --- Hovering a seed shows what it grows with ---------------------
    //
    // Everything unrelated recedes into the bed rather than disappearing,
    // so the neighbourhood reads without losing the shape around it.
    let hovered: string | null = null

    const neighboursOf = (topicId: string) => {
      const set = new Set<string>([topicId])
      graph.forEachNeighbor(topicId, n => set.add(n))
      return set
    }

    renderer.setSetting('nodeReducer', (node, attrs) => {
      if (!hovered) return attrs
      const near = neighboursOf(hovered)
      if (near.has(node)) {
        return node === hovered ? { ...attrs, size: (attrs.size as number) * 1.25 } : attrs
      }
      return { ...attrs, color: fade(attrs.color as string, 0.22), label: '' }
    })

    renderer.setSetting('edgeReducer', (edge, attrs) => {
      if (!hovered) return attrs
      const [from, to] = graph.extremities(edge)
      const near = neighboursOf(hovered)
      if (near.has(from) && near.has(to)) {
        return { ...attrs, color: 'rgba(184, 72, 42, 0.85)', size: (attrs.size as number) * 1.6 }
      }
      return { ...attrs, color: 'rgba(90, 76, 56, 0.10)' }
    })

    renderer.on('enterNode', ({ node }) => {
      hovered = node
      renderer.refresh()
    })

    renderer.on('leaveNode', () => {
      hovered = null
      renderer.refresh()
    })

    // --- Pulling back shows the beds -----------------------------------
    //
    // Zoomed in you read topics; zoomed out the individual names stop
    // mattering and what you want is which bed you are looking at. The
    // subject name is drawn over its members' centre, fading in as the
    // seed labels fade out, so the two never compete.
    const subjectOf = new Map<string, string>()
    for (const t of visible) {
      if (t.primary_subject_id) subjectOf.set(t.id, t.primary_subject_id)
    }

    renderer.on('afterRender', () => {
      const ratio = renderer.getCamera().ratio
      // Below this the seed labels carry the sheet; above it they have
      // thinned out and the bed names take over.
      const strength = Math.min(1, Math.max(0, (ratio - 0.9) / 0.6))
      if (strength <= 0.01) return

      const context = renderer.getCanvases().labels.getContext('2d')
      if (!context) return

      // CSS pixels, not device pixels: positions from graphToViewport
      // are in the same space.
      const width = context.canvas.width / (window.devicePixelRatio || 1)

      // Mean position of each bed's members, in screen coordinates.
      const centres = new Map<string, { x: number; y: number; n: number }>()
      graph.forEachNode((node, attrs) => {
        const subjectId = subjectOf.get(node)
        if (!subjectId) return
        const p = renderer.graphToViewport({ x: attrs.x as number, y: attrs.y as number })
        const acc = centres.get(subjectId) ?? { x: 0, y: 0, n: 0 }
        centres.set(subjectId, { x: acc.x + p.x, y: acc.y + p.y, n: acc.n + 1 })
      })

      context.save()
      context.textAlign = 'center'
      for (const [subjectId, acc] of centres) {
        const subject = data.subjects.find(s => s.id === subjectId)
        if (!subject || acc.n === 0) continue
        // Fixed screen size, not scaled by zoom: a name that grows as
        // you pull back ends up filling the frame and overprinting its
        // neighbours. Bigger beds get a slightly larger name, and the
        // whole scale comes down on a narrow canvas where a desktop
        // size would be wider than the bed it names.
        const narrow = Math.min(1, width / 900)
        const size = (16 + Math.min(acc.n, 12) * 1.1) * (0.62 + narrow * 0.38)
        context.font = `600 ${size}px Georgia, serif`
        context.fillStyle = fade(subject.colour, hullFade(strength))
        // A paper halo so a name over a dense bed stays readable.
        context.lineWidth = size * 0.28
        context.strokeStyle = 'rgba(239, 231, 214, 0.9)'
        context.lineJoin = 'round'

        // Sit the name above its bed rather than through the middle of
        // it, and keep it inside the frame: a bed near the edge would
        // otherwise have its name half off-screen.
        const half = context.measureText(subject.title).width / 2
        const margin = 6
        const x = Math.min(
          Math.max(acc.x / acc.n, half + margin),
          width - half - margin
        )
        const y = acc.y / acc.n - size * 1.4
        context.strokeText(subject.title, x, y)
        context.fillText(subject.title, x, y)
      }
      context.restore()
    })

    // A dormant seed's label recedes with it, so the whole entry reads
    // as one state rather than a faded dot with black text beside it.
    renderer.setSetting('defaultDrawNodeLabel', (context, nodeData, settings) => {
      const d = nodeData as unknown as {
        x: number; y: number; size: number; label: string; freshness: number
        lessonsTotal?: number; lessonsWorked?: number
      }

      // The lessons on a topic, drawn as a ring of dashes around its
      // seed: one dash per lesson, filled in the plate green once it
      // has been worked and left open in the rule ink until then. A
      // topic with no route has no ring at all, which is itself the
      // reading -- nothing has been laid out here yet.
      //
      // Drawn as marks rather than as a progress arc because the count
      // is the information: four dashes with one filled says the same
      // thing at a glance as "1 of 4", and an arc at this size cannot.
      const total = d.lessonsTotal ?? 0
      if (total > 0) {
        // Past a dozen the dashes stop being countable, so they become
        // a ruling instead: still proportioned, no longer enumerated.
        const marks = Math.min(total, 24)
        const worked = Math.round(((d.lessonsWorked ?? 0) / total) * marks)
        const radius = d.size + 4
        const gap = marks > 12 ? 0.18 : 0.3
        const step = (Math.PI * 2) / marks

        context.save()
        context.lineWidth = 1.5
        context.lineCap = 'butt'
        for (let i = 0; i < marks; i++) {
          // From the top, clockwise, so the first lesson sits where a
          // reader starts.
          const from = -Math.PI / 2 + i * step + step * gap * 0.5
          const to = from + step * (1 - gap)
          context.beginPath()
          context.strokeStyle = i < worked ? '#2f5233' : 'rgba(107, 92, 69, 0.45)'
          context.arc(d.x, d.y, radius, from, to)
          context.stroke()
        }
        context.restore()
      }

      if (!d.label) return

      // Seed names give way as you pull back: past this the bed names
      // take over, and printing both makes an unreadable page.
      const ratio = renderer.getCamera().ratio
      if (ratio > 1.5) return

      context.font = `500 ${settings.labelSize}px ${settings.labelFont}`
      context.globalAlpha = Math.min(1, Math.max(0.15, (1.5 - ratio) / 0.5))
      context.fillStyle = labelInk(d.freshness)

      // Flip the label to the left of its seed when it would otherwise
      // run off the right edge. On a phone the graph is narrow enough
      // that a fixed right-hand offset clips most of the outer labels.
      const width = context.measureText(d.label).width
      const gap = d.size + 5
      const overflows = d.x + gap + width > context.canvas.width / window.devicePixelRatio
      const x = overflows ? d.x - gap - width : d.x + gap

      context.fillText(d.label, x, d.y + settings.labelSize / 3)
      // Restore, or the alpha leaks into everything drawn after this.
      context.globalAlpha = 1
    })

    renderer.on('clickNode', ({ node }) => {
      // Material and lessons open where they live; only topics get the
      // panel, which reads topic detail.
      if (node.startsWith('lesson:')) {
        window.location.href = `/lesson/${node.slice('lesson:'.length)}`
        return
      }
      if (node.startsWith('resource:')) return
      setSelected(node)
    })
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
  }, [data, query, subject, showDormantOnly, showResources, showLessons, colourFor, repel, centre, linkDistance])

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

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showResources}
              onChange={e => setShowResources(e.target.checked)}
            />
            Material
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showLessons}
              onChange={e => setShowLessons(e.target.checked)}
            />
            Lessons
          </label>

          <button
            className={styles.forcesToggle}
            onClick={() => setShowForces(v => !v)}
            aria-expanded={showForces}
          >
            Forces
          </button>
        </div>

        {showForces && (
          <div className={styles.forces}>
            <label className={styles.force}>
              <span className={styles.forceLabel}>Repel</span>
              <input
                type="range" min={4} max={80} step={2}
                value={repel}
                onChange={e => setRepel(+e.target.value)}
              />
              <span className={styles.forceValue}>{repel}</span>
            </label>
            <label className={styles.force}>
              <span className={styles.forceLabel}>Draw together</span>
              <input
                type="range" min={0.1} max={6} step={0.1}
                value={centre}
                onChange={e => setCentre(+e.target.value)}
              />
              <span className={styles.forceValue}>{centre.toFixed(1)}</span>
            </label>
            <label className={styles.force}>
              <span className={styles.forceLabel}>Link pull</span>
              <input
                type="range" min={0} max={3} step={0.1}
                value={linkDistance}
                onChange={e => setLinkDistance(+e.target.value)}
              />
              <span className={styles.forceValue}>{linkDistance.toFixed(1)}</span>
            </label>
            <button
              className={styles.forcesToggle}
              onClick={() => { setRepel(24); setCentre(1.2); setLinkDistance(1) }}
            >
              Reset
            </button>
          </div>
        )}
      </div>

      <div
        ref={holder}
        className={styles.canvas}
        style={{ '--controls-height': showForces ? '8.5rem' : '4.5rem' } as React.CSSProperties}
      />

      {!data && (
        <div className={styles.reading}>
          <Setting label="Reading the bed" shape="panel" />
        </div>
      )}

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
          onRemoved={() => {
            setSelected(null)
            setReload(n => n + 1)
          }}
        />
      )}
    </div>
  )
}

function TopicPanel({
  topic,
  colour,
  onClose,
  onRemoved,
}: {
  topic: GraphTopic
  colour: string
  onClose: () => void
  /** The bed has to be read again: the node and its edges are gone. */
  onRemoved: () => void
}) {
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function grub() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/topics/${topic.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not grub that out.')
      }
      onRemoved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(false)
    }
  }
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

      <div className={styles.panelFoot}>
        <a className={styles.tend} href={`/topics/${topic.id}`}>
          Open the topic
        </a>

        {/* Grubbing out from the bed itself.
            The subject sheet takes a topic out of one subject; here you
            are looking at the whole map, so this takes the topic off it
            entirely. Two presses, and the second states what goes --
            the same shape the subject sheet uses, because it is the
            same kind of irreversible act. */}
        {asked ? (
          <span className={styles.grub}>
            <span className={styles.grubNote}>
              Takes the topic off the map, with its routes and lessons.
              {(detail?.resources.length ?? 0) > 0 && ' Material stays in the library.'}
            </span>
            <button
              type="button"
              className={styles.grubKeep}
              onClick={() => setAsked(false)}
              disabled={busy}
            >
              Leave it
            </button>
            <button type="button" className={styles.grubGo} onClick={grub} disabled={busy}>
              {busy ? 'Grubbing out…' : 'Grub it out'}
            </button>
          </span>
        ) : (
          <button type="button" className={styles.grubAsk} onClick={() => setAsked(true)}>
            Grub it out
          </button>
        )}
      </div>

      {error && <p className={styles.grubProblem}>{error}</p>}
    </aside>
  )
}

export { EDGE_KIND_LABEL }
