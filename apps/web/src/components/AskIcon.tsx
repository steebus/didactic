/**
 * The mark of the agent: a speech bubble.
 *
 * Its own file because two places draw it -- the marking desk on a
 * lesson, and the docked button everywhere else -- and a glyph copied
 * into both is a glyph that will be changed in one.
 */
export function AskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none">
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A2.5 2.5 0 0 1 17 6.5v5A2.5 2.5 0 0 1 14.5 14H8l-4 3v-3H5.5A2.5 2.5 0 0 1 3 11.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
