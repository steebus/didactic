import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { viabilityFigure } from '@/lib/scoring'
import { getSubjectArea } from '@/lib/subject'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { Emblem, slugify } from '@/components/Emblem'
import { SheetNav } from '@/components/SheetNav'
import { ROOT_STAGES } from '@/components/RootsSpecimen'
import { SubjectBed } from './SubjectBed'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params
  const area = await getSubjectArea(supabaseAdmin(), id)
  if (!area) notFound()

  const { subject, tree, topics, counts, sowing } = area
  const state = stockState(area.freshness, area.lastExposureAt)
  const vague = area.confidence < 0.4

  return (
    <main className={styles.sheet}>
      <header
        className={styles.head}
        style={
          { background: subject.colour, '--focus-ink': 'var(--paper)' } as React.CSSProperties
        }
      >
        <SheetNav back={{ href: '/', label: 'Stock list' }} />

        <div className={styles.headRow}>
          <div className={styles.headTitle}>
            <p className={styles.eyebrow}>Subject</p>
            <h1 className={styles.title}>{subject.title}</h1>
            <p className={styles.summary}>
              {counts.topics} {counts.topics === 1 ? 'topic' : 'topics'} ·{' '}
              {counts.resources} {counts.resources === 1 ? 'resource' : 'resources'}
              {counts.unread > 0 && ` (${counts.unread} unread)`} · {counts.curricula}{' '}
              {counts.curricula === 1 ? 'curriculum' : 'curricula'}
            </p>
          </div>

          <Emblem slug={slugify(subject.title)} colour="rgba(239,231,214,0.16)" size={72} />
        </div>

        <div className={styles.headFoot}>
          <div className={styles.figures}>
            <span className={styles.figure}>
              <span className={styles.figureLabel}>Viability</span>
              <span className={`${styles.figureValue} ${vague ? styles.vague : ''}`}>
                {vague && <span className={styles.about}>about </span>}
                {viabilityFigure(area.ability)}
              </span>
            </span>
            <span className={styles.figure}>
              <span className={styles.figureLabel}>Condition</span>
              <span className={styles.figureValue}>{STOCK_LABEL[state]}</span>
            </span>
          </div>

          {/* The other reading of the same bed. The outline below is
              fixed and scannable; the graph is where position is
              emergent and the connections are the point. */}
          <Link href={`/graph?subject=${subject.id}`} className={styles.showGraph}>
            Show graph
          </Link>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <div className={styles.spread}>
          <div className={styles.main}>
            <SubjectBed subjectId={subject.id} tree={tree} colour={subject.colour} />
          </div>

          <aside className={styles.margin}>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Condition</h2>
              <StockBar
                freshness={area.freshness}
                lastExposureAt={area.lastExposureAt}
                colour={subject.colour}
              />
              <p className={styles.blockNote}>
                {area.lastExposureAt
                  ? `Last tended ${DATE.format(new Date(area.lastExposureAt))}.`
                  : 'Nothing here has been tended yet.'}
              </p>
              {vague && (
                <p className={styles.caveat}>
                  Not much to go on yet — this figure is a guess.
                </p>
              )}
            </section>

            {sowing && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>How you sowed it</h2>
                <p className={styles.blockNote}>
                  {DATE.format(new Date(sowing.created_at))}
                  {sowing.roots !== null &&
                    ` · roots ${sowing.roots} of 5, ${ROOT_STAGES[sowing.roots].label.toLowerCase()}`}
                </p>

                <dl className={styles.account}>
                  {sowing.confident && (
                    <>
                      <dt className={styles.accountTerm}>Already taken</dt>
                      <dd className={styles.accountValue}>{sowing.confident}</dd>
                    </>
                  )}
                  {sowing.gaps && (
                    <>
                      <dt className={styles.accountTerm}>Thin ground</dt>
                      <dd className={styles.accountValue}>{sowing.gaps}</dd>
                    </>
                  )}
                  {sowing.depth && (
                    <>
                      <dt className={styles.accountTerm}>How far</dt>
                      <dd className={styles.accountValue}>{sowing.depth}</dd>
                    </>
                  )}
                  {sowing.evidence.length > 0 && (
                    <>
                      <dt className={styles.accountTerm}>Evidence filed</dt>
                      <dd className={styles.accountValue}>
                        {sowing.evidence.map(e => e.title).join(' · ')}
                      </dd>
                    </>
                  )}
                </dl>

                {sowing.qualifiers.filter(q => q.answer?.trim()).length > 0 && (
                  <details className={styles.answers}>
                    <summary className={styles.answersSummary}>
                      {sowing.qualifiers.filter(q => q.answer?.trim()).length} qualifying
                      answers
                    </summary>
                    <ul className={styles.answerList}>
                      {sowing.qualifiers
                        .filter(q => q.answer?.trim())
                        .map(q => (
                          <li key={q.prompt} className={styles.answerRow}>
                            <span className={styles.answerRung}>{q.level}</span>
                            <span>
                              <span className={styles.answerPrompt}>{q.prompt}</span>
                              <span className={styles.answerText}>{q.answer}</span>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}

                <p className={styles.caveat}>
                  A self-report sets the first figure and nothing else. Real
                  reading and real work overwrite it.
                </p>

                {sowing.assessment && (
                  <Link href={`/subjects/${subject.id}/reading`} className={styles.readingLink}>
                    See the reading
                  </Link>
                )}
              </section>
            )}

            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Unread here</h2>
              {counts.unread === 0 ? (
                <p className={styles.empty}>Nothing waiting.</p>
              ) : (
                <ul className={styles.blockList}>
                  {topics
                    .flatMap(t =>
                      t.resources
                        .filter(r => r.status === 'queued')
                        .map(r => ({ resource: r, topic: t }))
                    )
                    // One resource can be filed against several topics in
                    // the same subject; the margin lists it once.
                    .filter(
                      (row, i, all) =>
                        all.findIndex(o => o.resource.id === row.resource.id) === i
                    )
                    .slice(0, 8)
                    .map(({ resource, topic }) => (
                      <li key={resource.id} className={styles.blockRow}>
                        <span className={styles.blockRowName}>
                          {resource.url ? (
                            <a href={resource.url} target="_blank" rel="noreferrer">
                              {resource.title}
                            </a>
                          ) : (
                            resource.title
                          )}
                        </span>
                        <span className={styles.leaders} aria-hidden="true" />
                        <Link href={`/topics/${topic.id}`} className={styles.blockFigure}>
                          {topic.title}
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
