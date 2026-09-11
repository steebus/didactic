'use client'

import styles from './blocks.module.css'

export interface FlowStep {
  text?: string
  detail?: string
  /** Where the flow parts. Each branch is a labelled lane of its own
   *  steps, and the flow comes back together underneath them. */
  branches?: Array<{ label?: string; steps?: FlowStep[] }>
  /** A branch that leaves the drawing: it names where it goes rather
   *  than drawing an arrow across the page to get there. */
  goes?: string
}

export interface FlowData {
  title?: string
  steps?: FlowStep[]
}

/**
 * A decision drawn as one.
 *
 * Prose can say "if this, do that, unless the other" and a reader will
 * follow it once; a flow shows the shape of the decision, which is what
 * they need when they meet it again. Steps go down the page, a step
 * that parts shows its branches side by side, and the flow joins back
 * up underneath them.
 *
 * Boxes and rules rather than a drawn graph: a lane that stacks on a
 * phone reads as a flow, and an SVG of routed arrows does not. A branch
 * that leads somewhere else in the flow says where it goes instead of
 * drawing a line across the page to get there.
 */
export function Flow({ data }: { data: FlowData }) {
  const steps = (data.steps ?? []).filter(s => s?.text)
  if (steps.length === 0) return null

  return (
    <figure className={styles.figure}>
      {data.title && <figcaption className={styles.figureTitle}>{data.title}</figcaption>}
      <div className={styles.flow}>
        <Lane steps={steps} />
      </div>
    </figure>
  )
}

/** One run of steps, top to bottom. */
function Lane({ steps, depth = 0 }: { steps: FlowStep[]; depth?: number }) {
  return (
    <>
      {steps.map((step, i) => {
        const branches = (step.branches ?? []).filter(b => (b.steps ?? []).some(s => s?.text))
        const last = i === steps.length - 1 && branches.length === 0 && !step.goes

        return (
          <div key={i} className={styles.flowPart}>
            <div className={branches.length > 0 ? `${styles.flowBox} ${styles.flowAsk}` : styles.flowBox}>
              <span className={styles.flowText}>{step.text}</span>
              {step.detail && <span className={styles.flowDetail}>{step.detail}</span>}
            </div>

            {step.goes && <p className={styles.flowGoes}>Go to “{step.goes}”</p>}

            {branches.length > 0 && (
              <div className={styles.flowBranches}>
                {branches.map((branch, b) => (
                  <div key={b} className={styles.flowBranch}>
                    {branch.label && <p className={styles.flowLabel}>{branch.label}</p>}
                    {/* Deeper branches are drawn the same way; the
                        prompt asks for one parting, and a second is
                        drawn rather than refused. */}
                    <Lane steps={(branch.steps ?? []).filter(s => s?.text)} depth={depth + 1} />
                  </div>
                ))}
              </div>
            )}

            {/* The rule down to whatever comes next. Not under the last
                box in a lane: a flow that ends in a dangling line has
                not ended. */}
            {!last && <span className={styles.flowJoin} aria-hidden="true" />}
          </div>
        )
      })}
    </>
  )
}
