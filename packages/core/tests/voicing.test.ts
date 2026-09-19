import { describe, it, expect } from 'vitest'
import {
  canPlay,
  listenLabel,
  listenOffer,
  placeAt,
  secondsBefore,
  spokenClock,
  spokenLength,
  voicingProgress,
  NOT_VOICED,
  type VoicingStanding,
} from '../src/voicing'

const standing = (over: Partial<VoicingStanding> = {}): VoicingStanding => ({
  ...NOT_VOICED,
  ...over,
})

describe('canPlay', () => {
  it('is false where nothing has been asked for', () => {
    expect(canPlay(standing())).toBe(false)
  })

  it('is false where it is asked for and nothing is said yet', () => {
    expect(canPlay(standing({ state: 'queued', total: 12 }))).toBe(false)
  })

  it('is true on the first piece, not the last', () => {
    // The whole design: generation outruns playback, so one piece made
    // is a lesson that can be started.
    expect(canPlay(standing({ state: 'voicing', done: 1, total: 12 }))).toBe(true)
  })

  it('trusts a finished recording over its own counts', () => {
    expect(canPlay(standing({ state: 'ready', done: 0, total: null }))).toBe(true)
  })

  it('is false for a lesson nobody has a standing for', () => {
    expect(canPlay(undefined)).toBe(false)
  })

  it('is false where it failed with nothing made', () => {
    expect(canPlay(standing({ state: 'failed', total: 12 }))).toBe(false)
  })
})

describe('listenOffer', () => {
  it('offers to make one where there is none', () => {
    expect(listenOffer(standing())).toBe('make')
    expect(listenOffer(undefined)).toBe('make')
  })

  it('says waiting while it is queued with nothing said', () => {
    expect(listenOffer(standing({ state: 'queued' }))).toBe('waiting')
    expect(listenOffer(standing({ state: 'voicing', total: 12 }))).toBe('waiting')
  })

  it('offers what exists as soon as a piece does', () => {
    expect(listenOffer(standing({ state: 'voicing', done: 3, total: 12 }))).toBe('making')
  })

  it('offers to play a finished recording', () => {
    expect(listenOffer(standing({ state: 'ready', done: 12, total: 12 }))).toBe('play')
  })

  it('offers to try again after a failure', () => {
    expect(listenOffer(standing({ state: 'failed' }))).toBe('again')
  })

  it('offers pause for the lesson that is playing, whatever its standing', () => {
    // The player's fact beats the recording's: a lesson still being
    // made can be the one running.
    expect(listenOffer(standing({ state: 'voicing', done: 2, total: 12 }), true)).toBe('pause')
    expect(listenOffer(standing({ state: 'ready', done: 9, total: 9 }), true)).toBe('pause')
  })
})

describe('voicingProgress', () => {
  it('says nothing where nothing has been asked for', () => {
    expect(voicingProgress(standing())).toBeNull()
    expect(voicingProgress(undefined)).toBeNull()
  })

  it('says nothing while the count is unknown', () => {
    // A ring drawn from a guess jumps backwards when the real figure
    // lands, which reads as a fault rather than as progress.
    expect(voicingProgress(standing({ state: 'queued', total: null }))).toBeNull()
  })

  it('is the share of pieces made', () => {
    expect(voicingProgress(standing({ state: 'voicing', done: 3, total: 12 }))).toBe(0.25)
  })

  it('is full for a finished recording whatever the counts say', () => {
    expect(voicingProgress(standing({ state: 'ready', done: 0, total: null }))).toBe(1)
  })

  it('never runs past full when the two counts disagree', () => {
    expect(voicingProgress(standing({ state: 'voicing', done: 14, total: 12 }))).toBe(1)
  })

  it('says nothing for a failure, which is not a position', () => {
    expect(voicingProgress(standing({ state: 'failed', done: 4, total: 12 }))).toBeNull()
  })
})

describe('listenLabel', () => {
  it('names the lesson, because a route is sixteen identical circles', () => {
    expect(listenLabel('play', 'Field Data', standing({ state: 'ready' }))).toBe(
      'Listen to Field Data'
    )
  })

  it('says how far through, where the figure is known', () => {
    expect(
      listenLabel('making', 'Field Data', standing({ state: 'voicing', done: 3, total: 12 }))
    ).toBe('Listen to Field Data — still being read aloud, 3 of 12 pieces')
  })

  it('leaves the figure out where it is not known yet', () => {
    expect(listenLabel('waiting', 'Field Data', standing({ state: 'queued' }))).toBe(
      'Field Data is waiting to be read aloud'
    )
  })

  it('offers the retry in words as well as in colour', () => {
    expect(listenLabel('again', 'Field Data', standing({ state: 'failed' }))).toBe(
      'Reading Field Data aloud failed — try again'
    )
  })

  it('reads as an offer where there is no recording', () => {
    expect(listenLabel('make', 'Field Data', undefined)).toBe('Read Field Data aloud')
  })
})

describe('placeAt', () => {
  const pieces = [{ seconds: 30 }, { seconds: 45 }, { seconds: 20 }]

  it('places the start of the lesson at the start of its first piece', () => {
    expect(placeAt(pieces, 0)).toEqual({ index: 0, offset: 0 })
  })

  it('places a second inside the piece that holds it', () => {
    expect(placeAt(pieces, 50)).toEqual({ index: 1, offset: 20 })
  })

  it('places a boundary at the start of the next piece, not the end of the last', () => {
    // A bar dragged to exactly 30 seconds means "the second piece from
    // its beginning", not "the first piece, finished".
    expect(placeAt(pieces, 30)).toEqual({ index: 1, offset: 0 })
    expect(placeAt(pieces, 75)).toEqual({ index: 2, offset: 0 })
  })

  it('clamps a position before the beginning', () => {
    expect(placeAt(pieces, -20)).toEqual({ index: 0, offset: 0 })
  })

  it('gives the last piece everything past the end', () => {
    // Chunk lengths are stored rounded, so a bar dragged to its own
    // right-hand end can ask for a second past the last piece.
    expect(placeAt(pieces, 95)).toEqual({ index: 2, offset: 20 })
    expect(placeAt(pieces, 400)).toEqual({ index: 2, offset: 20 })
  })

  it('has somewhere to put a position in a recording with no pieces', () => {
    expect(placeAt([], 12)).toEqual({ index: 0, offset: 0 })
  })

  it('steps over a piece of no length rather than landing on it', () => {
    expect(placeAt([{ seconds: 10 }, { seconds: 0 }, { seconds: 10 }], 10)).toEqual({
      index: 2,
      offset: 0,
    })
  })

  it('never hands back an offset longer than the piece it is in', () => {
    for (const second of [0, 1, 29.9, 30, 74.99, 75, 94.9, 95]) {
      const place = placeAt(pieces, second)
      expect(place.offset).toBeLessThanOrEqual(pieces[place.index].seconds)
      expect(place.offset).toBeGreaterThanOrEqual(0)
    }
  })

  it('round-trips against the seconds before its own piece', () => {
    // What the bar does: a position in, a place out, and the position
    // read back off the place has to be the one that went in.
    for (const second of [0, 7, 30, 44, 75, 90]) {
      const place = placeAt(pieces, second)
      expect(secondsBefore(pieces, place.index) + place.offset).toBeCloseTo(second, 5)
    }
  })
})

describe('spokenLength and secondsBefore', () => {
  const pieces = [{ seconds: 30 }, { seconds: 45 }, { seconds: 20 }]

  it('sums the whole recording', () => {
    expect(spokenLength(pieces)).toBe(95)
    expect(spokenLength([])).toBe(0)
  })

  it('sums what comes before a piece', () => {
    expect(secondsBefore(pieces, 0)).toBe(0)
    expect(secondsBefore(pieces, 2)).toBe(75)
  })

  it('treats an index past the end as the whole recording', () => {
    expect(secondsBefore(pieces, 9)).toBe(95)
  })
})

describe('spokenClock', () => {
  it('prints minutes and padded seconds', () => {
    expect(spokenClock(0)).toBe('0:00')
    expect(spokenClock(9)).toBe('0:09')
    expect(spokenClock(75)).toBe('1:15')
    expect(spokenClock(600)).toBe('10:00')
  })

  it('floors rather than rounds, so a clock never reads past its own end', () => {
    expect(spokenClock(59.9)).toBe('0:59')
  })

  it('never prints a negative clock', () => {
    expect(spokenClock(-4)).toBe('0:00')
  })
})
