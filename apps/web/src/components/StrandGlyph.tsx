import { GLYPH_BOX, STRAND_GLYPHS } from '@didactic/core/specimens'
import { STRAND_LABEL } from '@didactic/core/timeline'
import type { Strand } from '@didactic/core/timeline'

/**
 * The specimen on the timeline's stem.
 *
 * A leaf for a passage someone kept, a bud for their own note, the
 * thing in flower for an entry about a week. It is a label, not a
 * decoration: the three forms are what let a month be read as a shape
 * before a word of it is read as text.
 *
 * Drawn in `currentColor` so the sheet decides the ink, and hidden from
 * the reading order — the row states its strand in words beside it, and
 * a screen reader announcing "leaf" would be describing the drawing
 * rather than the record.
 */
export function StrandGlyph({
  strand,
  size = 22,
  className,
}: {
  strand: Strand
  size?: number
  className?: string
}) {
  const glyph = STRAND_GLYPHS[strand]

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // The form is named in words beside it; this is the drawing of it.
      data-strand={strand}
    >
      <title>{STRAND_LABEL[strand]}</title>

      {/* Petals first, so the disc of a flower sits over where they
          meet rather than under it. */}
      {glyph.petals.map(angle => (
        <ellipse
          key={angle}
          cx={GLYPH_BOX / 2}
          cy={6.6}
          rx={2}
          ry={3.3}
          transform={`rotate(${angle} ${GLYPH_BOX / 2} ${GLYPH_BOX / 2})`}
        />
      ))}

      <path d={glyph.outline} fill="currentColor" fillOpacity={0.14} />

      {glyph.detail.map(d => (
        <path key={d} d={d} strokeWidth={0.9} />
      ))}
    </svg>
  )
}
