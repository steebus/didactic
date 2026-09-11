'use client'

import { useId, useMemo, useState } from 'react'
import { readModel, runModel, type ModelSpec } from '@didactic/core/model'
import { Chart } from './Chart'
import styles from './blocks.module.css'

export type ModelData = ModelSpec

/**
 * A model the reader can push on.
 *
 * `chart` plots figures the writer already had; this computes them from
 * sliders. The difference is what it teaches: a single plotted line
 * shows one case, and the shape of a response -- what a rate rise
 * actually does to a repayment, where the curve stops being a curve --
 * is a thing you find by moving a number and watching.
 *
 * The arithmetic is all in `@didactic/core/model`, so the phone runs
 * the identical model and so it can be tested without a slider to drag.
 * What is here is the dragging, the printing, and handing the computed
 * series to the same `Chart` every other plot in a lesson is drawn by.
 */
export function Model({ data }: { data: ModelData }) {
  const model = useMemo(() => readModel(data), [data])
  const [at, setAt] = useState<Record<string, number>>({})
  const titleId = useId()

  // A payload that cannot be read is not drawn at all: a model block
  // the reader cannot tell a wrong curve from a right one in is worse
  // than no block.
  if (!model) return null

  const values = Object.fromEntries(
    model.sliders.map(s => [s.id, at[s.id] ?? s.value])
  )
  const run = runModel(model, values)

  return (
    <figure className={styles.figure}>
      {model.title && (
        <figcaption className={styles.figureTitle} id={titleId}>
          {model.title}
        </figcaption>
      )}

      {/* The controls above the plot, because they are the question and
          the plot is the answer. */}
      <div className={styles.modelInputs}>
        {model.sliders.map(slider => (
          <label key={slider.id} className={styles.modelInput}>
            <span className={styles.modelLabel}>
              {slider.label}
              <span className={styles.modelValue}>
                {slider.unit === '£' && '£'}
                {format(values[slider.id], slider.step)}
                {slider.unit && slider.unit !== '£' && ` ${slider.unit}`}
              </span>
            </span>
            <input
              type="range"
              className={styles.modelSlider}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={values[slider.id]}
              onChange={e =>
                setAt(a => ({ ...a, [slider.id]: Number(e.target.value) }))
              }
            />
          </label>
        ))}
      </div>

      {run.readouts.length > 0 && (
        <dl className={styles.modelReadouts}>
          {run.readouts.map((readout, i) => (
            <div key={i} className={styles.modelReadout}>
              <dt className={styles.modelReadoutLabel}>{readout.label}</dt>
              <dd className={styles.modelReadoutValue}>
                {readout.value === null ? (
                  '—'
                ) : (
                  <>
                    {readout.unit === '£' && '£'}
                    {money(readout.value, readout.dp)}
                    {readout.unit && readout.unit !== '£' && (
                      <span className={styles.modelUnit}> {readout.unit}</span>
                    )}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {run.series.length > 0 && run.x.values.length > 1 && (
        // The same plot as any other in a lesson, handed numbers this
        // block worked out rather than numbers a writer typed.
        <Chart
          data={{
            kind: 'line',
            x: { label: run.x.label, values: run.x.values.map(v => format(v, 1)) },
            y: run.y,
            series: run.series,
          }}
        />
      )}

      {/* Said rather than left as a gap in a line. A model is only
          worth anything if the reader can trust what it draws, and a
          curve quietly missing its first point is exactly the kind of
          thing that spends that trust. */}
      {run.incomplete && (
        <p className={styles.modelGap}>
          There is no answer at some of these settings — the arithmetic runs
          out. Move a slider off its end and the line fills in.
        </p>
      )}

      {model.caption && <figcaption className={styles.caption}>{model.caption}</figcaption>}
    </figure>
  )
}

/** A slider's own value, at the precision its step implies: a step of
 *  1 never prints a decimal, a step of 0.1 prints exactly one. */
function format(value: number, step: number): string {
  const dp = step >= 1 ? 0 : Math.min(String(step).split('.')[1]?.length ?? 0, 3)
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

function money(value: number, dp: number): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}
