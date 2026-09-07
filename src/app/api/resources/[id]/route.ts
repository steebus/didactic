import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { setResourceStatus } from '@/lib/consume'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, depth } = await req.json()

  try {
    const result = await setResourceStatus(supabaseAdmin(), id, status, depth)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Validation failures are the caller's fault; anything else is ours.
    const status4xx = message.includes('invalid status') || message.includes('depth is required')
    return NextResponse.json({ error: message }, { status: status4xx ? 400 : 500 })
  }
}
