import { NextResponse } from 'next/server'
import { supabaseSession } from '@/lib/auth'

export async function POST() {
  const supabase = await supabaseSession()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
