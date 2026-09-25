import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { readChats } from '@/lib/chats'
import { SheetNav } from '@/components/SheetNav'
import { ChatsSheet } from './ChatsSheet'
import styles from './page.module.css'

/**
 * Every conversation, kept.
 *
 * A conversation that cannot be found again is a conversation that was
 * not really kept, however faithfully its rows were written. This is the
 * sheet that makes the keeping true.
 *
 * The order lives in the URL rather than in the sheet's own state, so a
 * way of looking at the pile is something you can come back to, which is
 * the same argument `/marked` makes about a search.
 */
export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>
}) {
  const { by } = await searchParams
  const order = by === 'subject' ? 'subject' : 'date'

  // The owner is needed before the read rather than beside it: these
  // rows are scoped by it. Every other sheet runs the two together
  // because its reader does not take a user.
  const owner = await requireOwner()
  const chats = await readChats(supabaseAdmin(), owner.id)

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="chats" />
        <h1 className={styles.title}>Conversations</h1>
        <p className={styles.standfirst}>
          {chats.length === 0
            ? 'Nothing asked yet. The button at the foot of a sheet starts one.'
            : `${chats.length} ${chats.length === 1 ? 'conversation' : 'conversations'}, kept.`}
        </p>
      </header>

      <ChatsSheet chats={chats} order={order} />
    </main>
  )
}
