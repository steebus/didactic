import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { supabaseSession, isClaimed } from '@/lib/auth'

/** Long enough to be worth having. This is the only account there will
 *  ever be, and there is no reset flow behind it. */
const MIN_PASSWORD = 12

/**
 * Claim a fresh installation: set the one account that owns everything.
 *
 * This is open by necessity — nobody can be signed in before the first
 * account exists — so it closes itself the moment there is one. There
 * is no second account and no invitation.
 */
export async function POST(req: Request) {
  const { email, password } = await req.json()

  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Both fields are needed.' }, { status: 400 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'That is not an address.' }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `At least ${MIN_PASSWORD} characters. There is no way back in if you lose it.` },
      { status: 400 }
    )
  }

  // Checked here rather than only on the sheet: the sheet decides what
  // to print, this decides what is allowed.
  if (await isClaimed()) {
    return NextResponse.json(
      { error: 'This catalogue already has an owner. Sign in instead.' },
      { status: 409 }
    )
  }

  const { error: createError } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    // There is no mail server here and one account to confirm, so the
    // owner is confirmed by having reached an unclaimed installation.
    email_confirm: true,
  })
  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  // Signed in straight away: the alternative is a sign-in sheet that
  // asks for the password typed two seconds ago.
  const supabase = await supabaseSession()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return NextResponse.json(
      { error: 'The account was made, but signing in failed. Try signing in.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
