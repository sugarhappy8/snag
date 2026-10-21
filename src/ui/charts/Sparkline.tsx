// A sparkline: a tiny trend with no axes, for a stock list row, a KPI tile or a company card. One path and one end dot,
// however long the series is. Pure and hook-free, so a test can call it as a function. It draws from two real points up;
// fewer than that has no trend to show and it renders nothing.
import type { ReactElement } from 'react'
import type { ChartTone } from '../../game/charts/spec'
import { formatUnit } from './format'
import { extentOf, linePath, linearScale, markerPath } from './geometry'
import './charts.css'

export interface SparklineProps {
  /** Oldest first. A null (or a number that is not finite) is a gap: the line breaks there. */
  values: readonly (number | null)[]
  tone: ChartTone
  /** What the series is, for the screen reader: 'Net profit'. */
  label: string
  /** How a value reads in the label. Money callers pass shortMoney, share prices formatPrice. Default: plainNumber. */
  fmt?: (n: number) => string
  /** The size of the drawing box in its own units (default 80 by 24); the element scales to its container. */
  width?: number
  height?: number
}

const DEFAULT_WIDTH = 80
const DEFAULT_HEIGHT = 24
const MIN_WIDTH = 20
const MAX_WIDTH = 240
const MIN_HEIGHT = 12
const MAX_HEIGHT = 80
/** Room around the drawing, so the end dot and the stroke are never cut off. */
const MARGIN = 3
const DOT_RADIUS = 2.4

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * A number to three significant digits: 842, 12.3, 0.5, then 1.2K, 12K, 2.5M from a thousand up. Under 0.001 it is 0.
 * For values that are not money; money callers pass their own formatter, so a yen life reads in yen.
 */
export function plainNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const r = Number(n.toPrecision(3))
  if (Math.abs(r) >= 1000) return formatUnit('count', r)
  if (Math.abs(r) < 0.001) return '0'
  return String(r)
}

/** 'Net profit: first $40K, last $1.2M, low $40K, high $1.2M'. Gaps are skipped; with no number at all, 'Net profit: no data'. */
export function sparkLabel(label: string, values: readonly (number | null)[], fmt: (n: number) => string): string {
  let first: number | null = null
  let last: number | null = null
  let low = Infinity
  let high = -Infinity
  for (const v of values) {
    if (!isNum(v)) continue
    if (first === null) first = v
    last = v
    if (v < low) low = v
    if (v > high) high = v
  }
  if (first === null || last === null) return `${label}: no data`
  return `${label}: first ${fmt(first)}, last ${fmt(last)}, low ${fmt(low)}, high ${fmt(high)}`
}

function size(v: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return fallback
  return Math.round(Math.max(min, Math.min(max, v)))
}

export function Sparkline(p: SparklineProps): ReactElement | null {
  const values = p.values
  let points = 0
  for (const v of values) if (isNum(v)) points++
  if (points < 2) return null

  const w = size(p.width, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH)
  const h = size(p.height, DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT)
  const n = values.length
  const xs = Array.from({ length: n }, (_, i) => i)
  const [lo, hi] = extentOf(values)
  const sx = linearScale(0, n - 1, MARGIN, w - MARGIN)
  const sy = linearScale(lo, hi, h - MARGIN, MARGIN)

  // One run of real points is one stroke. A run of a single point has no line to draw; a zero-length stroke with a
  // round cap draws it as a dot.
  const parts: string[] = []
  let lastAt = -1
  let from = -1
  for (let i = 0; i <= n; i++) {
    const real = i < n && isNum(values[i])
    if (real) {
      lastAt = i
      if (from < 0) from = i
    } else if (from >= 0) {
      const seg = linePath(xs.slice(from, i), values.slice(from, i), sx, sy)
      parts.push(i - from === 1 ? `${seg}h0` : seg)
      from = -1
    }
  }
  const d = parts.join(' ')
  const end = values[lastAt] as number
  const custom = p.width !== undefined || p.height !== undefined
  const label = sparkLabel(p.label, values, p.fmt ?? plainNumber)

  return (
    <svg
      className={`ch-spark ch-tone-${p.tone}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMinYMid meet"
      role="img"
      aria-label={label}
      focusable="false"
      style={custom ? { height: h, maxWidth: Math.min(328, Math.round(w * 1.5)) } : undefined}
    >
      <path className="ch-spark-line" d={d} pathLength={1} />
      <path className="ch-spark-dot" d={markerPath('circle', sx(lastAt), sy(end), DOT_RADIUS)} />
    </svg>
  )
}
