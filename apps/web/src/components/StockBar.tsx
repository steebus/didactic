/**
 * Viability bar. Freshness is carried by hatch density as well as fill,
 * so the state survives a monochrome screen or reduced colour vision —
 * see PRODUCT.md, Accessibility & Inclusion.
 *
 * The states, their labels and the hatch table live in
 * `@didactic/core/stock`: the phone draws the same bar from the same
 * numbers with `react-native-svg`. What is here is the `<svg>`.
 */

import { stockState, STOCK_HATCH, stockFill, stockLabel } from '@didactic/core/stock'

// Re-exported so the sheets that read a state alongside drawing a bar
// keep their one import.
export { type StockState, stockState, STOCK_LABEL, STOCK_ORDER } from '@didactic/core/stock'

export function StockBar({
  freshness,
  lastExposureAt,
  colour,
  width = 120,
  height = 10,
}: {
  freshness: number
  lastExposureAt: string | null
  colour: string
  width?: number
  height?: number
}) {
  const state = stockState(freshness, lastExposureAt)
  const hatch = STOCK_HATCH[state]
  const id = `hatch-${state}-${colour.replace('#', '')}`
  const filled = stockFill(freshness, state) * width

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      /* The bar carries freshness; the figure printed beside it carries
         ability. Announcing freshness as "viability" gave the two
         channels one name, so a screen reader heard 100 where the sheet
         printed 11 -- collapsing the distinction the product exists to
         make. The bar says what it actually shows. */
      aria-label={stockLabel(freshness, state)}
      style={{ display: 'block' }}
    >
      {hatch.gap > 0 && (
        <defs>
          <pattern
            id={id}
            width={hatch.gap + hatch.width}
            height={hatch.gap + hatch.width}
            patternTransform={`rotate(${hatch.angle})`}
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={hatch.gap + hatch.width}
              stroke={colour}
              strokeWidth={hatch.width}
            />
          </pattern>
        </defs>
      )}
      <rect
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        fill="none"
        stroke="var(--rule)"
        strokeWidth="1"
      />
      {filled > 0 && (
        <rect x="1" y="1" width={Math.max(0, filled - 2)} height={height - 2} fill={`url(#${id})`} />
      )}
    </svg>
  )
}
