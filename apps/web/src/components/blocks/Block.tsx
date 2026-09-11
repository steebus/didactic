'use client'

import { Chart, type ChartData } from './Chart'
import { Model, type ModelData } from './Model'
import { Check, type CheckData } from './Check'
import { Blank, type BlankData } from './Blank'
import { Sort, type SortData } from './Sort'
import { Compare, type CompareData } from './Compare'
import { Steps, type StepsData } from './Steps'
import { Flow, type FlowData } from './Flow'
import { Picture, type PictureData } from './Picture'

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
    case 'model':
      return <Model data={data as ModelData} />
    case 'check':
      return <Check data={data as CheckData} />
    case 'blank':
      return <Blank data={data as BlankData} />
    case 'sort':
      return <Sort data={data as SortData} />
    case 'compare':
      return <Compare data={data as CompareData} />
    case 'steps':
      return <Steps data={data as StepsData} />
    case 'flow':
      return <Flow data={data as FlowData} />
    case 'picture':
      return <Picture data={data as PictureData} />
    default:
      return null
  }
}
