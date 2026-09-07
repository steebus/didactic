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

// Unclustered and unknown subjects get a dormant, unsprouted seed.
const FALLBACK = (
  <path d="M30 14c10 0 17 8 17 18s-7 18-17 18-17-8-17-18 7-18 17-18z" />
)

/**
 * The plate is printed as a solid colour field with the specimen
 * reversed out in paper, the way a chromolithograph catalogue prints
 * its illustrations. A line drawing floating on the ground is the
 * antiques-shop version of this world, not the world itself.
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
  const plate = PLATES[slug] ?? FALLBACK
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

export function slugify(title: string) {
  return title.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
