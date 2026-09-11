import { RootsSpecimen } from './RootsSpecimen'
import { routeLevel, routeCaption, type RouteProgress } from '@/lib/progress'
import styles from './RouteSpecimen.module.css'

/**
 * The progress plate on a band: the same specimen the sow sheet draws,
 * grown to how far the route has been worked. Where a bed row has only
 * the width for a printed chip, a band has room for the plant, so this is
 * where the growing device earns its place.
 *
 * The plate takes the band's own ink and reads as an inset window in it,
 * with the figure printed under it in paper. One caption carries the
 * whole reading — "1 of 18 worked", "No route yet" — so the plant never
 * needs a label repeating the word beneath it.
 */
export function RouteSpecimen({
  progress,
  ink,
}: {
  progress: RouteProgress
  /** The band's plate ink, so the window sits in it rather than on it. */
  ink: string
}) {
  return (
    <figure className={styles.plate}>
      <div className={styles.window}>
        <RootsSpecimen
          level={routeLevel(progress)}
          ink={ink}
          ariaLabel={`Route progress: ${routeCaption(progress)}`}
        />
      </div>
      <figcaption className={styles.caption}>{routeCaption(progress)}</figcaption>
    </figure>
  )
}
