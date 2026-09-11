/**
 * Condition: how warm a topic is, as a named state rather than a number.
 *
 * Freshness is a continuous decay, but a sheet prints a word, and both
 * platforms must print the same word at the same value. The hatch table
 * comes with it: density is the second carrier of the same state, so
 * that condition survives a monochrome screen or reduced colour vision
 * (PRODUCT.md, Accessibility & Inclusion). Colour is the third, and
 * redundant by design.
 */

export type StockState = 'in-season' | 'holding' | 'dormant' | 'unsown'

/**
 * Never sown is checked before any threshold: a topic with no exposure
 * at all is not the same as one that has gone cold.
 */
export function stockState(freshness: number, lastExposureAt: string | null): StockState {
  if (lastExposureAt === null) return 'unsown'
  if (freshness >= 0.6) return 'in-season'
  if (freshness >= 0.25) return 'holding'
  return 'dormant'
}

/**
 * Worst first: what has never been touched, then what has decayed
 * furthest. The order a bed is walked when deciding what to tend.
 */
export const STOCK_ORDER: StockState[] = ['unsown', 'dormant', 'holding', 'in-season']

export const STOCK_LABEL: Record<StockState, string> = {
  'in-season': 'In season',
  holding: 'Holding',
  dormant: 'Dormant',
  unsown: 'Unsown',
}

/**
 * Hatch density falls with viability: solid, then ruled, then sparse,
 * then an empty bed with only its outline. Drawn as an SVG pattern on
 * the web and by `react-native-svg` on the phone, from these same
 * numbers.
 */
export const STOCK_HATCH: Record<StockState, { gap: number; width: number; angle: number }> = {
  'in-season': { gap: 2, width: 2, angle: 45 },
  holding: { gap: 4, width: 1.5, angle: 45 },
  dormant: { gap: 7, width: 1, angle: 45 },
  unsown: { gap: 0, width: 0, angle: 0 },
}

/**
 * How much of the bar is filled, as a fraction of its width. An unsown
 * topic shows none; anything else keeps a sliver so that "barely" still
 * reads as a bar rather than as nothing.
 */
export function stockFill(freshness: number, state: StockState): number {
  return state === 'unsown' ? 0 : Math.max(0.06, freshness)
}

/**
 * What a reader hears. The bar carries freshness and the figure beside
 * it carries ability; announcing freshness as "viability" gave the two
 * channels one name, and a screen reader said 100 where the sheet
 * printed 11.
 */
export function stockLabel(freshness: number, state: StockState): string {
  return `${STOCK_LABEL[state]}, freshness ${Math.round(freshness * 100)} per cent`
}
