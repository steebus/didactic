/**
 * Which plate a new subject is printed in.
 *
 * A subject's plate is its identity on the bed and the stock list, so two
 * subjects sharing one is two identities read as one. Every path that
 * made a subject used to take `plates[count % 6]` -- which collides as
 * soon as a subject is thrown away, because the count goes down while the
 * colours in use do not, and two of the paths held the six plates in
 * different orders besides. So three subjects could come out one mustard.
 *
 * The plate is now the least used one, earliest in the palette's order
 * on a tie. Six subjects get six plates; a seventh doubles up on the
 * first, and so on round, evenly.
 *
 * The palette is passed in rather than imported: it is `@didactic/tokens`
 * data, and this package does not depend on that one.
 */
export function nextPlate(taken: readonly string[], palette: readonly string[]): string {
  if (palette.length === 0) throw new Error('nextPlate: an empty palette has no plate to give')
  const uses = new Map(palette.map(p => [p.toLowerCase(), 0]))
  for (const colour of taken) {
    const key = colour.toLowerCase()
    if (uses.has(key)) uses.set(key, uses.get(key)! + 1)
  }
  let best = palette[0]
  for (const p of palette) {
    if (uses.get(p.toLowerCase())! < uses.get(best.toLowerCase())!) best = p
  }
  return best
}

/**
 * The same rule over subjects that already exist, oldest first, moving as
 * few as it can.
 *
 * A map already as even as its count allows is left alone. Otherwise the
 * oldest subject printed in each plate keeps it, so a subject that
 * already has a plate of its own is never touched. Every later subject
 * sharing a plate keeps it too unless that plate is used more than the
 * least used one, in which case it takes the least used -- earliest in
 * the palette's order on a tie. Colours outside the palette are left
 * alone. Answers the plate each subject should have, in the order given.
 *
 * It is the reading `055` applies in SQL, and it settles: applied to its
 * own answer it changes nothing, which is what makes the migration safe
 * to run twice.
 */
export function balancePlates(colours: readonly string[], palette: readonly string[]): string[] {
  const inPalette = new Set(palette.map(p => p.toLowerCase()))

  // Already as even as the count allows -- no plate used twice more than
  // another -- is left exactly as it is. Every placement below goes to a
  // least used plate, so the walk always ends this even, and this is
  // what makes a second pass a pass that does nothing.
  const tally = new Map(palette.map(p => [p.toLowerCase(), 0]))
  for (const colour of colours) {
    const key = colour.toLowerCase()
    if (tally.has(key)) tally.set(key, tally.get(key)! + 1)
  }
  if (Math.max(...tally.values()) - Math.min(...tally.values()) <= 1) return [...colours]

  const uses = new Map(palette.map(p => [p.toLowerCase(), 0]))
  const holder = new Map<string, number>()
  colours.forEach((colour, i) => {
    const key = colour.toLowerCase()
    if (inPalette.has(key) && !holder.has(key)) {
      holder.set(key, i)
      uses.set(key, 1)
    }
  })

  const least = () => palette.reduce((best, p) =>
    uses.get(p.toLowerCase())! < uses.get(best.toLowerCase())! ? p : best, palette[0])

  return colours.map((colour, i) => {
    const key = colour.toLowerCase()
    if (!inPalette.has(key) || holder.get(key) === i) return colour
    const lowest = least()
    const chosen = uses.get(key)! > uses.get(lowest.toLowerCase())! ? lowest : colour
    uses.set(chosen.toLowerCase(), uses.get(chosen.toLowerCase())! + 1)
    return chosen
  })
}
