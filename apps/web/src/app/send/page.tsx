import { headers } from 'next/headers'
import { requireOwner } from '@/lib/auth'
import { sharedLink } from '@didactic/core/shared'
import { SheetNav } from '@/components/SheetNav'
import { SendSheet } from './SendSheet'
import inbox from '@/app/inbox/page.module.css'

/**
 * Where things sent from outside the app arrive.
 *
 * Three ways in, one address: the bookmarklet opens it in a small window
 * with the page it was pressed on, Android's share sheet opens it through
 * the installed app's share target (`manifest.ts`), and an iPhone
 * Shortcut opens it from Safari's. All three hand over some of `url`,
 * `title` and `text`, which `core/shared.sharedLink` reads into what was
 * meant.
 *
 * Saving happens in the browser, after the page has loaded, rather than
 * while it renders: a GET that writes is a GET that a prefetch, a
 * preview or a reload writes again. The route files one address once
 * however many times it is sent, so a reload costs nothing either.
 *
 * Opened with nothing, it says how to send things to it.
 */
export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; title?: string; text?: string; popup?: string }>
}) {
  const [, given, head] = await Promise.all([requireOwner(), searchParams, headers()])
  const shared = sharedLink(given)
  const origin = `${head.get('x-forwarded-proto') ?? 'https'}://${head.get('host')}`

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
        <SendSheet shared={shared} popup={given.popup === '1'} origin={origin} />
      </div>
    </main>
  )
}
