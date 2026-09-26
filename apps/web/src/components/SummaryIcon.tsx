import { GLYPH_BOX, STRAND_GLYPHS } from '@didactic/core/specimens'

/**
 * The sprig: a section said back in the reader's own words.
 *
 * The same form the Marked sheet files a summary under, so the press
 * beside a heading and the row it becomes are recognisably one thing.
 * Filled once there is a summary standing, which is the whole of what
 * the press has to say before it is opened.
 */
export function SummaryIcon({ filled = false, size = 16 }: { filled?: boolean; size?: number }) {
  const glyph = STRAND_GLYPHS.summary
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <path d={glyph.outline} fill="currentColor" fillOpacity={filled ? 0.85 : 0.12} />
      {glyph.detail.map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
