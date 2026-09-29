import { describe, it, expect } from 'vitest'
import { localClock, nudgeMessage, readRemindAt, shouldNudge } from '../src/tendPush'

// 22:00 UTC on 30 June is 08:00 on 1 July in Sydney (AEST, UTC+10).
const eightInSydney = new Date('2026-06-30T22:00:00Z')
const minutesLater = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)

describe('readRemindAt', () => {
  it('takes a 24-hour time and nothing else', () => {
    expect(readRemindAt('07:30')).toBe('07:30')
    expect(readRemindAt('23:59')).toBe('23:59')
    expect(readRemindAt('24:00')).toBeNull()
    expect(readRemindAt('7:30')).toBeNull()
    expect(readRemindAt(730)).toBeNull()
  })
})

describe('localClock', () => {
  it('reads the date and time where the reader is', () => {
    expect(localClock(eightInSydney, 'Australia/Sydney')).toEqual({ date: '2026-07-01', minutes: 480 })
    expect(localClock(eightInSydney, 'UTC')).toEqual({ date: '2026-06-30', minutes: 1320 })
  })

  it('falls back to UTC for a zone it cannot read', () => {
    expect(localClock(eightInSydney, 'Not/AZone').minutes).toBe(1320)
  })
})

describe('shouldNudge', () => {
  const base = {
    due: 5,
    lastSentAt: null,
    remindAt: '08:00',
    now: eightInSydney,
    timeZone: 'Australia/Sydney',
  }

  it('asks at the chosen time when something is due', () => {
    expect(shouldNudge(base)).toBe(true)
    expect(shouldNudge({ ...base, now: minutesLater(eightInSydney, 14) })).toBe(true)
  })

  it('never asks about nothing', () => {
    expect(shouldNudge({ ...base, due: 0 })).toBe(false)
  })

  it('does not ask before the chosen time', () => {
    expect(shouldNudge({ ...base, now: minutesLater(eightInSydney, -15) })).toBe(false)
    expect(shouldNudge({ ...base, remindAt: '18:30' })).toBe(false)
  })

  it('makes up a missed round, but lets the day go after two hours', () => {
    expect(shouldNudge({ ...base, now: minutesLater(eightInSydney, 120) })).toBe(true)
    expect(shouldNudge({ ...base, now: minutesLater(eightInSydney, 135) })).toBe(false)
  })

  it('asks once a day, counting days where the reader is', () => {
    // Sent at 08:05 Sydney: the next round the same morning stays quiet.
    const sentToday = minutesLater(eightInSydney, 5).toISOString()
    expect(shouldNudge({ ...base, now: minutesLater(eightInSydney, 15), lastSentAt: sentToday })).toBe(false)
    // Sent yesterday at 08:00 Sydney -- which is the same UTC date as now.
    const yesterday = minutesLater(eightInSydney, -24 * 60).toISOString()
    expect(shouldNudge({ ...base, lastSentAt: yesterday })).toBe(true)
  })

  it('reads an unreadable time as the default, and an unreadable last send as another day', () => {
    expect(shouldNudge({ ...base, remindAt: 'dawn' })).toBe(true)
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
