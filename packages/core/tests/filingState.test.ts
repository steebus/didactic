import { describe, it, expect } from 'vitest'
import { filingOf, filingPhrase } from '../src/filingState'

describe('filingOf', () => {
  it('is filed the moment it has a topic, whatever the job says', () => {
    // A document read in rounds files as it goes and re-queues itself,
    // so a job still running can already have filed something. What the
    // reader wants to know is whether it has a home.
    expect(filingOf({ job: 'running', topics: 2 })).toBe('filed')
    expect(filingOf({ job: 'done', topics: 1 })).toBe('filed')
  })

  it('tells waiting apart from reading apart from failed', () => {
    expect(filingOf({ job: 'pending', topics: 0 })).toBe('waiting')
    expect(filingOf({ job: 'running', topics: 0 })).toBe('reading')
    expect(filingOf({ job: 'failed', topics: 0 })).toBe('failed')
  })

  it('calls a finished job with no topics what it is, not a failure', () => {
    // An article about something genuinely new is filed against nothing
    // until a subject is sown that covers it. That is the map being
    // honest, not the pipeline breaking.
    expect(filingOf({ job: 'done', topics: 0 })).toBe('nothing')
  })

  it('says nothing at all about material that was never queued', () => {
    // Proof offered while sowing arrives read and has no job.
    expect(filingOf({ job: null, topics: 0 })).toBe('none')
  })
})

describe('filingPhrase', () => {
  it('counts the topics once there is more than one', () => {
    expect(filingPhrase('filed', 1).word).toBe('Filed')
    expect(filingPhrase('filed', 3).word).toBe('Filed · 3')
  })

  it('answers "is something wrong?" for every state that raises it', () => {
    // The states a reader can misread as a fault each carry a note
    // saying what is actually happening.
    for (const state of ['waiting', 'reading', 'nothing'] as const) {
      expect(filingPhrase(state, 0).note).toBeTruthy()
    }
  })

  it('prints nothing for material that was never queued', () => {
    expect(filingPhrase('none', 0).word).toBe('')
  })
})
