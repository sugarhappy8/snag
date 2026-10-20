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

/** One row of a ladder chart (market share, rank among rivals). */
export interface LadderRow {
  /** 1 to SPEC_LIMITS.id characters. */
  id: string
  /** At most SPEC_LIMITS.label characters. */
  name: string
  /** A share (unit pct), a score, a rank number. */
  value: number
  /** 1-based, this period. */
  rank: number
  /** Rank last period; null when unknown or new. */
  prevRank: number | null
  /** The value last period. */
  prev: number | null
  /** At most SPEC_LIMITS.spark points, oldest first. */
  spark: (number | null)[]
  /** The player's own row. */
  you?: true
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
  /** Ladder rows (kind 'ladder'), at most SPEC_LIMITS.rows. */
  rows?: LadderRow[]
  /** The price year of a multi-year money chart; the frame shows "prices of {basis}". */
  basis?: number
  /** The second line of a KPI tile, or a footnote. At most SPEC_LIMITS.note characters. */
  note?: string
  /** The accessible text, and what a text-only test reads. Every string is at most CHART_LIMITS.text. */
  summary: string
}

export const CHART_LIMITS = { title: 60, text: 120, points: 64, series: 6, steps: 20, marks: 8 } as const

/** Limits beyond CHART_LIMITS that readChartSpec enforces. `magnitude` bounds every number a spec carries. */
export const SPEC_LIMITS = { rows: 12, spark: 12, label: 40, note: 60, id: 24, magnitude: 1e15 } as const

const KINDS: readonly ChartKind[] = ['line', 'bars', 'stack', 'waterfall', 'ladder', 'timeline', 'meter', 'kpi']
const UNITS: readonly ChartUnit[] = ['money', 'pct', 'count', 'rank', 'years']
const TONES: readonly ChartTone[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'good', 'bad', 'muted']
const STEP_KINDS: readonly ChartStep['kind'][] = ['total', 'delta']
const SERIES_ID = /^[a-z0-9_-]+$/
/** Ids that would be dangerous as a lookup key. They are legal under SERIES_ID, so they are refused by name. */
const POISON_IDS: readonly string[] = ['__proto__', 'constructor', 'prototype']
const MAX_RANK = 1_000_000
const BASIS_MIN = 1800
const BASIS_MAX = 2300

function plain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** An own property, so nothing is ever read through the prototype chain. */
function own(o: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined
}

/** A non-empty string of at most `max` characters with no control character, or null. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) return null
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 32) return null
  return v
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= SPEC_LIMITS.magnitude
}

function rank(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_RANK
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null
}

/** The array when it exists and its length is within `max`. The length is read before any element. */
function listOf(v: unknown, max: number): unknown[] | null {
  return Array.isArray(v) && v.length <= max ? v : null
}

/** A copy of an array of finite numbers or nulls (gaps), or null when anything else is in it. */
function numbersOrGaps(v: unknown, max: number): (number | null)[] | null {
  const list = listOf(v, max)
  if (!list) return null
  const out: (number | null)[] = []
  for (let i = 0; i < list.length; i++) {
    const n = list[i]
    if (n === null) out.push(null)
    else if (finite(n)) out.push(n)
    else return null
  }
  return out
}

function readX(v: unknown): (number | string)[] | null {
  const list = listOf(v, CHART_LIMITS.points)
  if (!list) return null
  const out: (number | string)[] = []
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (typeof e === 'string') {
      const t = text(e, SPEC_LIMITS.label)
      if (t === null) return null
      out.push(t)
    } else if (finite(e)) out.push(e)
    else return null
  }
  return out
}

function readSeries(v: unknown): ChartSeries[] | null {
  const list = listOf(v, CHART_LIMITS.series)
  if (!list) return null
  const out: ChartSeries[] = []
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    if (!plain(s)) return null
    const id = text(own(s, 'id'), SPEC_LIMITS.id)
    const label = text(own(s, 'label'), SPEC_LIMITS.label)
    const tone = oneOf(TONES, own(s, 'tone'))
    const values = numbersOrGaps(own(s, 'values'), CHART_LIMITS.points)
    if (id === null || !SERIES_ID.test(id) || POISON_IDS.includes(id) || label === null || tone === null || values === null) return null
    out.push({ id, label, tone, values })
  }
  return out
}

function readSteps(v: unknown): ChartStep[] | null {
  const list = listOf(v, CHART_LIMITS.steps)
  if (!list) return null
  const out: ChartStep[] = []
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    if (!plain(s)) return null
    const label = text(own(s, 'label'), SPEC_LIMITS.label)
    const value = own(s, 'value')
    const kind = oneOf(STEP_KINDS, own(s, 'kind'))
    if (label === null || !finite(value) || kind === null) return null
    out.push({ label, value, kind })
  }
  return out
}

function readMarks(v: unknown): ChartMark[] | null {
  const list = listOf(v, CHART_LIMITS.marks)
  if (!list) return null
  const out: ChartMark[] = []
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    if (!plain(m)) return null
    const at = own(m, 'at')
    const label = text(own(m, 'label'), SPEC_LIMITS.label)
    if (!finite(at) || label === null) return null
    out.push({ at, label })
  }
  return out
}

function readRows(v: unknown): LadderRow[] | null {
  const list = listOf(v, SPEC_LIMITS.rows)
  if (!list) return null
  const out: LadderRow[] = []
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (!plain(r)) return null
    const id = text(own(r, 'id'), SPEC_LIMITS.id)
    const name = text(own(r, 'name'), SPEC_LIMITS.label)
    const value = own(r, 'value')
    const place = own(r, 'rank')
    const prevRank = own(r, 'prevRank')
    const prev = own(r, 'prev')
    const spark = numbersOrGaps(own(r, 'spark'), SPEC_LIMITS.spark)
    const you = own(r, 'you')
    if (id === null || POISON_IDS.includes(id) || name === null || !finite(value) || !rank(place) || spark === null) return null
    if (prevRank !== null && !rank(prevRank)) return null
    if (prev !== null && !finite(prev)) return null
    if (you !== undefined && you !== true) return null
    out.push({ id, name, value, rank: place, prevRank, prev, spark, ...(you === true ? { you } : {}) })
  }
  return out
}

/**
 * Read a chart spec from JSON that nobody vouches for (a queued modal, a menu row, a save). Returns a fresh object, or
 * null when anything is wrong: it never truncates, clamps or repairs. Strings are non-empty and have no control
 * character; every number is finite and at most SPEC_LIMITS.magnitude; arrays are length-checked before they are walked,
 * so a hostile ten-million element array costs nothing. Keys that are not part of the spec are dropped, and a series or
 * row id that could poison a lookup (__proto__, constructor, prototype) is refused.
 */
export function readChartSpec(json: unknown): ChartSpec | null {
  if (!plain(json) || own(json, 'v') !== 1) return null
  const kind = oneOf(KINDS, own(json, 'kind'))
  const unit = oneOf(UNITS, own(json, 'unit'))
  const title = text(own(json, 'title'), CHART_LIMITS.title)
  const summary = text(own(json, 'summary'), CHART_LIMITS.text)
  const x = readX(own(json, 'x'))
  const series = readSeries(own(json, 'series'))
  if (kind === null || unit === null || title === null || summary === null || x === null || series === null) return null

  const spec: ChartSpec = { v: 1, kind, title, unit, x, series, summary }

  const steps = own(json, 'steps')
  if (steps !== undefined) {
    const read = readSteps(steps)
    if (read === null) return null
    spec.steps = read
  }
  const marks = own(json, 'marks')
  if (marks !== undefined) {
    const read = readMarks(marks)
    if (read === null) return null
    spec.marks = read
  }
  const rows = own(json, 'rows')
  if (rows !== undefined) {
    const read = readRows(rows)
    if (read === null) return null
    spec.rows = read
  }
  const basis = own(json, 'basis')
  if (basis !== undefined) {
    if (typeof basis !== 'number' || !Number.isFinite(basis) || basis < BASIS_MIN || basis > BASIS_MAX) return null
    spec.basis = basis
  }
  const note = own(json, 'note')
  if (note !== undefined) {
    const read = text(note, SPEC_LIMITS.note)
    if (read === null) return null
    spec.note = read
  }

  // What each kind needs to be drawn at all.
  switch (kind) {
    case 'line':
    case 'bars':
    case 'stack':
    case 'timeline':
      if (x.length < 1 || series.length < 1) return null
      for (const s of series) if (s.values.length !== x.length) return null
      break
    case 'waterfall':
      if (!spec.steps || spec.steps.length < 2) return null
      break
    case 'ladder':
      if (!spec.rows || spec.rows.length < 1) return null
      break
    case 'kpi':
    case 'meter':
      if (series.length < 1) return null
      break
  }
  return spec
}
