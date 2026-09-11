/**
 * A lesson block that models something, rather than plotting numbers
 * that were worked out somewhere else.
 *
 * `chart` draws figures the writer already had. This computes them, from
 * sliders the reader moves: what a rate rise does to a repayment, what
 * doubling the contribution does to a pot, what a cache hit rate does to
 * the load on an origin. The point is the shape of the response, which
 * is a thing you find by moving a number and watching, and cannot be
 * found by reading a single plotted line.
 *
 * Everything here is arithmetic over declared names, read by
 * `@didactic/core/expression` -- a closed grammar that cannot reach
 * anything. The payload stays data; see that module for why that
 * mattered enough to write a parser for.
 *
 * The whole thing is pure and lives here rather than in the component
 * so the phone runs the identical model, and so the arithmetic can be
 * tested without a slider to drag.
 */

import { readFormula, type Formula } from './expression'

export interface ModelInput {
  /** The name formulas read it by. */
  id?: string
  label?: string
  /** Printed against the figure: £, %, years. */
  unit?: string
  min?: number
  max?: number
  step?: number
  /** Where the slider starts. */
  value?: number
}

export interface ModelSpec {
  title?: string
  inputs?: ModelInput[]
  /** Intermediate names, in order; each may read the inputs and any
   *  `let` before it. Keeps the formulas below readable. */
  let?: Array<{ id?: string; is?: string }>
  /** Figures printed above the plot. */
  readouts?: Array<{ label?: string; is?: string; unit?: string; dp?: number }>
  /** What runs along the bottom of the plot. */
  x?: { id?: string; label?: string; from?: number; to?: string | number; steps?: number }
  series?: Array<{ name?: string; is?: string }>
  y?: { label?: string }
  caption?: string
}

/** An input with every hole filled and its bounds made sense of. */
export interface Slider {
  id: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
}

export interface ReadModel {
  title: string | null
  sliders: Slider[]
  x: { id: string; label: string; from: number; to: Formula | number; steps: number }
  y: { label: string }
  lets: Array<{ id: string; formula: Formula }>
  readouts: Array<{ label: string; formula: Formula; unit: string; dp: number }>
  series: Array<{ name: string; formula: Formula }>
  caption: string | null
}

/** How many points a plot is drawn from. Enough to read a curve as a
 *  curve, few enough that re-running the model on every drag of a
 *  slider is not felt. */
const STEPS = { fallback: 24, most: 120 }

/** A slider with no range is not a slider. These are the bounds used
 *  where a payload leaves them out, not a suggestion to the writer. */
const SPAN = { min: 0, max: 100 }

const text = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback

const number = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/**
 * Read a payload into something that can be run, or null.
 *
 * Null for anything that could only be drawn by guessing at what the
 * writer meant: a formula that is not arithmetic, a name declared
 * twice, a series reading something nothing supplies. A model block
 * that cannot be trusted to be right is worse than no block, because
 * the reader has no way to tell a wrong curve from a right one.
 */
export function readModel(spec: ModelSpec): ReadModel | null {
  const rawInputs = Array.isArray(spec.inputs) ? spec.inputs : []
  const sliders: Slider[] = []
  const declared = new Set<string>()

  for (const input of rawInputs) {
    const id = typeof input.id === 'string' ? input.id.trim() : ''
    // The ids are what formulas read, so they have to be names the
    // expression language can actually say, and each has to be one
    // thing only.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id) || declared.has(id)) return null
    declared.add(id)

    const min = number(input.min, SPAN.min)
    const max = number(input.max, SPAN.max)
    if (!(max > min)) return null

    const span = max - min
    const step = Math.min(Math.max(number(input.step, span / 100), span / 1000), span)
    const value = Math.min(Math.max(number(input.value, min + span / 2), min), max)

    sliders.push({
      id,
      label: text(input.label, id),
      unit: text(input.unit, ''),
      min,
      max,
      step,
      value,
    })
  }
  if (sliders.length === 0) return null

  // The name running along the bottom. It is in scope for the series
  // and for nothing else, so it is checked for a clash here.
  const xId = text(spec.x?.id, 'x')
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(xId) || declared.has(xId)) return null

  const lets: ReadModel['lets'] = []
  for (const binding of Array.isArray(spec.let) ? spec.let : []) {
    const id = typeof binding.id === 'string' ? binding.id.trim() : ''
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id) || declared.has(id) || id === xId) return null

    const formula = readFormula(binding.is)
    // Each `let` may read the inputs and the lets before it, and
    // nothing else. Reading a later one would be an order the payload
    // never states; reading the x would make it a series, not a let.
    if (!formula || !formula.reads.every(name => declared.has(name))) return null

    declared.add(id)
    lets.push({ id, formula })
  }

  const readouts: ReadModel['readouts'] = []
  for (const readout of Array.isArray(spec.readouts) ? spec.readouts : []) {
    const formula = readFormula(readout.is)
    if (!formula || !formula.reads.every(name => declared.has(name))) return null
    readouts.push({
      label: text(readout.label, 'Result'),
      formula,
      unit: text(readout.unit, ''),
      dp: Math.min(Math.max(Math.round(number(readout.dp, 0)), 0), 4),
    })
  }

  // The series may read the x as well, which is what makes them series.
  const withX = new Set(declared)
  withX.add(xId)

  const series: ReadModel['series'] = []
  for (const line of Array.isArray(spec.series) ? spec.series : []) {
    const formula = readFormula(line.is)
    if (!formula || !formula.reads.every(name => withX.has(name))) return null
    series.push({ name: text(line.name, 'Value'), formula })
  }
  if (series.length === 0 && readouts.length === 0) return null

  // The far end of the axis may itself be a formula -- a mortgage runs
  // to whatever the term slider says -- so it is read as one and a
  // plain number is just the simplest case of that.
  let to: Formula | number
  if (typeof spec.x?.to === 'number') {
    to = spec.x.to
  } else {
    const formula = readFormula(spec.x?.to)
    if (!formula || !formula.reads.every(name => declared.has(name))) return null
    to = formula
  }

  return {
    title: typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim() : null,
    sliders,
    x: {
      id: xId,
      label: text(spec.x?.label, xId),
      from: number(spec.x?.from, 0),
      to,
      steps: Math.min(Math.max(Math.round(number(spec.x?.steps, STEPS.fallback)), 2), STEPS.most),
    },
    y: { label: text(spec.y?.label, '') },
    lets,
    readouts,
    series,
    caption:
      typeof spec.caption === 'string' && spec.caption.trim() ? spec.caption.trim() : null,
  }
}

export interface ModelRun {
  readouts: Array<{ label: string; value: number | null; unit: string; dp: number }>
  x: { label: string; values: number[] }
  y: { label: string }
  series: Array<{ name: string; values: number[] }>
  /** True where some point of some line had no answer -- a rate of
   *  zero in a formula that divides by it. The block says so rather
   *  than drawing a line with holes nobody can see. */
  incomplete: boolean
}

/**
 * Run the model at the slider positions given.
 *
 * Called on every drag, so it does no work it can avoid: the formulas
 * were parsed once when the payload was read, and this only walks the
 * trees they produced.
 */
export function runModel(model: ReadModel, at: Record<string, number>): ModelRun {
  // The inputs, clamped to their own bounds: the values arrive from a
  // slider, but nothing stops a caller passing anything.
  const scope: Record<string, number> = {}
  for (const slider of model.sliders) {
    const value = number(at[slider.id], slider.value)
    scope[slider.id] = Math.min(Math.max(value, slider.min), slider.max)
  }

  // The intermediates, in the order they were declared. A binding that
  // has no answer is left out rather than set to zero, so everything
  // downstream of it reads as unanswerable too instead of quietly
  // computing with a number nobody chose.
  let broken = false
  for (const binding of model.lets) {
    const value = binding.formula.evaluate(scope)
    if (value === null) broken = true
    else scope[binding.id] = value
  }

  const readouts = model.readouts.map(readout => ({
    label: readout.label,
    value: readout.formula.evaluate(scope),
    unit: readout.unit,
    dp: readout.dp,
  }))

  const to = typeof model.x.to === 'number' ? model.x.to : model.x.to.evaluate(scope)
  const values: number[] = []
  const series = model.series.map(line => ({ name: line.name, values: [] as number[] }))

  if (to !== null && to > model.x.from) {
    const span = to - model.x.from
    for (let i = 0; i < model.x.steps; i++) {
      const x = model.x.from + (span * i) / (model.x.steps - 1)
      const point = { ...scope, [model.x.id]: x }

      // A point is only plotted where every line has an answer at it,
      // so the lines stay in step with the axis underneath them.
      const at = model.series.map(line => line.formula.evaluate(point))
      if (at.some(v => v === null)) {
        broken = true
        continue
      }

      values.push(x)
      at.forEach((v, j) => series[j].values.push(v as number))
    }
  } else if (model.series.length > 0) {
    broken = true
  }

  return {
    readouts,
    x: { label: model.x.label, values },
    y: model.y,
    series,
    incomplete: broken || readouts.some(r => r.value === null),
  }
}
