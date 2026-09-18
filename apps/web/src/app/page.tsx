import { EDITION_DATE as EDITION_DATE } from '@didactic/core/copy'
import Link from 'next/link'
import { viabilityFigure, vagueFigure } from '@didactic/core/scoring'
import { getHomeData } from '@/lib/home'
import { Emblem, slugify } from '@/components/Emblem'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { SheetNav } from '@/components/SheetNav'
import { LeaveLine } from '@/components/LeaveLine'
import { LightingLine } from '@/components/LightingLine'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'
import { plate } from '@didactic/tokens'



export default async function Home() {
  // The proxy has already turned unauthenticated traffic away; this is
  // the check that counts, made where the data is read.
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, data] = await Promise.all([requireOwner(), getHomeData()])
  const today = EDITION_DATE.format(new Date())
  const largestHolding = Math.max(1, ...data.subjects.map(s => s.count))

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="stock" />
        <div className={styles.masthead}>
          <h1 className={styles.title}>Didactic</h1>
          <div className={styles.edition}>
            <span className={styles.editionRule}>Subjects · {today}</span>
            <span className={styles.editionRule}>
              {data.totals.topics} topics · {data.totals.subjects} subjects
            </span>
          </div>
        </div>
        <p className={styles.strapline}>
          Everything you are growing, with its viability and what has gone
          dormant since you last tended it.
        </p>
      </header>
      <div className={styles.headRule} />

      <div className={styles.sheetBody}>
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
              <h2 className={styles.sectionTitle}>Subjects</h2>
              {/* Starting a subject, offered where the decision is
                  actually made: looking at what you already grow and
                  finding it does not cover something.

                  This is where the garden line used to be. Two quiet
                  links to the tending sheet stood beside this title on
                  the one sheet that already carries Tend in its running
                  head with the due count stamped on it -- so the sheet
                  asked three times for the same thing and never once
                  for the one that is not offered anywhere else. */}
              <Link href="/subjects/new" className={styles.sow}>
                Sow a new subject
              </Link>
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
                const vague = vagueFigure(subject.confidence)
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

            {/* Loose stock, folded behind one entry. The names are not
                listed here: a list of them is a glance at a job rather
                than the place it gets done, and it pushed everything
                below it down the sheet by however much was unfiled. The
                entry is set as a holding, so it takes its size from its
                count against the largest bed, and prints the total where
                a subject prints its viability and condition -- it has
                neither, because it is not a bed. */}
            {data.unfiled.length > 0 && (
              <section className={styles.looseStock}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Loose stock</h2>
                </div>
                <Link
                  href="/loose"
                  className={styles.entry}
                  style={{
                    '--weight': Math.min(1, data.unfiled.length / largestHolding),
                    '--i': data.subjects.length,
                  } as React.CSSProperties}
                >
                  <Emblem
                    slug="loose-stock"
                    colour={plate.terracotta}
                    size={48 + Math.min(1, data.unfiled.length / largestHolding) * 28}
                  />

                  <div className={styles.entryBody}>
                    <h3 className={styles.entryTitle}>
                      {data.unfiled.length === 1 ? 'Unfiled topic' : 'Unfiled topics'}
                    </h3>
                    <div className={styles.entryMeta}>
                      <span>Sown, but filed under no subject</span>
                    </div>
                  </div>

                  <div className={styles.entryFigures}>
                    <span className={styles.figureLabel}>Total</span>
                    <span className={styles.viability}>{data.unfiled.length}</span>
                  </div>
                </Link>
              </section>
            )}

            {/* Something read that matched nothing already sown. The
                topics are real and in the ground; what they are missing
                is a subject to belong to, and the resource that put them
                there is the case for sowing one. */}
            {data.fertile.length > 0 && (
              <section className={styles.loose}>
                <h3 className={styles.looseTitle}>Fertile ground</h3>
                <p className={styles.looseNote}>
                  Read, but about nothing you are growing yet. Sowing a subject
                  around one of these files it and its topics at once.
                </p>
                <ul className={styles.fertileList}>
                  {data.fertile.map(({ resource, topics }) => (
                    <li key={resource.id} className={styles.fertileRow}>
                      <div className={styles.fertileHead}>
                        <span className={styles.fertileTitle}>{resource.title}</span>
                        <span className={styles.fertileKind}>{resource.kind}</span>
                      </div>
                      <p className={styles.fertileTopics}>
                        {topics.map(t => t.title).join(' · ')}
                      </p>
                      {/* The sow form takes it from here: the resource
                          rides along as evidence, and its loose topics
                          are what the bed is laid out around. */}
                      <Link
                        href={`/subjects/new?from=${resource.id}`}
                        className={styles.fertileAction}
                      >
                        Sow a subject from this
                      </Link>
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
        {/* Which light the sheet is printed under, and the way out of
            the catalogue: both at the foot of the one sheet everything
            starts from, both pressed about once a year. */}
        <LightingLine />
        <LeaveLine />
      </footer>
      </div>
    </main>
  )
}
