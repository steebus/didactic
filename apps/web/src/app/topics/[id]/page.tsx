import { edgeKindLabel } from '@didactic/core/graph'
import Link from 'next/link'
import { NoteText } from '@/components/NoteText'
import { notFound } from 'next/navigation'
import { viabilityFigure, vagueFigure } from '@didactic/core/scoring'
import { getTopicArea } from '@/lib/topic'
import { StockBar, stockState, STOCK_LABEL } from '@/components/StockBar'
import { DraftCurriculum } from './DraftCurriculum'
import { LessonList } from './LessonList'
import { FiledUnder } from './FiledUnder'
import { ChangeLevel } from './ChangeLevel'
import { GrubOut } from './GrubOut'
import { FigureRecord } from './FigureRecord'
import { AddResource } from '@/components/AddResource'
import { SheetNav } from '@/components/SheetNav'
import { Crumbs } from '@/components/Crumbs'
import { GardenLine } from '@/components/GardenLine'
import { BandSpecimen, BandSpecimenCaption } from '@/components/BandSpecimen'
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

  const { topic, subjects, curricula, resources, neighbours, highlights } = area
  const vague = vagueFigure(topic.ability_confidence)
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
        {/* Grown to how far this topic's route has been worked, laid in
            as the band's ground rather than standing beside the title:
            on a phone the plate cost the band a third of its height and
            pushed the reading below the fold. */}
        <BandSpecimen progress={routeProgress(curricula)} ink={colour} />

        {/* An entry written from a topic sheet starts filed under that
            topic, and the composer says so. */}
        <SheetNav
          back={{ href: '/', label: 'Subjects' }}
          filedUnder={{ id: topic.id, title: topic.title }}
        />

        <div className={styles.headRow}>
          <div>
            {/* The subject is the way back to the bed this topic was
                sown in, printed as the trail every sheet carries. A
                topic filed nowhere says so instead. */}
            {subjects.length === 0 ? (
              <p className={styles.eyebrow}>Unfiled</p>
            ) : (
              <Crumbs
                className={styles.eyebrow}
                trail={subjects.map(s => ({
                  href: `/subjects/${s.id}`,
                  label: s.title,
                }))}
              />
            )}
            <h1 className={styles.title}>{topic.title}</h1>
            {/* The figure the specimen used to carry under it. The
                drawing is the band's ground now, and a faded drawing
                cannot be read as a figure. */}
            <BandSpecimenCaption progress={routeProgress(curricula)} />
          </div>
        </div>

        {topic.summary && <p className={styles.summary}>{topic.summary}</p>}

        {/* Press either figure for the account behind it. It used to be
            a block in the margin, a column and a screen away from the
            number it explained. */}
        <FigureRecord
          viability={{ figure: viabilityFigure(topic.ability), vague }}
          condition={STOCK_LABEL[state]}
          lastTended={topic.last_exposure_at}
          record={area.record}
        />
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        {/* The narrowest scope: everything this topic's lessons left
            behind, and nothing from anywhere else. */}
        <GardenLine topicId={topic.id} here={topic.title} />
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
                  <LessonList
                    lessons={route.lessons}
                    routeId={route.id}
                    goal={route.goal}
                    draft={route.status === 'draft'}
                  />
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
                {/* Folded shut, and it opens on a press.

                    This is the last thing on the sheet and the longest:
                    a topic worked through for a month carries fifty
                    passages, each of them several lines, and they sat
                    open under the route by default — so the way to the
                    resources below them was a screen of quotations the
                    reader had already read once. The count in the head
                    is what they are actually looking for most of the
                    time, and it is printed whether it is open or not.

                    A `details` rather than a state and a button: the
                    sheet is a server component, the fold wants no
                    JavaScript to work, and the browser's own element
                    already carries the keyboard, the ARIA and the
                    find-in-page that a hand-rolled one would have to be
                    given. */}
                <details className={styles.fold}>
                  <summary className={styles.foldHead}>
                    <h2 className={styles.sectionTitle}>Marked</h2>
                    <span className={styles.foldNote}>
                      <span className={styles.sectionNote}>
                        {highlights.length} {highlights.length === 1 ? 'mark' : 'marks'}
                      </span>
                      {/* Drawn rather than typed, so it turns on the
                          open rather than being swapped for another
                          character. */}
                      <svg
                        className={styles.foldMark}
                        width="10"
                        height="7"
                        viewBox="0 0 10 7"
                        aria-hidden="true"
                      >
                        <path
                          d="M1 1.4 L5 5.4 L9 1.4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </summary>
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
                </details>
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

            {/* Where it is filed, and the only place that can be
                changed. A topic sits under every subject it genuinely
                belongs to; until now the sheets could add one by name
                and take one away from the bed's own edit mode, and
                moving one meant retyping its name somewhere else and
                hoping the resolver reached the same row. */}
            <FiledUnder
              topicId={topic.id}
              topicTitle={topic.title}
              subjects={subjects.map(s => ({ id: s.id, title: s.title, colour: s.colour }))}
              primarySubjectId={topic.primary_subject_id}
              nearby={area.nearby}
            />

            {/* What level it sits at. Both moves are refused while it
                carries a route, and the block says why rather than
                hiding the controls -- "why can I not do this" is the
                question a hidden control provokes. */}
            <ChangeLevel
              topicId={topic.id}
              topicTitle={topic.title}
              hasRoute={curricula.length > 0}
              routeId={route?.id ?? null}
              evidence={{
                subjects: subjects.map(s => ({ id: s.id, title: s.title })),
                sources: resources.slice(0, 3).map(r => r.resource.title),
                resources: resources.length,
                lessons: curricula.reduce((n, c) => n + c.total, 0),
                marks: highlights.length,
                exposures: area.record.filter(e => e.kind === 'exposure').length,
              }}
            />

            {/* Last on the sheet, past everything the topic holds.
                Grubbing one out is the rarest thing done here and the
                only one that cannot be undone, so it sits below the
                reading rather than beside it. */}
            <GrubOut
              topicId={topic.id}
              topicTitle={topic.title}
              routes={curricula.length}
              backTo={subjects[0] ? `/subjects/${subjects[0].id}` : '/'}
              evidence={{
                subjects: subjects.map(s => ({ id: s.id, title: s.title })),
                sources: resources.slice(0, 3).map(r => r.resource.title),
                resources: resources.length,
                lessons: curricula.reduce((n, c) => n + c.total, 0),
                marks: highlights.length,
                exposures: area.record.filter(e => e.kind === 'exposure').length,
              }}
            />

            {neighbours.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Nearby</h2>
                <ul className={styles.record}>
                  {neighbours.map(n => (
                    <li key={n.id} className={styles.recordRow}>
                      <Link href={`/topics/${n.id}`}>{n.title}</Link>
                      <span className={styles.recordDate}>
                        {edgeKindLabel(n.kind, n.incoming)}
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
