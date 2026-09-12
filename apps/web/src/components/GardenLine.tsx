'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import type { ClozeCount } from '@didactic/core/clozes'
import { tendPhrase } from '@didactic/core/clozes'
import { TENDED } from './TendTally'
import styles from './GardenLine.module.css'

const api = didactic()

/**
 * The way into the garden from wherever you are standing.
 *
 * One line: what is due, and the offer to turn something over at
 * random. It is printed on the stock list against the whole site, on a
 * subject against that subject and on a topic against that topic, so
 * "give me something from here" means the thing the reader is looking
 * at rather than always meaning everything.
 *
 * A random cloze is offered whether or not anything is due, and that is
 * the point of it: the schedule says what is *worth* asking, and a
 * reader who wants to turn something over anyway should not have to
 * wait for permission. Answering one still moves its schedule -- it is
 * a real answer, not a rehearsal.
 */
export function GardenLine({
  subjectId,
  topicId,
  /** What "here" is called, for the random offer. */
  here,
}: {
  subjectId?: string
  topicId?: string
  here?: string
}) {
  const [counts, setCounts] = useState<ClozeCount | null>(null)

  // Only the site-wide line prints a figure. A count scoped to one
  // subject would be a second route, asked for on every subject sheet,
  // to print a number beside a link that works either way.
  const wide = !subjectId && !topicId

  useEffect(() => {
    if (!wide) return
    let cancelled = false

    const read = () => {
      void api.clozes.count().then(({ ok, body }) => {
        if (!cancelled && ok) setCounts(body)
      })
    }

    read()
    window.addEventListener(TENDED, read)
    return () => {
      cancelled = true
      window.removeEventListener(TENDED, read)
    }
  }, [wide])

  const query = new URLSearchParams()
  if (subjectId) query.set('subject', subjectId)
  if (topicId) query.set('topic', topicId)

  const tendHref = wide ? '/tend' : `/tend?${query}`
  const randomQuery = new URLSearchParams(query)
  randomQuery.set('mode', 'random')

  // Nothing to say and nothing planted: the line would be an
  // advertisement for a feature rather than a way into one.
  if (wide && counts && counts.total === 0) return null

  return (
    <p className={styles.line}>
      {wide && counts && counts.due > 0 ? (
        <>
          <Link href={tendHref} className={styles.due}>
            {tendPhrase(counts.due)}
          </Link>
          <span className={styles.gap}>·</span>
        </>
      ) : (
        wide && (
          <>
            <span className={styles.rest}>Nothing due</span>
            <span className={styles.gap}>·</span>
          </>
        )
      )}
      <Link href={`/tend?${randomQuery}`} className={styles.random}>
        {here ? `A random cloze from ${here}` : 'A random cloze'}
      </Link>
      {!wide && (
        <>
          <span className={styles.gap}>·</span>
          <Link href={tendHref} className={styles.random}>
            What is due here
          </Link>
        </>
      )}
    </p>
  )
}
