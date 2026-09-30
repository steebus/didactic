import styles from './FootBar.module.css'

/* Shared by the foot bar and the subject sheet's tools. Styled by the foot
   bar's own module, so they animate the same way wherever they are
   marked `data-on`. */

/* The glyphs are drawn with currentColor on a 24-unit box. Their parts are
   grouped so the active state can move them (see FootBar.module.css). */

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" className={styles.svg}>
      {children}
    </svg>
  )
}

/** A potted plant: the leaves grow out of the pot when it is the sheet. */
export function Plant() {
  return (
    <Svg>
      <path d="M7.5 15.5h9l-1.1 5.5H8.6Z" />
      <path d="M12 15.5V10" />
      <g className={styles.leaves}>
        <path d="M12 12.5c-3.4 0-5-1.900-5-5 3.400 0 5 1.900 5 5Z" />
        <path d="M12 10.5c0-3 1.600-5.200 5-5.200 0 3-1.600 5.200-5 5.200Z" />
      </g>
    </Svg>
  )
}

/** The bed as a graph: the nodes pop when it is the sheet. */
export function Graph() {
  return (
    <Svg>
      <path d="M7.700 15.700 10.700 8" />
      <path d="M13.600 8 16.700 13.500" />
      <path d="M8.400 18h7" />
      <g className={styles.nodes}>
        <circle cx="6.500" cy="17.500" r="2.300" />
        <circle cx="12" cy="6.500" r="2.300" />
        <circle cx="17.500" cy="16" r="2.300" />
      </g>
    </Svg>
  )
}

/** A stack of cards: it fans out when it is the sheet. */
export function Cards() {
  return (
    <Svg>
      <rect className={styles.cardBack} x="6.500" y="4.500" width="11" height="15" />
      <rect className={styles.cardMid} x="6.500" y="4.500" width="11" height="15" />
      <rect className={styles.cardFront} x="6.500" y="4.500" width="11" height="15" />
    </Svg>
  )
}

/** A tray: the lip lifts when it is the sheet. */
export function Tray() {
  return (
    <Svg>
      <path d="M3.500 13.500 6.500 5h11l3 8.500V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
      <path className={styles.lip} d="M3.500 13.500h5.200a3.300 3.300 0 0 0 6.600 0h5.200" />
    </Svg>
  )
}

/** A pulse line: what you have been doing. */
export function Pen() {
  return (
    <Svg>
      <g className={styles.pen}>
        <path d="M3 12.500h4l3-7.500 4 14 3-6.500h4" />
      </g>
    </Svg>
  )
}
