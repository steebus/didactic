'use client'

import { useId, useState } from 'react'
import styles from './blocks.module.css'

interface Series {
  name: string
  values: number[]
}

export interface ChartData {
  kind?: 'line' | 'bar'
  title?: string
  x?: { label?: string; values?: (number | string)[] }
  y?: { label?: string }
  series?: Series[]
  caption?: string
}

const INKS = ['var(--plate-green)', 'var(--plate-terracotta)', '#c8871a', '#2a4a7c']

const W = 640
const H = 300
const PAD = { top: 16, right: 16, bottom: 40, left: 56 }

/** Round a maximum up to something a person would label an axis with. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

function format(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

/**
 * A plot, drawn as SVG from numbers the lesson supplied.
 *
 * ponytail: no charting library. Two shapes over a handful of points
 * each is less code than the dependency's own configuration would be,
 * and it inherits the sheet's inks and type rather than being themed
 * back into them. If a lesson ever needs real scales, dates, or
 * interaction beyond reading a value off, that is the point to reach
 * for a library rather than to grow this.
 */
export function Chart({ data }: { data: ChartData }) {
  const titleId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const series = (data.series ?? []).filter(s => Array.isArray(s.values) && s.values.length > 0)
  if (series.length === 0) return null

  const xs = data.x?.values ?? series[0].values.map((_, i) => i)
  const count = Math.min(xs.length, ...series.map(s => s.values.length))
  if (count === 0) return null

  const max = niceMax(Math.max(...series.flatMap(s => s.values.slice(0, count))))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const xAt = (i: number) => PAD.left + (count === 1 ? plotW / 2 : (i / (count - 1)) * plotW)
  const yAt = (v: number) => PAD.top + plotH - (v / max) * plotH

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f))
  // Label every nth point, for the largest n that still leaves about
  // eight labels along the axis. Dropping every other one was enough
  // while a chart meant a handful of figures typed into a lesson; a
  // model computes its own points -- two dozen and more -- and every
  // other one of those is still a solid line of overlapping type.
  const every = Math.max(1, Math.ceil(count / 8))
  const bar = data.kind === 'bar'
  const slotW = plotW / Math.max(1, count - 1)

  return (
    <figure className={styles.figure}>
      {data.title && (
        <figcaption className={styles.figureTitle} id={titleId}>
          {data.title}
        </figcaption>
      )}

      <div className={styles.plotWrap}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={styles.plot}
          role="img"
          aria-labelledby={data.title ? titleId : undefined}
          aria-label={data.title ? undefined : 'Chart'}
        >
          {ticks.map(t => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yAt(t)}
                y2={yAt(t)}
                className={styles.rule}
              />
              <text x={PAD.left - 8} y={yAt(t) + 4} className={styles.tick} textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}

          {bar
            ? series.map((s, si) =>
                s.values.slice(0, count).map((v, i) => {
                  const groupW = plotW / count
                  const barW = Math.max(2, (groupW * 0.7) / series.length)
                  const x = PAD.left + i * groupW + groupW * 0.15 + si * barW
                  return (
                    <rect
                      key={`${si}-${i}`}
                      x={x}
                      y={yAt(v)}
                      width={barW}
                      height={PAD.top + plotH - yAt(v)}
                      fill={INKS[si % INKS.length]}
                    />
                  )
                })
              )
            : series.map((s, si) => (
                <polyline
                  key={si}
                  points={s.values
                    .slice(0, count)
                    .map((v, i) => `${xAt(i)},${yAt(v)}`)
                    .join(' ')}
                  fill="none"
                  stroke={INKS[si % INKS.length]}
                  strokeWidth={2}
                />
              ))}

          {hover !== null && !bar && (
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className={styles.crosshair}
            />
          )}
          {hover !== null &&
            !bar &&
            series.map((s, si) => (
              <circle
                key={si}
                cx={xAt(hover)}
                cy={yAt(s.values[hover])}
                r={4}
                fill={INKS[si % INKS.length]}
              />
            ))}

          {/* One hit area per x position: hovering reads the values at
              that point rather than hunting for a two pixel line. The
              title element is what a touch device and a screen reader
              get instead of the hover. */}
          {xs.slice(0, count).map((label, i) => (
            <rect
              key={i}
              x={bar ? PAD.left + i * (plotW / count) : PAD.left + (i - 0.5) * slotW}
              y={PAD.top}
              width={bar ? plotW / count : slotW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {`${label}: ${series.map(s => `${s.name} ${format(s.values[i])}`).join(', ')}`}
              </title>
            </rect>
          ))}

          {xs.slice(0, count).map((label, i) =>
            i % every !== 0 && i !== count - 1 ? null : (
              <text
                key={i}
                x={bar ? PAD.left + (i + 0.5) * (plotW / count) : xAt(i)}
                y={H - PAD.bottom + 18}
                className={styles.tick}
                textAnchor="middle"
              >
                {String(label)}
              </text>
            )
          )}

          {data.x?.label && (
            <text x={PAD.left + plotW / 2} y={H - 4} className={styles.axis} textAnchor="middle">
              {data.x.label}
            </text>
          )}
          {data.y?.label && (
            <text
              transform={`rotate(-90) translate(${-(PAD.top + plotH / 2)} 14)`}
              className={styles.axis}
              textAnchor="middle"
            >
              {data.y.label}
            </text>
          )}
        </svg>
      </div>

      {series.length > 1 && (
        <ul className={styles.legend}>
          {series.map((s, si) => (
            <li key={si} className={styles.legendItem}>
              <span
                className={styles.swatch}
                style={{ background: INKS[si % INKS.length] }}
                aria-hidden="true"
              />
              {s.name}
              {hover !== null && (
                <span className={styles.legendValue}>{format(s.values[hover])}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The numbers themselves, for a screen reader and for anyone who
          would rather read them than a picture of them. */}
      <details className={styles.dataTable}>
        <summary className={styles.dataSummary}>The figures</summary>
        <table>
          <thead>
            <tr>
              <th>{data.x?.label ?? ''}</th>
              {series.map((s, i) => (
                <th key={i}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {xs.slice(0, count).map((label, i) => (
              <tr key={i}>
                <th scope="row">{String(label)}</th>
                {series.map((s, si) => (
                  <td key={si}>{format(s.values[i])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {data.caption && <p className={styles.caption}>{data.caption}</p>}
    </figure>
  )
}
