/**
 * Open the notes out to a page of their own, or fold them back to the
 * panel. Four corners pointing out, or the same four pointing in.
 */
export function ExpandIcon({ folding }: { folding?: boolean }) {
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
      {folding ? (
        <>
          <path d="M6 1.5v4.5H1.5" />
          <path d="M8 12.5V8h4.5" />
        </>
      ) : (
        <>
          <path d="M8.5 1.5h4v4" />
          <path d="M5.5 12.5h-4v-4" />
        </>
      )}
    </svg>
  )
}
