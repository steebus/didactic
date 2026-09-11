import { describe, it, expect } from 'vitest'
import { readModel, runModel, sliderFigure, figure, type ModelSpec } from '../src/model'

/** The block's own example, near enough: a repayment mortgage. */
const mortgage: ModelSpec = {
  title: 'What a rate rise does to a repayment',
  inputs: [
    { id: 'principal', label: 'Borrowed', unit: '£', min: 50000, max: 1000000, step: 5000, value: 250000 },
    { id: 'rate', label: 'Rate', unit: '%', min: 0.5, max: 12, step: 0.1, value: 5.5 },
    { id: 'years', label: 'Term', unit: 'years', min: 5, max: 40, step: 1, value: 25 },
  ],
  let: [
    { id: 'r', is: 'rate / 100 / 12' },
    { id: 'n', is: 'years * 12' },
    { id: 'payment', is: 'principal * r / (1 - (1 + r) ^ (0 - n))' },
  ],
  readouts: [
    { label: 'Every month', is: 'payment', unit: '£' },
    { label: 'Interest over the term', is: 'payment * n - principal', unit: '£' },
  ],
  x: { id: 'year', label: 'Year', from: 0, to: 'years', steps: 26 },
  y: { label: 'Owed (£)' },
  series: [
    {
      name: 'Still owed',
      is: 'principal * ((1 + r) ^ n - (1 + r) ^ (year * 12)) / ((1 + r) ^ n - 1)',
    },
  ],
  caption: 'The first years are nearly all interest.',
}

const at = (spec: ModelSpec, values: Record<string, number> = {}) => {
  const model = readModel(spec)
  if (!model) throw new Error('the model would not read')
  const start = Object.fromEntries(model.sliders.map(s => [s.id, s.value]))
  return runModel(model, { ...start, ...values })
}

describe('readModel', () => {
  it('reads a real model', () => {
    const model = readModel(mortgage)
    expect(model).not.toBeNull()
    expect(model!.sliders.map(s => s.id)).toEqual(['principal', 'rate', 'years'])
    expect(model!.lets.map(l => l.id)).toEqual(['r', 'n', 'payment'])
    expect(model!.series).toHaveLength(1)
    expect(model!.title).toBe('What a rate rise does to a repayment')
  })

  it('refuses a model with no inputs, since there is nothing to move', () => {
    expect(readModel({ ...mortgage, inputs: [] })).toBeNull()
    expect(readModel({ ...mortgage, inputs: undefined })).toBeNull()
  })

  it('refuses an input whose id is not a name a formula could read', () => {
    for (const id of ['', '2rate', 'rate rise', 'rate.rise', 'rate-rise']) {
      expect(readModel({ ...mortgage, inputs: [{ id, min: 0, max: 1 }] })).toBeNull()
    }
  })

  it('refuses the same name declared twice', () => {
    expect(
      readModel({
        ...mortgage,
        inputs: [
          { id: 'rate', min: 0, max: 1 },
          { id: 'rate', min: 0, max: 2 },
        ],
      })
    ).toBeNull()
  })

  it('refuses a let that takes the name of an input', () => {
    expect(readModel({ ...mortgage, let: [{ id: 'rate', is: '1' }] })).toBeNull()
  })

  it('refuses a slider with no range to move over', () => {
    expect(readModel({ ...mortgage, inputs: [{ id: 'r', min: 5, max: 5 }] })).toBeNull()
    expect(readModel({ ...mortgage, inputs: [{ id: 'r', min: 9, max: 1 }] })).toBeNull()
  })

  it('refuses a let that reads a later one, since the payload states no such order', () => {
    expect(
      readModel({
        ...mortgage,
        let: [
          { id: 'a', is: 'b + 1' },
          { id: 'b', is: '2' },
        ],
      })
    ).toBeNull()
  })

  it('refuses a series reading a name nothing supplies', () => {
    expect(
      readModel({ ...mortgage, series: [{ name: 'Nonsense', is: 'inflation * 2' }] })
    ).toBeNull()
  })

  it('refuses a readout reading the x, which only a series may', () => {
    // A readout is a single figure, so a name that varies along the
    // axis has no one value to print.
    expect(readModel({ ...mortgage, readouts: [{ label: 'No', is: 'year * 2' }] })).toBeNull()
  })

  it('lets a series read the x, which is what makes it a series', () => {
    const model = readModel({ ...mortgage, series: [{ name: 'Straight', is: 'year * 2' }] })
    expect(model).not.toBeNull()
  })

  it('refuses a formula that is not arithmetic', () => {
    expect(readModel({ ...mortgage, let: [{ id: 'x', is: 'fetch(1)' }] })).toBeNull()
    expect(readModel({ ...mortgage, let: [{ id: 'x', is: 'principal.toString' }] })).toBeNull()
    expect(readModel({ ...mortgage, series: [{ name: 'Bad', is: '' }] })).toBeNull()
  })

  it('refuses a model with nothing to show at all', () => {
    expect(readModel({ ...mortgage, series: [], readouts: [] })).toBeNull()
  })

  it('takes readouts alone, with no plot', () => {
    // A calculator with no curve in it is a fair thing to want.
    const model = readModel({ ...mortgage, series: [] })
    expect(model).not.toBeNull()
    expect(model!.readouts).toHaveLength(2)
  })

  it('clamps a starting value into its own slider', () => {
    const model = readModel({
      ...mortgage,
      inputs: [{ id: 'r', min: 0, max: 10, value: 99 }],
      let: [],
      readouts: [{ label: 'r', is: 'r' }],
      series: [],
      x: { id: 'x', to: 1 },
    })
    expect(model!.sliders[0].value).toBe(10)
  })

  it('fills in a missing label from the name', () => {
    const model = readModel({
      inputs: [{ id: 'rate', min: 0, max: 10 }],
      readouts: [{ is: 'rate' }],
      x: { to: 1 },
    })
    expect(model!.sliders[0].label).toBe('rate')
    expect(model!.readouts[0].label).toBe('Result')
  })
})

describe('runModel', () => {
  it('computes the readouts at the sliders as they stand', () => {
    const run = at(mortgage)
    // £250,000 over 25 years at 5.5%.
    expect(run.readouts[0].value).toBeCloseTo(1535.1, 0)
    expect(run.readouts[0].unit).toBe('£')
  })

  it('moves when a slider moves', () => {
    const cheap = at(mortgage, { rate: 2 }).readouts[0].value!
    const dear = at(mortgage, { rate: 9 }).readouts[0].value!
    expect(dear).toBeGreaterThan(cheap)
  })

  it('plots a point for every step of the axis', () => {
    const run = at(mortgage)
    expect(run.x.values).toHaveLength(26)
    expect(run.series[0].values).toHaveLength(26)
    expect(run.x.values[0]).toBe(0)
    expect(run.x.values[25]).toBeCloseTo(25)
  })

  it('pays a mortgage down to nothing over its term', () => {
    const run = at(mortgage)
    const balance = run.series[0].values
    expect(balance[0]).toBeCloseTo(250000, -2)
    expect(balance[balance.length - 1]).toBeCloseTo(0, 4)
    // And monotonically: every year owes less than the one before.
    for (let i = 1; i < balance.length; i++) {
      expect(balance[i]).toBeLessThan(balance[i - 1])
    }
  })

  it('follows the term slider, since the axis end is itself a formula', () => {
    expect(at(mortgage, { years: 10 }).x.values.at(-1)).toBeCloseTo(10)
    expect(at(mortgage, { years: 40 }).x.values.at(-1)).toBeCloseTo(40)
  })

  it('clamps a value handed in from outside the slider', () => {
    // The values come from a slider, but nothing stops a caller.
    const wild = at(mortgage, { rate: 10000 })
    const top = at(mortgage, { rate: 12 })
    expect(wild.readouts[0].value).toBeCloseTo(top.readouts[0].value!, 6)
  })

  it('says so rather than drawing a curve it could not finish', () => {
    // The payment divides by the rate, so a zero rate has no answer.
    const zero = readModel({
      ...mortgage,
      inputs: [
        { id: 'principal', min: 1000, max: 100000, value: 10000 },
        { id: 'rate', min: 0, max: 12, value: 0 },
        { id: 'years', min: 5, max: 40, value: 25 },
      ],
    })!
    const run = runModel(zero, { principal: 10000, rate: 0, years: 25 })
    expect(run.incomplete).toBe(true)
    expect(run.readouts[0].value).toBeNull()
  })

  it('is complete on an honest model', () => {
    expect(at(mortgage).incomplete).toBe(false)
  })

  it('keeps the lines in step with the axis under them', () => {
    // A point is only kept where every line has an answer at it, or the
    // lines and the axis would drift apart by however many points were
    // dropped.
    const run = at({
      inputs: [{ id: 'k', min: 1, max: 10, value: 5 }],
      x: { id: 'x', from: 0, to: 10, steps: 11 },
      series: [
        { name: 'Fine', is: 'x * k' },
        { name: 'Divides by x', is: 'k / x' },
      ],
    })
    expect(run.x.values).toHaveLength(run.series[0].values.length)
    expect(run.x.values).toHaveLength(run.series[1].values.length)
    // x = 0 is dropped, since one line has no answer there.
    expect(run.x.values).not.toContain(0)
    expect(run.incomplete).toBe(true)
  })
})

describe('printing a figure', () => {
  it('prints a whole-numbered slider without a decimal', () => {
    expect(sliderFigure(25, 1)).toBe('25')
    expect(sliderFigure(25.4, 1)).toBe('25')
  })

  it('holds the decimal place a fractional step implies', () => {
    // So a figure does not grow and shrink a decimal place under the
    // reader's thumb as they drag.
    expect(sliderFigure(5.5, 0.1)).toBe('5.5')
    expect(sliderFigure(5, 0.1)).toBe('5.0')
    expect(sliderFigure(5.25, 0.01)).toBe('5.25')
  })

  it('groups thousands the way the rest of the sheet does', () => {
    expect(sliderFigure(250000, 5000)).toBe('250,000')
    expect(figure(1535.12, 2)).toBe('1,535.12')
    expect(figure(1535.12, 0)).toBe('1,535')
  })
})
