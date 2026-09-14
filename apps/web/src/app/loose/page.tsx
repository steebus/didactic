import { getLooseStock } from '@/lib/loose'
import { requireOwner } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SheetNav } from '@/components/SheetNav'
import { LooseSheet } from './LooseSheet'
import styles from './page.module.css'

/**
 * Loose stock: every topic filed under no subject at all.
 *
 * They arrive two ways and the sheet cannot tell them apart, which is
 * why it prints what each one holds rather than guessing. Ingestion
 * makes them when a reading matches nothing already sown; taking a topic
 * out of the last bed it sat in makes them too. Either way the topic is
 * real and in the ground, carrying whatever has been read into it, and
 * the only thing missing is somewhere for it to belong.
 *
 * The subjects sheet has always listed them, but only as names — and a
 * list of names is exactly the wrong tool for this job, because the
 * question is never "what is loose" but "which of these are worth
 * keeping, and where do the rest go". That is a job done in handfuls, so
 * this sheet does it in handfuls.
 */
export default async function LoosePage() {
  const [, loose, { data: subjects }] = await Promise.all([
    requireOwner(),
    getLooseStock(),
    supabaseAdmin().from('subjects').select('id, title').order('title'),
  ])

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav back={{ href: '/', label: 'Subjects' }} />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Loose stock</h1>
          <p className={styles.standfirst}>
            {loose.length === 0
              ? 'Everything you hold is filed under a subject.'
              : `${loose.length} ${loose.length === 1 ? 'topic sits' : 'topics sit'} under no subject.`}
          </p>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <LooseSheet loose={loose} subjects={subjects ?? []} />
      </div>
    </main>
  )
}
