import { NextResponse } from 'next/server'
import { ownerId } from '@/lib/auth'
import { pushKeys } from '@/lib/push'

/**
 * The app's public push key, for a phone subscribing to Tend reminders.
 * 503 when the pair is not set on the deployment: the sheet then says
 * reminders are not set up, rather than offering a switch that fails.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const keys = pushKeys()
  if (!keys) {
    return NextResponse.json(
      { error: 'Reminders are not set up on this deployment: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are missing.' },
      { status: 503 }
    )
  }
  return NextResponse.json({ publicKey: keys.publicKey })
}
