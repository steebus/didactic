'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { tendPhrase } from '@didactic/core/clozes'
import { useBench } from './Bench'

const api = didactic()

/**
 * How often the garden is allowed to ask.
 *
 * Four hours. The figure is the whole design of this notice: a garden
 * that asks every time you open a sheet is a garden you learn to
 * dismiss without reading, and a notice nobody reads is worse than no
 * notice -- it teaches the reader to ignore the corner where the bench
 * also reports what their work came to.
 */
const EVERY_MS = 4 * 60 * 60 * 1000

/** When it last asked. Kept in the browser, because it is a fact about
 *  this person at this screen and not about the catalogue. */
const LAST_ASKED = 'didactic:tend-asked'

/** How long after landing before it asks. Long enough that the sheet
 *  the reader came for is the thing they see first. */
const SETTLE_MS = 2500

function askedAt(): number {
  try {
    return Number(localStorage.getItem(LAST_ASKED)) || 0
  } catch {
    // Site data blocked. It will simply ask once per page instead of
    // once per four hours, which is the right way round to fail: the
    // notice is dismissible and the alternative is never asking.
    return 0
  }
}

function remember(at: number) {
  try {
    localStorage.setItem(LAST_ASKED, String(at))
  } catch {
    // As above.
  }
}

/**
 * Tend the Garden: the notice that says something is due.
 *
 * Mounted above the router with the bench, so it is the same slip of
 * paper in the same corner as everything else the app has to say, and
 * so walking from sheet to sheet does not restart its clock.
 *
 * It never asks on the Tend sheet itself: the reader is already
 * standing in the garden, and being told there is work here while
 * doing it is the app talking over itself.
 */
export function TendNotice() {
  // The two controls rather than the bench itself: the bench object
  // changes identity whenever any job ticks over, and depending on it
  // would tear this effect down and set it up again -- restarting the
  // beat and asking for the count -- every time a notice in the corner
  // moved. `offer` and `withdraw` are stable.
  const { offer, withdraw } = useBench()
  const router = useRouter()
  const here = usePathname()
  const tending = here?.startsWith('/tend') ?? false

  useEffect(() => {
    if (tending) return

    let cancelled = false

    const ask = async () => {
      if (cancelled) return
      const since = Date.now() - askedAt()
      if (since < EVERY_MS) return

      const { ok, body } = await api.clozes.count()
      // Nothing due is not an errand, and it does not spend the four
      // hours either: the next check should still happen when there is
      // finally something to say.
      if (cancelled || !ok || body.due === 0) return

      remember(Date.now())
      offer({
        key: 'tend',
        title: 'Tend the Garden',
        note: `${tendPhrase(body.due)}. A few minutes over what you have already read.`,
        label: 'Tend now',
        take: () => router.push('/tend'),
      })
    }

    // Once the sheet the reader came for has settled, and then on the
    // beat for as long as the tab is left open -- a browser tab lives
    // for days, and the whole point of a four-hourly notice is that it
    // arrives during the day rather than only on a fresh load.
    const settling = setTimeout(() => void ask(), SETTLE_MS)
    const beat = setInterval(() => void ask(), 10 * 60 * 1000)

    return () => {
      cancelled = true
      clearTimeout(settling)
      clearInterval(beat)
    }
  }, [offer, router, tending])

  // Standing in the garden puts the notice away, however it got there.
  useEffect(() => {
    if (tending) withdraw('tend')
  }, [tending, withdraw])

  return null
}
