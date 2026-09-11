'use client'

import { useEffect, useState } from 'react'

/**
 * Sowing takes the better part of a minute -- an LLM call, an
 * embedding per topic and a similarity search per topic -- and a
 * button that only says it is busy for that long reads as a button
 * that has died. So it reports the work in the same voice as the rest
 * of the sheet.
 *
 * None of this corresponds to a real step. It is a gardener's rumour
 * of one, and it is deliberately not a progress bar: a bar that cannot
 * know the total lies about how much is left, and this cannot know.
 *
 * The list runs once and holds on the last phrase rather than cycling.
 * Twelve labels at 2.6s wrap in 31 seconds, so on a sowing that takes
 * the better part of a minute the reader watched "Turning the ground"
 * come round a second time and read it as stuck. A label that stops
 * advancing says nearly there; a label that starts again says broken.
 * ponytail: a plain sequence, no easing, no percentage. If the real
 * stages ever become legible, report those instead.
 */
// The phrases live in `@didactic/core/copy`: the phone waits on the same
// sowing and says the same things. What is here is the timing, which is
// a React hook and cannot travel.
import { LABOURS, labourPhrase } from '@didactic/core/copy'

export { LABOURS, DRAWINGS } from '@didactic/core/copy'

/**
 * The phrase to print on a button while a bed is being laid out.
 *
 * Two sheets lay out beds now -- the sowing sheet and the offer to try
 * again on a bed that came back empty -- and a wait that reads as a
 * dead button on one of them is a wait that reads as a dead button on
 * both.
 */
export function useLabour(busy: boolean, phrases: string[] = LABOURS): string {
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(busy)

  // Back to the first phrase whenever a new run starts. Adjusted
  // during the render that notices the change rather than in an
  // effect: an effect that sets state cascades a second render, which
  // is both slower and what the lint rule is there to prevent.
  if (running !== busy) {
    setRunning(busy)
    setStep(0)
  }

  useEffect(() => {
    if (!busy) return
    const tick = setInterval(() => setStep(n => n + 1), 2600)
    return () => clearInterval(tick)
  }, [busy])

  return labourPhrase(step, phrases)
}
