import { describe, it, expect } from 'vitest'
import {
  planPrompt,
  planIsEmpty,
  entryBody,
  ENTRIES_SHOWN,
  ENTRY_CEILING,
  type LearningPlan,
  type PlanEntry,
} from '../src/learningPlan'

const entry = (body: string, by: PlanEntry['by'] = 'ai'): PlanEntry => ({
  at: '2026-09-24T10:00:00Z',
  by,
  kind: 'lesson',
  ref: null,
  body,
})

const plan = (over: Partial<LearningPlan> = {}): LearningPlan => ({
  curriculumId: 'c1',
  reasoning: null,
  qualifiers: [],
  entries: [],
  updatedAt: null,
  ...over,
})

describe('planPrompt', () => {
  it('says nothing at all when there is nothing to say', () => {
    // A heading with nothing under it teaches a model the section is
    // noise, and the next course's plan is then read as noise too.
    expect(planPrompt(plan())).toBeNull()
    expect(planPrompt(null)).toBeNull()
  })

  it('is still empty when the reasoning is only whitespace', () => {
    expect(planPrompt(plan({ reasoning: '   \n  ' }))).toBeNull()
  })

  it('carries the reasoning', () => {
    const prompt = planPrompt(plan({ reasoning: 'Opens shallow; they hold the basics.' }))
    expect(prompt).toContain('Opens shallow; they hold the basics.')
    expect(prompt).toContain('THE LEARNING PLAN FOR THIS COURSE')
  })

  it('leaves out a qualifier nobody answered', () => {
    // "They did not answer" is not evidence about what they know, and
    // reads to a model as though it were.
    const prompt = planPrompt(
      plan({
        reasoning: 'x',
        qualifiers: [
          { prompt: 'Answered one?', level: 2, answer: 'Yes, at work.' },
          { prompt: 'Skipped one?', level: 4, answer: null },
          { prompt: 'Blank one?', level: 5, answer: '   ' },
        ],
      })
    )
    expect(prompt).toContain('Answered one?')
    expect(prompt).not.toContain('Skipped one?')
    expect(prompt).not.toContain('Blank one?')
  })

  it('says nothing where every qualifier is unanswered and nothing else exists', () => {
    expect(planPrompt(plan({ qualifiers: [{ prompt: 'q', level: 1, answer: null }] }))).toBeNull()
  })

  it('prints the level a question was pitched at', () => {
    const prompt = planPrompt(
      plan({ qualifiers: [{ prompt: 'Do you?', level: 4, answer: 'Sometimes.' }] })
    )
    expect(prompt).toContain('level 4')
  })

  it('lists the log oldest first, so it reads as the course was built', () => {
    const prompt = planPrompt(
      plan({ entries: [entry('First lesson covered A.'), entry('Second covered B.')] })
    )
    const first = prompt!.indexOf('First lesson covered A.')
    const second = prompt!.indexOf('Second covered B.')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
  })

  it('keeps the newest entries when the log outgrows the cap', () => {
    const entries = Array.from({ length: ENTRIES_SHOWN + 5 }, (_, i) => entry(`lesson ${i}`))
    const prompt = planPrompt(plan({ entries }))
    expect(prompt).not.toContain('lesson 0')
    expect(prompt).toContain(`lesson ${ENTRIES_SHOWN + 4}`)
  })

  it('marks what the reader wrote as theirs', () => {
    const prompt = planPrompt(plan({ entries: [entry('I want more on testing.', 'user')] }))
    expect(prompt).toContain('The reader: I want more on testing.')
  })

  it('tells the agent to say so when it departs from the plan', () => {
    // A plan that cannot be departed from is a cage, and the reader is
    // allowed to change their mind. The instruction has to carry both.
    const prompt = planPrompt(plan({ reasoning: 'x' }))
    expect(prompt).toMatch(/depart/i)
  })
})

describe('planIsEmpty', () => {
  it('agrees with planPrompt about whether a plan exists', () => {
    expect(planIsEmpty(plan())).toBe(true)
    expect(planIsEmpty(plan({ reasoning: 'why' }))).toBe(false)
    expect(planIsEmpty(plan({ entries: [entry('a lesson')] }))).toBe(false)
  })
})

describe('entryBody', () => {
  it('keeps a short line as it is', () => {
    expect(entryBody('Covered the event loop and microtasks.')).toBe(
      'Covered the event loop and microtasks.'
    )
  })

  it('flattens the whitespace a model leaves behind', () => {
    expect(entryBody('  Covered\n  the  loop.  ')).toBe('Covered the loop.')
  })

  it('leaves no line at all for nothing', () => {
    expect(entryBody('')).toBeNull()
    expect(entryBody('   ')).toBeNull()
    expect(entryBody(null)).toBeNull()
    expect(entryBody(undefined)).toBeNull()
  })

  it('cuts an overlong entry at a sentence end', () => {
    // The instruction says "very short" and models are not reliable
    // about that; one that writes four hundred words would crowd the
    // reasoning out of everyone else's prompt.
    const long = `${'This sentence is of a workable length. '.repeat(20)}`
    const cut = entryBody(long)!
    expect(cut.length).toBeLessThanOrEqual(ENTRY_CEILING)
    expect(cut.endsWith('.')).toBe(true)
  })

  it('ellipsises where there is no sentence end to cut at', () => {
    const cut = entryBody('x'.repeat(ENTRY_CEILING + 50))!
    expect(cut.length).toBeLessThanOrEqual(ENTRY_CEILING + 1)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('does not cut at a full stop near the very start', () => {
    // Otherwise "See below." followed by three hundred words becomes
    // just "See below.", which says nothing at all.
    const cut = entryBody(`Short. ${'and then much more detail '.repeat(30)}`)!
    expect(cut.length).toBeGreaterThan(ENTRY_CEILING / 2)
  })
})
