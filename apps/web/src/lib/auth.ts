import { cache } from 'react'
import { connection } from 'next/server'
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
 * The token is still *verified* rather than trusted, which is what
 * `getUser` was here for -- but `getClaims` does it by checking the
 * signature against the project's public key instead of asking the
 * auth server whether the token is good. This project signs with
 * ES256 and publishes a JWKS, so that check is arithmetic on the
 * function rather than a round trip to another host; the key is
 * fetched once and held.
 *
 * That round trip was the single most expensive thing this app did.
 * It ran ahead of every authenticated request, on every page and
 * every route handler, and it cost more than all the queries behind
 * it put together: `/api/topics`, which reads the database and does
 * not call this, answered in 107ms, while `/api/inbox/count`, which
 * does nothing but two counts on an index and calls this, took
 * 1390ms.
 *
 * `cache` still keeps it to one call per request however many times a
 * render asks. A token this cannot verify falls back to asking the
 * auth server, so a session signed with the old symmetric secret --
 * or anything else unexpected -- is answered correctly rather than
 * thrown out.
 */
export const getOwner = cache(async (): Promise<User | null> => {
  // Verifying a token's signature means checking what it claims about
  // when it expires, which means reading the clock -- and a clock read
  // while prerendering is a value that changes between renders, which
  // Next refuses. `headers()` below already makes this request-time,
  // but the sheets start the gate and their own read together in a
  // `Promise.all`, so the clock could be read before the headers had
  // resolved and said so. This states it before anything else runs.
  await connection()
  const bearer = (await headers()).get('authorization')?.match(/^Bearer (.+)$/)
  const client = bearer ? supabaseBrowser() : await supabaseSession()
  const token = bearer?.[1]

  try {
    const { data, error } = await client.auth.getClaims(token)
    if (!error && data?.claims) {
      const claims = data.claims as {
        sub: string
        email?: string
        role?: string
        [key: string]: unknown
      }
      // `getClaims` answers with the token's claims, where the rest of
      // this file passes a `User` about. The claims carry what anything
      // here actually reads -- the id, and the address the sign-in
      // sheet prints back.
      return {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        aud: String(claims.aud ?? ''),
        app_metadata: (claims.app_metadata as User['app_metadata']) ?? {},
        user_metadata: (claims.user_metadata as User['user_metadata']) ?? {},
        created_at: '',
      } as User
    }
  } catch {
    // Fall through to the round trip below.
  }

  // A token the public key cannot answer for. Ask the auth server.
  const { data } = token
    ? await client.auth.getUser(token)
    : await client.auth.getUser()
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
