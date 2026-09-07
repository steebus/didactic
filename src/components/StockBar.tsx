/**
 * Viability bar. Freshness is carried by hatch density as well as fill,
 * so the state survives a monochrome screen or reduced colour vision —
 * see PRODUCT.md, Accessibility & Inclusion.
 *
 * Four named states, printed the way a stock table prints condition.
 */

export type StockState = 'in-season' | 'holding' | 'dormant' | 'unsown'

export function stockState(freshness: number, lastExposureAt: string | null): StockState {
  if (lastExposureAt === null) return 'unsown'
  if (freshness >= 0.6) return 'in-season'
  if (freshness >= 0.25) return 'holding'
  return 'dormant'
}

export const STOCK_LABEL: Record<StockState, string> = {
  'in-season': 'In season',
  holding: 'Holding',
  dormant: 'Dormant',
  unsown: 'Unsown',
}

// Hatch density falls with viability: solid, then ruled, then sparse,
// then an empty bed with only its outline.
const HATCH: Record<StockState, { gap: number; width: number; angle: number }> = {
  'in-season': { gap: 2, width: 2, angle: 45 },
  holding: { gap: 4, width: 1.5, angle: 45 },
  dormant: { gap: 7, width: 1, angle: 45 },
  unsown: { gap: 0, width: 0, angle: 0 },
}

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
  const hatch = HATCH[state]
  const id = `hatch-${state}-${colour.replace('#', '')}`
  const filled = state === 'unsown' ? 0 : Math.max(0.06, freshness) * width

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${STOCK_LABEL[state]}, viability ${Math.round(freshness * 100)} per cent`}
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
