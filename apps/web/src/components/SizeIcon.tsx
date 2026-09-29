/**
 * The reading's size, one step either way: a minus and a plus, drawn
 * lighter and smaller than the dial's own plus beside them, so the press
 * that opens the buttons is never mistaken for the one that grows the
 * page.
 */
export function SizeIcon({ way }: { way: 1 | -1 }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <g fill="currentColor">
        <rect x="2" y="6.25" width="10" height="1.5" />
        {way === 1 && <rect x="6.25" y="2" width="1.5" height="10" />}
      </g>
    </svg>
  )
}
