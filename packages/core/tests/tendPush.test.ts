import { describe, it, expect } from 'vitest'
import { localHour, nudgeMessage, shouldNudge, NUDGE_EVERY_MS } from '../src/tendPush'

// 02:00 UTC is noon in Sydney (AEST, UTC+10) and 22:00 the evening before in New York.
const noonInSydney = new Date('2026-07-01T02:00:00Z')

describe('localHour', () => {
  it('reads the hour where the reader is', () => {
    expect(localHour(noonInSydney, 'Australia/Sydney')).toBe(12)
    expect(localHour(noonInSydney, 'UTC')).toBe(2)
  })

  it('falls back to UTC for a zone it cannot read', () => {
    expect(localHour(noonInSydney, 'Not/AZone')).toBe(2)
  })
})

describe('shouldNudge', () => {
  const base = { due: 5, lastSentAt: null, now: noonInSydney, timeZone: 'Australia/Sydney' }

  it('asks when something is due, in the day, and it has not asked before', () => {
    expect(shouldNudge(base)).toBe(true)
  })

  it('never asks about nothing', () => {
    expect(shouldNudge({ ...base, due: 0 })).toBe(false)
  })

  it('does not ask at night where the reader is', () => {
    expect(shouldNudge({ ...base, timeZone: 'America/New_York' })).toBe(false)
    expect(shouldNudge({ ...base, now: new Date('2026-07-01T11:30:00Z') })).toBe(false) // 21:30 Sydney
    expect(shouldNudge({ ...base, now: new Date('2026-06-30T22:00:00Z') })).toBe(true) // 08:00 Sydney
  })

  it('asks at most once in four hours', () => {
    const justUnder = new Date(noonInSydney.getTime() - NUDGE_EVERY_MS + 60_000).toISOString()
    const four = new Date(noonInSydney.getTime() - NUDGE_EVERY_MS).toISOString()
    expect(shouldNudge({ ...base, lastSentAt: justUnder })).toBe(false)
    expect(shouldNudge({ ...base, lastSentAt: four })).toBe(true)
  })

  it('reads an unreadable last time as long ago', () => {
    expect(shouldNudge({ ...base, lastSentAt: 'yesterday-ish' })).toBe(true)
  })
})

describe('nudgeMessage', () => {
  it('says what the notice in the corner says, and goes to the garden', () => {
    expect(nudgeMessage(1)).toEqual({
      title: 'Tend the Garden',
      body: '1 card is due. A few minutes over what you have already read.',
      url: '/tend',
      tag: 'tend',
    })
    expect(nudgeMessage(24).body).toMatch(/^24 cards are due\./)
  })
})
