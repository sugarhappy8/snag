// Chart text: values, signed changes and the one-line readout under a chart. Money goes through the game's own
// shortMoney, so it follows the live bound money context (the player's currency and price year), like every component.
// Every function is total: a non-finite number reads as 0, and no string holds NaN, Infinity or undefined.
import { shortMoney } from '../../game/core'
import { CHART_LIMITS, type ChartSpec, type ChartUnit } from '../../game/charts/spec'

function safe(v: number): number {
  return Number.isFinite(v) ? v : 0
}

/** '7.0' -> '7', '0.50' -> '0.5', '12' stays. */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

const COUNT_UNITS: readonly [number, string][] = [
  [1e18, 'Qi'],
  [1e15, 'Qa'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]

/** A non-negative count in the short form: 842, 1.2K, 12K, 2.5M. */
function compactCount(a: number): string {
  if (a < 10) return trimZeros(a.toFixed(1))
  if (Math.round(a) < 1000) return String(Math.round(a))
  if (a >= 1e21) return a.toExponential(1).replace('e+', 'e').replace(/\.0e/, 'e')
  let i = COUNT_UNITS.findIndex(([v]) => a >= v)
  if (i < 0) i = COUNT_UNITS.length - 1
  for (;;) {
    const [v, s] = COUNT_UNITS[i]!
    const x = a / v
    const text = trimZeros(x.toFixed(x >= 10 ? 0 : 1))
    // 999,999 rounds to '1000K' in thousands, so it moves up a unit and reads '1M'.
    if (Number(text) < 1000 || i === 0) return `${text}${s}`
    i -= 1
  }
}

/** The number of a percentage, from a fraction, without the sign or the % sign. `tiny` is true below 0.01%. */
function pctBody(frac: number): { text: string; tiny: boolean } {
  const p = Math.abs(safe(frac)) * 100
  if (p === 0) return { text: '0', tiny: false }
  if (p < 0.01) return { text: '0.01', tiny: true }
  if (p < 1) return { text: trimZeros(p.toFixed(2)), tiny: false }
  if (p < 10) return { text: trimZeros(p.toFixed(1)), tiny: false }
  if (p < 1000) return { text: String(Math.round(p)), tiny: false }
  return { text: compactCount(p), tiny: false }
}

function yearsBody(v: number): { text: string; one: boolean } {
  const a = Math.abs(safe(v))
  const r = a >= 10 ? Math.round(a) : Math.round(a * 10) / 10
  return { text: trimZeros(String(r)), one: r === 1 }
}

/**
 * A value in its unit: money as the game writes it ($1.1M), pct from a fraction (0.072 -> '7.2%', 0.0035 -> '0.35%',
 * 0.00004 -> '<0.01%'), count as 842, 1.2K or 2.5M, rank as '#3', years as '12 yrs'.
 */
export function formatUnit(unit: ChartUnit, v: number): string {
  const n = safe(v)
  switch (unit) {
    case 'money':
      return shortMoney(n)
    case 'pct': {
      const { text, tiny } = pctBody(n)
      if (tiny) return n < 0 ? '>-0.01%' : '<0.01%'
      return `${n < 0 && text !== '0' ? '-' : ''}${text}%`
    }
    case 'count': {
      const body = compactCount(Math.abs(n))
      return n < 0 && !isZeroText(body) ? `-${body}` : body
    }
    case 'rank':
      return `#${Math.max(0, Math.round(n))}`
    case 'years': {
      const { text, one } = yearsBody(n)
      return `${n < 0 && text !== '0' ? '-' : ''}${text} ${one ? 'yr' : 'yrs'}`
    }
  }
}

/** Text with a digit from 1 to 9 in it is a value that is not zero. */
function isZeroText(s: string): boolean {
  return !/[1-9]/.test(s)
}

/**
 * A change with an ASCII sign: '+$310K', '-$2.1M'. Zero, and anything that rounds to zero, has no sign ('$0').
 * For unit rank the number is places, written '+2' or '-3'.
 */
export function formatSigned(unit: ChartUnit, v: number): string {
  const n = safe(v)
  const body = unit === 'rank' ? String(Math.round(Math.abs(n))) : formatUnit(unit, Math.abs(n))
  if (isZeroText(body)) return body
  return `${n < 0 ? '-' : '+'}${body}`
}

/**
 * A change in words for a reader who cannot see the arrow: 'up $310K', 'down 2 places', 'no change'. `v` is the new
 * value minus the old one, in the unit of the chart. A lower rank number is a better place, so for unit rank a falling
 * number reads 'up'. A percentage moves in points: 'up 2.1 points'.
 */
export function describeDelta(unit: ChartUnit, v: number): string {
  const n = safe(v)
  const abs = Math.abs(n)
  if (unit === 'rank') {
    const places = Math.round(abs)
    if (places === 0) return 'no change'
    return `${n < 0 ? 'up' : 'down'} ${places} ${places === 1 ? 'place' : 'places'}`
  }
  if (unit === 'pct') {
    const { text, tiny } = pctBody(abs)
    if (text === '0') return 'no change'
    return `${n > 0 ? 'up' : 'down'} ${tiny ? '<' : ''}${text} ${text === '1' && !tiny ? 'point' : 'points'}`
  }
  const body = formatUnit(unit, abs)
  if (isZeroText(body)) return 'no change'
  return `${n > 0 ? 'up' : 'down'} ${body}`
}

/** Cut text to `max` characters at a word, with no ellipsis character. */
export function clipText(text: string, max: number = CHART_LIMITS.text): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  const out = space > max * 0.5 ? cut.slice(0, space) : cut
  return out.replace(/[\s,;:-]+$/, '')
}

/** An x entry as text: a year stays '2029', a fraction keeps two decimals at most, a string stays itself. */
export function xText(x: number | string | undefined): string {
  if (typeof x === 'string') return x
  if (typeof x !== 'number' || !Number.isFinite(x)) return ''
  return Number.isInteger(x) ? String(x) : trimZeros(x.toFixed(2))
}

function indexOfSpec(index: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Number.isFinite(index) ? Math.round(index) : 0))
}

function valueText(unit: ChartUnit, v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? formatUnit(unit, v) : 'no data'
}

/** The label with its first letter lowered, unless its first word looks like an acronym: 'Sales after tax' -> 'sales after tax'. */
function lowerFirst(s: string): string {
  const word = s.split(' ')[0] ?? ''
  return /[A-Z]/.test(word.slice(1)) ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

/** Ladder rows are an optional field that a later spec revision types; read them defensively either way. */
export interface RowLike {
  rank: number
  name: string
  value: number
  prevRank: number | null
}

export function rowsOf(spec: ChartSpec): RowLike[] {
  const raw = (spec as { rows?: unknown }).rows
  if (!Array.isArray(raw)) return []
  const out: RowLike[] = []
  for (const r of raw as unknown[]) {
    if (typeof r !== 'object' || r === null) continue
    const o = r as Record<string, unknown>
    if (typeof o.name !== 'string' || typeof o.value !== 'number' || typeof o.rank !== 'number') continue
    out.push({ rank: o.rank, name: o.name, value: o.value, prevRank: typeof o.prevRank === 'number' ? o.prevRank : null })
  }
  return out
}

function shareText(part: number, whole: number): string {
  const p = (Math.abs(safe(part)) / Math.abs(safe(whole))) * 100
  if (!Number.isFinite(p)) return ''
  return p > 0 && p < 0.5 ? '<1%' : `${Math.round(p)}%`
}

/**
 * The one line under a chart for point `index` (the cursor, or the last point). Line, bars, stack and timeline:
 * '2029: Net profit $1.1M', for up to 3 series and then 'and N more'. Waterfall: 'Wages: -$2.2M, 23% of sales after
 * tax' (a delta says what share of the first total it is). Ladder: '#2 You 12%'. Kpi and meter: the summary. At most 120
 * characters.
 */
export function readoutFor(spec: ChartSpec, index: number): string {
  const fallback = clipText(spec.summary)
  switch (spec.kind) {
    case 'line':
    case 'bars':
    case 'stack':
    case 'timeline': {
      if (spec.x.length === 0 || spec.series.length === 0) return fallback
      const i = indexOfSpec(index, spec.x.length)
      const shown = spec.series.slice(0, 3).map((s) => `${s.label} ${valueText(spec.unit, s.values[i])}`)
      const more = spec.series.length - shown.length
      return clipText(`${xText(spec.x[i])}: ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}`)
    }
    case 'waterfall': {
      const steps = spec.steps ?? []
      if (steps.length === 0) return fallback
      const st = steps[indexOfSpec(index, steps.length)]!
      if (st.kind === 'total') return clipText(`${st.label}: ${formatUnit(spec.unit, st.value)}`)
      const first = steps.find((s) => s.kind === 'total')
      const share = first && safe(first.value) !== 0 ? shareText(st.value, first.value) : ''
      return clipText(`${st.label}: ${formatSigned(spec.unit, st.value)}${share && first ? `, ${share} of ${lowerFirst(first.label)}` : ''}`)
    }
    case 'ladder': {
      const rows = rowsOf(spec)
      if (rows.length === 0) return fallback
      const r = rows[indexOfSpec(index, rows.length)]!
      return clipText(`#${Math.max(0, Math.round(safe(r.rank)))} ${r.name} ${formatUnit(spec.unit, r.value)}`)
    }
    default:
      return fallback
  }
}
