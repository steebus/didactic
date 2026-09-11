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

// The stages and every path live in `@didactic/core/specimens`: the
// phone draws the same specimen with `react-native-svg` from the same
// geometry. What is here is the `<svg>` and the drawing-on animation.
import {
  ROOT_STAGES,
  STEM_GROWN,
  ROOT_GROWN,
  STEM,
  TAPROOT,
  LEAF,
  MIDRIB,
  PETALS,
  LATERALS,
  LEAVES,
} from '@didactic/core/specimens'

export { ROOT_STAGES } from '@didactic/core/specimens'

export function RootsSpecimen({
  level: raw,
  caption,
  ink = 'var(--plate-green)',
  ariaLabel,
}: {
  level: number
  /** Printed under the plate. Omitted entirely when absent. */
  caption?: string
  /** The plate's ink. Defaults to the app's own green. */
  ink?: string
  /** Overrides the spoken label. The specimen is reused to show route
   *  progress as well as a roots level; when it does, the label must say
   *  so rather than announcing a "Level n of 5" that means something
   *  else on that band. */
  ariaLabel?: string
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
        aria-label={ariaLabel ?? `Level ${level} of 5: ${stage.label}`}
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
