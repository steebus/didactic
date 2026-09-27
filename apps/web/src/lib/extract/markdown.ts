import { JSDOM } from 'jsdom'

/**
 * An article's readable HTML, as markdown the lesson reader can print.
 *
 * Readability hands back the article as HTML: the page with its
 * navigation, its adverts and its comment section taken away. The app
 * reads lessons as markdown -- sanitised, with the headings listed as
 * contents and each one given a press for its summary -- so an article
 * is brought into the same shape rather than given a second renderer
 * that would have to learn all of that again.
 *
 * What is kept is what reads: headings, paragraphs, lists, quotes,
 * code, tables, links and pictures, emphasis. What is dropped is
 * anything that was only ever the page's -- scripts, styles, frames,
 * forms. Links and pictures are made absolute against the page they
 * came from, and only `http(s)` survives, so nothing in an article can
 * reach for a `javascript:` URL through the reader.
 *
 * Text is escaped where markdown would otherwise read it as syntax. An
 * article about pricing is full of dollar signs, and the reader typesets
 * `$...$` as mathematics -- left alone, "$5 and $10" would come out as
 * a formula.
 */
export function htmlToMarkdown(html: string, baseUrl: string): string {
  const { document } = new JSDOM(`<body>${html}</body>`, { url: baseUrl }).window
  const ctx: Context = { base: baseUrl, depth: 0, notes: [] }
  const body = blocks(document.body, ctx).trim()
  if (ctx.notes.length === 0) return body
  // A bold line rather than a heading: the reader lists headings as the
  // article's sections, and its notes are not one.
  const notes = ctx.notes.map((note, i) => `${i + 1}. ${note}`).join('\n')
  return `${body}\n\n---\n\n**Notes**\n\n${notes}`
}

/**
 * Bumped whenever the importer changes what it makes of a page, so an
 * article kept by an older one is made again when it is next opened
 * (`resourceBody.ts`). 2: line breaks kept, and pop-up notes numbered.
 */
export const IMPORTER = 2

/**
 * The attribute a pop-up note travels in, from the page as fetched
 * (`./url`) to here, where it becomes a numbered note.
 */
export const NOTE_ATTR = 'data-didactic-note'

interface Context {
  base: string
  /** How deep in lists we are, for the indent of a nested one. */
  depth: number
  /** The article's notes so far, shared by every level, in reading order. */
  notes: string[]
}

/**
 * A `<br>`, while the text around it is still being tidied.
 *
 * Markdown's own hard break is two spaces before the newline, and the
 * tidy that collapses a page's runs of spaces took one of them away --
 * so every line of a poem ran into the next. The line separator
 * survives the tidy, `escapeText` never lets one through from the page,
 * and `paragraphs` settles each into a break that cannot be collapsed.
 */
const BREAK = '\u2028'

/** Superscript digits, for a note's number in the text. */
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

const DROPPED = new Set([
  'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'form', 'input',
  'button', 'select', 'textarea', 'svg', 'canvas', 'template', 'nav', 'aside', 'footer',
])

const BLOCK = new Set([
  'address', 'article', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'ol',
  'p', 'pre', 'section', 'summary', 'table', 'ul',
])

/** The children of a container, as a run of markdown blocks. */
function blocks(parent: Element, ctx: Context): string {
  const parts: string[] = []
  let inline = ''

  const flush = () => {
    const text = paragraphs(inline)
    if (text) parts.push(text)
    inline = ''
  }

  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) {
      inline += escapeText(node.textContent ?? '')
      continue
    }
    if (node.nodeType !== 1) continue
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (DROPPED.has(tag)) continue

    if (BLOCK.has(tag)) {
      flush()
      const made = block(el, tag, ctx)
      if (made.trim()) parts.push(made)
    } else {
      inline += inlineOf(el, ctx)
    }
  }
  flush()

  return parts.join('\n\n')
}

/** One block element. */
function block(el: Element, tag: string, ctx: Context): string {
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = oneLine(inlineChildren(el, ctx))
      return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : ''
    }
    case 'p':
    case 'dt':
    case 'dd':
    case 'summary':
    case 'figcaption': {
      if (tag === 'figcaption') {
        const text = oneLine(inlineChildren(el, ctx))
        return text ? `*${text}*` : ''
      }
      return paragraphs(inlineChildren(el, ctx))
    }
    case 'hr':
      return '---'
    case 'pre': {
      const code = preformatted(el).replace(/\n+$/, '')
      if (!code.trim()) return ''
      const fence = code.includes('```') ? '~~~' : '```'
      // Never a word after the fence: the reader lifts ```chart and its
      // kind out as interactive blocks, and an article's code sample is
      // not one of those.
      return `${fence}\n${code}\n${fence}`
    }
    case 'blockquote': {
      const inner = blocks(el, ctx)
      return inner
        .split('\n')
        .map(line => (line ? `> ${line}` : '>'))
        .join('\n')
    }
    case 'ul':
    case 'ol':
      return list(el, tag === 'ol', ctx)
    case 'li':
      // A list item outside a list: read it as a paragraph.
      return blocks(el, ctx)
    case 'table':
      return table(el, ctx)
    default:
      return blocks(el, ctx)
  }
}

/** A list, with nested lists indented under their item. */
function list(el: Element, ordered: boolean, ctx: Context): string {
  const items = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'li')
  const start = Number(el.getAttribute('start')) || 1

  return items
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : '- '
      const body = blocks(item, { ...ctx, depth: ctx.depth + 1 })
      const pad = ' '.repeat(marker.length)
      const [first, ...rest] = body.split('\n')
      return [
        `${marker}${first ?? ''}`,
        ...rest.map(line => (line ? `${pad}${line}` : '')),
      ].join('\n')
    })
    .join('\n')
}

/** A table, as a pipe table when it is a plain grid, else its rows. */
function table(el: Element, ctx: Context): string {
  const rows = Array.from(el.querySelectorAll('tr'))
    .map(tr =>
      Array.from(tr.children)
        .filter(c => /^(td|th)$/i.test(c.tagName))
        .map(cell => oneLine(inlineChildren(cell, ctx)).replace(/\|/g, '\\|'))
    )
    .filter(cells => cells.length > 0)
  if (rows.length === 0) return ''

  const width = Math.max(...rows.map(r => r.length))
  const padded = rows.map(r => [...r, ...Array(width - r.length).fill('')])
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`

  return [line(padded[0]), line(Array(width).fill('---')), ...padded.slice(1).map(line)].join('\n')
}

/** The inline content of an element, as one run of markdown. */
function inlineChildren(el: Element, ctx: Context): string {
  let text = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) text += escapeText(node.textContent ?? '')
    else if (node.nodeType === 1) {
      const child = node as Element
      const tag = child.tagName.toLowerCase()
      if (DROPPED.has(tag)) continue
      // A block inside an inline run -- a div in a paragraph, which
      // pages do -- is read for its words rather than dropped.
      text += BLOCK.has(tag) ? ` ${oneLine(inlineChildren(child, ctx))} ` : inlineOf(child, ctx)
    }
  }
  return text
}

/** One inline element. */
function inlineOf(el: Element, ctx: Context): string {
  const tag = el.tagName.toLowerCase()
  const inner = () => inlineChildren(el, ctx)
  // Emphasis or a link can hold a line break but not a paragraph break,
  // which would leave its markers stranded on either side.
  const run = () => inner().replace(/\s*\u2028\s*/g, BREAK).trim()

  const note = el.getAttribute(NOTE_ATTR)?.replace(/\s+/g, ' ').trim()
  if (note) {
    const n = ctx.notes.push(asParagraph(escapeText(note)))
    const text = inner()
    const trailing = /\s*$/.exec(text)?.[0] ?? ''
    return `${text.slice(0, text.length - trailing.length)}${superscript(n)}${trailing}`
  }

  switch (tag) {
    case 'br':
      return BREAK
    case 'strong':
    case 'b': {
      const text = run()
      return text ? `**${text}**` : ''
    }
    case 'em':
    case 'i': {
      const text = run()
      return text ? `*${text}*` : ''
    }
    case 'code': {
      const code = (el.textContent ?? '').replace(/\s+/g, ' ')
      if (!code.trim()) return ''
      const tick = code.includes('`') ? '``' : '`'
      return `${tick}${code}${tick}`
    }
    case 'a': {
      const text = run()
      const href = absolute(el.getAttribute('href'), ctx.base)
      if (!text) return ''
      return href ? `[${text}](${href})` : text
    }
    case 'img': {
      const src = absolute(el.getAttribute('src'), ctx.base)
      if (!src) return ''
      const alt = escapeText(el.getAttribute('alt') ?? '').replace(/[\[\]]/g, '')
      return `![${alt}](${src})`
    }
    default:
      return inner()
  }
}

/** A URL made absolute against the page, or null unless it is http(s). */
function absolute(href: string | null, base: string): string | null {
  if (!href) return null
  try {
    const url = new URL(href, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Parentheses would end the markdown link early.
    return url.toString().replace(/\(/g, '%28').replace(/\)/g, '%29')
  } catch {
    return null
  }
}

/**
 * Text, with the characters markdown would read as syntax escaped.
 *
 * Emphasis, code, links and HTML, and the dollar sign, which the
 * reader's mathematics would otherwise take. Line-start syntax -- a
 * heading's `#`, a list's `-` or `1.` -- is caught in `asParagraph`,
 * where the start of a line is known.
 */
function escapeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/([\\`*_[\]<>$|~])/g, '\\$1')
}

/** An inline run on one line, for a heading or a table cell. A line
 *  break is a space here: `\s` takes the line separator too. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * An inline run as prose: one line break kept as a hard break, two or
 * more as a new paragraph, and any at either end let go.
 *
 * The hard break is markdown's backslash before the newline rather than
 * its two spaces, because nothing that tidies whitespace can take it
 * away. Every line is checked as a paragraph's first would be: a line
 * inside a paragraph that begins "# " is a heading all the same.
 */
function paragraphs(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .split(/ ?\u2028(?: ?\u2028)+ ?/)
    .map(paragraph =>
      paragraph
        .split(BREAK)
        .map(line => line.trim())
        .filter(Boolean)
        .map(asParagraph)
        .join('\\\n')
    )
    .filter(Boolean)
    .join('\n\n')
}

/** A preformatted block's text, a `<br>` in it read as the newline it
 *  shows as. */
function preformatted(el: Element): string {
  let text = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) text += node.textContent ?? ''
    else if (node.nodeType === 1) {
      const child = node as Element
      text += child.tagName.toLowerCase() === 'br' ? '\n' : preformatted(child)
    }
  }
  return text
}

function superscript(n: number): string {
  return String(n).replace(/\d/g, d => SUPERSCRIPT[Number(d)])
}

/**
 * A run of text set as a paragraph, or as one line of one.
 *
 * One that happens to begin like a heading or a list -- "# of users",
 * "- and then", "2. Next", "3) and" -- or is only a rule of dashes or
 * equals signs, which under a line makes it a heading, is still prose,
 * so the syntax it would otherwise be read as is escaped. `*` and `>`
 * already are.
 */
function asParagraph(text: string): string {
  if (/^#{1,6}(\s|$)/.test(text) || /^[-+](\s|$)/.test(text) || /^(-+|=+)$/.test(text)) return `\\${text}`
  return text.replace(/^(\d+)([.)])(\s|$)/, '$1\\$2$3')
}
