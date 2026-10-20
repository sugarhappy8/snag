// The "Show as table" view of a chart: the same numbers as the plot, as a real table (caption, head, rows) for a screen
// reader or for anyone who would rather read than look. Pure; every cell is a string, every row is as wide as the head.
import { waterfallLayout } from './geometry'
import { describeDelta, formatSigned, formatUnit, rowsOf, xText } from './format'
import type { ChartSpec, ChartUnit } from '../../game/charts/spec'

const NO_DATA = 'no data'

function cell(unit: ChartUnit, v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? formatUnit(unit, v) : NO_DATA
}

/** The last two numbers in a row of values that hold one, skipping gaps. */
function lastTwo(values: readonly (number | null | undefined)[]): { last: number | null; prev: number | null } {
  let last: number | null = null
  let prev: number | null = null
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    prev = last
    last = v
  }
  return { last, prev }
}

function changeInPlaces(rank: number, prevRank: number | null): string {
  if (prevRank === null || !Number.isFinite(prevRank)) return 'new'
  const d = Math.round(prevRank) - Math.round(rank)
  if (d === 0) return 'no change'
  return `${d > 0 ? 'up' : 'down'} ${Math.abs(d)}`
}

/** 'Year' when every x is a year, else 'Point'. */
function xHead(x: readonly (number | string)[]): string {
  const years = x.length > 0 && x.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1000 && v <= 3000)
  return years ? 'Year' : 'Point'
}

/**
 * The chart as a table. Line, bars, stack, timeline and meter: a row per x and a column per series. Waterfall: a row per
 * step with the amount and the running total. Ladder: a row per row with the value and the change in places. Kpi: a row
 * per series with the latest value and its change.
 */
export function specTable(spec: ChartSpec): { caption: string; head: string[]; rows: string[][] } {
  const caption = spec.title.length > 0 ? spec.title : 'Chart data'
  switch (spec.kind) {
    case 'waterfall': {
      const steps = spec.steps ?? []
      const { bars } = waterfallLayout(steps)
      return {
        caption,
        head: ['Step', 'Amount', 'Running total'],
        rows: steps.map((s, i) => [
          s.label,
          s.kind === 'total' ? cell(spec.unit, s.value) : formatSigned(spec.unit, s.value),
          cell(spec.unit, bars[i]?.level),
        ]),
      }
    }
    case 'ladder':
      return {
        caption,
        head: ['Rank', 'Name', 'Value', 'Change'],
        rows: rowsOf(spec).map((r) => [`#${Math.max(0, Math.round(Number.isFinite(r.rank) ? r.rank : 0))}`, r.name, cell(spec.unit, r.value), changeInPlaces(r.rank, r.prevRank)]),
      }
    case 'kpi':
      return {
        caption,
        head: ['Measure', 'Latest', 'Change'],
        rows: spec.series.map((s) => {
          const { last, prev } = lastTwo(s.values)
          return [s.label, cell(spec.unit, last), last !== null && prev !== null ? describeDelta(spec.unit, last - prev) : NO_DATA]
        }),
      }
    default:
      return {
        caption,
        head: [xHead(spec.x), ...spec.series.map((s) => s.label)],
        rows: spec.x.map((x, i) => [xText(x), ...spec.series.map((s) => cell(spec.unit, s.values[i]))]),
      }
  }
}
