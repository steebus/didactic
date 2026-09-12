import { requireOwner } from '@/lib/auth'
import { SheetNav } from '@/components/SheetNav'
import { TendSheet } from './TendSheet'
import styles from './page.module.css'

/**
 * The garden.
 *
 * Everything due, one card at a time, and a way to turn something over
 * when nothing is. The sheet is deliberately not a list: a list of two
 * hundred clozes is a backlog, and a backlog is a thing to feel bad
 * about rather than a thing to do. One card, then the next, and a line
 * saying how many are left.
 *
 * The scope comes off the URL, so tending one subject or one topic is a
 * place that can be linked to and come back to -- which is what the
 * "a random one from here" controls on the stock list, a subject and a
 * topic actually link to.
 */
export default async function TendPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; topic?: string; lesson?: string; mode?: string }>
}) {
  const [, params] = await Promise.all([requireOwner(), searchParams])

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="tend" />
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>What you have already read</p>
            <h1 className={styles.title}>Tend</h1>
          </div>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <TendSheet
          subjectId={params.subject ?? null}
          topicId={params.topic ?? null}
          lessonId={params.lesson ?? null}
          random={params.mode === 'random'}
        />
      </div>
    </main>
  )
}
