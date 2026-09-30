import { BannerFigures } from '@/components/BannerFigures'
import { SheetNav } from '@/components/SheetNav'
import { Setting, Slug } from '@/components/Setting'
import canvas from '@/components/GraphCanvas.module.css'
import styles from './loading.module.css'

/**
 * The bed, while it is read.
 *
 * The banner is the one the bed prints once it is mounted, so the
 * hand-off does not change the head; the panel floats on the drill
 * grid because the bed is not a sheet.
 */
export default function Loading() {
  return (
    <main className={styles.bed}>
      <div className={canvas.controls}>
        <SheetNav current="bed" hideHere />
        <div className={canvas.headRow}>
          <h1 className={canvas.title}>The Bed</h1>
          <BannerFigures lines={[<Slug key="a" w="12rem" band />]} />
        </div>
      </div>
      <div className={styles.panel}>
        <Setting label="Reading the bed" shape="panel" />
      </div>
    </main>
  )
}
