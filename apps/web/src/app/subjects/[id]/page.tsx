import { EDITION_DATE as DATE } from '@didactic/core/copy'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { viabilityFigure, vagueFigure } from '@didactic/core/scoring'
import { GRAIN } from '@didactic/core/config'
import { getSubjectArea } from '@/lib/subject'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { SheetNav } from '@/components/SheetNav'
import { Graph, Cards, Tray } from '@/components/NavGlyphs'
import glyphs from '@/components/FootBar.module.css'
import { BandSpecimen, BandSpecimenCaption } from '@/components/BandSpecimen'
import { routeProgress, aggregateRoutes } from '@didactic/core/progress'
import { ROOT_STAGES } from '@/components/RootsSpecimen'
import { SubjectBed } from './SubjectBed'
import { GrubOut } from './GrubOut'
import { BedTarget } from './BedTarget'
import { PutBack } from './PutBack'
import styles from './page.module.css'
import { Suspense } from 'react'
import { ActivityEntry } from '@/components/ActivityEntry'
import { requireOwner } from '@/lib/auth'



export default async function SubjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, area] = await Promise.all([requireOwner(), getSubjectArea(id)])
  if (!area) notFound()

  const { subject, tree, groups, topics, counts, sowing, resources } = area
  const state = stockState(area.freshness, area.lastExposureAt)
  const vague = vagueFigure(area.confidence)
  // The bed's routes folded into one figure, so the band's plant grows
  // with how much of the subject has actually been worked.
  const routes = aggregateRoutes(topics.map(t => routeProgress(t.curricula)))

  return (
    <main className={styles.sheet}>
      <header
        className={styles.head}
        style={
          { background: subject.colour, '--focus-ink': 'var(--paper)' } as React.CSSProperties
        }
      >
        {/* How far the bed has been worked, laid in as the band's own
            ground rather than standing beside the title. */}
        <BandSpecimen progress={routes} ink={subject.colour} />

        <SheetNav back={{ href: '/', label: 'Subjects' }} />

        <div className={styles.headRow}>
          <div className={styles.headTitle}>
            <h1 className={styles.title}>{subject.title}</h1>
            <p className={styles.summary}>
              {counts.topics} {counts.topics === 1 ? 'topic' : 'topics'} ·{' '}
              {counts.resources} {counts.resources === 1 ? 'resource' : 'resources'}
              {counts.unread > 0 && ` (${counts.unread} unread)`} · {counts.curricula}{' '}
              {counts.curricula === 1 ? 'curriculum' : 'curricula'}
            </p>
            {/* The figure the specimen used to carry under it. The
                drawing is the band's ground now, and a faded drawing
                cannot be read as a figure. */}
            <BandSpecimenCaption progress={routes} />
          </div>
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
            {area.effort && area.effort.topics > 0 && (
              <span className={styles.figure}>
                <span className={styles.figureLabel}>
                  To depth {area.effort.target ?? GRAIN.DEFAULT_TARGET}
                </span>
                <span className={`${styles.figureValue} ${area.effort.about ? styles.vague : ''}`}>
                  {area.effort.lessons === 0 ? (
                    'reached'
                  ) : (
                    <>
                      {area.effort.about && <span className={styles.about}>about </span>}
                      {Math.round(area.effort.hours)} h
                    </>
                  )}
                </span>
              </span>
            )}
          </div>

          {/* The other readings of the same bed: the graph, where
              position is emergent and the connections are the point;
              the cards to turn over from it; and what has been sent in
              for it. Words under the glyphs: the word is the carrier. */}
          <div
            className={styles.tools}
            style={{ '--glyph-ground': subject.colour } as React.CSSProperties}
          >
            <Link href={`/graph?subject=${subject.id}`} className={styles.tool}>
              <span className={glyphs.glyph}><Graph /></span>
              Subject bed
            </Link>
            <Link href={`/tend?subject=${subject.id}`} className={styles.tool}>
              <span className={glyphs.glyph}><Cards /></span>
              Tend subject
            </Link>
            <Link href={`/inbox?subject=${subject.id}`} className={styles.tool}>
              <span className={glyphs.glyph}><Tray /></span>
              Resources
            </Link>
          </div>
        </div>
      </header>
      {/* The year of this bed, grown up out of the rule; streamed in
          behind the plain rule. */}
      <Suspense fallback={<div className={styles.headRule} />}>
        <ActivityEntry
          scope={{ subject: subject.id }}
          plain={<div className={styles.headRule} />}
          stemInk="var(--paper)"
          cellInk={subject.colour}
        />
      </Suspense>

      <div className={styles.body}>
        <div className={styles.spread}>
          <div className={styles.main}>
            <SubjectBed
              subjectId={subject.id}
              tree={tree}
              groups={groups}
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

            {area.promotedFrom && <PutBack subjectId={subject.id} from={area.promotedFrom} />}

            {area.effort && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>To your target</h2>
                <BedTarget subjectId={subject.id} effort={area.effort} />
              </section>
            )}

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

            {resources.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Filed against the subject</h2>
                <p className={styles.blockNote}>
                  Evidence for the subject as a whole. File it onto the
                  particular topics it informs from their own sheets.
                </p>
                <ul className={styles.blockList}>
                  {resources.map(resource => (
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
                      <span className={styles.blockFigure}>{resource.kind}</span>
                    </li>
                  ))}
                </ul>
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
      </div>
    </main>
  )
}
