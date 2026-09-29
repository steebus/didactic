import { describe, it, expect } from 'vitest'
import {
  isSettled,
  listed,
  progressNow,
  readSteps,
  stepLine,
  type IngestProgress,
} from '../src/ingestProgress'

const progress = (over: Partial<IngestProgress>): IngestProgress => ({
  id: 'r1',
  title: 'A piece',
  summary: null,
  job: { state: 'running', attempts: 1, error: null },
  steps: [],
  topics: [],
  filing: 'reading',
  ...over,
})

describe('stepLine', () => {
  it('says how long the page was, and keeps its title aside', () => {
    expect(stepLine({ kind: 'fetched', words: 3214, title: 'Game theory' })).toEqual({
      line: 'Fetched · 3,214 words',
      aside: 'Game theory',
    })
  })

  it('forwards the model’s summary under what it found', () => {
    const said = stepLine({
      kind: 'read',
      summary: 'An introduction to games.',
      whole: null,
      concepts: [{ name: 'Nash equilibrium', description: null }, { name: 'Payoff', description: null }],
    })
    expect(said).toEqual({ line: 'Found 2 concepts', aside: 'An introduction to games.' })
  })

  it('names the one thing a piece is about when it is about one thing', () => {
    expect(
      stepLine({ kind: 'read', summary: null, whole: 'Game theory', concepts: [{ name: 'Game theory', description: null }] }).line
    ).toBe('It is about one thing: Game theory')
  })

  it('says where the concepts went, leaving out what did not happen', () => {
    expect(stepLine({ kind: 'placed', linked: ['a', 'b'], created: ['c'], asked: [] }).line).toBe(
      'Placed: 2 already growing and 1 new'
    )
    expect(stepLine({ kind: 'placed', linked: [], created: [], asked: ['x'] }).line).toBe(
      'Placed: 1 to ask you about'
    )
  })

  it('counts connections in the singular when there is one', () => {
    expect(stepLine({ kind: 'connected', edges: 1, bedded: 0 }).line).toBe('Drew 1 connection')
    expect(stepLine({ kind: 'connected', edges: 4, bedded: 2 }).line).toBe(
      'Drew 4 connections, and filed 2 into a subject'
    )
  })
})

describe('listed', () => {
  it('reads as a sentence', () => {
    expect(listed([])).toBe('')
    expect(listed(['a'])).toBe('a')
    expect(listed(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('isSettled', () => {
  it('stops polling once the job is done, failed, or there never was one', () => {
    expect(isSettled({ job: null })).toBe(true)
    expect(isSettled({ job: { state: 'done', attempts: 1, error: null } })).toBe(true)
    expect(isSettled({ job: { state: 'failed', attempts: 3, error: 'x' } })).toBe(true)
    expect(isSettled({ job: { state: 'running', attempts: 1, error: null } })).toBe(false)
    expect(isSettled({ job: { state: 'pending', attempts: 0, error: null } })).toBe(false)
  })
})

describe('progressNow', () => {
  it('says nothing while it is being read: the steps say it', () => {
    expect(progressNow(progress({}))).toBeNull()
  })

  it('tells a retry apart from a first wait', () => {
    expect(progressNow(progress({ job: { state: 'pending', attempts: 0, error: null } }))).toBe(
      'Waiting its turn to be read.'
    )
    expect(progressNow(progress({ job: { state: 'pending', attempts: 1, error: 'x' } }))).toMatch(/tried again/)
  })

  it('counts the topics once filed', () => {
    const p = progress({
      job: { state: 'done', attempts: 1, error: null },
      filing: 'filed',
      topics: [{ id: 't', title: 'T', state: 'active' }],
    })
    expect(progressNow(p)).toBe('Filed under 1 topic.')
  })
})

describe('readSteps', () => {
  it('keeps only steps it knows how to say', () => {
    const stored = [
      { kind: 'fetching', from: 'example.com', at: '2026-09-29T00:00:00Z' },
      { kind: 'mystery', at: '2026-09-29T00:00:01Z' },
      null,
      'fetched',
    ]
    expect(readSteps(stored)).toHaveLength(1)
    expect(readSteps(null)).toEqual([])
  })
})
