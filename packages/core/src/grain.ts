/**
 * How big a topic is, and how far this reader is from where they want
 * to take it.
 *
 * Two figures and one rule. **Inherent complexity** (C) is a topic's
 * own hours from nothing to ability 3, estimated from signals that do
 * not depend on the reader: how deep its prerequisites run and how much
 * has been written about it alone. **Applied complexity** (H) is this
 * reader's hours from where they are to where they want to be, and it
 * moves every time evidence lands. The rule: how big a topic *looks* --
 * its lesson budget, whether it reads as lesson-, topic- or
 * subject-sized -- comes from H on read, like freshness, and never
 * changes what the topic *is*. Identity changes only by the reader's
 * hand.
 *
 * Pure, and here, because the phone prints the same figures and a
 * figure computed two ways is two different maps. The design, and why it
 * departs from its brief, is
 * `docs/superpowers/specs/2026-09-27-grain-and-complexity-design.md`.
 */

import { config, GRAIN } from './config'

/* ------------------------------------------------------ inherent: C */

/** An edge as grain reads it. */
export interface GrainEdge {
  from: string
  to: string
  kind: string
  /** `ai`, `user` or `skeleton`: who drew it. */
  createdBy: string
}

/** What the longest prerequisite chain under a topic is made of. */
export interface PrereqDepth {
  /** Weighted length: the reader's edges count 1, the model's 0.5. */
  depth: number
  byReader: number
  byModel: number
}

/** One term of `log C`, kept so the figure can explain itself. */
export type Contribution =
  | { signal: 'base'; log: number; hours: number }
  | { signal: 'prereq'; log: number; depth: PrereqDepth }
  | { signal: 'material'; log: number; words: number }

export interface Inherent {
  /** Hours from nothing to ability 3. */
  hours: number
  /** Uncertainty on the log scale. */
  logSd: number
  /** Their `log` values sum to `ln(hours)`. */
  contributions: Contribution[]
}

/**
 * The longest chain of `prereq` edges into each topic, weighted by who
 * drew each edge.
 *
 * A prerequisite edge points from the topic to learn first to the one
 * that needs it. Model-drawn edges can loop, so an edge that would close
 * a cycle is skipped; topics are visited in id order so the same map
 * always gives the same answer. No transitive reduction is needed: a
 * shortcut edge is never on a longest path.
 */
export function prerequisiteDepths(topicIds: readonly string[], edges: readonly GrainEdge[]): Map<string, PrereqDepth> {
  const ids = new Set(topicIds)
  const into = new Map<string, Array<{ from: string; weight: number; byReader: boolean }>>()
  for (const e of edges) {
    if (e.kind !== 'prereq' || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue
    const weight = GRAIN.EDGE_WEIGHT[e.createdBy] ?? GRAIN.EDGE_WEIGHT.ai
    const held = into.get(e.to) ?? []
    held.push({ from: e.from, weight, byReader: e.createdBy !== 'ai' })
    into.set(e.to, held)
  }
  for (const held of into.values()) held.sort((a, b) => a.from.localeCompare(b.from))

  const done = new Map<string, PrereqDepth>()
  const visiting = new Set<string>()
  const none: PrereqDepth = { depth: 0, byReader: 0, byModel: 0 }

  const depthOf = (id: string): PrereqDepth => {
    const known = done.get(id)
    if (known) return known
    visiting.add(id)
    let best = none
    for (const edge of into.get(id) ?? []) {
      if (visiting.has(edge.from)) continue
      const below = depthOf(edge.from)
      const here = {
        depth: below.depth + edge.weight,
        byReader: below.byReader + (edge.byReader ? 1 : 0),
        byModel: below.byModel + (edge.byReader ? 0 : 1),
      }
      if (here.depth > best.depth + 1e-9 || (Math.abs(here.depth - best.depth) <= 1e-9 && here.byReader > best.byReader)) {
        best = here
      }
    }
    visiting.delete(id)
    done.set(id, best)
    return best
  }

  for (const id of [...ids].sort()) depthOf(id)
  return done
}

/**
 * C for one topic, from its signals. `log C` is the base plus one term
 * per signal, and each term is kept.
 */
export function inherentHours(signals: { prereq: PrereqDepth; words: number }): Inherent {
  const contributions: Contribution[] = [
    { signal: 'base', log: Math.log(GRAIN.BASE_HOURS), hours: GRAIN.BASE_HOURS },
  ]
  const levels = Math.min(signals.prereq.depth, GRAIN.PREREQ_CAP)
  if (levels > 0) contributions.push({ signal: 'prereq', log: GRAIN.PREREQ_STEP * levels, depth: signals.prereq })
  const words = Math.max(0, Math.min(signals.words, GRAIN.MATERIAL_CAP))
  if (words > 0) {
    contributions.push({
      signal: 'material',
      log: GRAIN.MATERIAL_STEP * Math.log(1 + words / GRAIN.MATERIAL_SCALE),
      words: Math.round(signals.words),
    })
  }
  const log = contributions.reduce((sum, c) => sum + c.log, 0)
  return { hours: Math.exp(log), logSd: GRAIN.PRIOR_LOG_SD, contributions }
}

/** C for every topic on the map. `focusedWords`: words of readable
 *  material filed under that topic and no other. */
export function inherentComplexity(input: {
  topicIds: readonly string[]
  edges: readonly GrainEdge[]
  focusedWords: ReadonlyMap<string, number>
}): Map<string, Inherent> {
  const depths = prerequisiteDepths(input.topicIds, input.edges)
  const out = new Map<string, Inherent>()
  for (const id of input.topicIds) {
    out.set(id, inherentHours({
      prereq: depths.get(id) ?? { depth: 0, byReader: 0, byModel: 0 },
      words: input.focusedWords.get(id) ?? 0,
    }))
  }
  return out
}

/**
 * The varieties under a topic: everything its `specialises` edges lead
 * to, however far down, each once. A specialisation edge points from the
 * broader topic to its variety.
 */
export function varietiesOf(topicId: string, edges: readonly GrainEdge[]): string[] {
  const below = new Map<string, string[]>()
  for (const e of edges) {
    if (e.kind !== 'specialises' || e.from === e.to) continue
    const held = below.get(e.from) ?? []
    held.push(e.to)
    below.set(e.from, held)
  }
  const seen = new Set<string>([topicId])
  const found: string[] = []
  const stack = [...(below.get(topicId) ?? [])].sort().reverse()
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    found.push(id)
    for (const next of [...(below.get(id) ?? [])].sort().reverse()) stack.push(next)
  }
  return found
}

/* ------------------------------------------------------- applied: H */

/** Roots, on the ability scale. Roots of nought is the floor. */
export function rootsAsAbility(roots: number): number {
  return Math.min(5, Math.max(1, roots))
}

export interface StartingPoint {
  /** a₀ on the 1–5 scale. */
  level: number
  /** Where it came from. */
  from: 'ability' | 'roots' | 'blend'
  /** The share of it that is the topic's own figure. */
  weight: number
}

/**
 * Where this reader starts from on a topic. The topic's own ability,
 * blended toward the subject's roots while it is not yet trusted
 * (confidence under `CONFIDENT_ENOUGH`), in proportion to how far it
 * has got there.
 */
export function startingPoint(input: { ability: number; confidence: number; roots: number | null }): StartingPoint {
  const weight = Math.min(1, Math.max(0, input.confidence) / config.CONFIDENT_ENOUGH)
  if (input.roots === null || weight >= 1) return { level: input.ability, from: 'ability', weight: 1 }
  const rooted = rootsAsAbility(input.roots)
  if (weight <= 0) return { level: rooted, from: 'roots', weight: 0 }
  return { level: weight * input.ability + (1 - weight) * rooted, from: 'blend', weight }
}

/** A subject as the target reads it. */
export interface TargetSource {
  id: string
  title: string
  target: number | null
  roots: number | null
}

export interface Target {
  level: number
  from: 'topic' | 'subject' | 'assumed'
  /** The subject it came from, for `from: 'subject'`. */
  subject: { id: string; title: string } | null
  /** The roots a₀ leans on while the figure is unsure. */
  roots: number | null
}

/**
 * Where the reader wants to take a topic. Its own target first; else the
 * highest among the subjects it sits in, since wanting to go that far in
 * one of them is wanting to go that far; else a working knowledge. The
 * roots come with it from the same subject -- or, for a target set on
 * the topic, from whichever of its subjects the reader knew best.
 */
export function targetFor(topicTarget: number | null, subjects: readonly TargetSource[]): Target {
  const rootsKnown = subjects.map(s => s.roots).filter((r): r is number => r !== null)
  const bestRoots = rootsKnown.length > 0 ? Math.max(...rootsKnown) : null
  if (topicTarget !== null) return { level: topicTarget, from: 'topic', subject: null, roots: bestRoots }

  const aimed = subjects
    .filter((s): s is TargetSource & { target: number } => s.target !== null)
    .sort((a, b) => b.target - a.target || a.title.localeCompare(b.title))[0]
  if (aimed) return { level: aimed.target, from: 'subject', subject: { id: aimed.id, title: aimed.title }, roots: aimed.roots }
  return { level: GRAIN.DEFAULT_TARGET, from: 'assumed', subject: null, roots: bestRoots }
}

/**
 * Hours from ability `from` to ability `to` for a topic of inherent
 * complexity `c` (its hours from 1 to 3). Each level costs
 * `COST_RATIO` times the one before; integrating r^a gives the closed
 * form, so any two fractional levels work.
 */
export function hoursBetween(c: number, from: number, to: number, r: number = GRAIN.COST_RATIO): number {
  if (!(to > from) || !(c > 0)) return 0
  return (c * (r ** to - r ** from)) / (r ** 3 - r ** 1)
}

/** Lessons for so many hours. */
export function lessonsFor(hours: number): number {
  return hours > 1e-9 ? Math.ceil(hours / GRAIN.LESSON_HOURS - 1e-9) : 0
}

export type DisplayGrain = 'at-target' | 'lesson' | 'topic' | 'subject'

/**
 * How big a topic reads for this reader, from its span's lessons. Given
 * the state it was last shown in, a topic that was subject-sized stays
 * so until it falls below `SUBJECT_LIKE_LEAVE`: a band, so one on the
 * line does not flip.
 */
export function displayGrain(lessons: number, previous?: DisplayGrain | null): DisplayGrain {
  if (lessons <= 0) return 'at-target'
  if (lessons === 1) return 'lesson'
  const enter = GRAIN.SUBJECT_LIKE_ENTER
  const leave = GRAIN.SUBJECT_LIKE_LEAVE
  if (lessons > enter) return 'subject'
  if (previous === 'subject' && lessons >= leave) return 'subject'
  return 'topic'
}

/** The lessons a route through the topic is drafted to, and the range
 *  the drafting model may stray into with a reason. */
export function routeBudget(lessons: number): { lessons: number; low: number; high: number } {
  const budget = Math.min(GRAIN.BUDGET_MAX, Math.max(GRAIN.BUDGET_MIN, lessons))
  return {
    lessons: budget,
    low: Math.max(1, Math.floor(budget * (1 - GRAIN.BUDGET_SLACK))),
    high: Math.ceil(budget * (1 + GRAIN.BUDGET_SLACK)),
  }
}

/* ------------------------------------------------------ the figure */

/** Everything the topic sheet says about effort, computed on read. */
export interface TopicEffort {
  /** H: hours from where the reader is to their target. */
  hours: number
  lessons: number
  grain: DisplayGrain
  start: StartingPoint
  target: Target
  inherent: Inherent
  /** The topic with its varieties, where it has any. */
  span: { hours: number; lessons: number; varieties: number } | null
  /** True while the figure should print as a guess. */
  about: boolean
}

/**
 * The whole reading for one topic: C, the reader's start and target,
 * H, its lessons, and how big it reads. `varieties` are the inherent
 * figures of the topics under it, with the reader's own start on each.
 */
export function topicEffort(input: {
  inherent: Inherent
  ability: number
  confidence: number
  target: Target
  varieties?: ReadonlyArray<{ inherent: Inherent; ability: number; confidence: number }>
  previous?: DisplayGrain | null
}): TopicEffort {
  const start = startingPoint({ ability: input.ability, confidence: input.confidence, roots: input.target.roots })
  const hours = hoursBetween(input.inherent.hours, start.level, input.target.level)
  const lessons = lessonsFor(hours)

  const varieties = input.varieties ?? []
  let span: TopicEffort['span'] = null
  if (varieties.length > 0) {
    const below = varieties.reduce((sum, v) => {
      const from = startingPoint({ ability: v.ability, confidence: v.confidence, roots: input.target.roots })
      return sum + hoursBetween(v.inherent.hours, from.level, input.target.level)
    }, 0)
    span = { hours: hours + below, lessons: lessonsFor(hours + below), varieties: varieties.length }
  }

  return {
    hours,
    lessons,
    grain: displayGrain(span ? span.lessons : lessons, input.previous),
    start,
    target: input.target,
    inherent: input.inherent,
    span,
    about: input.inherent.logSd > GRAIN.ABOUT_LOG_SD || input.confidence < config.CONFIDENT_ENOUGH,
  }
}

/** A bed's effort to its target, as the subject sheet prints it. */
export interface SubjectEffort {
  hours: number
  lessons: number
  about: boolean
  /** Topics already at their target. */
  atTarget: number
  /** Topics it was added up from. */
  topics: number
  /** The target set on the subject; null where it is assumed. */
  target: number | null
}

/** A subject's effort to its target: its topics' own hours, each once. */
export function subjectEffort(efforts: readonly TopicEffort[]): { hours: number; lessons: number; about: boolean; atTarget: number } {
  const hours = efforts.reduce((sum, e) => sum + e.hours, 0)
  return {
    hours,
    lessons: efforts.reduce((sum, e) => sum + e.lessons, 0),
    about: efforts.some(e => e.about),
    atTarget: efforts.filter(e => e.lessons === 0).length,
  }
}

/* ---------------------------------------------------------- words */

/** What a target level is called where a reader chooses it. */
export const TARGET_LABEL: Record<number, string> = {
  2: 'the basics',
  3: 'a working knowledge',
  4: 'fluent',
  5: 'mastery',
}

/** The levels a reader can aim for. */
export const TARGET_LEVELS = [2, 3, 4, 5] as const

/** Hours, as a person would say them. */
export function sayHours(hours: number): string {
  if (hours <= 0) return 'no time'
  if (hours < 1) return 'under an hour'
  if (hours < 10) {
    const rounded = Math.round(hours * 2) / 2
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} ${rounded === 1 ? 'hour' : 'hours'}`
  }
  return `${Math.round(hours)} hours`
}

/** The figure in the band: short. */
export function effortFigure(effort: TopicEffort): string {
  if (effort.lessons === 0) return 'reached'
  const h = effort.hours
  return h < 1 ? '<1 h' : h < 10 ? `${Math.round(h * 2) / 2} h` : `${Math.round(h)} h`
}

/** The sentence the figure stands for. */
export function effortSentence(effort: TopicEffort): string {
  const depth = formatLevel(effort.target.level)
  if (effort.lessons === 0) return `At your target: depth ${depth}. Refreshers and tending keep it there.`
  const hours = sayHours(effort.hours)
  const lessons = `${effort.lessons} ${effort.lessons === 1 ? 'lesson' : 'lessons'}`
  return effort.about
    ? `About ${hours} to depth ${depth} from where you are, about ${lessons}.`
    : `${capital(hours)} to depth ${depth} from where you are, ${lessons}.`
}

/** How big it reads, in words. */
export const GRAIN_LABEL: Record<DisplayGrain, string> = {
  'at-target': 'At your target',
  lesson: 'Lesson-sized for you',
  topic: 'Topic-sized for you',
  subject: 'Subject-sized for you',
}

/** Each term of C, as a line of the explanation. */
export function contributionLine(c: Contribution): string {
  switch (c.signal) {
    case 'base':
      return `${sayHours(c.hours)} to start from: about one teaching week`
    case 'prereq': {
      const who = [
        c.depth.byReader > 0 ? `${c.depth.byReader} drawn by you` : '',
        c.depth.byModel > 0 ? `${c.depth.byModel} by the model, counted half` : '',
      ].filter(Boolean).join(', ')
      const links = c.depth.byReader + c.depth.byModel
      return `A prerequisite chain ${links} ${links === 1 ? 'link' : 'links'} long under it (${who}): ×${factor(c.log)}`
    }
    case 'material':
      return `${c.words.toLocaleString('en-GB')} words written about it alone: ×${factor(c.log)}`
  }
}

/** Where the start came from. */
export function startLine(effort: TopicEffort, subjectTitle?: string | null): string {
  const level = formatLevel(effort.start.level)
  const roots = effort.target.roots
  const where = subjectTitle ? ` for ${subjectTitle}` : ''
  switch (effort.start.from) {
    case 'ability':
      return `Starting from ${level}: this topic's own figure.`
    case 'roots':
      return `Starting from ${level}: nothing has been recorded here yet, so the roots you gave${where} (${roots}) stand in.`
    case 'blend':
      return `Starting from ${level}: this topic's figure, not yet sure of itself, leaned ${Math.round((1 - effort.start.weight) * 100)}% toward the roots you gave${where} (${roots}).`
  }
}

/** Where the target came from. */
export function targetLine(target: Target): string {
  const level = `${formatLevel(target.level)}${TARGET_LABEL[target.level] ? `, ${TARGET_LABEL[target.level]}` : ''}`
  switch (target.from) {
    case 'topic':
      return `Taking it to ${level}: set on this topic.`
    case 'subject':
      return `Taking it to ${level}: your target for ${target.subject!.title}.`
    case 'assumed':
      return `Taking it to ${level}: assumed, since no target has been set.`
  }
}

/** The cost curve, said once. */
export const COST_LINE = `Each level costs ${GRAIN.COST_RATIO}× the one before, so going from 3 to 4 takes longer than going from 1 to 2. A lesson carries about ${GRAIN.LESSON_HOURS} hours of work with its reading and practice.`

/** The span, where the topic has varieties. */
export function spanLine(effort: TopicEffort): string | null {
  if (!effort.span) return null
  const n = effort.span.varieties
  return `With its ${n} ${n === 1 ? 'variety' : 'varieties'}: about ${sayHours(effort.span.hours)}, ${effort.span.lessons} ${effort.span.lessons === 1 ? 'lesson' : 'lessons'}. ${GRAIN_LABEL[effort.grain]}.`
}

function factor(log: number): string {
  return Math.exp(log).toFixed(2)
}

function formatLevel(level: number): string {
  return (Math.round(level * 10) / 10).toString()
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A bed's effort, in one line. */
export function subjectEffortLine(effort: SubjectEffort): string {
  const depth = effort.target ?? GRAIN.DEFAULT_TARGET
  const assumed = effort.target === null ? ' (assumed; set a target to change it)' : ''
  if (effort.topics === 0) return `Nothing in this bed to take to depth ${depth} yet.`
  if (effort.lessons === 0) return `Every topic here is at its target${assumed}.`
  const at = effort.atTarget > 0 ? ` ${effort.atTarget} of its ${effort.topics} topics are already there.` : ''
  return `${effort.about ? 'About ' : ''}${effort.about ? sayHours(effort.hours) : capital(sayHours(effort.hours))} to take this bed to depth ${depth}${assumed}, about ${effort.lessons} lessons.${at}`
}

/**
 * A target as a request carries it: a level from 2 to 5 in half steps,
 * or null to take the target away. Anything else is `undefined`, which a
 * route answers with a 400.
 */
export function readTarget(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value >= 2 && value <= 5 && Number.isInteger(value * 2) ? value : undefined
}
