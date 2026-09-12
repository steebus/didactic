import { describe, it, expect } from 'vitest'
import {
  jobKey,
  jobTitle,
  jobNote,
  jobWay,
  jobSettles,
  jobPhrases,
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

const KINDS: JobKind[] = ['sowing', 'writing', 'opening', 'tending']
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

  it('names the topic when the app opens a bed, not the lesson it wrote', () => {
    // Nobody asked for this lesson and nobody has seen its name, so a
    // notice naming it would be a notice about a stranger.
    expect(jobTitle(job({ kind: 'opening', name: 'Exposure' }))).toBe(
      'Preparing your first lesson in Exposure'
    )
    expect(jobTitle(job({ kind: 'opening', name: 'Exposure', state: 'done' }))).toBe(
      'Your first lesson in Exposure is ready'
    )
    expect(jobTitle(job({ kind: 'opening', name: 'Exposure', state: 'failed' }))).toBe(
      'The first lesson in Exposure could not be prepared'
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
    // The three a reader presses a button for say "carry on reading",
    // because they are standing in front of it waiting. Tending cannot
    // say that: it starts *because* they have finished reading and
    // marked the lesson worked, so it says the same promise the other
    // way round -- there is nothing here to wait for.
    for (const kind of KINDS) {
      expect(jobNote(job({ kind }))).toMatch(/carry on|nothing to wait for/i)
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

describe('tending, the job that runs behind a finished reader', () => {
  const tending = (over: Partial<JobLike> = {}) =>
    job({ kind: 'tending', name: 'What exposure is', ...over })

  it('says the lesson is being read back, not written', () => {
    expect(jobTitle(tending())).toBe('Reading What exposure is back')
  })

  it('says where it ended up, in the garden\'s own word', () => {
    expect(jobTitle(tending({ state: 'done' }))).toBe('What exposure is is in the garden')
  })

  it('says plainly when it did not work', () => {
    expect(jobTitle(tending({ state: 'failed' }))).toMatch(/could not be read back/)
  })

  it('tells the reader there is nothing to wait for, because there is not', () => {
    // Nobody pressed a button for this: the lesson was marked worked
    // and the reader is already on their way somewhere else.
    expect(jobNote(tending())).toMatch(/nothing to wait for/i)
  })

  it('offers nowhere to go, and so puts itself away', () => {
    // The cards are due now, but answering them two seconds after
    // reading the sentences they are cut from teaches nothing.
    expect(jobWay(tending({ state: 'done' }))).toBeNull()
    expect(jobSettles(tending({ state: 'done' }), false)).toBe(true)
  })
})

describe('jobWay', () => {
  it('offers the way to the finished thing', () => {
    // A sowing goes to the reading, not to the bed: the bed is a list of
    // topics and says nothing about where it came from, and "where did
    // this come from" is the question a reader has the moment a bed they
    // did not write appears.
    expect(jobWay(job({ state: 'done' }))).toBe('See the reading')
    expect(jobWay(job({ kind: 'writing', state: 'done' }))).toBe('Read it')
  })

  it('hands over the lesson an opening wrote, which is why it ran', () => {
    expect(jobWay(job({ kind: 'opening', state: 'done' }))).toBe('Read it')
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

describe('jobPhrases', () => {
  it('gives each kind the list its own sheet already uses', () => {
    // Sowing waits in the sowing sheet's voice, writing in the writing
    // one. The words live in copy.ts; this only says which set.
    expect(jobPhrases('sowing')[0]).toMatch(/ground/i)
    expect(jobPhrases('writing')[0]).toMatch(/pencil/i)
    expect(jobPhrases('opening')[0]).toMatch(/bed/i)
    expect(jobPhrases('tending')[0]).toMatch(/lesson/i)
  })

  it('gives every kind something to say', () => {
    for (const kind of KINDS) {
      expect(jobPhrases(kind).length).toBeGreaterThan(2)
    }
  })

  it('ends every list on a phrase that can stay true for a while', () => {
    // The last one holds until the work lands, so it cannot be a step.
    for (const kind of KINDS) {
      expect(jobPhrases(kind).at(-1)).toMatch(/almost/i)
    }
  })
})
