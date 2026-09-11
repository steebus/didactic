import Link from 'next/link'
import { readVerdict, type Verdict } from '@didactic/core/subject'
import type { Sowing } from '@didactic/core/shapes'
import { RootsSpecimen, ROOT_STAGES } from '@/components/RootsSpecimen'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'

/** What the two figures together mean, said in one line. The wording is
 *  deliberately about the answers rather than about the person. */
const VERDICT: Record<Verdict, { headline: string; note: string }> = {
  above: {
    headline: 'Your answers read higher than your own figure',
    note: 'You are underselling yourself by at least two rungs. The bed has been cut against what you showed rather than what you claimed, so expect it to start further along than you asked for.',
  },
  below: {
    headline: 'Your answers read lower than your own figure',
    note: 'That is not a mark against you: a figure is easy to state and a question is hard to answer cold. The bed starts nearer the ground than your own figure would have put it, which is the safer mistake.',
  },
  matching: {
    headline: 'Your answers and your own figure agree',
    note: 'Within a rung, which is as close as one conversation can honestly get. The bed is cut where you both put it.',
  },
  unstated: {
    headline: 'A reading, with nothing to read it against',
    note: 'You did not set a roots figure, so there is nothing to compare this with — only what the answers themselves showed.',
  },
}

/**
 * The reading: the user's own figure set against what their answers
 * showed, as two plates of the same plant at different depths.
 *
 * Both are kept and neither is a mark. The app owns ability and this
 * does not write it — what this sheet does is make the first figure
 * arguable, which PRODUCT.md's third principle requires of every number
 * the app produces.
 */
export function ReadingSheet({
  subject,
  sowing,
}: {
  subject: { id: string; title: string; colour: string }
  sowing: Sowing | null
}) {
  const assessment = sowing?.assessment ?? null
  const verdict = readVerdict(sowing?.roots ?? null, assessment?.level ?? null)
  const answered = (sowing?.qualifiers ?? []).filter(q => q.answer?.trim())
  const skipped = (sowing?.qualifiers ?? []).filter(q => !q.answer?.trim())

  return (
    <main className={styles.sheet}>
      <header className={styles.head} style={{ background: subject.colour }}>
        {/* The back link already names the subject, so the parentage
            line would print it twice on the same band. */}
        <SheetNav back={{ href: `/subjects/${subject.id}`, label: subject.title }} />
        <h1 className={styles.title}>The reading</h1>
        <p className={styles.strapline}>
          What you said about yourself, and what your answers showed. Both are
          kept; neither is a mark.
        </p>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        {!assessment ? (
          <section className={styles.block}>
            <h2 className={styles.blockTitle}>Nothing to read</h2>
            <p className={styles.note}>
              This subject was sown without answering anything, so there is no
              reading to print. Every exposure you file from here will move the
              figures on their own.
            </p>
            <Link href={`/subjects/${subject.id}`} className={styles.action}>
              Go to the bed
            </Link>
          </section>
        ) : (
          <>
            <section className={styles.compare}>
              <figure className={styles.column}>
                <figcaption className={styles.columnHead}>
                  <span className={styles.columnLabel}>You said</span>
                  <span className={styles.columnFigure}>
                    {sowing?.roots ?? '—'}
                    <span className={styles.of}>of 5</span>
                  </span>
                  <span className={styles.columnStage}>
                    {sowing?.roots !== null && sowing?.roots !== undefined
                      ? ROOT_STAGES[sowing.roots].label
                      : 'Not stated'}
                  </span>
                </figcaption>
                <div className={styles.plate}>
                  <RootsSpecimen
                    level={sowing?.roots ?? 0}
                    ink={subject.colour}
                  />
                </div>
              </figure>

              <figure className={styles.column}>
                <figcaption className={styles.columnHead}>
                  <span className={styles.columnLabel}>Your answers show</span>
                  <span className={styles.columnFigure}>
                    {assessment.level}
                    <span className={styles.of}>of 5</span>
                  </span>
                  <span className={styles.columnStage}>
                    {ROOT_STAGES[Math.min(5, Math.max(0, assessment.level))].label}
                  </span>
                </figcaption>
                <div className={styles.plate}>
                  <RootsSpecimen level={assessment.level} ink={subject.colour} />
                </div>
              </figure>
            </section>

            <section className={styles.verdict}>
              <h2 className={styles.verdictTitle}>{VERDICT[verdict].headline}</h2>
              <p className={styles.verdictNote}>{VERDICT[verdict].note}</p>
              {assessment.note && <p className={styles.verdictBody}>{assessment.note}</p>}
              <p className={styles.tally}>
                {assessment.answered} of {assessment.asked} qualifying{' '}
                {assessment.asked === 1 ? 'question' : 'questions'} answered
              </p>
            </section>

            <div className={styles.columns}>
              {assessment.shown.length > 0 && (
                <section className={styles.block}>
                  <h2 className={styles.blockTitle}>What you showed</h2>
                  <ul className={styles.list}>
                    {assessment.shown.map(item => (
                      <li key={item} className={styles.listRow}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {assessment.missing.length > 0 && (
                <section className={styles.block}>
                  <h2 className={styles.blockTitle}>What you did not</h2>
                  <ul className={`${styles.list} ${styles.listGaps}`}>
                    {assessment.missing.map(item => (
                      <li key={item} className={styles.listRow}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {answered.length > 0 && (
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>What you were asked</h2>
                <ol className={styles.answers}>
                  {answered.map(q => (
                    <li key={q.prompt} className={styles.answerRow}>
                      <span className={styles.rung}>{q.level}</span>
                      <div>
                        <p className={styles.prompt}>{q.prompt}</p>
                        <p className={styles.answer}>{q.answer}</p>
                      </div>
                    </li>
                  ))}
                  {skipped.map(q => (
                    <li key={q.prompt} className={`${styles.answerRow} ${styles.skipped}`}>
                      <span className={styles.rung}>{q.level}</span>
                      <div>
                        <p className={styles.prompt}>{q.prompt}</p>
                        <p className={styles.answer}>Left blank.</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className={styles.foot}>
              <p className={styles.caveat}>
                This is one conversation, not a test, and it is a starting
                figure rather than a verdict on you. Ability is owned by the
                app and moves only on real evidence: read something, work
                something, and both of these numbers become history.
              </p>
              <div className={styles.actions}>
                <Link href={`/subjects/${subject.id}`} className={styles.action}>
                  Go to the bed
                </Link>
                <Link href={`/graph?subject=${subject.id}`} className={styles.quietAction}>
                  Show graph
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
