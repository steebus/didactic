import { Suspense } from 'react'
import Link from 'next/link'
import { viabilityFigure } from '@/lib/scoring'
import { getHomeData } from '@/lib/home'
import { Emblem, slugify } from '@/components/Emblem'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { SheetNav } from '@/components/SheetNav'
import { EditionGalley, StockGalley } from './Galley'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'


const EDITION_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * The stock list.
 *
 * The masthead, the strapline and the rule under them are the same on
 * every visit and need neither the session nor the database, so they
 * are printed the moment the route is reached. The edition line and
 * the holdings stream into them: two boundaries rather than one,
 * because the figure at the top of the sheet should not hold up the
 * sheet, and the sheet should not hold up the figure.
 */
export default function Home() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="stock" />
        <div className={styles.masthead}>
          <h1 className={styles.title}>Didactic</h1>
          <Suspense fallback={<EditionGalley />}>
            <Edition />
          </Suspense>
        </div>
        <p className={styles.strapline}>
          Everything you are growing, with its viability and what has gone
          dormant since you last tended it.
        </p>
      </header>
      <div className={styles.headRule} />

      <div className={styles.sheetBody}>
        <Suspense fallback={<StockGalley />}>
          <Stock />
        </Suspense>
      </div>
    </main>
  )
}

/** What edition this is: the date, and what the catalogue holds. */
async function Edition() {
  const [, data] = await Promise.all([requireOwner(), getHomeData()])
  const today = EDITION_DATE.format(new Date())

  return (
    <div className={styles.edition}>
      <span className={styles.editionRule}>Stock list · {today}</span>
      <span className={styles.editionRule}>
        {data.totals.topics} topics · {data.totals.subjects} subjects
      </span>
    </div>
  )
}

/** The holdings themselves. */
async function Stock() {
  // The proxy has already turned unauthenticated traffic away; this is
  // the check that counts, made where the data is read. It starts
  // together with the read rather than before it: neither needs the
  // other's answer, and each is a round trip to a different continent.
  const [, data] = await Promise.all([requireOwner(), getHomeData()])
  const largestHolding = Math.max(1, ...data.subjects.map(s => s.count))

  return (
    <>
      {data.totals.topics === 0 ? (
        <div className={styles.blank}>
          <h2 className={styles.blankTitle}>Nothing sown yet</h2>
          <p className={styles.blankNote}>
            Name something you want to learn and the sheet fills itself, or send
            an article to the inbox and let it find its own place.
          </p>
          <Link href="/subjects/new" className={styles.recommendationAction} style={{ color: 'var(--ink)' }}>
            Sow a subject
          </Link>
        </div>
      ) : (
        <div className={styles.spread}>
          <section>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Stock in hand</h2>
              <span className={styles.sectionNote}>
                Viability · condition
              </span>
            </div>

            <ul className={styles.listing}>
              {data.subjects.map((subject, index) => {
                const state = stockState(subject.freshness, subject.lastExposureAt)
                const slug = slugify(subject.title)
                // Larger holdings take more of the sheet.
                const weight = subject.count / largestHolding
                // A figure the app is unsure of prints soft and hedged:
                // ability is app-owned and cannot be corrected by hand,
                // so it must not look more certain than it is.
                const vague = subject.confidence < 0.4
                return (
                  <li key={subject.id}>
                    <Link
                      // A holding opens as its own sheet now, not
                      // straight onto the canvas: the bed is a fixed
                      // outline you can act on, and the graph is one
                      // press away from it.
                      href={`/subjects/${subject.id}`}
                      className={styles.entry}
                      style={{ '--weight': weight, '--i': index } as React.CSSProperties}
                    >
                      <Emblem
                        slug={slug}
                        colour={subject.colour}
                        size={48 + weight * 28}
                      />

                      <div className={styles.entryBody}>
                        <h3 className={styles.entryTitle}>{subject.title}</h3>
                        <div className={styles.entryMeta}>
                          <span>
                            {subject.count} {subject.count === 1 ? 'topic' : 'topics'}
                          </span>
                          <span className={styles.leaders} aria-hidden="true" />
                          {subject.queuedCount > 0 && (
                            <span className={styles.queuedFlag}>
                              {subject.queuedCount} unread
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.entryFigures}>
                        <span className={styles.figureLabel}>Viability</span>
                        <span
                          className={`${styles.viability} ${vague ? styles.viabilityVague : ''}`}
                        >
                          {vague && <span className={styles.about}>about </span>}
                          {viabilityFigure(subject.ability)}
                        </span>
                        <span className={styles.figureLabel}>Condition</span>
                        <span className={styles.conditionCell}>
                          <StockBar
                            freshness={subject.freshness}
                            lastExposureAt={subject.lastExposureAt}
                            colour={subject.colour}
                          />
                          <span className={styles.stateLine}>{STOCK_LABEL[state]}</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>

            {data.unfiled.length > 0 && (
              <section className={styles.loose}>
                <h3 className={styles.looseTitle}>Loose stock</h3>
                <p className={styles.looseNote}>
                  Sown but not yet filed under a subject.
                </p>
                <ul className={styles.looseList}>
                  {data.unfiled.map(topic => (
                    <li key={topic.id} className={styles.blockRow}>
                      <Link href={`/topics/${topic.id}`} className={styles.blockRowName}>
                        {topic.title}
                      </Link>
                      <span className={styles.leaders} aria-hidden="true" />
                      <span className={styles.blockFigure}>
                        {viabilityFigure(topic.ability)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>

          <aside className={styles.margin}>
            {data.inProgress.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Under way</h2>
                <ul className={styles.workList}>
                  {data.inProgress.map(c => (
                    <li key={c.id} className={styles.workRow}>
                      <Link href={`/curriculum/${c.id}`} className={styles.workTitle}>
                        {c.title}
                      </Link>
                      <span className={styles.workMeta}>
                        {c.topicTitle && `${c.topicTitle} · `}
                        {c.completed} of {c.total} worked
                      </span>
                      {c.nextLesson ? (
                        <Link href={`/lesson/${c.nextLesson.id}`} className={styles.workNext}>
                          Carry on: {c.nextLesson.title}
                        </Link>
                      ) : (
                        <span className={styles.workBlocked}>
                          Nothing open — earlier ground first
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>In season</h2>
              {data.hot.length === 0 ? (
                <p className={styles.empty}>Nothing tended lately.</p>
              ) : (
                <ul className={styles.blockList}>
                  {data.hot.map(topic => (
                    <li key={topic.id} className={styles.blockRow}>
                      <Link href={`/topics/${topic.id}`} className={styles.blockRowName}>
                        {topic.title}
                      </Link>
                      <span className={styles.leaders} aria-hidden="true" />
                      <span className={styles.blockFigure}>
                        {viabilityFigure(topic.ability)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Going dormant</h2>
              {data.cold.length === 0 ? (
                <p className={styles.empty}>Everything is holding.</p>
              ) : (
                <ul className={styles.blockList}>
                  {data.cold.map(topic => (
                    <li key={topic.id} className={styles.blockRow}>
                      <Link href={`/topics/${topic.id}`} className={styles.blockRowName}>
                        {topic.title}
                      </Link>
                      <span className={styles.leaders} aria-hidden="true" />
                      <span className={styles.blockFigure}>
                        {viabilityFigure(topic.ability)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Unsown stock</h2>
              {data.queued.length === 0 ? (
                <p className={styles.empty}>Nothing waiting.</p>
              ) : (
                <ul className={styles.blockList}>
                  {data.queued.slice(0, 5).map(resource => (
                    <li key={resource.id} className={styles.blockRow}>
                      <span className={styles.blockRowName}>{resource.title}</span>
                      <span className={styles.leaders} aria-hidden="true" />
                      <span className={styles.blockFigure}>{resource.kind}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.suggested && (
              <section className={styles.recommendation}>
                <h2 className={styles.recommendationTitle}>This season</h2>
                <p className={styles.recommendationName}>{data.suggested.title}</p>
                <p className={styles.recommendationNote}>
                  Viability has fallen to {viabilityFigure(data.suggested.ability)}.
                  Ten minutes would bring it back.
                </p>
                <Link
                  href={`/topics/${data.suggested.id}`}
                  className={styles.recommendationAction}
                >
                  Tend it
                </Link>
              </section>
            )}
          </aside>
        </div>
      )}

      <footer className={styles.foot}>
        <span>
          {data.pendingCount > 0
            ? `${data.pendingCount} awaiting your decision`
            : 'Nothing awaiting decision'}
        </span>
        <nav className={styles.footLinks}>
          <Link href="/graph">The whole bed</Link>
          <Link href="/inbox">Inbox</Link>
          <Link href="/subjects/new">Sow a subject</Link>
        </nav>
      </footer>
    </>
  )
}
