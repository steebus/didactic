'use client'

import { Chart, type ChartData } from './Chart'
import { Check, type CheckData } from './Check'
import { Compare, type CompareData } from './Compare'
import { Steps, type StepsData } from './Steps'

/**
 * One place that turns a parsed block into a component.
 *
 * Every component here takes data that came from a language model, so
 * each one treats its own payload as a suggestion: a missing field is
 * a field to leave out, and a shape too broken to draw returns null
 * rather than throwing the lesson away. Nothing in this directory
 * renders HTML from the payload -- the values are read, and the markup
 * around them is ours.
 */
export function Block({ name, data }: { name: string; data: unknown }) {
  if (typeof data !== 'object' || data === null) return null

  switch (name) {
    case 'chart':
      return <Chart data={data as ChartData} />
    case 'check':
      return <Check data={data as CheckData} />
    case 'compare':
      return <Compare data={data as CompareData} />
    case 'steps':
      return <Steps data={data as StepsData} />
    default:
      return null
  }
}
