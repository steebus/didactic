/**
 * The way back to the head of the sheet: a nib pointing up, over the
 * rule it returns to.
 *
 * Drawn rather than set as a character, for the reason the other two
 * are -- an arrow glyph takes the reading face's own weight and colour
 * and sits on its baseline, which reads as a stray letter on a button
 * that holds no text.
 */
export function TopIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <g fill="currentColor">
        {/* The head of the sheet. */}
        <rect x="3.5" y="2.5" width="11" height="1.5" />
        {/* The nib, and the stem under it. */}
        <path d="M9 6 L14 11.5 H4 Z" />
        <rect x="8.25" y="11" width="1.5" height="4.5" />
      </g>
    </svg>
  )
}
