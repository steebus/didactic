/**
 * A sheet with a line written on it and a pencil against it: the mark
 * that is a note rather than a passage.
 *
 * Drawn rather than set as a unicode glyph, for the same reason the
 * nudge arrows are: a text glyph inherits whatever the system font
 * decides and never matches the surrounding line weight.
 */
export function NoteIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      {/* The sheet, with its corner turned. */}
      <path d="M3.75 2.25h6l4.5 4.5v9h-10.5z" />
      <path d="M9.75 2.25v4.5h4.5" />
      {/* Two ruled lines, and a third left short so the block does not
          read as a filled rectangle at this size. */}
      <path d="M6.25 9.5h5.5" />
      <path d="M6.25 12.25h5.5" />
      <path d="M6.25 15h3" />
    </svg>
  )
}
