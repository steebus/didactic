/**
 * The one browser global pdfjs cannot start without.
 *
 * pdfjs is written for a browser and expects `DOMMatrix`, `ImageData`
 * and `Path2D` to exist. Node provides none of them, so at load it
 * reaches for `@napi-rs/canvas` and takes them from there. Where that
 * package is not present it warns about each one and carries on -- and
 * then, a few thousand lines further down, evaluates
 *
 *     const SCALE_MATRIX = new DOMMatrix()
 *
 * at module scope, and throws `ReferenceError: DOMMatrix is not
 * defined` before anything has had a chance to catch it. That is the
 * whole failure: one module-level constructor call, in code we never
 * reach, in a library we only ever ask for text.
 *
 * On Vercel the native package does not arrive. It is a real dependency
 * of `pdf-parse`, but nothing statically imports it -- pdfjs requires
 * it at runtime inside a `try` -- so file tracing has nothing to follow
 * and the binary is not put in the function. Naming `pdfjs-dist` and
 * friends in `serverExternalPackages` fixed the bundling half of this
 * and could not fix that half: the require stack in the failure reads
 * `/var/task/node_modules/pdfjs-dist/legacy/build/pdf.mjs`, so pdfjs
 * itself was where it should be and its canvas was still missing.
 *
 * So the global is provided here instead, and the native package is not
 * needed at all. This runs before pdfjs is imported -- it is the first
 * import of `extract/pdf.ts`, and ESM evaluates in order -- so by the
 * time that constructor runs there is something to construct.
 *
 * WHAT THIS IS NOT: a working matrix. Every path that would use one is
 * a rendering path, and nothing here renders -- we read text, outlines
 * and destinations. The methods therefore throw rather than returning
 * something plausible, so that the day someone reaches for
 * `getScreenshot` (the page-as-an-image tier that was deliberately left
 * unbuilt) they get a sentence telling them what to do about it, rather
 * than a silently blank image.
 *
 * `ImageData` and `Path2D` are deliberately left undefined. Both are
 * only ever constructed inside rendering functions -- glyph paths,
 * clips, image data -- so nothing needs them to exist for the module to
 * load, and leaving them absent keeps the same honest failure for the
 * same future reader.
 */

/** What to say when a rendering path is reached without a real canvas. */
const NO_CANVAS =
  'This build reads PDFs but cannot render them: DOMMatrix is a stub from ' +
  'lib/extract/pdfGlobals.ts. To render, add @napi-rs/canvas to the ' +
  'function (it must actually be traced into the deploy, not merely ' +
  'installed) and remove the stub.'

/**
 * Enough of a `DOMMatrix` to be constructed and to hold the six affine
 * components, which is all pdfjs does with the one it makes at load.
 */
class StubDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0

  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length >= 6) {
      ;[this.a, this.b, this.c, this.d, this.e, this.f] = init
    }
  }

  // Everything below is a rendering operation. Throwing is the point:
  // a matrix that quietly does nothing produces a blank page and no
  // explanation.
  multiplySelf(): never {
    throw new Error(NO_CANVAS)
  }
  preMultiplySelf(): never {
    throw new Error(NO_CANVAS)
  }
  invertSelf(): never {
    throw new Error(NO_CANVAS)
  }
  translate(): never {
    throw new Error(NO_CANVAS)
  }
  scale(): never {
    throw new Error(NO_CANVAS)
  }
}

const globals = globalThis as { DOMMatrix?: unknown }

// Only where there is nothing already. A runtime that brings its own --
// a browser, or a Node that has grown one, or a deploy that really does
// carry the native canvas -- keeps it, and this does nothing at all.
globals.DOMMatrix ??= StubDOMMatrix

export {}
