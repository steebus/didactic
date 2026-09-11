/**
 * The list of what has been marked: ruled lines with one of them
 * washed, which is what the page itself looks like once a reader has
 * been through it.
 */
export function MarksIcon() {
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
        <rect x="2.5" y="3" width="13" height="1.5" />
        <rect x="2.5" y="11.5" width="13" height="1.5" />
        <rect x="2.5" y="15" width="8.5" height="1.5" />
      </g>
      {/* The marked line, drawn as the wash rather than as another rule. */}
      <rect x="2.5" y="6.5" width="13" height="3.5" fill="currentColor" opacity="0.45" />
    </svg>
  )
}
