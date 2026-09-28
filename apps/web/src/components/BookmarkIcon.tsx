/**
 * A ribbon with a notch cut in its foot: the bookmark.
 *
 * Filled once one is dropped in this reading, outlined while there is
 * none -- the button says which press it is before it is pressed, since
 * pressing it again takes the bookmark out.
 */
export function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <path
        d="M4.5 2.5 H13.5 V15.5 L9 11.75 L4.5 15.5 Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
    </svg>
  )
}
