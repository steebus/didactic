/**
 * What a resource is called when the page it came from would not say.
 *
 * Saving a link made the resource with the link as its title, and the
 * title the page carried -- which ingestion reads -- was never written
 * back. So every article kept its address as its name, and that address
 * was printed on the stock list, the topic sheets, the sprouting sheet,
 * the graph and the reader, a word as long as the whole URL, pushing
 * each of them off the side of a phone in turn.
 *
 * `urlTitle` is the readable stand-in, until the page's own title
 * arrives: scheme, `www.`, query and fragment dropped, and a long path
 * shortened in the middle to the site and the last segment, which are
 * the two parts a reader recognises. `isPlaceholderTitle` is how the
 * places that learn the real title know they may replace it -- a title
 * somebody typed is never overwritten.
 *
 * `056` applies the same shortening to titles already stored, in SQL,
 * and is checked against this.
 */

/** Longest a stand-in title may run, in characters. */
export const URL_TITLE_MAX = 60

/** A URL as a title a reader can take in at a glance. */
export function urlTitle(url: string): string {
  const bare = url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  if (bare.length <= URL_TITLE_MAX) return bare
  const slash = bare.indexOf('/')
  if (slash < 0) return `${bare.slice(0, URL_TITLE_MAX - 1)}…`
  const short = `${bare.slice(0, slash)}/…/${bare.slice(bare.lastIndexOf('/') + 1)}`
  return short.length <= URL_TITLE_MAX ? short : `${short.slice(0, URL_TITLE_MAX - 1)}…`
}

/**
 * Whether a resource's title is only its address, raw or shortened, and
 * so may be replaced by the title the page itself carries.
 */
export function isPlaceholderTitle(
  title: string | null | undefined,
  url: string | null | undefined
): boolean {
  if (!url) return false
  const said = (title ?? '').trim()
  if (!said || said === url.trim() || said === urlTitle(url)) return true
  // A stand-in shortened some other way still starts with the site and
  // has no spaces in it; a page's own title almost never does both.
  const host = urlTitle(url).split('/')[0]
  return !/\s/.test(said) && said.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').startsWith(host)
}
