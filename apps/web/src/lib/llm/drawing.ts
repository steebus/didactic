/**
 * One picture drawn for a lesson, by OpenAI's image model.
 *
 * The lesson writer describes what the plate should show; this wraps
 * that in the catalogue's hand -- a natural-history plate, inked and
 * lightly washed, in the palette the sheets are printed in -- and asks
 * for it. What comes back is the image's bytes, which the caller keeps
 * (`lib/drawings.ts`).
 *
 * Two ways to the model, tried in turn: Vercel's AI Gateway through the
 * `ai` SDK the app already uses for Jev, then OpenAI directly with
 * `OPENAI_API_KEY`, over plain fetch.
 */

import { generateImage } from 'ai'
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

/** A drawing, or why there is none -- said, because "could not be drawn"
 *  with nothing after it was the whole of what the first deploy told
 *  anybody, and a refusal and a timeout want different fixes. */
export type Drawing =
  | { ok: true; bytes: Uint8Array; type: string; via: string }
  | { ok: false; reason: string }

/**
 * The image model through Vercel's AI Gateway, the way ingestion reaches
 * Jev: billed to the Vercel account, authorised by `AI_GATEWAY_API_KEY`
 * or, on Vercel itself, the deployment's OIDC token. It needs no OpenAI
 * organisation of our own, which is what `gpt-image-*` asks a direct
 * caller to have verified before it will draw anything.
 */
const GATEWAY_MODEL = () => process.env.GATEWAY_IMAGE_MODEL?.trim() || 'openai/gpt-image-1.5'

/** Whether the gateway can be asked at all from here. */
export function gatewayReachable(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)
}

/** Whether there is anything to draw with. */
export function canDraw(): boolean {
  return gatewayReachable() || Boolean(process.env.OPENAI_API_KEY)
}

/**
 * Draw one plate: through the gateway first, then OpenAI directly with
 * our own key, and the first that answers with a picture wins. Never
 * throws. A lesson that does not get its drawing is a lesson with one
 * fewer figure, not a lesson that failed -- but it says why.
 */
export async function drawPicture(
  subject: string,
  signal: AbortSignal = AbortSignal.timeout(TIMEOUT)
): Promise<Drawing> {
  if (!subject.trim()) return { ok: false, reason: 'nothing to draw was described' }
  const reasons: string[] = []
  if (gatewayReachable()) {
    const drawn = await throughGateway(subject, signal)
    if (drawn.ok) return drawn
    reasons.push(drawn.reason)
  }
  if (process.env.OPENAI_API_KEY && !signal.aborted) {
    const drawn = await direct(subject, signal)
    if (drawn.ok) return drawn
    reasons.push(drawn.reason)
  }
  const reason = reasons.join('; ') || 'no image model is configured (no gateway, no OPENAI_API_KEY)'
  console.error('drawing:', reason)
  return { ok: false, reason }
}

async function throughGateway(subject: string, signal: AbortSignal): Promise<Drawing> {
  const model = GATEWAY_MODEL()
  try {
    const { image } = await generateImage({
      model,
      prompt: drawingPrompt(subject),
      size: '1536x1024',
      // The same options as the direct call, passed on to OpenAI's
      // models; a model from another maker ignores what it does not know.
      providerOptions: {
        openai: { quality: 'medium', background: 'opaque', output_format: 'webp', output_compression: 85 },
      },
      maxRetries: 0,
      abortSignal: signal,
    })
    return { ok: true, bytes: image.uint8Array, type: image.mediaType || 'image/png', via: `gateway ${model}` }
  } catch (e) {
    return { ok: false, reason: `gateway ${model}: ${message(e)}` }
  }
}

async function direct(subject: string, signal: AbortSignal): Promise<Drawing> {
  const key = process.env.OPENAI_API_KEY!
  const model = MODEL()
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
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
      // OpenAI's error body says what is wrong in a sentence -- an
      // unverified organisation, a model the key cannot use -- so that
      // sentence is the reason, rather than a bare status.
      const text = await res.text()
      let said = text.slice(0, 200)
      try {
        said = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? said
      } catch {}
      return { ok: false, reason: `openai ${model} ${res.status}: ${said}` }
    }
    const body = (await res.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = body.data?.[0]?.b64_json
    if (!b64) return { ok: false, reason: `openai ${model}: answered with no image` }
    return {
      ok: true,
      bytes: Uint8Array.from(Buffer.from(b64, 'base64')),
      type: 'image/webp',
      via: `openai ${model}`,
    }
  } catch (e) {
    return { ok: false, reason: `openai ${model}: ${message(e)}` }
  }
}

function message(e: unknown): string {
  if (e instanceof Error) return e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timed out' : e.message
  return String(e)
}
