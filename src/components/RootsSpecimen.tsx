import styles from './RootsSpecimen.module.css'

/**
 * The specimen plate: one plant drawn at the depth a level states.
 *
 * At 0 a dormant seed lying on bare ground; at each notch the seed
 * splits, the taproot goes down, the stem goes up, a leaf pair opens,
 * and at 5 the crown flowers. Roots are drawn as carefully as the
 * shoot, because the question this answers is about depth.
 *
 * Kept apart from the slider so a sheet can print the figure without
 * the control — the reading sets two of these side by side, one for
 * what the user said and one for what their answers showed.
 */

export const ROOT_STAGES = [
  {
    label: 'Bare ground',
    note: 'Nothing sown. No prior knowledge at all.',
  },
  {
    label: 'Just germinated',
    note: 'You know the words. Nothing has taken hold yet.',
  },
  {
    label: 'Seedling',
    note: 'You can follow a conversation about it and mostly keep up.',
  },
  {
    label: 'In leaf',
    note: 'You use it, with the documentation open beside you.',
  },
  {
    label: 'Well rooted',
    note: 'You work in it without looking much up, and you know where it bends.',
  },
  {
    label: 'In full flower',
    note: 'Mastery. You could teach it, and you know what the books get wrong.',
  },
] as const

/** How much of the stem and taproot is drawn at each notch. */
const STEM_GROWN = [0, 0.14, 0.34, 0.58, 0.8, 1]
const ROOT_GROWN = [0, 0.16, 0.4, 0.62, 0.84, 1]

const STEM = 'M70 126 C 66 108 74 84 70 58 C 68 44 70 36 70 26'
const TAPROOT = 'M70 126 C 73 144 65 158 69 176 C 71 186 69 194 68 202'

/** Lateral roots, each appearing at its own notch. The system spreads
 *  as well as deepens: a subject held well is held widely. */
const LATERALS: Array<{ d: string; stage: number; width: number }> = [
  { d: 'M69 140 C 58 143 50 148 40 154', stage: 2, width: 2.2 },
  { d: 'M70 145 C 81 148 88 153 96 159', stage: 2, width: 2.2 },
  { d: 'M68 158 C 55 162 46 170 36 178', stage: 3, width: 2 },
  { d: 'M69 163 C 83 167 91 174 100 181', stage: 3, width: 2 },
  { d: 'M69 133 C 57 133 46 132 34 129', stage: 4, width: 1.8 },
  { d: 'M69 176 C 80 182 85 189 90 197', stage: 4, width: 1.8 },
  // Root hairs: the fine work that only a deep holding has.
  { d: 'M40 154 C 36 160 34 165 33 171', stage: 5, width: 1.1 },
  { d: 'M96 159 C 100 165 102 170 102 176', stage: 5, width: 1.1 },
  { d: 'M36 178 C 32 184 31 189 31 195', stage: 5, width: 1.1 },
  { d: 'M100 181 C 104 187 106 191 106 196', stage: 5, width: 1.1 },
  { d: 'M68 202 C 65 205 63 206 61 207', stage: 5, width: 1.1 },
]

/** Leaves open in opposite pairs, each pair one notch further up the
 *  stem than the last. `angle` is measured from the stem outward. */
const LEAVES: Array<{ x: number; y: number; angle: number; scale: number; stage: number }> = [
  // Seed leaves: small, blunt, the first thing a seedling puts out.
  { x: 69, y: 104, angle: -18, scale: 0.5, stage: 2 },
  { x: 69, y: 104, angle: -162, scale: 0.5, stage: 2 },
  { x: 70, y: 86, angle: -28, scale: 0.72, stage: 3 },
  { x: 70, y: 86, angle: -152, scale: 0.72, stage: 3 },
  { x: 71, y: 66, angle: -32, scale: 0.88, stage: 4 },
  { x: 71, y: 66, angle: -148, scale: 0.88, stage: 4 },
  { x: 70, y: 48, angle: -42, scale: 0.64, stage: 5 },
  { x: 70, y: 48, angle: -138, scale: 0.64, stage: 5 },
]

const LEAF = 'M0 0 C 9 -13 25 -16 34 -7 C 25 6 9 9 0 0 Z'
const MIDRIB = 'M3 0 C 12 -3 22 -5 30 -6'

const PETALS = [0, 60, 120, 180, 240, 300]

export function RootsSpecimen({
  level: raw,
  caption,
  ink = 'var(--plate-green)',
}: {
  level: number
  /** Printed under the plate. Omitted entirely when absent. */
  caption?: string
  /** The plate's ink. Defaults to the app's own green. */
  ink?: string
}) {
  const level = Math.min(5, Math.max(0, Math.round(raw)))
  const stage = ROOT_STAGES[level]

  // Growth runs from the base outward, so each part waits for the part
  // that carries it. Retraction has no such order: pulling the figure
  // back down is one movement.
  const delay = (from: number, grown: boolean) => (grown ? `${from * 55}ms` : '0ms')

  return (
    <figure className={styles.plate} style={{ '--plate-ink': ink } as React.CSSProperties}>
      <svg
        className={styles.specimen}
        viewBox="0 0 140 210"
        role="img"
        aria-label={`Level ${level} of 5: ${stage.label}`}
      >
        {/* Below the soil line, so root depth reads against something. */}
        <rect className={styles.soil} x="0" y="126" width="140" height="84" />
        {[150, 174, 196].map(y => (
          <line
            key={y}
            className={styles.stratum}
            x1="8"
            y1={y}
            x2="132"
            y2={y}
            strokeDasharray="2 5"
          />
        ))}
        <line className={styles.soilLine} x1="0" y1="126" x2="140" y2="126" />

        <g className={styles.plant}>
          {/* The taproot and stem are one drawing each, revealed to the
              depth the level states, so moving between levels grows the
              same plant rather than swapping between six of them. */}
          <path
            className={styles.root}
            d={TAPROOT}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - ROOT_GROWN[level]}
            strokeWidth="3.4"
          />
          {LATERALS.map(lateral => {
            const grown = level >= lateral.stage
            return (
              <path
                key={lateral.d}
                className={styles.root}
                d={lateral.d}
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={grown ? 0 : 1}
                strokeWidth={lateral.width}
                style={{ transitionDelay: delay(lateral.stage, grown) }}
              />
            )
          })}

          <path
            className={styles.stem}
            d={STEM}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - STEM_GROWN[level]}
            strokeWidth="3.6"
          />

          {LEAVES.map((leaf, i) => {
            const grown = level >= leaf.stage
            return (
              <g key={i} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle})`}>
                <g
                  className={styles.leaf}
                  style={{
                    transform: `scale(${grown ? leaf.scale : 0})`,
                    transitionDelay: delay(leaf.stage, grown),
                  }}
                >
                  <path d={LEAF} />
                  <path className={styles.midrib} d={MIDRIB} />
                </g>
              </g>
            )
          })}

          {/* A bud at four; at five the same crown is open. */}
          <g
            className={styles.crown}
            style={{ transform: `scale(${level === 4 ? 1 : 0})`, transformOrigin: '70px 46px' }}
          >
            <ellipse className={styles.bud} cx="70" cy="38" rx="4.6" ry="9" />
          </g>

          <g
            className={styles.crown}
            style={{
              transform: `scale(${level === 5 ? 1 : 0})`,
              transformOrigin: '70px 24px',
              transitionDelay: delay(5, level === 5),
            }}
          >
            {PETALS.map(a => (
              <ellipse
                key={a}
                className={styles.petal}
                cx="70"
                cy="13"
                rx="5.4"
                ry="9"
                transform={`rotate(${a} 70 24)`}
              />
            ))}
            <circle className={styles.petal} cx="70" cy="24" r="6.5" />
            <circle className={styles.heart} cx="70" cy="24" r="3.6" />
          </g>

          {/* The seed itself: whole while nothing has happened, split
              and parting at one, gone by two — it has become the plant. */}
          <g
            className={styles.seed}
            transform="rotate(-12 70 119)"
            style={{ opacity: level === 0 ? 1 : level === 1 ? 0.72 : 0 }}
          >
            <path
              className={styles.seedHalf}
              d="M70 106.5 C 62 107 60.5 113 60.5 119 C 60.5 125 62 131 70 131.5 Z"
              style={{ transform: `translateX(${level >= 1 ? -4 : 0}px)` }}
            />
            <path
              className={styles.seedHalf}
              d="M70 106.5 C 78 107 79.5 113 79.5 119 C 79.5 125 78 131 70 131.5 Z"
              style={{ transform: `translateX(${level >= 1 ? 4 : 0}px)` }}
            />
          </g>
        </g>
      </svg>

      {caption !== undefined && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  )
}
