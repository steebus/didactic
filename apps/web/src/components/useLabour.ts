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
export const LABOURS = [
  'Turning the ground…',
  'Sifting the seed…',
  'Reading the packet…',
  'Consulting the almanac…',
  'Squinting at the light…',
  'Measuring the drills…',
  'Arguing with the compost…',
  'Spacing the rows…',
  'Naming the seedlings…',
  'Filing the labels…',
  'Watering in…',
  'Standing back…',
  // The last one holds until the bed comes back, so it has to be a
  // phrase that can be true for a while.
  'Almost done…',
]

/**
 * Drawing the connections is one model call over the whole bed rather
 * than the sowing's several, so the list is shorter -- it holds on the
 * last phrase sooner, which is honest about there being one thing
 * happening rather than twelve.
 */
export const DRAWINGS = [
  'Walking the bed…',
  'Looking for what leads to what…',
  'Following the paths…',
  'Tying in the runners…',
  'Ruling the lines…',
  'Standing back…',
  'Almost done…',
]

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

  return phrases[Math.min(step, phrases.length - 1)]
}
