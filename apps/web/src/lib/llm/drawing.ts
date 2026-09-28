/**
 * One picture drawn for a lesson, by OpenAI's image model.
 *
 * The lesson writer describes what the plate should show; this wraps
 * that in the catalogue's hand -- a natural-history plate, inked and
 * lightly washed, in the palette the sheets are printed in -- and asks
 * for it. What comes back is the image's bytes, which the caller keeps
 * (`lib/drawings.ts`).
 *
 * Called with fetch rather than the SDK: it is one request, and a
 * dependency for one request is a dependency to keep up to date.
 */

import { colour, plate } from '@didactic/tokens'

const ENDPOINT = 'https://api.openai.com/v1/images/generations'

/** Overridable, so a newer model is a variable on the deploy rather
 *  than a commit. */
const MODEL = () => process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1'

/**
 * Most of the minute a round is allowed. Drawings are asked for
 * together, so this is the wall-clock cost of the round, not a per-
 * picture one; what has not arrived by then is left out of the lesson.
 */
const TIMEOUT = 50_000

/**
 * The house style, as the image model is asked for it.
 *
 * Words the model has seen under a thousand herbarium sheets rather than
 * adjectives of our own, and the palette as the hex values `DESIGN.md`
 * gives -- the model will not match them exactly, but naming them keeps
 * it inside the family. No lettering of any kind: an image model's
 * lettering is where it goes visibly wrong, and a mislabelled plate is
 * worse than an unlabelled one. What wants naming goes in the caption,
 * which is set in type.
 */
export function drawingPrompt(subject: string): string {
  return [
    `A scientific illustration plate: ${subject.trim().replace(/\s+/g, ' ')}.`,
    '',
    'Style: a nineteenth-century natural-history or botanical engraving, as in a naturalist\'s field book or an ' +
      'encyclopaedia plate. Fine pen-and-ink linework drawn by hand, with cross-hatching and stippling for form, ' +
      'lightly tinted with flat, translucent watercolour washes. Diagrammatic and exact rather than painterly: ' +
      'the parts drawn clearly, as a cutaway, cross-section, elevation or exploded view where that shows the ' +
      'thing better than the outside of it does. Abstract ideas are shown as a physical object, specimen or ' +
      'apparatus that embodies them, drawn the same way.',
    '',
    `Palette: an uncoated warm newsprint ground (${colour.paper}), sepia-black ink (${colour.ink}) and a softer brown ` +
      `ink (${colour.inkSoft}) for the linework, and sparing washes of forest green (${plate.green}), terracotta ` +
      `(${plate.terracotta}), mustard (${plate.mustard}), ultramarine (${plate.ultramarine}), plum ` +
      `(${plate.plum}) and olive (${plate.olive}). No other colours, no gradients, no gloss.`,
    '',
    'Composition: the subject centred on the paper with a generous empty margin all round, on a plain ground. ' +
      'Absolutely no text: no letters, words, numbers, labels, captions, leader lines to labels, signatures, ' +
      'watermarks, borders or frames.',
  ].join('\n')
}

/**
 * Draw one plate. Returns the image, or null for anything short of one:
 * no key, a refusal, a timeout, an answer with no picture in it. A
 * lesson that does not get its drawing is a lesson with one fewer
 * figure, not a lesson that failed.
 */
export async function drawPicture(
  subject: string,
  signal: AbortSignal = AbortSignal.timeout(TIMEOUT)
): Promise<{ bytes: Uint8Array; type: string } | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key || !subject.trim()) return null
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        prompt: drawingPrompt(subject),
        n: 1,
        // Landscape, which is the shape of the column a lesson is read in.
        size: '1536x1024',
        quality: 'medium',
        background: 'opaque',
        // A plate is mostly flat paper and linework, which WebP holds in
        // a fraction of a PNG's weight at no visible cost.
        output_format: 'webp',
        output_compression: 85,
      }),
      signal,
    })
    if (!res.ok) {
      console.error('drawing: the image model refused', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const body = (await res.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = body.data?.[0]?.b64_json
    if (!b64) return null
    return { bytes: Uint8Array.from(Buffer.from(b64, 'base64')), type: 'image/webp' }
  } catch (e) {
    console.error('drawing: could not draw', e)
    return null
  }
}
