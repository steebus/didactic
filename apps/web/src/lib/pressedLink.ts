'use client'

/**
 * What a press inside rendered prose is asking for.
 *
 * A lesson body is an HTML string set into the page, so the links in
 * it are plain anchors -- nothing React rendered and nothing the
 * router knows about. Left alone, pressing one leaves the app and
 * loads the whole document again: the reader waits through a blank
 * page for a sheet the router could have turned to in place. So the
 * press is read here and handed to the router instead.
 *
 * Only inward links. A link out of the catalogue belongs to somebody
 * else's site and is already opened beside the reading rather than in
 * place of it.
 */
export interface Press {
  target: EventTarget | null
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  button: number
}

export function pressedLink(
  press: Press,
  selected: () => Selection | null = () => window.getSelection()
): string | null {
  // A middle press, or any of the four modifiers, means the reader has
  // asked the browser for something -- a tab, a window, a download --
  // and taking the press over would refuse them it.
  if (press.button !== 0) return null
  if (press.metaKey || press.ctrlKey || press.shiftKey || press.altKey) return null

  const from = press.target instanceof Element ? press.target : null
  const href = from?.closest('a')?.getAttribute('href')
  if (!href?.startsWith('/')) return null

  // A press that finishes a drag across the words is a passage being
  // kept, not a link being followed. Marks are taken by selecting, so
  // this happens over a link often enough to matter.
  const selection = selected()
  if (selection && !selection.isCollapsed) return null

  return href
}
