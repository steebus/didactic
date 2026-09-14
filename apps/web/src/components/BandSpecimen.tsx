import { RootsSpecimen } from './RootsSpecimen'
import { routeLevel, routeCaption, type RouteProgress } from '@didactic/core/progress'
import styles from './BandSpecimen.module.css'

/**
 * The growing specimen as the band's own ground, rather than a plate
 * standing beside the title.
 *
 * The plate version (`RouteSpecimen`) gave the plant a window of its
 * own on the right of the band, which cost the band about a third of
 * its height on a phone and pushed the reading below the fold. Laid in
 * behind the words instead, the same drawing costs no height at all:
 * it is the ground the title is printed on.
 *
 * Everything that decides how it looks is a custom property, set in
 * `BandSpecimen.module.css` and overridable per sheet -- see the block
 * at the top of that file.
 *
 * The caption is *not* drawn here. A faded drawing cannot be read as a
 * figure, and "7 of 16 worked" is the one thing on this band that
 * changes -- so the sheet prints it as a line of its own and the
 * drawing is what it has always been behind that: a reading of depth,
 * taken in at a glance rather than counted.
 */
export function BandSpecimen({
  progress,
  ink,
}: {
  progress: RouteProgress
  /** The band's plate ink, so the drawing sits in it rather than on it. */
  ink: string
}) {
  return (
    // Decorative: the figure it illustrates is printed as text in the
    // band, so a screen reader that announced this too would say the
    // same thing twice.
    <div className={styles.ground} aria-hidden="true">
      <RootsSpecimen level={routeLevel(progress)} ink={ink} ariaLabel="" />
    </div>
  )
}

/** The caption the drawing used to carry, printed as its own line. */
export function BandSpecimenCaption({ progress }: { progress: RouteProgress }) {
  return <p className={styles.caption}>{routeCaption(progress)}</p>
}
