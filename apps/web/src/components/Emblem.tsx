import { specimenIndex } from '@didactic/core/specimens'

// Re-exported: the sheets that name a subject's plate take both from
// here, and the rule for which specimen a slug draws is shared so the
// phone picks the same one.
export { slugify } from '@didactic/core/specimens'

/**
 * Subject plates. Flat two-colour forms in the register of a catalogue
 * engraving: one silhouette, one ink, no gradients. Each subject gets a
 * seed or specimen form rather than a category icon.
 */

/**
 * Reversed out of a saturated plate, so every form is one bold
 * silhouette. Thin strokes and small detail disappear at listing size;
 * these read at 48px.
 */
const PLATES: Record<string, React.ReactNode> = {
  // Sprout: a fat seed leaf pair on a thick stem.
  'front-end': (
    <>
      <path d="M28 52V26h4v26z" />
      <path d="M30 28C30 16 38 8 50 8c0 12-8 20-20 20z" />
      <path d="M30 34C30 24 23 17 12 17c0 10 7 17 18 17z" />
    </>
  ),
  // Bulb: a stacked root vegetable, wide shoulders tapering to a root.
  'data-backend': (
    <>
      <path d="M26 6h8v14h-8z" />
      <path d="M30 18c11 0 17 7 17 16 0 8-7 14-17 14s-17-6-17-14c0-9 6-16 17-16z" />
      {/* Growth rings, cut back to the plate's own ink. */}
      <path d="M22 26h16v3H22zM20 34h20v3H20z" className="plateGround" />
    </>
  ),
  // Trellis: heavy orthogonal frame, unmistakable at any size.
  infrastructure: (
    <>
      <path d="M10 16h40v6H10zM10 34h40v6H10z" />
      <path d="M16 8h6v44h-6zM38 8h6v44h-6z" />
    </>
  ),
  // Graft: a single stock stem with a scion bound in at the union.
  ai: (
    <>
      <path d="M27 52V30h6v22z" />
      <path d="M20 24h20v8H20z" />
      <path d="M30 24c0-11 6-18 17-20-1 12-7 20-17 20z" />
      <path d="M30 22c-2-8-7-13-15-14 1 9 6 14 15 14z" />
    </>
  ),
  // Grain head: a fat wheat ear.
  'economic-history': (
    <>
      <path d="M28 52V30h4v22z" />
      <ellipse cx="30" cy="14" rx="7" ry="12" />
      <ellipse cx="17" cy="26" rx="6" ry="10" transform="rotate(-30 17 26)" />
      <ellipse cx="43" cy="26" rx="6" ry="10" transform="rotate(30 43 26)" />
    </>
  ),
  // Aperture: a heavy ring with a solid centre.
  photography: (
    <>
      <path
        d="M30 6a24 24 0 100 48 24 24 0 000-48zm0 8a16 16 0 110 32 16 16 0 010-32z"
        fillRule="evenodd"
      />
      <circle cx="30" cy="30" r="9" />
    </>
  ),
}

/**
 * Specimens for subjects with no plate of their own.
 *
 * Every subject the user sows falls here -- the named plates above only
 * match the slugs written into this file -- so this cannot be one
 * dormant seed. A catalogue prints a specimen for every line it
 * carries, and a bed with a blank counter beside it reads as stock
 * nobody bothered to draw.
 *
 * Six forms in the same register as the named plates: one silhouette,
 * reversed out, legible at 48px. Which one a subject gets is decided by
 * its title, so it is the same specimen on every sheet and every
 * reload.
 */
const SPECIMENS: React.ReactNode[] = [
  // Seed, dormant: the original fallback, kept as one of the set.
  <path key="seed" d="M30 14c10 0 17 8 17 18s-7 18-17 18-17-8-17-18 7-18 17-18z" />,
  // Pod: three fat beans in a split husk.
  <g key="pod">
    <path d="M14 22c0-6 7-10 16-10s16 4 16 10-7 26-16 26-16-20-16-26z" />
    <circle cx="30" cy="22" r="4" className="plateGround" />
    <circle cx="30" cy="32" r="4" className="plateGround" />
    <circle cx="30" cy="42" r="3" className="plateGround" />
  </g>,
  // Tuber: a heavy root with two eyes.
  <g key="tuber">
    <path d="M30 10c12 0 19 9 19 20s-8 20-19 20-19-9-19-20 7-20 19-20z" />
    <circle cx="24" cy="26" r="3" className="plateGround" />
    <circle cx="36" cy="36" r="3" className="plateGround" />
  </g>,
  // Cutting: a stem with three leaves off one side.
  <g key="cutting">
    <path d="M28 54V12h4v42z" />
    <path d="M32 20c0-7 6-12 15-12 0 7-6 12-15 12z" />
    <path d="M32 32c0-7 6-12 15-12 0 7-6 12-15 12z" />
    <path d="M28 26c0-7-6-12-15-12 0 7 6 12 15 12z" />
  </g>,
  // Cone: a scaled seed cone on a short stalk.
  <g key="cone">
    <path d="M28 54v-8h4v8z" />
    <path d="M30 6c9 0 14 10 14 22s-5 18-14 18-14-6-14-18S21 6 30 6z" />
    <path d="M17 24h26v3H17zM18 34h24v3H18z" className="plateGround" />
  </g>,
  // Bud: a tight bulb on a straight stem, about to break.
  <g key="bud">
    <path d="M28 54V30h4v24z" />
    <path d="M30 4c8 0 13 7 13 16s-5 14-13 14-13-5-13-14S22 4 30 4z" />
  </g>,
]

/**
 * A stable index from the title. Not a hash worth defending -- it only
 * has to be deterministic, so a subject keeps its specimen between
 * reloads and between sheets.
 *
 * Position is folded in rather than only the characters, because
 * "Shares and Stocks" and "Stocks and Shares" are anagrams and a
 * sum-of-characters hash handed them the same specimen -- which is
 * precisely the pair a reader most needs to tell apart.
 */
function specimenFor(slug: string): React.ReactNode {
  return SPECIMENS[specimenIndex(slug, SPECIMENS.length)]
}

/**
 * A subject's plate: one silhouette reversed out of one ink.
 *
 * A named subject gets its own drawing; anything else gets a specimen
 * chosen by `specimenIndex`, so the same subject keeps the same form
 * between reloads, between sheets, and on the phone.
 */
export function Emblem({
  slug,
  colour,
  size = 60,
}: {
  slug: string
  colour: string
  size?: number
}) {
  const plate = PLATES[slug] ?? specimenFor(slug)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="60" height="60" fill={colour} />
      <style>{`.plateGround { fill: ${colour}; stroke: ${colour}; }`}</style>
      <g
        style={{ fill: 'var(--paper)', stroke: 'var(--paper)' }}
        transform="translate(30 30) scale(0.78) translate(-30 -30)"
      >
        {plate}
      </g>
    </svg>
  )
}
