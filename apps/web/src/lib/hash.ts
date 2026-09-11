'use client'

/**
 * Write a section's name into the address bar without navigating.
 *
 * The app router patches `history.pushState` and `history.replaceState`
 * so that a URL changed behind its back is still reflected in
 * `usePathname` and `useSearchParams`. The way it does that is to
 * dispatch a history traversal, and a traversal re-spawns the route's
 * data: the sheet drops to the loading state of the nearest boundary
 * and the client component under it is mounted again from nothing.
 *
 * So travelling from the contents list to a heading flashed the whole
 * catalogue through a galley and back before landing on the section --
 * for a press that is meant to be a scroll and nothing else.
 *
 * A hash is not a navigation. The path and the query are unchanged, so
 * nothing the router holds needs to hear about it, and the patch's own
 * way past itself is a call carrying state the router wrote. Handing
 * back the entry it is already standing on writes the URL natively and
 * dispatches nothing.
 *
 * Where that state is not there -- before the router's first commit,
 * or if it ever stops marking its entries this way -- the address bar
 * is left alone rather than navigated. A hash that does not follow the
 * reader is a far smaller thing than the sheet blinking out from under
 * them, and the contents list is real anchors either way, so the link
 * can still be copied.
 */
export function setHash(hash: string, into: History = window.history): boolean {
  // `__NA` is what the router stamps on every entry it owns, and what
  // its own patch looks for before deciding a call came from outside.
  const state = into.state as { __NA?: boolean } | null
  if (!state?.__NA) return false

  into.replaceState(state, '', hash)
  return true
}
