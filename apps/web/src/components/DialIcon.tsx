/**
 * The press that unfurls the reading's buttons: a plus that turns to a
 * cross once they are out, so the same press reads as putting them away.
 * The turn is the stylesheet's, on `aria-expanded`.
 */
export function DialIcon() {
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
        <rect x="8.25" y="3" width="1.5" height="12" />
        <rect x="3" y="8.25" width="12" height="1.5" />
      </g>
    </svg>
  )
}
