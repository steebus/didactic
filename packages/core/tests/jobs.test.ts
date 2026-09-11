import { describe, it, expect } from 'vitest'
import {
  jobKey,
  jobTitle,
  jobNote,
  jobWay,
  jobSettles,
  type JobKind,
  type JobLike,
  type JobState,
} from '../src/jobs'

const job = (over: Partial<JobLike> = {}): JobLike => ({
  kind: 'sowing',
  name: 'Photography',
  state: 'running',
  ...over,
})

const KINDS: JobKind[] = ['sowing', 'writing']
const STATES: JobState[] = ['running', 'done', 'failed']

describe('jobKey', () => {
  it('is the same for the same piece of work', () => {
    expect(jobKey('writing', 'abc')).toBe(jobKey('writing', 'abc'))
  })

  it('keeps the two kinds apart on the same id', () => {
    // A subject and a lesson could share an id; the work is not the same.
    expect(jobKey('writing', 'abc')).not.toBe(jobKey('sowing', 'abc'))
  })

  it('keeps two lessons apart', () => {
    expect(jobKey('writing', 'abc')).not.toBe(jobKey('writing', 'def'))
  })
})

describe('jobTitle', () => {
  it('says what is underway, naming the thing', () => {
    expect(jobTitle(job())).toBe('Sowing Photography')
    expect(jobTitle(job({ kind: 'writing', name: 'Core Web Vitals' }))).toBe(
      'Writing Core Web Vitals'
    )
  })

  it('says what came of it', () => {
    expect(jobTitle(job({ state: 'done' }))).toBe('Photography is sown')
    expect(jobTitle(job({ kind: 'writing', name: 'Lazy Loading', state: 'done' }))).toBe(
      'Lazy Loading is written'
    )
  })

  it('says plainly when it did not work', () => {
    expect(jobTitle(job({ state: 'failed' }))).toBe('Photography could not be sown')
    expect(jobTitle(job({ kind: 'writing', name: 'Lazy Loading', state: 'failed' }))).toBe(
      'Lazy Loading could not be written'
    )
  })

  it('has a line for every kind in every state', () => {
    for (const kind of KINDS) {
      for (const state of STATES) {
        expect(jobTitle(job({ kind, state }))).toBeTruthy()
      }
    }
  })
})

describe('jobNote', () => {
  it('tells the reader they may walk away, which is the whole point', () => {
    for (const kind of KINDS) {
      expect(jobNote(job({ kind }))).toMatch(/carry on/i)
    }
  })

  it('has nothing to add once it is done', () => {
    expect(jobNote(job({ state: 'done' }))).toBeNull()
  })

  it('gives the reason it failed', () => {
    expect(jobNote(job({ state: 'failed', reason: 'The model was busy.' }))).toBe(
      'The model was busy.'
    )
  })

  it('still says something when a failure carries no reason', () => {
    expect(jobNote(job({ state: 'failed' }))).toBeTruthy()
    expect(jobNote(job({ state: 'failed', reason: null }))).toBeTruthy()
  })
})

describe('jobWay', () => {
  it('offers the way to the finished thing', () => {
    expect(jobWay(job({ state: 'done' }))).toBe('See the bed')
    expect(jobWay(job({ kind: 'writing', state: 'done' }))).toBe('Read it')
  })

  it('offers nothing while it runs, because there is nowhere to go', () => {
    expect(jobWay(job())).toBeNull()
  })

  it('offers nothing on a failure', () => {
    expect(jobWay(job({ state: 'failed' }))).toBeNull()
  })
})

describe('jobSettles', () => {
  it('puts away a finished job with nowhere to go', () => {
    expect(jobSettles(job({ state: 'done' }), false)).toBe(true)
  })

  it('never puts away a job carrying a way to what it made', () => {
    // Taking the link away on a timer, from a reader who walked off
    // because they were told they could, is the one thing this
    // mechanism must not do.
    expect(jobSettles(job({ state: 'done' }), true)).toBe(false)
  })

  it('never puts away a failure, which is where the reason is written', () => {
    expect(jobSettles(job({ state: 'failed' }), false)).toBe(false)
    expect(jobSettles(job({ state: 'failed' }), true)).toBe(false)
  })

  it('never puts away something still running', () => {
    expect(jobSettles(job(), false)).toBe(false)
  })
})
