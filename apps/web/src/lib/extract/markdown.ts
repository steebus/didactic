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
  return blocks(document.body, { base: baseUrl, depth: 0 }).trim()
}

interface Context {
  base: string
  /** How deep in lists we are, for the indent of a nested one. */
  depth: number
}

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
    const text = inline.replace(/[ \t]+/g, ' ').trim()
    if (text) parts.push(asParagraph(text))
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
      const text = inlineChildren(el, ctx).replace(/[ \t]+/g, ' ').trim()
      if (!text) return ''
      return tag === 'figcaption' ? `*${text}*` : asParagraph(text)
    }
    case 'hr':
      return '---'
    case 'pre': {
      const code = (el.textContent ?? '').replace(/\n+$/, '')
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

  switch (tag) {
    case 'br':
      return '  \n'
    case 'strong':
    case 'b': {
      const text = inner().trim()
      return text ? `**${text}**` : ''
    }
    case 'em':
    case 'i': {
      const text = inner().trim()
      return text ? `*${text}*` : ''
    }
    case 'code': {
      const code = (el.textContent ?? '').replace(/\s+/g, ' ')
      if (!code.trim()) return ''
      const tick = code.includes('`') ? '``' : '`'
      return `${tick}${code}${tick}`
    }
    case 'a': {
      const text = inner().trim()
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

/** An inline run on one line, for a heading or a table cell. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * A run of text set as a paragraph.
 *
 * One that happens to begin like a heading or a list -- "# of users",
 * "- and then", "2. Next" -- is still a paragraph, so the syntax it
 * would otherwise be read as is escaped. `*` and `>` already are.
 */
function asParagraph(text: string): string {
  if (/^#{1,6}(\s|$)/.test(text) || /^[-+](\s|$)/.test(text)) return `\\${text}`
  return text.replace(/^(\d+)\.(\s|$)/, '$1\\.$2')
}
