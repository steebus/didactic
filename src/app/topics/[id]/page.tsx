import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { viabilityFigure } from '@/lib/scoring'
import { getTopicArea } from '@/lib/topic'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { DraftCurriculum } from './DraftCurriculum'
import { AddResource } from '@/components/AddResource'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EDGE_KIND_LABEL: Record<string, string> = {
  prereq: 'sow first',
  related: 'grows with',
  specialises: 'variety of',
  alternative: 'instead of',
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params
  const area = await getTopicArea(supabaseAdmin(), id)
  if (!area) notFound()

  const { topic, subjects, curricula, resources, neighbours, exposures } = area
  const vague = topic.ability_confidence < 0.4
  const state = stockState(topic.freshness, topic.last_exposure_at)
  const colour = subjects[0]?.colour ?? 'var(--plate-green)'
  const unread = resources.filter(r => r.resource.status === 'queued')
  const read = resources.filter(r => r.resource.status !== 'queued')

  return (
    <main className={styles.sheet}>
      <header className={styles.head} style={{ background: colour }}>
        <div className={styles.headRow}>
          <div>
            {/* The subject names were already printed here; they are
                the way back to the bed the topic was sown in, so they
                are links rather than a label. */}
            <p className={styles.eyebrow}>
              {subjects.length === 0
                ? 'Unfiled'
                : subjects.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ' · '}
                      <Link href={`/subjects/${s.id}`} className={styles.eyebrowLink}>
                        {s.title}
                      </Link>
                    </span>
                  ))}
            </p>
            <h1 className={styles.title}>{topic.title}</h1>
          </div>
          <Link href="/" className={styles.back}>
            Back to the stock list
          </Link>
        </div>

        {topic.summary && <p className={styles.summary}>{topic.summary}</p>}

        <div className={styles.figures}>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Viability</span>
            <span className={styles.figureValue}>
              {vague && <span className={styles.about}>about </span>}
              {viabilityFigure(topic.ability)}
            </span>
          </span>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Condition</span>
            <span className={styles.figureValue}>{STOCK_LABEL[state]}</span>
          </span>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <div className={styles.spread}>
          <div className={styles.main}>
            <section>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Curriculum</h2>
                <span className={styles.sectionNote}>Introductory to advanced</span>
              </div>

              {curricula.length === 0 ? (
                <p className={styles.empty}>
                  No route laid out yet. Draft one and reshape it until it is
                  the one you actually want to follow.
                </p>
              ) : (
                <ul className={styles.routes}>
                  {curricula.map(c => (
                    <li key={c.id}>
                      <Link href={`/curriculum/${c.id}`} className={styles.route}>
                        <div className={styles.routeBody}>
                          <h3 className={styles.routeTitle}>{c.title}</h3>
                          <p className={styles.routeMeta}>
                            {c.shape === 'branching' ? 'Branching' : 'Linear'}
                            {' · '}
                            {c.total} {c.total === 1 ? 'lesson' : 'lessons'}
                            {c.status === 'draft' && ' · awaiting your approval'}
                            {c.status === 'archived' && ' · archived'}
                          </p>
                          {c.goal && <p className={styles.routeGoal}>{c.goal}</p>}
                        </div>
                        <div className={styles.routeFigure}>
                          <span className={styles.figureLabel}>Worked</span>
                          <span className={styles.routeCount}>
                            {c.complete}/{c.total}
                          </span>
                          <span
                            className={styles.routeBar}
                            aria-hidden="true"
                            style={{ '--fraction': c.fraction } as React.CSSProperties}
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <DraftCurriculum
                topicId={topic.id}
                topicTitle={topic.title}
                candidates={resources.map(r => ({
                  id: r.resource.id,
                  title: r.resource.title,
                  kind: r.resource.kind,
                }))}
              />
            </section>

            <section>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Resources</h2>
                <span className={styles.sectionNote}>
                  {unread.length > 0 ? `${unread.length} unread` : 'All read'}
                </span>
              </div>

              {resources.length === 0 ? (
                <p className={styles.empty}>
                  Nothing filed against this topic yet.
                </p>
              ) : (
                <ul className={styles.material}>
                  {[...unread, ...read].map(({ resource }) => (
                    <li key={resource.id} className={styles.materialRow}>
                      <span className={styles.materialName}>
                        {resource.url ? (
                          <a href={resource.url} target="_blank" rel="noreferrer">
                            {resource.title}
                          </a>
                        ) : (
                          resource.title
                        )}
                      </span>
                      <span className={styles.leaders} aria-hidden="true" />
                      <span className={styles.materialMeta}>
                        {resource.kind} · {resource.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Filed here rather than sent to the inbox to be sorted:
                  when you already know what a thing is about, saying so
                  beats waiting for a model to work it out. */}
              <AddResource topicId={topic.id} topicTitle={topic.title} compact />
            </section>
          </div>

          <aside className={styles.margin}>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Why this figure</h2>
              {exposures.length === 0 ? (
                <p className={styles.empty}>
                  Nothing recorded. The figure is the starting floor, not a
                  measurement.
                </p>
              ) : (
                <ul className={styles.record}>
                  {exposures.map(e => (
                    <li key={e.id} className={styles.recordRow}>
                      <span>{e.reason}</span>
                      <span className={styles.recordDate}>
                        {new Date(e.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {vague && (
                <p className={styles.caveat}>
                  Not much to go on yet — this figure is a guess.
                </p>
              )}
            </section>

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Condition</h2>
              <StockBar
                freshness={topic.freshness}
                lastExposureAt={topic.last_exposure_at}
                colour={colour}
              />
              <p className={styles.blockNote}>
                {topic.last_exposure_at
                  ? `Last tended ${new Date(topic.last_exposure_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}.`
                  : 'Never tended.'}
              </p>
              <Link href={`/refresher/${topic.id}`} className={styles.action}>
                Read a refresher
              </Link>
            </section>

            {neighbours.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Nearby</h2>
                <ul className={styles.record}>
                  {neighbours.map(n => (
                    <li key={`${n.id}-${n.kind}-${n.incoming}`} className={styles.recordRow}>
                      <Link href={`/topics/${n.id}`}>{n.title}</Link>
                      <span className={styles.recordDate}>
                        {EDGE_KIND_LABEL[n.kind] ?? n.kind}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
