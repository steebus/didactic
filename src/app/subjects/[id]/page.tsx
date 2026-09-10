import Link from 'next/link'
import { notFound } from 'next/navigation'
import { viabilityFigure } from '@/lib/scoring'
import { getSubjectArea } from '@/lib/subject'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { Emblem, slugify } from '@/components/Emblem'
import { SheetNav } from '@/components/SheetNav'
import { ROOT_STAGES } from '@/components/RootsSpecimen'
import { SubjectBed } from './SubjectBed'
import { GrubOut } from './GrubOut'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'
import { Suspense } from 'react'
import { HeadGalley, BedGalley } from './Galley'

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * A bed: the topics in a subject, what is filed against them, and the
 * account of how it was sown.
 *
 * Split in two so neither half waits on the other's rendering. The
 * band cannot be printed ahead of the data -- it carries the subject's
 * own plate colour and its title -- so it stands in the sheet's
 * default ground until it arrives, and the outline streams in
 * separately beneath the rule. Both halves read the same cached area,
 * which is one read however many ask for it.
 */
export default function SubjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // The id is not read here. Which subject this is is a runtime
  // answer, and awaiting it in the page body would make the whole
  // sheet wait for the request -- including the rule and the measure,
  // which are the same for every bed there will ever be. The promise
  // goes down to the halves that actually need it.
  return (
    <main className={styles.sheet}>
      <Suspense fallback={<HeadGalley />}>
        <Head params={params} />
      </Suspense>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Suspense fallback={<BedGalley />}>
          <Bed params={params} />
        </Suspense>
      </div>
    </main>
  )
}

/** The band: what this bed is, and how it is doing. */
async function Head({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent. An unauthenticated request still ends in
  // the redirect the gate throws.
  const [, area] = await Promise.all([requireOwner(), getSubjectArea(id)])
  if (!area) notFound()

  const { subject, counts } = area
  const state = stockState(area.freshness, area.lastExposureAt)
  const vague = area.confidence < 0.4

  return (
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
  )
}

/** The bed itself, and the margin beside it. */
async function Bed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [, area] = await Promise.all([requireOwner(), getSubjectArea(id)])
  if (!area) notFound()

  const { subject, tree, topics, counts, sowing } = area
  const vague = area.confidence < 0.4

  return (
    <>
        <div className={styles.spread}>
          <div className={styles.main}>
            <SubjectBed
              subjectId={subject.id}
              tree={tree}
              colour={subject.colour}
              sown={sowing !== null}
              related={counts.edges}
            />
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

        {/* At the foot, past everything the bed holds. Grubbing one out
            is the last thing anyone does to a subject and should never
            sit beside the things they do daily. */}
        <div className={styles.foot}>
          <GrubOut subjectId={subject.id} title={subject.title} />
        </div>
    </>
  )
}
