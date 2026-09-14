'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { editorHtmlToMarkdown, markdownToEditorHtml } from '@/lib/richText'
import { useMentions } from './useMentions'
import styles from './NoteEditor.module.css'

/** The formatting a note is allowed to carry, and what draws it. */
const COMMANDS = [
  { command: 'bold', label: 'Bold', hint: 'Bold (⌘B)', glyph: <strong>B</strong> },
  { command: 'italic', label: 'Italic', hint: 'Italic (⌘I)', glyph: <em>I</em> },
  { command: 'insertUnorderedList', label: 'Bulleted list', hint: 'Bulleted list', glyph: <ListGlyph /> },
  { command: 'insertOrderedList', label: 'Numbered list', hint: 'Numbered list', glyph: <ListGlyph numbered /> },
] as const

/**
 * The blocks a line can be turned into.
 *
 * `formatBlock` rather than a command of its own: it is the same
 * deprecated-and-universal `execCommand` the four above use, and it
 * takes the tag as its argument, so three headings and a quote are one
 * mechanism rather than four.
 *
 * Two heading levels and not six. A diary entry is a page about a week
 * -- it wants sections and the odd sub-section, and a sixth level in a
 * box this size is a control nobody presses. The serialiser reads all
 * six, so an entry that arrives with deeper headings keeps them.
 */
const BLOCKS = [
  { tag: 'h2', label: 'Heading', hint: 'Heading', glyph: 'H1' },
  { tag: 'h3', label: 'Sub-heading', hint: 'Sub-heading', glyph: 'H2' },
  { tag: 'blockquote', label: 'Quote', hint: 'Quote', glyph: '❝' },
] as const

/**
 * Writing a note, with the formatting a note actually wants.
 *
 * A box you can bold things in, storing markdown -- see
 * src/lib/richText.ts for why what is typed and what is kept are not
 * the same thing.
 *
 * It is a contenteditable driven by execCommand, which is deprecated
 * and has been for years, and which every browser still implements
 * because the alternative is writing a text editor. For four commands
 * over a paragraph or two it is the right amount of machinery; if it
 * ever goes, this component is the only thing that has to change.
 *
 * `@` names a topic or a lesson. What is chosen is written in as a
 * link to that thing's own address, which is all a tag is -- see
 * `@didactic/core/mentions`.
 */
export function NoteEditor({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  fill,
  tall,
  className,
}: {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  label: string
  autoFocus?: boolean
  /** Take the height on offer rather than sizing to the writing: the
   *  editor is a page of its own rather than a field in a panel. */
  fill?: boolean
  /** Half again the usual height. A note is a remark about a sentence;
   *  an entry is a page about a week, and the size of the field is the
   *  clearest thing a sheet says about how much is wanted. */
  tall?: boolean
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  /** The markdown this box last reported. A value coming back in that
   *  matches it is this box's own writing, and rewriting the HTML for
   *  it would drop the cursor to the top on every keystroke. */
  const mine = useRef<string | null>(null)
  const [active, setActive] = useState<Record<string, boolean>>({})
  /** The block the cursor is standing in: `h2`, `blockquote`, `pre`. */
  const [here, setHere] = useState('')

  /**
   * Which block the cursor is in, read off the DOM.
   *
   * `queryCommandValue('formatBlock')` is the obvious way and the
   * browsers disagree about it -- some answer with the tag, some with
   * nothing inside a list, and none of them mention `<pre>` reliably.
   * Walking up to the box is the same few lines and says the same thing
   * everywhere.
   */
  function blockHere(): string {
    const el = box.current
    const selection = document.getSelection()
    if (!el || !selection?.anchorNode) return ''

    let node: Node | null = selection.anchorNode
    while (node && node !== el) {
      if (node.nodeType === 1) {
        const tag = (node as Element).tagName.toLowerCase()
        if (tag === 'pre' || tag === 'blockquote' || /^h[1-6]$/.test(tag)) return tag
      }
      node = node.parentNode
    }
    return ''
  }

  const report = useCallback(() => {
    const el = box.current
    if (!el) return
    const markdown = editorHtmlToMarkdown(el)
    mine.current = markdown
    onChange(markdown)
  }, [onChange])

  const mentions = useMentions(box, report)

  // Filled from the outside: on opening, and when the note is replaced
  // by something other than typing in it.
  useEffect(() => {
    const el = box.current
    if (!el || value === mine.current) return
    el.innerHTML = markdownToEditorHtml(value)
    mine.current = value
  }, [value])

  useEffect(() => {
    // Enter should part paragraphs rather than leave bare <div>s, which
    // is a document-wide setting rather than a property of the box.
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p')
    } catch {
      // Not every browser admits to the command; the serialiser reads
      // divs and paragraphs alike, so nothing depends on it.
    }
    if (autoFocus) box.current?.focus()
  }, [autoFocus])

  // Which marks the cursor is standing in, so the controls show the
  // state of the text rather than the state of the last press.
  useEffect(() => {
    const sync = () => {
      const el = box.current
      const selection = document.getSelection()
      if (!el || !selection?.anchorNode || !el.contains(selection.anchorNode)) return
      const state: Record<string, boolean> = {}
      for (const { command } of COMMANDS) {
        try {
          state[command] = document.queryCommandState(command)
        } catch {
          state[command] = false
        }
      }
      setActive(state)
      setHere(blockHere())
    }
    document.addEventListener('selectionchange', sync)
    return () => document.removeEventListener('selectionchange', sync)
  }, [])

  function run(command: string) {
    box.current?.focus()
    try {
      document.execCommand(command)
    } catch {
      return
    }
    report()
  }

  /**
   * Turn the line the cursor is in into a block, or back into prose.
   *
   * Pressing the control a line is already in takes it off, which is
   * what the pressed state promises: a toolbar that only ever adds
   * leaves no way back to a paragraph except undo.
   */
  function setBlock(tag: string) {
    box.current?.focus()
    try {
      document.execCommand('formatBlock', false, blockHere() === tag ? 'p' : tag)
    } catch {
      return
    }
    report()
  }

  /**
   * A fenced specimen around what is selected, or an empty one to type
   * into.
   *
   * Built by hand because `execCommand` has no fence: `formatBlock`
   * with `pre` gives a `<pre>` with no `<code>` inside it, which is not
   * what a markdown renderer reads and not what the serialiser writes.
   * So the pair is made here, and the cursor is put inside it.
   */
  function codeBlock() {
    const el = box.current
    if (!el) return
    el.focus()

    const selection = document.getSelection()
    if (!selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return

    const pre = document.createElement('pre')
    const code = document.createElement('code')
    // The selected text, taken as text: what is being fenced is code,
    // so whatever markup it was wearing is not part of it.
    code.textContent = range.toString() || '\n'
    pre.append(code)

    range.deleteContents()
    range.insertNode(pre)

    // Inside the specimen, at the end of what was just put there.
    const inside = document.createRange()
    inside.selectNodeContents(code)
    inside.collapse(false)
    selection.removeAllRanges()
    selection.addRange(inside)

    report()
  }

  const empty = !value.trim()

  return (
    <div
      className={[styles.editor, fill ? styles.filling : '', tall ? styles.tall : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.controls} role="toolbar" aria-label="Formatting">
        {COMMANDS.map(({ command, label: name, hint, glyph }) => (
          <button
            key={command}
            type="button"
            className={`${styles.control} ${active[command] ? styles.on : ''}`}
            aria-label={name}
            aria-pressed={Boolean(active[command])}
            title={hint}
            // The press must not take the selection out of the box, or
            // there is nothing left for the command to act on.
            onMouseDown={e => e.preventDefault()}
            onClick={() => run(command)}
          >
            {glyph}
          </button>
        ))}

        {/* What a line is, set apart from what a word is. */}
        <span className={styles.divide} aria-hidden="true" />

        {BLOCKS.map(({ tag, label: name, hint, glyph }) => (
          <button
            key={tag}
            type="button"
            className={`${styles.control} ${here === tag ? styles.on : ''}`}
            aria-label={name}
            aria-pressed={here === tag}
            title={hint}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setBlock(tag)}
          >
            {glyph}
          </button>
        ))}

        <button
          type="button"
          className={`${styles.control} ${here === 'pre' ? styles.on : ''}`}
          aria-label="Code block"
          aria-pressed={here === 'pre'}
          title="Code block"
          onMouseDown={e => e.preventDefault()}
          onClick={codeBlock}
        >
          <CodeGlyph />
        </button>
      </div>

      <div
        ref={box}
        className={styles.box}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-placeholder={placeholder}
        data-empty={empty || undefined}
        // While a name is being typed the menu owns the arrows and the
        // return key, and nothing else.
        onKeyDown={e => mentions.onKeyDown(e)}
        onInput={() => {
          report()
          mentions.read()
        }}
        // Pasted markup is not what was written: a paste out of another
        // page carries its styling, its links and whatever else was in
        // the clipboard. The words are taken and the rest is left.
        onPaste={e => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          if (text) document.execCommand('insertText', false, text)
        }}
        onBlur={report}
      />

      {mentions.at && (
        // Printed where the `@` is rather than where the cursor has
        // got to, so it does not walk sideways as the name is typed.
        <div
          className={styles.mentions}
          style={{ left: mentions.at.left, top: mentions.at.top }}
        >
          {/* What is being filtered against.

              The name is typed into the prose, where the menu covers it
              -- so the reader was filtering a list against something
              they could not see, and could not tell a typo from a topic
              they simply do not have. It is printed back here, under
              the `@` it was typed after. */}
          <p className={styles.typing}>
            <span className={styles.typedAt}>@</span>
            {mentions.at.query ? (
              <span className={styles.typedName}>{mentions.at.query}</span>
            ) : (
              <span className={styles.typedHint}>Type a topic or lesson name</span>
            )}
          </p>

          <ul className={styles.mentionList} role="listbox" aria-label="Topics and lessons">
          {mentions.suggestions.map((suggestion, i) => (
            <li key={`${suggestion.kind}:${suggestion.id}`}>
              <button
                type="button"
                className={`${styles.mention} ${i === mentions.active ? styles.chosen : ''}`}
                role="option"
                aria-selected={i === mentions.active}
                // The press must not take the cursor out of the box,
                // or there is nothing left to write the name into.
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => mentions.setActive(i)}
                onClick={() => mentions.choose(suggestion)}
              >
                <span className={styles.mentionTitle}>{suggestion.title}</span>
                <span className={styles.mentionKind}>
                  {suggestion.kind === 'topic' ? 'Topic' : 'Lesson'}
                </span>
              </button>
            </li>
          ))}
          </ul>

          {/* A name that matches nothing says so, rather than leaving a
              menu that has silently become an empty box. */}
          {mentions.suggestions.length === 0 && (
            <p className={styles.nothing}>Nothing by that name yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Two angle brackets, which is what code looks like from a distance. */
function CodeGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M5.5 3.5 1.5 8l4 4.5M10.5 3.5 14.5 8l-4 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Three lines against three marks: bullets, or numbers. */
function ListGlyph({ numbered }: { numbered?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      {[2.5, 7.5, 12.5].map((y, i) => (
        <g key={y}>
          {numbered ? (
            <text x="0" y={y + 2.5} fontSize="5.5" fill="currentColor">
              {i + 1}
            </text>
          ) : (
            <circle cx="1.75" cy={y} r="1.5" fill="currentColor" />
          )}
          <rect x="5.5" y={y - 0.75} width="10.5" height="1.5" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}
