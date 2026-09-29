import { SheetNav } from '@/components/SheetNav'
import { Working } from '@/components/Setting'
import inbox from '@/app/inbox/page.module.css'

/** The door, while the gate is checked. */
export default function Loading() {
  return (
    <main className={inbox.sheet}>
      <header className={inbox.head}>
        <SheetNav current="inbox" />
        <div className={inbox.headRow}>
          <h1 className={inbox.title}>Send to the inbox</h1>
        </div>
      </header>
      <div className={inbox.headRule} />

      <div className={inbox.body}>
        <Working label="Opening" />
      </div>
    </main>
  )
}
