import { redirect } from 'next/navigation'
import { getOwner, isClaimed } from '@/lib/auth'
import { Emblem } from '@/components/Emblem'
import { EntryForm } from './EntryForm'
import styles from './page.module.css'


export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  // Already in. Printing a sign-in sheet to someone holding a session
  // is the sort of thing that makes people think they have been logged
  // out.
  if (await getOwner()) redirect(next && next.startsWith('/') ? next : '/')

  const claimed = await isClaimed()

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <div className={styles.mark}>
          <Emblem slug="unsown" colour="rgba(239,231,214,0.22)" size={72} />
        </div>
        <h1 className={styles.title}>Didactic</h1>
        <p className={styles.strapline}>
          {claimed
            ? 'A private catalogue. One key, one keeper.'
            : 'An unclaimed catalogue. Set the key that opens it.'}
        </p>
      </header>
      <div className={styles.headRule} />

      <EntryForm claimed={claimed} next={next ?? null} />
    </main>
  )
}
