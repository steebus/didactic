import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { getHomeData } from '@/lib/home'
import { Emblem, slugify } from '@/components/Emblem'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const EDITION_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function viabilityFigure(ability: number) {
  // Ability is 1-5; the sheet prints it as a percentage of full stock,
  // which is how a grower reads viability. An empty cluster aggregates
  // to 0, which is below the floor, so the figure is clamped rather
  // than printing a negative percentage.
  return Math.max(0, Math.round(((ability - 1) / 4) * 100))
}

export default async function Home() {
  const data = await getHomeData(supabaseAdmin())
  const today = EDITION_DATE.format(new Date())
  const largestHolding = Math.max(1, ...data.clusters.map(c => c.count))

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <div className={styles.masthead}>
          <h1 className={styles.title}>Didactic</h1>
          <div className={styles.edition}>
            <span className={styles.editionRule}>Stock list · {today}</span>
            <span className={styles.editionRule}>
              {data.totals.nodes} subjects · {data.totals.clusters} sections
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
      {data.totals.nodes === 0 ? (
        <div className={styles.blank}>
          <h2 className={styles.blankTitle}>Nothing sown yet</h2>
          <p className={styles.blankNote}>
            Name something you want to learn and the sheet fills itself, or send
            an article to the inbox and let it find its own place.
          </p>
          <Link href="/topics/new" className={styles.recommendationAction} style={{ color: 'var(--ink)' }}>
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
              {data.clusters.map(cluster => {
                const state = stockState(cluster.freshness, cluster.count > 0 ? 'seen' : null)
                const slug = slugify(cluster.title)
                // Larger holdings take more of the sheet.
                const weight = cluster.count / largestHolding
                return (
                  <li key={cluster.id}>
                    <Link
                      href={`/graph?cluster=${cluster.id}`}
                      className={styles.entry}
                      style={{ '--weight': weight } as React.CSSProperties}
                    >
                      <Emblem
                        slug={slug}
                        colour={cluster.colour}
                        size={48 + weight * 28}
                      />

                      <div className={styles.entryBody}>
                        <h3 className={styles.entryTitle}>{cluster.title}</h3>
                        <div className={styles.entryMeta}>
                          <span>
                            {cluster.count} {cluster.count === 1 ? 'subject' : 'subjects'}
                          </span>
                          <span className={styles.leaders} aria-hidden="true" />
                          {cluster.queuedCount > 0 && (
                            <span className={styles.queuedFlag}>
                              {cluster.queuedCount} unread
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.entryFigures}>
                        <span className={styles.figureLabel}>Viability</span>
                        <span className={styles.viability}>
                          {viabilityFigure(cluster.ability)}
                        </span>
                        <span className={styles.figureLabel}>Condition</span>
                        <span className={styles.conditionCell}>
                          <StockBar
                            freshness={cluster.freshness}
                            lastExposureAt={cluster.count > 0 ? 'seen' : null}
                            colour={cluster.colour}
                          />
                          <span className={styles.stateLine}>{STOCK_LABEL[state]}</span>
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <aside className={styles.margin}>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>In season</h2>
              {data.hot.length === 0 ? (
                <p className={styles.empty}>Nothing tended lately.</p>
              ) : (
                <ul className={styles.blockList}>
                  {data.hot.map(node => (
                    <li key={node.id} className={styles.blockRow}>
                      <Link href={`/graph?node=${node.id}`} className={styles.blockRowName}>
                        {node.title}
                      </Link>
                      <span className={styles.leaders} aria-hidden="true" />
                      <span className={styles.blockFigure}>
                        {viabilityFigure(node.ability)}
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
                  {data.cold.map(node => (
                    <li key={node.id} className={styles.blockRow}>
                      <Link href={`/graph?node=${node.id}`} className={styles.blockRowName}>
                        {node.title}
                      </Link>
                      <span className={styles.leaders} aria-hidden="true" />
                      <span className={styles.blockFigure}>
                        {viabilityFigure(node.ability)}
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
                  href={`/refresher/${data.suggested.id}`}
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
          <Link href="/topics/new">Sow a subject</Link>
        </nav>
      </footer>
      </div>
    </main>
  )
}
