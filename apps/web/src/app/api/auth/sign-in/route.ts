import { NextResponse } from 'next/server'
import { supabaseSession } from '@/lib/auth'

export async function POST(req: Request) {
  const { email, password } = await req.json()

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return NextResponse.json({ error: 'Both fields are needed.' }, { status: 400 })
  }

  const supabase = await supabaseSession()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Deliberately vague: which half was wrong is not information the
    // door should give away, and there is only one account to guess at.
    return NextResponse.json({ error: 'That does not open it.' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
