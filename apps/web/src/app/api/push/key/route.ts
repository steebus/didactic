import { NextResponse } from 'next/server'
import { ownerId } from '@/lib/auth'
import { pushKeys } from '@/lib/push'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * The app's public push key, for a phone subscribing to Tend reminders.
 * The pair is made on the first ask and kept (`lib/push.pushKeys`, 070).
 * 503 only before 070 has run or when the database cannot be reached:
 * the sheet then says so, rather than offering a switch that fails.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const keys = await pushKeys(supabaseAdmin())
  if (!keys) {
    return NextResponse.json(
      { error: 'Reminders are not ready yet: the push keys could not be made. Try again in a minute.' },
      { status: 503 }
    )
  }
  return NextResponse.json({ publicKey: keys.publicKey })
}
