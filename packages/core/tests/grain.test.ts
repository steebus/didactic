import { describe, it, expect } from 'vitest'
import { GRAIN } from '../src/config'
import {
  contributionLine,
  COST_LINE,
  displayGrain,
  effortFigure,
  effortSentence,
  GRAIN_LABEL,
  hoursBetween,
  inherentComplexity,
  inherentHours,
  lessonsFor,
  prerequisiteDepths,
  rootsAsAbility,
  readTarget,
  routeBudget,
  sayHours,
  subjectEffortLine,
  spanLine,
  startingPoint,
  startLine,
  subjectEffort,
  TARGET_LABEL,
  TARGET_LEVELS,
  targetFor,
  targetLine,
  topicEffort,
  varietiesOf,
  type GrainEdge,
  type Target,
} from '../src/grain'

const prereq = (from: string, to: string, createdBy = 'user'): GrainEdge => ({ from, to, kind: 'prereq', createdBy })
const variety = (from: string, to: string): GrainEdge => ({ from, to, kind: 'specialises', createdBy: 'ai' })
const assumed: Target = { level: 3, from: 'assumed', subject: null, roots: null }

describe('the cost curve', () => {
  // The brief's worked example: C = 12 h, r = 1.8, a lesson 1.25 h.
  it.each([
    [1, 4, 25.9, 21, 'subject'],
    [3, 4, 13.9, 12, 'topic'],
    [2.5, 3, 4.4, 4, 'topic'],
    [3.95, 4, 0.9, 1, 'lesson'],
    [4, 4, 0, 0, 'at-target'],
  ] as const)('takes %s to %s in about %s hours, %s lessons, shown as %s', (from, to, hours, lessons, grain) => {
    const h = hoursBetween(12, from, to)
    expect(h).toBeCloseTo(hours, 1)
    expect(lessonsFor(h)).toBe(lessons)
    expect(displayGrain(lessonsFor(h))).toBe(grain)
  })

  it('costs C hours from 1 to 3, by definition', () => {
    expect(hoursBetween(10, 1, 3)).toBeCloseTo(10)
  })

  it('adds up over the levels it crosses', () => {
    expect(hoursBetween(10, 1, 2) + hoursBetween(10, 2, 4)).toBeCloseTo(hoursBetween(10, 1, 4))
  })

  it('costs each level more than the last', () => {
    expect(hoursBetween(10, 3, 4)).toBeGreaterThan(hoursBetween(10, 1, 2) * GRAIN.COST_RATIO)
  })

  it('costs nothing at or past the target', () => {
    expect(hoursBetween(10, 4, 3)).toBe(0)
    expect(hoursBetween(0, 1, 3)).toBe(0)
  })
})

describe('prerequisiteDepths', () => {
  it('follows the longest chain in, counting the model’s edges half', () => {
    const depths = prerequisiteDepths(['a', 'b', 'c', 'd'], [prereq('a', 'b'), prereq('b', 'c', 'ai'), prereq('a', 'c'), prereq('c', 'd')])
    expect(depths.get('a')).toEqual({ depth: 0, byReader: 0, byModel: 0 })
    expect(depths.get('c')).toEqual({ depth: 1.5, byReader: 1, byModel: 1 })
    expect(depths.get('d')).toEqual({ depth: 2.5, byReader: 2, byModel: 1 })
  })

  it('survives a loop the model drew, and gives the same answer every time', () => {
    const edges = [prereq('a', 'b', 'ai'), prereq('b', 'c', 'ai'), prereq('c', 'a', 'ai')]
    const once = prerequisiteDepths(['a', 'b', 'c'], edges)
    const again = prerequisiteDepths(['c', 'b', 'a'], [...edges].reverse())
    expect([...once]).toEqual([...again])
    expect(Math.max(...[...once.values()].map(d => d.depth))).toBeLessThanOrEqual(1)
  })

  it('ignores other kinds and topics off the map', () => {
    expect(prerequisiteDepths(['a', 'b'], [variety('a', 'b'), prereq('x', 'b')]).get('b')!.depth).toBe(0)
  })
})

describe('inherent complexity', () => {
  it('starts from about one teaching week', () => {
    expect(inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: 0 }).hours).toBeCloseTo(GRAIN.BASE_HOURS)
  })

  it('grows with a deeper chain and more material written about it alone, within caps', () => {
    const plain = inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: 0 }).hours
    const deep = inherentHours({ prereq: { depth: 3, byReader: 3, byModel: 0 }, words: 0 }).hours
    const deeper = inherentHours({ prereq: { depth: 30, byReader: 30, byModel: 0 }, words: 0 }).hours
    const read = inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: 10_000 }).hours
    const book = inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: 900_000 }).hours
    expect(deep).toBeGreaterThan(plain)
    expect(deeper).toBeCloseTo(plain * Math.exp(GRAIN.PREREQ_STEP * GRAIN.PREREQ_CAP))
    expect(read).toBeGreaterThan(plain)
    expect(book).toBeCloseTo(inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: GRAIN.MATERIAL_CAP }).hours)
  })

  it('explains itself: every contribution reconciles to the figure', () => {
    const map = inherentComplexity({
      topicIds: ['a', 'b', 'c'],
      edges: [prereq('a', 'b'), prereq('b', 'c', 'ai')],
      focusedWords: new Map([['c', 12_400]]),
    })
    for (const c of map.values()) {
      const product = c.contributions.reduce((p, term) => p * Math.exp(term.log), 1)
      expect(product).toBeCloseTo(c.hours, 9)
    }
    expect(map.get('c')!.contributions.map(t => t.signal)).toEqual(['base', 'prereq', 'material'])
  })

  it('says each contribution in words', () => {
    const c = inherentHours({ prereq: { depth: 1.5, byReader: 1, byModel: 1 }, words: 12_400 })
    expect(c.contributions.map(contributionLine)).toEqual([
      '10 hours to start from: about one teaching week',
      'A prerequisite chain 2 links long under it (1 drawn by you, 1 by the model, counted half): ×1.16',
      '12,400 words written about it alone: ×1.24',
    ])
  })
})

describe('varietiesOf', () => {
  it('finds every variety below, once, through loops', () => {
    const edges = [variety('js', 'react'), variety('react', 'hooks'), variety('js', 'hooks'), variety('hooks', 'js'), prereq('js', 'ts')]
    expect(varietiesOf('js', edges).sort()).toEqual(['hooks', 'react'])
    expect(varietiesOf('hooks', edges).sort()).toEqual(['js', 'react'])
  })
})

describe('where a reader starts and where they are going', () => {
  it('trusts the figure once it is sure, the roots before anything is recorded, and blends between', () => {
    expect(startingPoint({ ability: 2.4, confidence: 0.6, roots: 4 })).toEqual({ level: 2.4, from: 'ability', weight: 1 })
    expect(startingPoint({ ability: 1, confidence: 0, roots: 3 })).toEqual({ level: 3, from: 'roots', weight: 0 })
    const blend = startingPoint({ ability: 2, confidence: 0.2, roots: 4 })
    expect(blend.from).toBe('blend')
    expect(blend.level).toBeCloseTo(3)
    expect(startingPoint({ ability: 1.5, confidence: 0.1, roots: null })).toEqual({ level: 1.5, from: 'ability', weight: 1 })
  })

  it('reads roots of nought as the floor', () => {
    expect(rootsAsAbility(0)).toBe(1)
    expect(rootsAsAbility(3)).toBe(3)
  })

  it('takes the topic’s own target, else the furthest of its subjects’, else a working knowledge', () => {
    const subjects = [
      { id: 's1', title: 'Web', target: 3, roots: 2 },
      { id: 's2', title: 'Systems', target: 4, roots: 1 },
      { id: 's3', title: 'Loose', target: null, roots: 5 },
    ]
    expect(targetFor(5, subjects)).toEqual({ level: 5, from: 'topic', subject: null, roots: 5 })
    expect(targetFor(null, subjects)).toEqual({ level: 4, from: 'subject', subject: { id: 's2', title: 'Systems' }, roots: 1 })
    expect(targetFor(null, [])).toEqual({ level: GRAIN.DEFAULT_TARGET, from: 'assumed', subject: null, roots: null })
  })
})

describe('display grain', () => {
  it('holds a subject-sized topic inside the band, and only when it was subject-sized', () => {
    expect(displayGrain(13)).toBe('subject')
    expect(displayGrain(11)).toBe('topic')
    expect(displayGrain(11, 'subject')).toBe('subject')
    expect(displayGrain(10, 'subject')).toBe('subject')
    expect(displayGrain(9, 'subject')).toBe('topic')
    expect(displayGrain(11, 'topic')).toBe('topic')
  })
})

describe('routeBudget', () => {
  it('asks for the lessons the hours need, within bounds, with room to stray', () => {
    expect(routeBudget(12)).toEqual({ lessons: 12, low: 9, high: 15 })
    expect(routeBudget(0).lessons).toBe(GRAIN.BUDGET_MIN)
    expect(routeBudget(40).lessons).toBe(GRAIN.BUDGET_MAX)
  })
})

describe('topicEffort', () => {
  const inherent = inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: 0 })

  it('reads the same topic four ways for four readers, and changes nothing about it', () => {
    const at = (ability: number, target: number) =>
      topicEffort({ inherent, ability, confidence: 1, target: { ...assumed, level: target, from: 'topic' } }).grain
    expect([at(1, 5), at(3, 4), at(2.5, 3), at(3.95, 4), at(4, 4)]).toEqual(['subject', 'topic', 'topic', 'lesson', 'at-target'])
  })

  it('reads a topic with varieties by its span, and budgets its route by its own hours', () => {
    const effort = topicEffort({
      inherent,
      ability: 2,
      confidence: 1,
      target: { ...assumed, level: 4 },
      varieties: [{ inherent, ability: 1, confidence: 1 }, { inherent, ability: 1, confidence: 1 }],
    })
    expect(effort.span!.hours).toBeGreaterThan(effort.hours)
    expect(effort.grain).toBe('subject')
    expect(effort.lessons).toBe(lessonsFor(effort.hours))
  })

  it('prints as a guess while C is uncalibrated or the start is unsure', () => {
    const effort = topicEffort({ inherent, ability: 2, confidence: 1, target: assumed })
    expect(effort.about).toBe(true)
    expect(effortSentence(effort)).toMatch(/^About \d+(\.5)? hours to depth 3 from where you are, about \d+ lessons\.$/)
    expect(effortFigure(effort)).toMatch(/ h$/)
  })

  it('says when it is there', () => {
    const effort = topicEffort({ inherent, ability: 3.2, confidence: 1, target: assumed })
    expect(effortFigure(effort)).toBe('reached')
    expect(effortSentence(effort)).toBe('At your target: depth 3. Refreshers and tending keep it there.')
  })

  it('says where the start and the target came from', () => {
    const blend = topicEffort({ inherent, ability: 2, confidence: 0.2, target: { level: 4, from: 'subject', subject: { id: 's', title: 'Web' }, roots: 4 } })
    expect(startLine(blend, 'Web')).toBe("Starting from 3: this topic's figure, not yet sure of itself, leaned 50% toward the roots you gave for Web (4).")
    expect(targetLine(blend.target)).toBe('Taking it to 4, fluent: your target for Web.')
    expect(targetLine(assumed)).toBe('Taking it to 3, a working knowledge: assumed, since no target has been set.')
  })
})

describe('the words', () => {
  it('says hours the way a person would', () => {
    expect([sayHours(0), sayHours(0.4), sayHours(1), sayHours(4.4), sayHours(13.9)]).toEqual([
      'no time', 'under an hour', '1 hour', '4.5 hours', '14 hours',
    ])
  })

  it('names every level a reader can aim for, and every grain', () => {
    for (const level of TARGET_LEVELS) expect(TARGET_LABEL[level]).toBeTruthy()
    expect(Object.keys(GRAIN_LABEL)).toHaveLength(4)
    expect(COST_LINE).toMatch(/1\.8×/)
  })

  it('says a span only where there is one', () => {
    const inherent = inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: 0 })
    expect(spanLine(topicEffort({ inherent, ability: 1, confidence: 1, target: assumed }))).toBeNull()
    const wide = topicEffort({ inherent, ability: 1, confidence: 1, target: assumed, varieties: [{ inherent, ability: 1, confidence: 1 }] })
    expect(spanLine(wide)).toMatch(/^With its 1 variety: about 20 hours, 16 lessons\. Subject-sized for you\.$/)
  })

  it('adds a bed up from its topics', () => {
    const inherent = inherentHours({ prereq: { depth: 0, byReader: 0, byModel: 0 }, words: 0 })
    const a = topicEffort({ inherent, ability: 1, confidence: 1, target: assumed })
    const b = topicEffort({ inherent, ability: 3, confidence: 1, target: assumed })
    expect(subjectEffort([a, b])).toEqual({ hours: a.hours, lessons: a.lessons, about: true, atTarget: 1 })
  })
})

describe('a bed’s line and a target as a request carries it', () => {
  it('says what the bed comes to, and says when the target is assumed', () => {
    const bed = { hours: 42.3, lessons: 36, about: true, atTarget: 2, topics: 9, target: null }
    expect(subjectEffortLine(bed)).toBe(
      'About 42 hours to take this bed to depth 3 (assumed; set a target to change it), about 36 lessons. 2 of its 9 topics are already there.'
    )
    expect(subjectEffortLine({ ...bed, lessons: 0, hours: 0, target: 4 })).toBe('Every topic here is at its target.')
    expect(subjectEffortLine({ ...bed, topics: 0 })).toBe('Nothing in this bed to take to depth 3 yet.')
  })

  it('takes 2 to 5 in half steps, or null, and nothing else', () => {
    expect([readTarget(2), readTarget(4.5), readTarget(null)]).toEqual([2, 4.5, null])
    expect([readTarget(1), readTarget(5.5), readTarget(3.3), readTarget('4'), readTarget(undefined)]).toEqual([
      undefined, undefined, undefined, undefined, undefined,
    ])
  })
})

describe('undoable identity, in words', () => {
  it('says a fold can be undone, and where', async () => {
    const { foldNote, UNFOLD_NOTE, unpromoteNote } = await import('../src/grain')
    expect(foldNote('Probabilistic Data Structures')).toBe(
      "It leaves the map until it is unfolded from Probabilistic Data Structures's sheet, which puts back everything the fold moved."
    )
    expect(UNFOLD_NOTE).toMatch(/unless you have worked it/)
    expect(unpromoteNote({ topicId: 't', title: 'React' })).toMatch(/^Made by promoting the topic React\./)
  })
})

describe('how a topic is written about', () => {
  it('reads the nine measured topics the way they were measured', async () => {
    const { readShape } = await import('../src/grain')
    const r = (works: number, topicShare: number, subfieldShare: number, softwareShare: number) =>
      readShape({ works, topicShare, subfieldShare, softwareShare })
    expect(r(70, 0.11, 0.3, 0.33)).toBe('practical')
    expect(r(5605, 0.32, 0.5, 0)).toBe('focused')
    expect(r(39006, 0.32, 0.49, 0)).toBe('focused')
    expect(r(39142, 0.09, 0.24, 0.06)).toBe('broad')
    expect(r(8545, 0.12, 0.38, 0)).toBe('broad')
    expect(r(19503, 0.17, 0.39, 0)).toBeNull()
    expect(r(12, 0.5, 0.5, 0)).toBe('unplaced')
    expect(readShape(null)).toBeNull()
  })

  it('adds its term to the figure, says it without naming a source, and nothing when unplaced', async () => {
    const { inherentHours, contributionLine } = await import('../src/grain')
    const none = { depth: 0, byReader: 0, byModel: 0 }
    const broad = inherentHours({ prereq: none, words: 0, shape: 'broad', shaped: true })
    expect(broad.hours).toBeCloseTo(GRAIN.BASE_HOURS * Math.exp(GRAIN.SHAPE.LOG.broad))
    expect(contributionLine(broad.contributions[1])).toBe('Written about across many specialisms, as a field is: ×1.35')
    expect(broad.shaped).toBe(true)
    const unplaced = inherentHours({ prereq: none, words: 0, shape: 'unplaced', shaped: true })
    expect(unplaced.contributions).toHaveLength(1)
    expect(inherentHours({ prereq: none, words: 0 }).shaped).toBe(false)
  })
})
