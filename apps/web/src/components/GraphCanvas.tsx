'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Graph from 'graphology'
import Sigma from 'sigma'
import { didactic } from '@didactic/api'
import { vagueFigure } from '@didactic/core/scoring'
import {
  layBed,
  seedBed,
  SPACING,
  DEFAULT_FORCES,
  FORCE_CONTROLS,
  KINSHIP_FORCES,
  type BedLayout,
  type BedLink,
  type BedNode,
  type Forces,
} from '@didactic/core/forces'
import { contains, outline, type Point } from '@didactic/core/hull'
import { timeline, when, type Birth } from '@didactic/core/timelapse'
import type { ActivityDay } from '@didactic/core/activity'
import type { Sprouting, SproutView } from '@didactic/core/shapes'
import { kindLine, UNNAMED } from '@didactic/core/sprouting'
import { SheetNav } from './SheetNav'
import { ActivityRule } from './ActivityRule'
import { BannerFigures } from './BannerFigures'
import { Slug } from './Setting'
import styles from './GraphCanvas.module.css'

const api = didactic()
import { Setting } from '@/components/Setting'
import { WhereItLooks } from '@/components/WhereItLooks'
import type { LooseClaim } from '@didactic/core/shapes'
import {
  fade,
  edgeLine,
  nodeSize,
  edgeSize,
  nodeFade,
  hullFade,
  labelInk,
  LABEL_INK,
  LABEL_INK_DARK,
  PAPER,
  PAPER_DARK,
} from '@didactic/core/graph'
import { useTheme } from './useTheme'
import { SproutActions } from './SproutActions'

/**
 * The bed's own inks, per lighting condition.
 *
 * Everything else in the build follows a custom property; a canvas
 * cannot, because it paints to a bitmap where no stylesheet reaches.
 * So the one surface that has to be told is told here, in one table
 * rather than as a conditional at each of fourteen paint sites.
 *
 * `ground` is the load-bearing one: every seed is mixed toward it as
 * its topic goes dormant, and fading a dark bed toward paper would
 * print the cold topics as the brightest things on the map.
 */
const INKS = {
  light: {
    ground: PAPER,
    label: LABEL_INK,
    unfiledSeed: '#7d6f5d',
    edge: 'rgba(90, 76, 56, 0.62)',
    membership: 'rgba(90, 76, 56, 0.10)',
    resourceRead: '#6b5c45',
    resourceUnread: '#c3b393',
    covers: 'rgba(107, 92, 69, 0.35)',
    lessonWorked: '#2f5233',
    lessonOpen: '#a8b394',
    teaches: 'rgba(47, 82, 51, 0.3)',
    markNoted: '#c8871a',
    markPlain: '#ddc08a',
    marks: 'rgba(200, 135, 26, 0.28)',
    marksStrong: 'rgba(200, 135, 26, 0.6)',
    hover: 'rgba(184, 72, 42, 0.85)',
    hullEdge: 'rgba(239, 231, 214, 0.9)',
    routeWorked: '#2f5233',
    routeLeft: 'rgba(107, 92, 69, 0.45)',
    // A sprouting subject is drawn in the garden green, outlined and
    // never filled: something coming up, not something sown.
    sprout: 'rgba(47, 82, 51, 0.8)',
    sproutWash: 'rgba(47, 82, 51, 0.07)',
  },
  dark: {
    ground: PAPER_DARK,
    label: LABEL_INK_DARK,
    unfiledSeed: '#6d6252',
    edge: 'rgba(206, 188, 154, 0.38)',
    membership: 'rgba(206, 188, 154, 0.08)',
    resourceRead: '#9b8a6f',
    resourceUnread: '#4a4036',
    covers: 'rgba(206, 188, 154, 0.22)',
    lessonWorked: '#649069',
    lessonOpen: '#46543f',
    teaches: 'rgba(100, 144, 105, 0.32)',
    markNoted: '#c8871a',
    markPlain: '#6b5730',
    marks: 'rgba(200, 135, 26, 0.26)',
    marksStrong: 'rgba(200, 135, 26, 0.55)',
    hover: 'rgba(208, 103, 74, 0.9)',
    hullEdge: 'rgba(28, 22, 19, 0.9)',
    routeWorked: '#649069',
    routeLeft: 'rgba(206, 188, 154, 0.3)',
    sprout: 'rgba(130, 176, 134, 0.85)',
    sproutWash: 'rgba(130, 176, 134, 0.08)',
  },
} as const

/** How far a sprout's outline stands off its seeds, in screen pixels. */
const SPROUT_PAD = 22

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
  created_at: string
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
  created_at: string
}

interface GraphResource {
  id: string
  title: string
  kind: string
  status: string
  created_at: string
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
  created_at: string
}

/**
 * A kept passage, as the bed draws it.
 *
 * Two kinds of connection, and they mean different things. `topic_id`
 * is where the mark came from -- the topic the lesson it was taken in
 * teaches. The tagged ids are what the reader said it was *about*,
 * which is very often somewhere else entirely: that is the whole
 * reason for naming things in a note.
 */
interface GraphMark {
  id: string
  label: string
  /** The topic of the lesson it was taken in. Null for scaffolding. */
  topic_id: string | null
  lesson_id: string
  /** Whether anything was written, or only a passage kept. */
  noted: boolean
  created_at: string
  /** What the note names. */
  topic_ids: string[]
  lesson_ids: string[]
}

/** Where the bed remembers when it was last looked at. */
const SEEN = 'didactic:bed-seen'

/** How long the whole of a profile takes to play back, in ms. */
const HISTORY_MS = 30_000
/** How long a seed takes to grow from nothing, in ms. */
const GROW_MS = 450

type Lapse = { mode: 'history' } | { mode: 'arrival'; since: number }

/**
 * Whether anything has been made since the bed was last opened, and when
 * the last look was. Reads and moves the bookmark in one go: the answer
 * is wanted once per visit, and the next visit starts from now.
 */
function arrivals(data: {
  topics: GraphTopic[]; subjects: Subject[]; resources: GraphResource[]
  lessons: GraphLesson[]; marks: GraphMark[]
}): Lapse | null {
  const times = [
    ...data.topics, ...data.subjects, ...data.resources, ...data.lessons, ...data.marks,
  ].map(x => when(x.created_at)).filter((t): t is number => t !== null)
  if (times.length === 0) return null
  const latest = Math.max(...times)

  let seen = 0
  try {
    seen = Number(localStorage.getItem(SEEN))
    localStorage.setItem(SEEN, String(latest))
  } catch {
    // Private window: no bookmark, so no arrivals either.
    return null
  }
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // The first visit has nothing to be new relative to.
  if (!seen || !Number.isFinite(seen) || latest <= seen || still) return null
  return { mode: 'arrival', since: seen }
}

export function GraphCanvas({
  initialSubject,
  initialTopic,
  initialSprouts = false,
  days = [],
}: {
  initialSubject: string | null
  initialTopic: string | null
  /** Open with the sprouting outlines drawn: the sprouting sheet's
   *  *See it on the bed* arrives this way. */
  initialSprouts?: boolean
  /** The reader's year, for the rule under the head. */
  days?: ActivityDay[]
}) {
  const holder = useRef<HTMLDivElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const sigma = useRef<Sigma | null>(null)

  // Held in a ref rather than closed over: the canvas is built in an
  // effect that must not tear the bed down and lay it out again just
  // because the router object changed identity.
  const router = useRouter()
  const travel = useRef<(href: string) => void>(() => {})
  useEffect(() => {
    travel.current = (href: string) => router.push(href)
  }, [router])

  const [data, setData] = useState<{
    topics: GraphTopic[]
    edges: GraphEdge[]
    subjects: Subject[]
    resources: GraphResource[]
    lessons: GraphLesson[]
    marks: GraphMark[]
  } | null>(null)
  const [selected, setSelected] = useState<string | null>(initialTopic)
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<string | null>(initialSubject)
  const [showDormantOnly, setShowDormantOnly] = useState(false)
  /** Which of the two corner panels is open; opening one closes the other. */
  const [panel, setPanel] = useState<'filters' | 'forces' | null>(null)
  // The replay: `undefined` until the first read of the bed has asked
  // whether anything arrived since the last look. The Animate button
  // sets it to the whole history; finishing, or a stop, clears it.
  const lapse = useRef<Lapse | null | undefined>(undefined)
  const [replays, setReplays] = useState(0)
  const [replaying, setReplaying] = useState(false)
  const clock = useRef<HTMLParagraphElement>(null)
  // The playhead on the activity rule, moved by the replay each frame.
  const playhead = useRef<HTMLSpanElement | null>(null)
  // Whether lines carry a caption for what they claim. A ref as well as
  // state: the canvas paints from the ref and is only asked to redraw.
  const [showRelations, setShowRelations] = useState(false)
  const relationsOn = useRef(false)
  useEffect(() => {
    relationsOn.current = showRelations
    sigma.current?.refresh()
  }, [showRelations])
  useEffect(() => {
    if (!panel) return
    const shut = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(null)
    document.addEventListener('keydown', shut)
    return () => document.removeEventListener('keydown', shut)
  }, [panel])
  // The bed is topics by default. Material and lessons are layers over
  // it, off until asked for, or the planting is unreadable.
  const [showResources, setShowResources] = useState(false)
  const [showLessons, setShowLessons] = useState(false)
  const [showMarks, setShowMarks] = useState(false)
  // The forces, exposed the way Obsidian exposes them: pulling these
  // around is how you find the arrangement that reads for you, and no
  // single default suits every planting. Moving one warms the running
  // bed rather than laying it out again from nothing.
  const [forces, setForces] = useState<Forces>(DEFAULT_FORCES)

  // Sprouting subjects: drawn as outlines over the topics they gather,
  // and the source of the kinship lines kinship pull pulls along. Read
  // only once something asks for them.
  const [showSprouts, setShowSprouts] = useState(initialSprouts)
  const [sprouting, setSprouting] = useState<Sprouting | null>(null)
  const [sproutNote, setSproutNote] = useState<string | null>(null)
  const [chosenSprout, setChosenSprout] = useState<string | null>(null)
  const [sproutReload, setSproutReload] = useState(0)

  // Bumped when the bed changes under us -- grubbing a topic out takes
  // its node and every edge into it, so the planting has to be read
  // again rather than patched.
  const [reload, setReload] = useState(0)

  // What the canvas needs from React state without being rebuilt when
  // it changes: the running layout, the forces it was last told, and
  // what to draw over it.
  const layout = useRef<BedLayout | null>(null)
  const settleNow = useRef<() => void>(() => {})
  const forcesNow = useRef(forces)
  const overlay = useRef<{ show: boolean; sprouting: Sprouting | null; chosen: string | null }>({
    show: false, sprouting: null, chosen: null,
  })

  // The control strip wraps to as many rows as the width needs, and
  // opening the forces adds more. A fixed inset parked the top of the
  // planting under the strip on a phone, so the canvas is told how
  // tall the strip actually is.
  const [controlsHeight, setControlsHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = controls.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setControlsHeight(el.getBoundingClientRect().height)
      sigma.current?.refresh()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The bed is painted rather than styled, so it has to be told which
  // light it is being read under. Changing this redraws it.
  const theme = useTheme()
  const inks = INKS[theme]

  useEffect(() => {
    // One call rather than two: `/api/graph` is this same merge done
    // server-side, and both read `getPlanting`, so they cannot drift.
    void api.graph.read().then(({ ok, body }) => {
      if (ok) setData(body)
    })
  }, [reload])

  // The reading is fetched when something needs it, and named when it
  // comes back with anything unnamed: naming is a model call, so it is
  // asked for only where there is something to name.
  const wantsSprouts = showSprouts || forces.kinshipPull > 0
  // The count for the banner alone: read without naming, so nothing is
  // asked of the model until the outlines are wanted.
  const [sproutCount, setSproutCount] = useState<number | null>(null)
  useEffect(() => {
    if (wantsSprouts) return
    let cancelled = false
    void api.sprouts.read().then(read => {
      if (!cancelled && read.ok) setSproutCount(read.body.sprouts.length)
    })
    return () => {
      cancelled = true
    }
  }, [wantsSprouts, reload, sproutReload])
  useEffect(() => {
    if (!wantsSprouts) return
    let cancelled = false
    void (async () => {
      setSproutNote(current => current ?? 'Reading what is sprouting…')
      const read = await api.sprouts.read()
      if (cancelled) return
      if (!read.ok) {
        setSproutNote(read.error ?? 'Could not read what is sprouting.')
        return
      }
      setSprouting(read.body)
      setSproutCount(read.body.sprouts.length)
      setSproutNote(null)
      if (read.body.keeps && (read.body.unnamed > 0 || read.body.unembedded > 0)) {
        setSproutNote('Naming what is sprouting…')
        const named = await api.sprouts.name()
        if (cancelled) return
        if (named.ok) {
          setSprouting(named.body)
          setSproutCount(named.body.sprouts.length)
        }
        setSproutNote(named.ok ? null : named.error ?? 'Could not name what is sprouting.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [wantsSprouts, reload, sproutReload])

  // Forces first, so on the first render there is no layout yet to
  // warm; the build below reads `forcesNow` for itself.
  useEffect(() => {
    forcesNow.current = forces
    layout.current?.configure(forces)
    settleNow.current()
  }, [forces])

  // Kinship arrives after the bed is drawn, and is handed to the
  // running layout rather than rebuilding it.
  useEffect(() => {
    if (!sprouting) return
    layout.current?.setKinship(kinLinks(sprouting))
    if (forcesNow.current.kinshipPull > 0) settleNow.current()
  }, [sprouting])

  useEffect(() => {
    overlay.current = { show: showSprouts, sprouting, chosen: chosenSprout }
    sigma.current?.refresh()
  }, [showSprouts, sprouting, chosenSprout])

  const colourFor = useCallback(
    (topic: GraphTopic) => {
      const s = data?.subjects.find(x => x.id === topic.primary_subject_id)
      return s?.colour ?? inks.unfiledSeed
    },
    [data, inks.unfiledSeed]
  )

  useEffect(() => {
    if (!data || !holder.current) return

    if (lapse.current === undefined) lapse.current = arrivals(data)
    const run = lapse.current
    // The whole history shows every layer: the replay is of the profile,
    // not of whichever layers were switched on.
    const withResources = showResources || run?.mode === 'history'
    const withLessons = showLessons || run?.mode === 'history'
    const withMarks = showMarks || run?.mode === 'history'

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
    const topicById = new Map(visible.map(t => [t.id, t]))

    // One pass over the lessons, so the ring is cheap to draw.
    const lessonTally = new Map<string, { total: number; worked: number }>()
    for (const lesson of data.lessons) {
      if (!lesson.topic_id) continue
      const tally = lessonTally.get(lesson.topic_id) ?? { total: 0, worked: 0 }
      tally.total += 1
      if (lesson.completed_at) tally.worked += 1
      lessonTally.set(lesson.topic_id, tally)
    }

    // Positions are left at the origin here: `seedBed` places every
    // seed below, once the whole planting -- material included -- is
    // known.
    visible.forEach(t => {
      graph.addNode(t.id, {
        label: t.title,
        // Size by ability: a stronger holding is a larger seed.
        size: nodeSize(t.ability),
        // Dormancy is mixed into the fill itself. Sigma has no alpha
        // attribute, so a separate opacity key renders as nothing.
        color: fade(colourFor(t), nodeFade(t.freshness), inks.ground),
        x: 0,
        y: 0,
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
        color: inks.edge,
        kind: e.kind,
      })
    })

    // --- Material and lessons, when asked for -------------------------
    //
    // Smaller and in ink rather than plate colour: these are not things
    // you know, they are things that touch what you know. A resource
    // reaches into every topic it covers, which is how the canvas shows
    // one paper feeding several subjects at once.
    if (withResources) {
      for (const r of data.resources ?? []) {
        const attached = r.topic_ids.filter(id => visibleIds.has(id))
        if (attached.length === 0) continue

        const nodeId = `resource:${r.id}`
        graph.addNode(nodeId, {
          label: r.title,
          size: 4.5,
          // Read material is inked; unread is outlined by being paler,
          // matching the sheet's own unsown/sown distinction.
          color: r.status === 'consumed' ? inks.resourceRead : inks.resourceUnread,
          x: 0,
          y: 0,
          freshness: 1,
          kindOfThing: 'resource',
          resourceId: r.id,
        })

        for (const topicId of attached) {
          graph.addEdge(nodeId, topicId, {
            size: 0.7,
            color: inks.covers,
            kind: 'covers',
          })
        }
      }
    }

    if (withLessons) {
      for (const l of data.lessons ?? []) {
        if (!visibleIds.has(l.topic_id)) continue

        const nodeId = `lesson:${l.id}`
        graph.addNode(nodeId, {
          label: l.title,
          size: 3.5,
          color: l.completed_at ? inks.lessonWorked : inks.lessonOpen,
          x: 0,
          y: 0,
          freshness: 1,
          kindOfThing: 'lesson',
          lessonId: l.id,
        })

        graph.addEdge(nodeId, l.topic_id, {
          size: 0.6,
          color: inks.teaches,
          kind: 'teaches',
        })
      }
    }

    // Marks. The one layer that draws two kinds of connection, and the
    // reason the layer is worth having: where a mark came from, and
    // what the reader said it was about. A passage kept in a lesson on
    // custody, noted as being about settlement, is a line between two
    // topics that nothing else on the map would ever draw -- it exists
    // only because somebody thought it.
    if (withMarks) {
      for (const m of data.marks ?? []) {
        // Every end a line could be drawn to, and whether any of them
        // is actually on the bed as it is filtered right now.
        const from = m.topic_id && visibleIds.has(m.topic_id) ? m.topic_id : null
        const about = m.topic_ids.filter(id => visibleIds.has(id))
        // A named lesson is a node of its own when the lessons layer
        // is up. With it down the line goes to the topic that lesson
        // teaches instead, so naming a lesson still draws something.
        const aboutLessons = m.lesson_ids.flatMap(id => {
          if (withLessons && graph.hasNode(`lesson:${id}`)) return [`lesson:${id}`]
          const topicId = data.lessons?.find(l => l.id === id)?.topic_id
          return topicId && visibleIds.has(topicId) ? [topicId] : []
        })

        const ends = [...new Set([...(from ? [from] : []), ...about, ...aboutLessons])]
        if (ends.length === 0) continue

        const nodeId = `mark:${m.id}`
        graph.addNode(nodeId, {
          label: m.label,
          size: 3,
          // The catalogue's own colour for a kept passage, the same
          // mustard the wash on the prose uses. A mark with nothing
          // written on it is the paler one: the passage was kept, the
          // thought was not.
          color: m.noted ? inks.markNoted : inks.markPlain,
          x: 0,
          y: 0,
          freshness: 1,
          kindOfThing: 'mark',
          markId: m.id,
          lessonId: m.lesson_id,
        })

        // Where it came from, drawn faint: provenance, not argument.
        if (from) {
          graph.addEdge(nodeId, from, {
            size: 0.6,
            color: inks.marks,
            kind: 'marked in',
          })
        }

        // What it is about, drawn stronger. This is a line the reader
        // asserted rather than one the map inferred, and it should
        // read as the more deliberate of the two.
        for (const end of ends) {
          if (end === from || graph.hasEdge(nodeId, end)) continue
          graph.addEdge(nodeId, end, {
            size: 1,
            color: inks.marksStrong,
            kind: 'about',
          })
        }
      }
    }

    // --- The forces ---------------------------------------------------
    //
    // `core/forces` holds the model and says why it replaced
    // ForceAtlas2; what is here is wiring. Topics are pulled toward the
    // middle of each subject they sit in (never toward each other
    // through invisible edges, which folded a subject into a ring and
    // strung every loose topic onto one ring of its own), along the
    // map's stated relations, and along kinship once it has been read.
    // Material, lessons and marks are carried beside what they touch.
    const bedNodes: BedNode[] = []
    graph.forEachNode((id, attrs) => {
      const topic = topicById.get(id)
      bedNodes.push({
        id,
        radius: attrs.size as number,
        subjects: topic?.subject_ids ?? [],
        satellite: !topic,
      })
    })

    const stated: BedLink[] = data.edges
      .filter(e => visibleIds.has(e.from_topic) && visibleIds.has(e.to_topic))
      .map(e => ({ source: e.from_topic, target: e.to_topic, weight: Number(e.weight) }))

    const attach: BedLink[] = []
    graph.forEachEdge((_edge, attrs, source, target) => {
      if (['covers', 'teaches', 'marked in', 'about'].includes(attrs.kind as string)) {
        attach.push({ source, target, weight: 1 })
      }
    })

    // --- When each thing was made ---------------------------------------
    //
    // A replay lays the bed down in the order it was made, so the bed
    // starts from whatever was already there (nothing, for the whole
    // history; everything older than the last look, for an arrival) and
    // the rest is brought in one by one. Material, lessons and marks
    // come in no earlier than the first topic they hang off, or they
    // would float in with nothing to be beside.
    const stamp = new Map<string, number>()
    const stampOf = (id: string): number | null => {
      if (id.startsWith('resource:')) return when(data.resources.find(r => r.id === id.slice(9))?.created_at)
      if (id.startsWith('lesson:')) return when(data.lessons.find(l => l.id === id.slice(7))?.created_at)
      if (id.startsWith('mark:')) return when(data.marks.find(m => m.id === id.slice(5))?.created_at)
      return when(topicById.get(id)?.created_at)
    }
    const order = [
      ...bedNodes.filter(n => !n.satellite),
      ...['resource:', 'lesson:', 'mark:'].flatMap(k => bedNodes.filter(n => n.id.startsWith(k))),
    ]
    if (run) {
      for (const n of order) {
        let when0 = stampOf(n.id) ?? 0
        if (n.satellite) {
          let earliest = Infinity
          graph.forEachNeighbor(n.id, nb => {
            const t = stamp.get(nb)
            if (t !== undefined) earliest = Math.min(earliest, t)
          })
          if (earliest !== Infinity) when0 = Math.max(when0, earliest)
        }
        stamp.set(n.id, when0)
      }
    }

    const fresh = (ms: number) => (run?.mode === 'arrival' ? ms > run.since : true)
    const comingIn = run ? order.filter(n => fresh(stamp.get(n.id) ?? 0)) : []
    const newSubjects = run ? data.subjects.filter(s => fresh(when(s.created_at) ?? 0)) : []
    const bornAtStart = new Set(
      run ? order.filter(n => !comingIn.includes(n)).map(n => n.id) : bedNodes.map(n => n.id)
    )
    // Subjects with a name on the bed, and since when. `null` is all of
    // them, which is every bed that is not being replayed.
    const subjectsUp: Map<string, number> | null = run
      ? new Map(data.subjects.filter(s => !newSubjects.includes(s)).map(s => [s.id, -Infinity]))
      : null
    const startNodes = run ? bedNodes.filter(n => bornAtStart.has(n.id)) : bedNodes

    seedBed(
      startNodes,
      n => topicById.get(n.id)?.primary_subject_id ?? 'loose',
      n => {
        let anchor: string | null = null
        graph.forEachNeighbor(n.id, neighbour => {
          if (anchor === null && topicById.has(neighbour)) anchor = neighbour
        })
        return anchor
      }
    )

    const kinship = overlay.current.sprouting ? kinLinks(overlay.current.sprouting) : []
    let bed = layBed(startNodes, { stated, attach, kinship }, forcesNow.current)
    const at = new Map(bedNodes.map(n => [n.id, n]))
    // Everything not yet made waits unseen, at the origin.
    const fullSize = new Map<string, number>()
    for (const n of comingIn) {
      fullSize.set(n.id, graph.getNodeAttribute(n.id, 'size') as number)
      graph.mergeNodeAttributes(n.id, { hidden: true, size: 0 })
    }

    // Copy the simulation's positions onto the graph, which is what
    // Sigma draws from and what makes it schedule a frame.
    const place = () => {
      graph.updateEachNodeAttributes(
        (id, attrs) => {
          const n = at.get(id)
          if (n) {
            attrs.x = n.x ?? 0
            attrs.y = n.y ?? 0
          }
          return attrs
        },
        { attributes: ['x', 'y'] }
      )
    }

    // The bed simulates as it opens: seeded evenly, it runs live and
    // cools to rest in a few seconds, so the reader watches each
    // subject draw together. This used to be settled before the first
    // paint, because ForceAtlas2 started from wedges it had to fight
    // its way out of and a half-settled bed left seeds clumped; the
    // seeding here is already even, so there is nothing to hide.
    //
    // Under reduced motion it is still settled first, and a slider
    // settles again at once. Dragging stays live either way: it is a
    // direct response to the hand, which is feedback, not decoration.
    const still = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // An arrival opens on the bed as the last look left it.
    if (still || run?.mode === 'arrival') bed.settle()
    place()
    bed.simulation.on('tick', place)
    layout.current = bed
    settleNow.current = () => {
      if (!still) return
      bed.settle()
      place()
    }

    const renderer = new Sigma(graph, holder.current, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelFont: 'var(--font-text-loaded), sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelColor: { color: inks.label },
      // Sigma hides labels that would collide; a larger grid cell means
      // it hides more of them rather than overprinting into mush.
      labelGridCellSize: 150,
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
      return { ...attrs, color: fade(attrs.color as string, 0.22, inks.ground), label: '' }
    })

    renderer.setSetting('edgeReducer', (edge, attrs) => {
      if (!hovered) return attrs
      const [from, to] = graph.extremities(edge)
      const near = neighboursOf(hovered)
      if (near.has(from) && near.has(to)) {
        return { ...attrs, color: inks.hover, size: (attrs.size as number) * 1.6 }
      }
      return { ...attrs, color: inks.membership }
    })

    renderer.on('enterNode', ({ node }) => {
      hovered = node
      renderer.refresh()
    })

    renderer.on('leaveNode', () => {
      hovered = null
      renderer.refresh()
    })

    // --- Sprouting subjects, drawn over the bed -------------------------
    //
    // A dashed outline around the topics each one gathers, its name in
    // italic above it: outlined and unfilled, because nothing has been
    // sown there. The outlines are kept in screen space as they are
    // drawn, so a press inside one can be told from a press on the bed.
    const sproutShapes = new Map<string, Point[]>()

    const drawSprouts = (context: CanvasRenderingContext2D) => {
      sproutShapes.clear()
      const { show, sprouting: reading, chosen } = overlay.current
      if (!show || !reading) return
      // CSS pixels, as graphToViewport answers in.
      const width = context.canvas.width / (window.devicePixelRatio || 1)

      for (const sprout of reading.sprouts) {
        const points = sprout.topics.flatMap(t => {
          if (!graph.hasNode(t.id)) return []
          const a = graph.getNodeAttributes(t.id)
          return [renderer.graphToViewport({ x: a.x as number, y: a.y as number })]
        })
        // One seed left on the bed after a filter is not a clump.
        if (points.length < 2) continue

        const shape = outline(points, SPROUT_PAD)
        sproutShapes.set(sprout.key, shape)
        const isChosen = chosen === sprout.key

        context.save()
        context.beginPath()
        shape.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)))
        context.closePath()
        if (isChosen) {
          context.fillStyle = inks.sproutWash
          context.fill()
        }
        context.setLineDash([6, 5])
        context.lineWidth = isChosen ? 2.2 : 1.5
        context.strokeStyle = inks.sprout
        context.stroke()

        // The name sits above the outline, kept inside the frame: the
        // camera fits the seeds to the canvas, not the names over them,
        // so an outline along the top edge would print its name off it.
        const name = sprout.title ?? UNNAMED
        const top = Math.min(...shape.map(p => p.y))
        const bottom = Math.max(...shape.map(p => p.y))
        const middle = points.reduce((sum, p) => sum + p.x, 0) / points.length
        context.setLineDash([])
        context.font = `italic 600 15px Georgia, serif`
        context.textAlign = 'center'
        const half = context.measureText(name).width / 2
        const x = Math.min(Math.max(middle, half + 6), width - half - 6)
        const y = top - 6 >= 18 ? top - 6 : bottom + 18
        context.lineJoin = 'round'
        context.lineWidth = 4
        context.strokeStyle = inks.hullEdge
        context.strokeText(name, x, y)
        context.fillStyle = inks.sprout
        context.fillText(name, x, y)
        context.restore()
      }
    }

    // --- What each line claims, printed on it --------------------------
    //
    // Drawn by hand rather than as Sigma edge labels, because the
    // wording runs one way along a line and has to be told which: an
    // arrow turns to follow whichever way the line lies on screen.
    // With a seed hovered only its own lines are captioned.
    const drawRelations = (context: CanvasRenderingContext2D) => {
      if (!relationsOn.current) return
      context.save()
      context.font = `italic 500 11px Georgia, serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.lineJoin = 'round'
      context.lineWidth = 3
      graph.forEachEdge((edge, attrs, source, target, from, to) => {
        const line = edgeLine(attrs.kind as string)
        if (!line || from.hidden || to.hidden) return
        if (hovered && source !== hovered && target !== hovered) return
        const a = renderer.graphToViewport({ x: from.x as number, y: from.y as number })
        const b = renderer.graphToViewport({ x: to.x as number, y: to.y as number })
        const text = a.x <= b.x ? `${line} →` : `← ${line}`
        // Not where it would overprint the seeds at either end.
        if (Math.hypot(b.x - a.x, b.y - a.y) < context.measureText(text).width + 24) return
        const x = (a.x + b.x) / 2
        const y = (a.y + b.y) / 2
        context.strokeStyle = inks.hullEdge
        context.strokeText(text, x, y)
        context.fillStyle = inks.label
        context.fillText(text, x, y)
      })
      context.restore()
    }

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
      const context = renderer.getCanvases().labels.getContext('2d')
      if (!context) return

      drawSprouts(context)
      drawRelations(context)

      const ratio = renderer.getCamera().ratio
      // Below this the seed labels carry the sheet; above it they have
      // thinned out and the bed names take over.
      // The whole history is read at one zoom, with the names up.
      const strength = run?.mode === 'history'
        ? 1
        : Math.min(1, Math.max(0, (ratio - 0.9) / 0.6))
      // Zoomed in the names do not go: they sit back, fainter, and
      // grow, so a bed is still named when only a corner of it is in
      // frame.
      const presence = 0.22 + 0.78 * strength
      const grow = Math.min(3, Math.max(1, 1 / Math.sqrt(ratio)))

      // CSS pixels, not device pixels: positions from graphToViewport
      // are in the same space.
      const width = context.canvas.width / (window.devicePixelRatio || 1)
      const height = context.canvas.height / (window.devicePixelRatio || 1)

      // Mean position of each bed's members, in screen coordinates.
      const centres = new Map<string, { x: number; y: number; n: number }>()
      graph.forEachNode((node, attrs) => {
        const subjectId = subjectOf.get(node)
        if (!subjectId || attrs.hidden) return
        const p = renderer.graphToViewport({ x: attrs.x as number, y: attrs.y as number })
        const acc = centres.get(subjectId) ?? { x: 0, y: 0, n: 0 }
        centres.set(subjectId, { x: acc.x + p.x, y: acc.y + p.y, n: acc.n + 1 })
      })

      context.save()
      context.textAlign = 'center'
      for (const [subjectId, acc] of centres) {
        const subject = data.subjects.find(s => s.id === subjectId)
        if (!subject || acc.n === 0) continue
        // A subject comes up with its first seed, and fades in.
        const since = subjectsUp ? subjectsUp.get(subjectId) : -Infinity
        if (since === undefined) continue
        // Fixed screen size, not scaled by zoom: a name that grows as
        // you pull back ends up filling the frame and overprinting its
        // neighbours. Bigger beds get a slightly larger name, and the
        // whole scale comes down on a narrow canvas where a desktop
        // size would be wider than the bed it names.
        const narrow = Math.min(1, width / 900)
        const size = (16 + Math.min(acc.n, 12) * 1.1) * (0.62 + narrow * 0.38) * grow
        context.font = `600 ${size}px Georgia, serif`
        context.globalAlpha = Math.min(1, (performance.now() - since) / 700) * presence
        context.fillStyle = fade(subject.colour, hullFade(1), inks.ground)
        // A paper halo so a name over a dense bed stays readable.
        context.lineWidth = size * 0.28
        context.strokeStyle = inks.hullEdge
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
        // Held inside the frame as well as across it.
        const y = Math.min(Math.max(acc.y / acc.n - size * 1.4, size + 4), height - size)
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
          context.strokeStyle = i < worked ? inks.routeWorked : inks.routeLeft
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
      // Material, lessons and marks open where they live; only topics
      // get the panel, which reads topic detail.
      if (node.startsWith('lesson:')) {
        // Turned through the router rather than loaded again: the bed
        // is a heavy sheet to rebuild for a press that is a link.
        travel.current(`/lesson/${node.slice('lesson:'.length)}`)
        return
      }
      if (node.startsWith('mark:')) {
        // A mark is read where it was taken. The lesson sheet stands
        // the marks beside the reading, with this one in the list.
        const held = data.marks?.find(m => m.id === node.slice('mark:'.length))
        if (held) travel.current(`/lesson/${held.lesson_id}`)
        return
      }
      if (node.startsWith('resource:')) return
      setChosenSprout(null)
      setSelected(node)
    })

    // A press on open ground inside a sprout's outline opens that
    // sprout; anywhere else closes whatever was open.
    renderer.on('clickStage', ({ event }) => {
      const hit = [...sproutShapes].find(([, shape]) => contains(shape, { x: event.x, y: event.y }))
      setSelected(null)
      setChosenSprout(hit ? hit[0] : null)
    })

    // --- Dragging -------------------------------------------------------
    //
    // A held seed is pinned where the hand is, and the bed stays warm
    // while it is held, so its neighbours make way and settle again
    // around wherever it is dropped.
    let dragging: string | null = null

    renderer.on('downNode', ({ node }) => {
      dragging = node
      graph.setNodeAttribute(node, 'highlighted', true)
      const n = at.get(node)
      bed.pin(node, n?.x ?? 0, n?.y ?? 0)
    })

    renderer.on('moveBody', ({ event }) => {
      if (!dragging) return
      const position = renderer.viewportToGraph(event)
      bed.pin(dragging, position.x, position.y)
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
      bed.release(dragging)
      dragging = null
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

    // --- The replay -------------------------------------------------------
    //
    // Births come off a clock stretched from real time (see
    // `core/timelapse`). Each batch is added to the simulation and the
    // bed is laid out again around what is there, warm rather than from
    // nothing, so the beds grow and shift as seeds arrive instead of
    // being redrawn. A seed is born beside what it hangs off.
    let frame = 0
    if (run && (comingIn.length > 0 || newSubjects.length > 0)) {
      const arriving = run.mode === 'arrival'
      const births: Birth[] = [
        ...comingIn.map(n => ({ id: n.id, at: stamp.get(n.id) ?? 0 })),
        ...newSubjects.map(s => ({ id: `subject:${s.id}`, at: when(s.created_at) ?? 0 })),
      ]
      const plan = arriving
        ? timeline(births, 4000, { min: 350, max: 700 })
        : timeline(births, HISTORY_MS)
      const queue = [...births].sort((a, b) => plan.at.get(a.id)! - plan.at.get(b.id)!)
      const realAt = new Map(births.map(b => [b.id, b.at]))
      const born = new Set(bornAtStart)
      const growing = new Map<string, number>()
      let next = 0
      let golden = 0
      let lastBatch = performance.now()
      const t0 = performance.now()
      const head = playhead.current
      const year = days.length ? Date.parse(days[0].day) : null
      if (head) head.style.opacity = '1'

      // The date the clock has reached, run smoothly between births:
      // the last one's real time to the next one's, by how far through
      // the gap playback is.
      const dateAt = (t: number, i: number) => {
        const a = queue[Math.max(0, i - 1)]
        const b = queue[Math.min(queue.length - 1, i)]
        const ta = plan.at.get(a.id)!
        const tb = plan.at.get(b.id)!
        const f = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1
        return realAt.get(a.id)! + (realAt.get(b.id)! - realAt.get(a.id)!) * f
      }

      const movePlayhead = (t: number) => {
        if (!head || year === null) return
        const day = Math.min(days.length - 1, Math.max(0, (dateAt(t, next) - year) / 86_400_000))
        // One day is a `--pitch` (4px) and a stem is 2px wide.
        head.style.left = `${day * 4 + 1}px`
        // Keep it in view on a strip that scrolls.
        const scroller = head.closest<HTMLElement>('[role="button"]')
        if (scroller) {
          const pad = 48
          const over = head.getBoundingClientRect().right - scroller.getBoundingClientRect().right + pad
          const under = scroller.getBoundingClientRect().left - head.getBoundingClientRect().left + pad
          if (over > 0) scroller.scrollLeft += over
          else if (under > 0) scroller.scrollLeft -= under
        }
      }
      const camera = renderer.getCamera()

      // Beside what it hangs off: a neighbour already born, or failing
      // that a seed of the same subject, or failing that the middle.
      const settleBeside = (n: BedNode) => {
        const near: BedNode[] = []
        graph.forEachNeighbor(n.id, nb => {
          const m = at.get(nb)
          if (m && born.has(nb)) near.push(m)
        })
        if (near.length === 0) {
          for (const m of bedNodes) {
            if (born.has(m.id) && !m.satellite && m.subjects.some(s => n.subjects.includes(s))) near.push(m)
          }
        }
        const mean = (key: 'x' | 'y') =>
          near.length ? near.reduce((sum, m) => sum + (m[key] ?? 0), 0) / near.length : 0
        golden += 2.399963
        const reach = SPACING * (n.satellite ? 0.5 : 0.8)
        n.x = mean('x') + Math.cos(golden) * reach
        n.y = mean('y') + Math.sin(golden) * reach
        n.vx = 0
        n.vy = 0
      }

      const adopt = () => {
        bed.simulation.on('tick', null)
        bed.simulation.stop()
        const warm = layBed(
          bedNodes.filter(n => born.has(n.id)),
          { stated, attach, kinship },
          forcesNow.current
        )
        // Gently: a fresh simulation starts at full heat, which would
        // throw the whole bed about for every seed that arrives.
        warm.simulation.alpha(0.35)
        warm.simulation.on('tick', place)
        bed = warm
        layout.current = warm
      }

      const finish = () => {
        if (head) head.style.opacity = '0'
        lapse.current = null
        setReplaying(false)
        bed.simulation.alpha(Math.max(bed.simulation.alpha(), 0.5))
        if (arriving) camera.animatedReset({ duration: 900 })
      }

      const step = (now: number) => {
        const t = now - t0
        const batch: BedNode[] = []
        while (next < queue.length && plan.at.get(queue[next].id)! <= t) {
          const id = queue[next++].id
          if (id.startsWith('subject:')) {
            subjectsUp?.set(id.slice(8), now)
            continue
          }
          batch.push(at.get(id)!)
        }

        if (batch.length > 0) {
          for (const n of batch) {
            settleBeside(n)
            born.add(n.id)
            growing.set(n.id, now)
            graph.setNodeAttribute(n.id, 'hidden', false)
          }
          adopt()
          place()
          lastBatch = now
          const date = realAt.get(queue[next - 1].id)
          if (clock.current && date) {
            clock.current.textContent = new Date(date).toLocaleDateString('en-GB', {
              month: 'short', year: 'numeric',
            })
          }
          if (arriving) {
            // Close on what has just come in, and follow it.
            const shown = renderer.getNodeDisplayData(batch[batch.length - 1].id)
            if (shown) camera.animate({ x: shown.x, y: shown.y, ratio: 0.35 }, { duration: 600 })
          }
        }

        for (const [id, since] of growing) {
          const p = Math.min(1, (now - since) / GROW_MS)
          graph.setNodeAttribute(id, 'size', fullSize.get(id)! * (1 - (1 - p) ** 3))
          if (p === 1) growing.delete(id)
        }
        movePlayhead(t)
        renderer.refresh()

        const done = next >= queue.length && growing.size === 0
        // After the last arrival the camera holds a moment before it
        // pulls back out.
        if (done && now - lastBatch >= (arriving ? 1400 : 700)) {
          finish()
          return
        }
        frame = requestAnimationFrame(step)
      }

      setReplaying(true)
      frame = requestAnimationFrame(step)
    } else if (run) {
      // Nothing to play, so nothing to wait for.
      lapse.current = null
    }

    sigma.current = renderer
    return () => {
      cancelAnimationFrame(frame)
      if (playhead.current) playhead.current.style.opacity = '0'
      bed.simulation.on('tick', null)
      bed.simulation.stop()
      layout.current = null
      settleNow.current = () => {}
      renderer.kill()
      sigma.current = null
    }
    // `inks` is in the list because the bed is painted rather than
    // styled: a reader switching to dark gets the whole thing drawn
    // again, which is the only way a canvas can follow a theme. The
    // forces are not: moving one warms the running bed instead.
  }, [data, query, subject, showDormantOnly, showResources, showLessons, showMarks, colourFor, inks, theme, replays, days])

  const selectedTopic = data?.topics.find(t => t.id === selected) ?? null
  const chosen = sprouting?.sprouts.find(s => s.key === chosenSprout) ?? null
  const active = data?.topics.filter(t => t.state === 'active').length ?? 0

  return (
    <div
      className={styles.frame}
      style={days.length > 0 ? ({ '--year-h': '2.25rem' } as React.CSSProperties) : undefined}
    >
      <div className={styles.controls} ref={controls}>
        <SheetNav current="bed" hideHere />
        <div className={styles.headRow}>
          <h1 className={styles.title}>The Bed</h1>
          <BannerFigures
            lines={
              data
                ? [
                    `${active} ${active === 1 ? 'topic' : 'topics'} · ${data.subjects.length} ${data.subjects.length === 1 ? 'subject' : 'subjects'}`,
                    sproutCount === null
                      ? ''
                      : `${sproutCount} sprouting`,
                  ].filter(Boolean)
                : [<Slug key="a" w="12rem" band />]
            }
          />
        </div>
        {wantsSprouts && sproutNote && <p className={styles.sproutNote}>{sproutNote}</p>}
      </div>

      {days.length > 0 && (
        <div
          className={styles.year}
          style={controlsHeight ? ({ '--controls-height': `${controlsHeight}px` } as React.CSSProperties) : undefined}
        >
          <ActivityRule
            days={days}
            colours={Object.fromEntries((data?.subjects ?? []).map(s => [s.id, s.colour]))}
            onPlayhead={el => { playhead.current = el }}
          />
        </div>
      )}

      <div className={styles.tools} style={controlsHeight ? ({ '--controls-height': `${controlsHeight}px` } as React.CSSProperties) : undefined}>
        <div className={styles.tool}>
          <button
            type="button"
            className={styles.glyphButton}
            onClick={() => setPanel(p => (p === 'filters' ? null : 'filters'))}
            aria-expanded={panel === 'filters'}
            aria-label="Filters"
            title="Filters"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M4 5h16l-6 8v6l-4-2v-4Z" />
            </svg>
          </button>
          {panel === 'filters' && (
        <div className={`${styles.popover} ${styles.filters}`}>
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

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showMarks}
                  onChange={e => setShowMarks(e.target.checked)}
                />
                Marks
              </label>

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showRelations}
                  onChange={e => setShowRelations(e.target.checked)}
                />
                Relationships
              </label>

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={showSprouts}
                  onChange={e => {
                    setShowSprouts(e.target.checked)
                    if (!e.target.checked) setChosenSprout(null)
                  }}
                />
                Sprouting
              </label>
            </div>
          )}
        </div>
        <div className={styles.tool}>
          <button
            type="button"
            className={styles.glyphButton}
            onClick={() => setPanel(p => (p === 'forces' ? null : 'forces'))}
            aria-expanded={panel === 'forces'}
            aria-label="Forces"
            title="Forces"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M4 7h16M4 12h16M4 17h16" />
              <circle cx="9" cy="7" r="2" />
              <circle cx="15" cy="12" r="2" />
              <circle cx="8" cy="17" r="2" />
            </svg>
          </button>
          {panel === 'forces' && (
          <div className={styles.popover} data-wide>
                {FORCE_CONTROLS.map(control => (
                  <label key={control.key} className={styles.force}>
                    <span className={styles.forceLabel}>{control.label}</span>
                    <input
                      type="range" min={0} max={control.max} step={control.step}
                      value={forces[control.key]}
                      onChange={e => {
                        const value = +e.target.value
                        setForces(current => ({ ...current, [control.key]: value }))
                      }}
                    />
                    <span className={styles.forceValue}>{forces[control.key].toFixed(1)}</span>
                  </label>
                ))}
                {/* Subjects let go and kinship taken up: whatever clumps
                    now is clumping because the material puts it together. */}
                <button
                  className={styles.forcesToggle}
                  onClick={() => setForces(KINSHIP_FORCES)}
                >
                  By kinship
                </button>
                <button
                  className={styles.forcesToggle}
                  onClick={() => setForces(DEFAULT_FORCES)}
                >
                  Reset
                </button>
              </div>
          )}
        </div>
        <div className={styles.tool}>
          <button
            type="button"
            className={styles.glyphButton}
            onClick={() => {
              lapse.current = replaying ? null : { mode: 'history' }
              setReplaying(!replaying)
              setReplays(n => n + 1)
              setPanel(null)
            }}
            aria-pressed={replaying}
            aria-label={replaying ? 'Stop the replay' : 'Animate the bed'}
            title={replaying ? 'Stop the replay' : 'Animate the bed from its first seed'}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              {replaying ? <path d="M7 6h3v12H7zM14 6h3v12h-3z" /> : <path d="M8 5v14l11-7Z" />}
            </svg>
          </button>
        </div>
      </div>

      {replaying && <p className={styles.clock} ref={clock} aria-hidden="true" />}

      <div
        ref={holder}
        className={styles.canvas}
        style={controlsHeight
          ? ({ '--controls-height': `${controlsHeight}px` } as React.CSSProperties)
          : undefined}
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
          onFiled={() => setReload(n => n + 1)}
        />
      )}

      {!selectedTopic && chosen && (
        <SproutPanel
          key={chosen.key}
          sprout={chosen}
          onClose={() => setChosenSprout(null)}
          onPlanted={() => {
            setChosenSprout(null)
            // A new subject moves hulls and inks, so the bed is read
            // again; the reading is too, since this one is now a bed.
            setReload(n => n + 1)
          }}
          onDismissed={() => {
            setChosenSprout(null)
            setSproutReload(n => n + 1)
          }}
        />
      )}
    </div>
  )
}

/** The reading's kinship lines as the simulation takes them. */
function kinLinks(reading: Sprouting): BedLink[] {
  return reading.kinship.map(([source, target, weight]) => ({ source, target, weight }))
}

function TopicPanel({
  topic,
  colour,
  onClose,
  onRemoved,
  onFiled,
}: {
  topic: GraphTopic
  colour: string
  onClose: () => void
  /** The bed has to be read again: the node and its edges are gone. */
  onRemoved: () => void
  /** The bed has to be read again: the node has joined a hull and takes
   *  that subject's ink. */
  onFiled: () => void
}) {
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [filing, setFiling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function grub() {
    setBusy(true)
    setError(null)

    const { ok, error: failed } = await api.topics.remove(topic.id)
    if (ok) {
      onRemoved()
    } else {
      setError(failed ?? 'Could not grub that out.')
      setBusy(false)
    }
  }
  const [detail, setDetail] = useState<{
    exposures: Array<{ id: string; reason: string; created_at: string; depth: string }>
    resources: Array<{ relevance: number; resources: { title: string; status: string } }>
    edges: Array<{ from_topic: string; to_topic: string; kind: string }>
    subjects: Array<{ id: string; title: string }>
    nearby: LooseClaim[]
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
    void api.topics.get(topic.id).then(({ ok, body }) => {
      if (ok && !cancelled) setDetail(body)
    })
    return () => {
      cancelled = true
    }
  }, [topic.id])

  const viability = Math.max(0, Math.round(((topic.ability - 1) / 4) * 100))
  const vague = vagueFigure(topic.ability_confidence)

  /**
   * File it where the bed says, without leaving the bed.
   *
   * This panel is the one surface where the fault is actually visible:
   * an unfiled topic is drawn pale, hanging off a coloured hull it is
   * joined to five times over, and until now the only thing the panel
   * could do about that was send you to another sheet. The read is
   * re-run rather than patched, because filing a topic moves the hull
   * it is drawn inside and the ink it is drawn in.
   */
  async function fileWhereItLooks(claim: LooseClaim) {
    setFiling(true)
    setError(null)

    const { ok, error: failed } = await api.subjects.fileTopic(claim.subjectId, topic.id)
    if (ok) {
      onFiled()
    } else {
      setError(failed ?? `Could not file it under ${claim.subjectTitle}.`)
      setFiling(false)
    }
  }

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
                <span title={r.resources.title}>{r.resources.title}</span>
                <span className={styles.recordDate}>{r.resources.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filed under nothing, and the bed has an opinion about it. The
          panel is where this is worth saying most: the node in front of
          the reader is the pale one hanging off the hull. */}
      {detail && detail.subjects.length === 0 && detail.nearby.length > 0 && (
        <section className={styles.panelBlock}>
          <h3 className={styles.panelBlockTitle}>Filed under nothing</h3>
          <WhereItLooks
            claims={detail.nearby}
            onFile={fileWhereItLooks}
            busy={filing || busy}
            tone="block"
          />
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

/**
 * A sprouting subject, opened from its outline on the bed.
 *
 * Says what it is, why, and on what evidence -- the counts first, since
 * they are the reasoning -- and offers the two presses the sheet does.
 * The whole list lives on `/sprouting`; this is the one in front of you.
 */
function SproutPanel({
  sprout,
  onClose,
  onPlanted,
  onDismissed,
}: {
  sprout: SproutView
  onClose: () => void
  onPlanted: () => void
  onDismissed: () => void
}) {
  const [planted, setPlanted] = useState<string | null>(null)

  return (
    <aside className={styles.panel}>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        Close
      </button>

      <div className={styles.sproutPlate} aria-hidden="true" />

      <p className={styles.sproutKind}>
        Sprouting · {kindLine(sprout)}
      </p>
      <h2 className={`${styles.panelTitle} ${styles.sproutTitle}`}>
        {sprout.title ?? UNNAMED}
      </h2>

      {sprout.why && <p className={styles.sproutWhy}>{sprout.why}</p>}
      <p className={styles.caveat}>{sprout.evidence}</p>

      <section className={styles.panelBlock}>
        <h3 className={styles.panelBlockTitle}>Topics</h3>
        <ul className={styles.record}>
          {sprout.topics.map(t => (
            <li key={t.id}>
              <a href={`/topics/${t.id}`}>{t.title}</a>
              <span className={styles.recordDate}>
                {t.core ? 'at its heart' : t.loose ? 'loose' : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {sprout.material.length > 0 && (
        <section className={styles.panelBlock}>
          <h3 className={styles.panelBlockTitle}>Held together by</h3>
          <ul className={styles.record}>
            {sprout.material.map(m => (
              <li key={m.id}>
                <span title={m.title}>{m.title}</span>
                <span className={styles.recordDate}>{m.read ? 'read' : 'unread'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.panelBlock}>
        {planted ? (
          <p className={styles.caveat}>{planted}</p>
        ) : (
          <SproutActions
            sprout={sprout}
            onPlanted={p => {
              setPlanted(p.note)
              onPlanted()
            }}
            onDismissed={onDismissed}
          />
        )}
      </section>

      <div className={styles.panelFoot}>
        <a className={styles.tend} href="/sprouting">
          Everything sprouting
        </a>
      </div>
    </aside>
  )
}
