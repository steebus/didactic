import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseSession } from '@/lib/auth'

// ponytail: temporary diagnostic, deleted once the auth cost is known.
export async function GET() {
  const t0 = Date.now()
  const client = await supabaseSession()
  const t1 = Date.now()

  const { data: claims, error } = await client.auth.getClaims()
  const t2 = Date.now()

  const { data: user } = await client.auth.getUser()
  const t3 = Date.now()

  const store = await cookies()
  const raw = store.getAll().find(c => c.name.includes('auth-token'))?.value ?? ''
  const jwt = raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  let alg: string | null = null
  if (jwt) {
    try {
      alg = JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString()).alg as string
    } catch {
      alg = 'undecodable'
    }
  }

  return NextResponse.json({
    clientMs: t1 - t0,
    getClaimsMs: t2 - t1,
    getUserMs: t3 - t2,
    tokenAlg: alg,
    claimsOk: !!claims?.claims,
    claimsErr: error?.message ?? null,
    userOk: !!user.user,
    region: process.env.VERCEL_REGION ?? null,
  })
}
