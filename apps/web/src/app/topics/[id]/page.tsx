import { EDGE_KIND_LABEL } from '@didactic/core/graph'
import Link from 'next/link'
import { NoteText } from '@/components/NoteText'
import { notFound } from 'next/navigation'
import { viabilityFigure } from '@didactic/core/scoring'
import { getTopicArea } from '@/lib/topic'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { DraftCurriculum } from './DraftCurriculum'
import { AddResource } from '@/components/AddResource'
import { SheetNav } from '@/components/SheetNav'
import { RouteSpecimen } from '@/components/RouteSpecimen'
import { routeProgress } from '@didactic/core/progress'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'


export default async function TopicPage({
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
  const [, area] = await Promise.all([requireOwner(), getTopicArea(id)])
  if (!area) notFound()

  const { topic, subjects, curricula, resources, neighbours, exposures, highlights } = area
  const vague = topic.ability_confidence < 0.4
  const state = stockState(topic.freshness, topic.last_exposure_at)
  const colour = subjects[0]?.colour ?? 'var(--plate-green)'
  const unread = resources.filter(r => r.resource.status === 'queued')
  // One route is shown, because in practice there is one. An archived
  // route is history rather than a plan, so it is not the one offered.
  const route =
    curricula.find(c => c.status === 'active') ??
    curricula.find(c => c.status === 'draft') ??
    null
  const read = resources.filter(r => r.resource.status !== 'queued')

  return (
    <main className={styles.sheet}>
      <header
        className={styles.head}
        // The band takes the subject's own plate, so the focus ring in
        // here states its own ink rather than vanishing into whichever
        // colour the subject happens to carry.
        style={{ background: colour, '--focus-ink': 'var(--paper)' } as React.CSSProperties}
      >
        {/* The one sheet in the catalogue that did not carry the
            running head: the component was imported here and never
            printed, so a topic was the only place with no way to the
            other sheets but the browser's own back button. */}
        <SheetNav back={{ href: '/', label: 'Stock list' }} />

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
          {/* The running head above already carries the way back, so the
              aside holds only the progress plant — grown to how far this
              topic's route has been worked. */}
          <div className={styles.headAside}>
            <RouteSpecimen progress={routeProgress(curricula)} ink={colour} />
          </div>
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
            {/* Lessons, not curricula. A topic has one route through it
                in practice, and naming that route above its own lessons
                was a level with nothing in it -- the draft even took the
                topic's own title, so the sheet read "Brokerage Accounts
                and Custody / Brokerage Accounts and Custody". The route
                still exists and still has a page: it is where the order
                is reshaped and the draft approved, which is a different
                job from working through it. */}
            <section>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Lessons</h2>
                <span className={styles.sectionNote}>
                  {route
                    ? `${route.complete}/${route.total} worked${
                        route.status === 'draft' ? ' · awaiting your approval' : ''
                      }`
                    : 'None yet'}
                </span>
              </div>

              {!route ? (
                <p className={styles.empty}>
                  No lessons yet. Draft a route through this topic and reshape
                  it until it is the one you actually want to follow.
                </p>
              ) : (
                <>
                  {route.status === 'draft' && (
                    <p className={styles.draftNote}>
                      These are a proposal. Nothing counts toward the map until
                      you{' '}
                      <Link href={`/curriculum/${route.id}`} className={styles.inlineLink}>
                        reshape and approve the route
                      </Link>
                      .
                    </p>
                  )}
                  <ol className={styles.lessons}>
                    {route.lessons.map((lesson, i) => (
                      <li key={lesson.id}>
                        <Link
                          href={`/lesson/${lesson.id}`}
                          className={styles.lesson}
                          data-worked={lesson.completed_at ? 'true' : undefined}
                        >
                          {/* The position is the sequence, printed as a
                              catalogue prints a line number. It replaces
                              a bullet that carried no information. */}
                          <span className={styles.lessonNumber} aria-hidden="true">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className={styles.lessonBody}>
                            <span className={styles.lessonTitle}>{lesson.title}</span>
                            <span className={styles.lessonMeta}>
                              {lesson.stage}
                              {lesson.minutes ? ` · about ${lesson.minutes} min` : ''}
                            </span>
                          </span>
                          <span className={styles.lessonFlags}>
                            {lesson.marks > 0 && (
                              <span
                                className={styles.lessonMarks}
                                title={`${lesson.marks} passage${
                                  lesson.marks === 1 ? '' : 's'
                                } marked here`}
                              >
                                {lesson.marks}{' '}
                                {lesson.marks === 1 ? 'mark' : 'marks'}
                              </span>
                            )}
                            {lesson.completed_at && (
                              <span className={styles.lessonWorked}>Worked</span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                  <p className={styles.routeLink}>
                    <Link href={`/curriculum/${route.id}`} className={styles.inlineLink}>
                      Reshape the route
                    </Link>
                    {route.goal ? ` — ${route.goal}` : ''}
                  </p>
                </>
              )}

              {!route && (
                <DraftCurriculum
                  topicId={topic.id}
                  topicTitle={topic.title}
                  candidates={resources.map(r => ({
                    id: r.resource.id,
                    title: r.resource.title,
                    kind: r.resource.kind,
                  }))}
                />
              )}
            </section>

            {/* Marked passages, gathered from whichever lesson they were
                taken in. A quote is worth keeping past the lesson that
                happened to contain it. */}
            {highlights.length > 0 && (
              <section>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Marked</h2>
                  <span className={styles.sectionNote}>
                    {highlights.length} {highlights.length === 1 ? 'mark' : 'marks'}
                  </span>
                </div>
                <ul className={styles.marks}>
                  {highlights.map(h => (
                    <li key={h.id} className={styles.mark}>
                      {/* A mark with no passage is a note on the
                          lesson as a whole, and says so rather than
                          printing an empty rule. */}
                      {h.quote ? (
                        <blockquote className={styles.markQuote}>{h.quote}</blockquote>
                      ) : (
                        <p className={styles.markAbout}>A note on this lesson</p>
                      )}
                      {h.note && (
                        <NoteText markdown={h.note} className={styles.markNote} />
                      )}
                      {h.lesson && (
                        <p className={styles.markFrom}>
                          <Link href={`/lesson/${h.lesson.id}`} className={styles.inlineLink}>
                            {h.lesson.title}
                          </Link>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
