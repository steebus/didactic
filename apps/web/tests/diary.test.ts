import { describe, it, expect } from 'vitest'
import { depthOf, VERDICTS } from '@/lib/llm/diary'
import { config } from '@didactic/core/config'

describe('what a verdict records', () => {
  it('maps every verdict but one onto a depth the scorer knows', () => {
    for (const verdict of VERDICTS) {
      const depth = depthOf(verdict)
      if (verdict === 'mentioned') {
        // The whole point of having it: a topic named in passing must
        // have a way to record nothing. Without it the model has to
        // pick one of the four, and the cheapest way to get a wrong
        // `read` is to leave no way to say "no claim".
        expect(depth).toBeNull()
      } else {
        expect(depth).not.toBeNull()
        expect(config.DEPTH_WEIGHTS).toHaveProperty(depth as string)
      }
    }
  })

  it('records struggle at no weight, and applied above the ceiling', () => {
    expect(config.DEPTH_WEIGHTS[depthOf('struggled')!]).toBe(0)
    // `applied` is the only depth that can pass 3.5, and the diary is
    // the only thing in the app that writes one.
    expect(config.DEPTH_WEIGHTS[depthOf('applied')!]).toBe(1.0)
  })
})
