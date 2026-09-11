'use client'

import styles from './blocks.module.css'

export interface CompareData {
  title?: string
  columns?: string[]
  rows?: Array<{ label?: string; values?: string[] }>
}

/**
 * Two or three things that get confused with each other, set against
 * the same rows so the difference is the thing you read rather than
 * something you assemble from two paragraphs.
 *
 * A table rather than a picture, because that is what it is -- and it
 * stays readable when the sheet is narrow, which prose set in columns
 * does not.
 */
export function Compare({ data }: { data: CompareData }) {
  const columns = data.columns ?? []
  const rows = data.rows ?? []
  if (columns.length < 2 || rows.length === 0) return null

  return (
    <figure className={styles.figure}>
      {data.title && <figcaption className={styles.figureTitle}>{data.title}</figcaption>}
      <div className={styles.compareWrap}>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th />
              {columns.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <th scope="row">{row.label}</th>
                {columns.map((_, ci) => (
                  <td key={ci}>{row.values?.[ci] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
