// The chart spec: plain JSON that a builder returns and a chart component draws (R1 charts, D.2).
// Types and one constant only, with no imports, so every module may import it and it never joins an
// import cycle. Charts G.1 adds the reader (readChartSpec) below, in its own hunk.

export type ChartTone = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'good' | 'bad' | 'muted'
export type ChartKind = 'line' | 'bars' | 'stack' | 'waterfall' | 'ladder' | 'timeline' | 'meter' | 'kpi'
export type ChartUnit = 'money' | 'pct' | 'count' | 'rank' | 'years'

export interface ChartSeries {
  id: string
  label: string
  tone: ChartTone
  /** One value per x entry; null is a gap. */
  values: (number | null)[]
}

/** A waterfall row: a 'total' stands on the axis, a 'delta' hangs from the running total. */
export interface ChartStep {
  label: string
  value: number
  kind: 'total' | 'delta'
}

/** A short note pinned to a place in the chart. `at` is a position (an x or a row index); each chart kind says which. */
export interface ChartMark {
  at: number
  label: string
}

export interface ChartSpec {
  v: 1
  kind: ChartKind
  /** At most CHART_LIMITS.title characters. */
  title: string
  unit: ChartUnit
  /** At most CHART_LIMITS.points entries. */
  x: (number | string)[]
  /** At most CHART_LIMITS.series entries. */
  series: ChartSeries[]
  /** Waterfall rows, at most CHART_LIMITS.steps. */
  steps?: ChartStep[]
  /** At most CHART_LIMITS.marks. */
  marks?: ChartMark[]
  /** The accessible text, and what a text-only test reads. Every string is at most CHART_LIMITS.text. */
  summary: string
}

export const CHART_LIMITS = { title: 60, text: 120, points: 64, series: 6, steps: 20, marks: 8 } as const
