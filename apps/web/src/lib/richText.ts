/**
 * Rich text, kept as markdown.
 *
 * The note field is a box you can bold things in, but what is stored is
 * markdown rather than the HTML the box produces. Three reasons, in
 * order of how much they matter:
 *
 *  - The search column indexes the note verbatim. A note kept as HTML
 *    fills that index with its own tags, and searching for "em" starts
 *    matching every note anyone emphasised a word in.
 *  - A note then goes through the same pipeline a lesson body does, so
 *    it reads the same everywhere it is printed and is sanitised by the
 *    same allowlist.
 *  - Notes written before any of this existed are plain text, which is
 *    already valid markdown. Nothing has to be migrated.
 *
 * So the editor converts on the way in and on the way out, and this is
 * where that conversion lives.
 */

import { renderMarkdown, NOTE_TAGS } from './markdown'

/** Markdown into the HTML the editor is filled with. */
export function markdownToEditorHtml(markdown: string): string {
  return markdown.trim() ? renderMarkdown(markdown, NOTE_TAGS) : ''
}

/**
 * What the editor holds, back into markdown.
 *
 * Walks the box rather than parsing a string: the DOM is what the
 * browser actually built out of the reader's typing, and browsers
 * disagree about the markup they produce for the same keystrokes.
 */
export function editorHtmlToMarkdown(root: Node): string {
  const lines: string[] = []
  block(root, lines, 0)
  return lines
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Tags that end the line they are on rather than sitting in it. */
const BLOCKS = new Set(['p', 'div', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const LISTS = new Set(['ul', 'ol'])

/** How many `#` a heading is worth, by tag. */
const HEADINGS: Record<string, string> = {
  h1: '#', h2: '##', h3: '###', h4: '####', h5: '#####', h6: '######',
}

const tagOf = (node: Node) =>
  node.nodeType === 1 ? (node as Element).tagName.toLowerCase() : ''

/**
 * Walk what is laid out as blocks, gathering what is not.
 *
 * The two things browsers do that a naive walk gets wrong, both of
 * which a contenteditable box does within a couple of keystrokes:
 * bolding a word leaves `<b>word</b>` sitting beside a bare text node,
 * which is one paragraph and not two; and starting a list can nest the
 * `<ul>` inside the `<p>` the cursor was in, which is a list and not a
 * paragraph that happens to contain one.
 */
function block(node: Node, lines: string[], depth: number): void {
  let run: Node[] = []
  const flush = () => {
    if (!run.length) return
    paragraph(run.map(inline).join(''), lines)
    run = []
  }

  for (const child of Array.from(node.childNodes)) {
    const tag = tagOf(child)

    if (LISTS.has(tag)) {
      flush()
      list(child as Element, lines, depth)
      continue
    }

    // A specimen is taken as it stands. Everything else here walks the
    // markup looking for meaning; inside a fence the markup *is* the
    // meaning -- an asterisk is an asterisk and a newline is where the
    // line ends -- so `inline()` must not touch it.
    if (tag === 'pre') {
      flush()
      fence(child as Element, lines)
      continue
    }

    if (BLOCKS.has(tag)) {
      flush()
      // A block carrying blocks of its own is walked rather than
      // flattened -- see the note above about lists inside paragraphs.
      if (
        Array.from(child.childNodes).some(
          n => BLOCKS.has(tagOf(n)) || LISTS.has(tagOf(n)) || tagOf(n) === 'pre'
        )
      ) {
        // A quote holds paragraphs rather than text -- which is what
        // the renderer builds, and what the box holds the moment a
        // second line is typed into one. The mark belongs to every
        // line inside it, so it is carried down rather than lost here.
        if (tag === 'blockquote') {
          const inner: string[] = []
          block(child, inner, depth)
          for (const line of inner) lines.push(line.trim() ? `> ${line}` : '>')
          // The trailing `>` a blank line inside the quote leaves is
          // not part of it.
          while (lines.length && lines[lines.length - 1] === '>') lines.pop()
          lines.push('')
          continue
        }
        block(child, lines, depth)
      } else {
        // A heading and a quote are a paragraph with a mark in front of
        // every line of them. The mark is passed down rather than added
        // here because a block can hold a break, and half a heading is
        // not a heading.
        paragraph(inline(child), lines, HEADINGS[tag] ?? (tag === 'blockquote' ? '>' : ''))
      }
      continue
    }

    run.push(child)
  }

  flush()
}

/** A list, and the lists inside it. */
function list(element: Element, lines: string[], depth: number): void {
  const ordered = element.tagName.toLowerCase() === 'ol'
  let n = 0

  for (const item of Array.from(element.childNodes)) {
    if (tagOf(item) !== 'li') continue
    n++

    // What the item says, and the lists hanging off it, which are
    // written under it rather than flattened into its line.
    const own: Node[] = []
    const nested: Element[] = []
    for (const part of Array.from(item.childNodes)) {
      if (LISTS.has(tagOf(part))) nested.push(part as Element)
      else own.push(part)
    }

    const text = own.map(inline).join('').replace(/\s+/g, ' ').trim()
    if (text) lines.push(`${'  '.repeat(depth)}${ordered ? `${n}. ` : '- '}${text}`)
    for (const child of nested) list(child, lines, depth + 1)
  }

  // The blank line ends the whole list, so a list nested inside one
  // does not part its parent's items.
  if (depth === 0) lines.push('')
}

/**
 * Add a rendered run of text as a paragraph, blank line and all.
 *
 * `mark` is what goes in front of each line -- `##` for a heading, `>`
 * for a quote, nothing for prose. A marked line is not guarded: the
 * mark is the markup, and escaping it would print the hash rather than
 * set the heading.
 */
function paragraph(text: string, lines: string[], mark = ''): void {
  // A break inside a block parts paragraphs. Markdown's own hard break
  // is two trailing spaces, which no editor preserves and no reader can
  // see; a note is better served by the simpler reading.
  for (const part of text.split('\n')) {
    const line = part.trim()
    if (!line) continue
    lines.push(mark ? `${mark} ${line}` : guard(line), '')
  }
}

/**
 * A fenced specimen, taken as it stands.
 *
 * `textContent` rather than a walk of the children: a contenteditable
 * box puts `<div>`s and `<br>`s inside a `<pre>` as the cursor moves
 * through it, and none of that is part of the code. The text is what
 * was typed.
 *
 * The fence is grown past any run of backticks in the code, so a
 * specimen that is itself about markdown does not end the block it is
 * sitting in.
 */
function fence(element: Element, lines: string[]): void {
  const code = (element.textContent ?? '').replace(/ /g, ' ').replace(/\s+$/, '')
  if (!code.trim()) return

  const longest = Math.max(0, ...Array.from(code.matchAll(/`+/g), m => m[0].length))
  const rail = '`'.repeat(Math.max(3, longest + 1))

  // The language, when the box was given one. `language-x` is what
  // every markdown renderer writes and what ours reads back.
  const tongue = element.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1] ?? ''

  lines.push(`${rail}${tongue}`, ...code.split('\n'), rail, '')
}

function inline(node: Node): string {
  if (node.nodeType === 3) return escape((node as Text).data)
  if (node.nodeType !== 1) return ''

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (tag === 'br') return '\n'

  const inner = Array.from(el.childNodes).map(inline).join('')

  switch (tag) {
    case 'strong':
    case 'b':
      return wrap(inner, '**')
    case 'em':
    case 'i':
      return wrap(inner, '*')
    case 'del':
    case 's':
    case 'strike':
      return wrap(inner, '~~')
    case 'code':
      // Backticks do not nest, so what is inside is taken as written.
      return inner.trim() ? `\`${unescape(inner)}\`` : inner
    case 'a': {
      const href = el.getAttribute('href')
      return href && inner.trim() ? `[${inner}](${href})` : inner
    }
    default:
      return inner
  }
}

/**
 * Emphasis around what was emphasised, and not around the space beside
 * it: `** bold **` is not bold in any parser, so the padding is moved
 * out of the marks.
 */
function wrap(inner: string, mark: string): string {
  const [, before, middle, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? []
  return middle ? `${before}${mark}${middle}${mark}${after}` : inner
}

/** Characters that would otherwise be read as markup on the way back. */
function escape(text: string): string {
  // A non-breaking space is what a contenteditable box leaves behind
  // when a line ends in a space. It is not what the reader typed.
  return text.replace(/ /g, ' ').replace(/([\\`*_[\]<])/g, '\\$1')
}

function unescape(text: string): string {
  return text.replace(/\\([\\`*_[\]<])/g, '$1')
}

/**
 * Stop a line from becoming a heading, a list or a rule because of the
 * character it happens to start with.
 */
function guard(line: string): string {
  return line.replace(/^(\s*)([#>+|-]|\d+[.)])(\s)/, '$1\\$2$3')
}
