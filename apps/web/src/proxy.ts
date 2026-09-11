import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isOpenPath, isApiPath } from '@/lib/auth-paths'

/**
 * The optimistic half of the gate, and the only place the session token
 * can actually be refreshed — a Server Component cannot write cookies,
 * so without this a token would expire mid-session and the app would
 * start behaving as though nobody were signed in.
 *
 * It is not the enforcement. Anything that reads or writes owned data
 * checks for itself through `src/lib/auth.ts`; this exists so that an
 * unauthenticated request is turned away at the door rather than
 * rendering a sheet and then redirecting.
 *
 * Next 16 renamed Middleware to Proxy. Same file, same job, new name:
 * see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: written => {
          for (const { name, value } of written) request.cookies.set(name, value)
          for (const { name, value, options } of written) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // Refreshes the token as a side effect, which is the main reason this
  // runs on every request.
  const { data } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  if (data.user || isOpenPath(pathname)) return response

  if (isApiPath(pathname)) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }

  const entry = request.nextUrl.clone()
  entry.pathname = '/enter'
  entry.search = ''
  // Where they were headed, so the sign-in sheet can put them back
  // rather than always landing on the stock list.
  if (pathname !== '/') entry.searchParams.set('next', pathname)
  return NextResponse.redirect(entry)
}

export const config = {
  // Everything except Next's own asset routes, which have no session to
  // check and are needed to print the sign-in sheet.
  matcher: ['/((?!_next/static|_next/image|icon.png).*)'],
}
