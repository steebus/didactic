/**
 * Reorder arrows, drawn rather than set as unicode glyphs. A text arrow
 * inherits whatever the system font decides and never matches the
 * surrounding line weight.
 */
export function NudgeIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      {direction === 'up' ? (
        <>
          <path d="M7 11.5V2.5" />
          <path d="M3 6.5 7 2.5l4 4" />
        </>
      ) : (
        <>
          <path d="M7 2.5v9" />
          <path d="M3 7.5 7 11.5l4-4" />
        </>
      )}
    </svg>
  )
}
