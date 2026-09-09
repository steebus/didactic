/**
 * What is reachable without being signed in.
 *
 * Kept apart from the rest of the auth code because it is the one piece
 * that is worth reading on its own: too generous and the gate is
 * decorative, too strict and the sign-in sheet cannot load the fonts it
 * is printed in, or the queue worker cannot reach the app at all.
 */

/** Prefixes that must stay open, and why each one is here. */
const OPEN = [
  // The sign-in sheet itself, and the calls it makes.
  '/enter',
  '/api/auth/',
  // The queue worker calls this from Postgres with its own shared key.
  // It carries no session and never will.
  '/api/internal/',
  // Framework and asset routes. A gate in front of these locks the
  // sign-in sheet out of its own stylesheet.
  '/_next/',
  // The app icon. Next.js serves it from the icon.png file convention
  // rather than from public/, so it is a route like any other and the
  // gate would otherwise send the browser's icon request to the
  // sign-in sheet.
  '/icon.png',
]

export function isOpenPath(pathname: string): boolean {
  return OPEN.some(prefix =>
    prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix
  )
}

/**
 * True when the request is for an API route, which wants a 401 rather
 * than a redirect: a fetch following a redirect to an HTML sheet fails
 * further along, with an error that says nothing about the session.
 */
export function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
}
