import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { supabaseAdmin, supabaseBrowser } from './supabase'

/**
 * The gate.
 *
 * This is a single-user app: there is exactly one account, it owns
 * everything, and the login exists to keep the catalogue private rather
 * than to tell two people apart. Sharing and tenancy remain out of
 * scope — see PRODUCT.md. Row level security does not: the phone reads
 * rows directly under the owner's token, so the database enforces
 * ownership too rather than trusting this gate alone.
 *
 * What the account does carry is the id every row is written against.
 * Before this, that id was a constant compiled into the client, which
 * meant the browser told the server who it was, and meant a hosted
 * database with no matching row in `auth.users` rejected every write
 * with a foreign key violation. Now it comes from the session.
 */

/** A Supabase client bound to the request's cookies. */
export async function supabaseSession() {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: written => {
          try {
            for (const { name, value, options } of written) {
              store.set(name, value, options)
            }
          } catch {
            // Server Components cannot write cookies. The session is
            // refreshed in `proxy.ts`, which can, so this is the
            // expected path on a page render rather than a failure.
          }
        },
      },
    }
  )
}

/**
 * The signed-in account, or null.
 *
 * Two ways in, one answer. The web sends session cookies; the phone
 * sends `Authorization: Bearer <jwt>`, because a native app has no
 * cookie jar the server can refresh. A bearer token is verified on the
 * anon client, which holds no session of its own — the token is the
 * whole claim, so nothing is read from cookies when one is present.
 *
 * `getUser` is used rather than `getSession` deliberately, on either
 * path: it verifies the token with Supabase instead of trusting what
 * the request claims. `cache` keeps that to one call per request
 * however many times a render asks.
 */
export const getOwner = cache(async (): Promise<User | null> => {
  const bearer = (await headers()).get('authorization')?.match(/^Bearer (.+)$/)
  if (bearer) {
    const { data } = await supabaseBrowser().auth.getUser(bearer[1])
    return data.user ?? null
  }
  const supabase = await supabaseSession()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
})

/**
 * The account, or the sign-in sheet. For pages: the proxy has already
 * turned most unauthenticated traffic away, but a redirect there is an
 * optimistic check and this is the one that counts.
 */
export async function requireOwner(): Promise<User> {
  const owner = await getOwner()
  if (!owner) redirect('/enter')
  return owner
}

/**
 * The account's id for a write, or null. Route handlers use this and
 * answer 401 themselves: a fetch that follows a redirect to an HTML
 * sheet fails later with an error that says nothing about the session.
 */
export async function ownerId(): Promise<string | null> {
  const owner = await getOwner()
  return owner?.id ?? null
}

/**
 * Whether the catalogue has been claimed yet.
 *
 * The first visit to a fresh installation sets the one account; every
 * visit after that is a sign-in. There is no invitation flow and no
 * second account, so this is what closes the door behind the owner.
 */
export async function isClaimed(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({
      page: 1,
      perPage: 1,
    })
    if (error) return true
    return data.users.length > 0
  } catch {
    // A missing or wrong service key lands here, as does an unreachable
    // database. Answering "claimed" is the safe way round: it prints a
    // sign-in sheet that will not work rather than offering to create
    // an account on a database that may already have one.
    return true
  }
}
