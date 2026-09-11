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
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  /** The markdown this box last reported. A value coming back in that
   *  matches it is this box's own writing, and rewriting the HTML for
   *  it would drop the cursor to the top on every keystroke. */
  const mine = useRef<string | null>(null)
  const [active, setActive] = useState<Record<string, boolean>>({})

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

  const empty = !value.trim()

  return (
    <div
      className={[styles.editor, fill ? styles.filling : '', className ?? '']
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
        <ul
          className={styles.mentions}
          style={{ left: mentions.at.left, top: mentions.at.top }}
          role="listbox"
          aria-label="Topics and lessons"
        >
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
      )}
    </div>
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
