// The net-worth line (R1 charts, G.7): one life's net worth by age as a timeline spec, for the Profile, Death and Graveyard
// screens and the wealth cockpit. Pure: it reads the life series (life-series.ts, written by ageUp) and the live net worth,
// writes nothing, draws no random number and looks at no year after the present one. A life with fewer than two points has
// no line, so the builder returns null and the screen shows nothing.
import { netWorth } from '../core'
import { lifeRows } from '../life-series'
import type { GameState } from '../types'
import { fit, moneyLabel, priceBasisYear, whole } from './money'
import { reveal } from './reveal'
import { CHART_LIMITS, SPEC_LIMITS, type ChartMark, type ChartSpec } from './spec'

/** The oldest age a point may have (the life series holds no more). */
const MAX_AGE = 150

/**
 * At most `max` of `rows`, in their order: the first, the last, every row `keep` asks for, and the rest picked evenly from
 * what is left. A list that already fits comes back as a copy. If the first, the last and the kept rows alone would not
 * fit, the first and the last stay and the earliest kept rows fill the room. A cap that is not a number, or under two,
 * means the first and the last.
 */
export function downsample<T>(rows: readonly T[], max: number, keep: (r: T, i: number) => boolean): T[] {
  const n = rows.length
  const cap = Number.isFinite(max) ? Math.max(2, Math.floor(max)) : 2
  if (n <= cap) return rows.slice()
  const picked = new Set<number>([0, n - 1])
  for (let i = 1; i < n - 1 && picked.size < cap; i++) if (keep(rows[i]!, i)) picked.add(i)
  const free = cap - picked.size
  if (free > 0) {
    const rest: number[] = []
    for (let i = 0; i < n; i++) if (!picked.has(i)) rest.push(i)
    // `rest` is longer than `free` (n is over the cap), so these are distinct and spread over the whole life.
    for (let j = 0; j < free; j++) picked.add(rest[Math.floor(((j + 0.5) * rest.length) / free)]!)
  }
  return [...picked].sort((a, b) => a - b).map((i) => rows[i]!)
}

interface Point {
  age: number
  worth: number
}

/** The net worth right now, whole, or null when the books will not add up to a number. */
function liveWorth(g: GameState): number | null {
  try {
    const n = netWorth(g)
    return Number.isFinite(n) ? whole(n) : null
  } catch {
    return null
  }
}

/**
 * One point for each age lived, oldest first: the rows of the life series, with the live worth standing at the character's
 * age. A row for the current age is replaced by the live worth (the year has moved on since it was written); with no row
 * for that age the live worth is added. The ages stay in order whatever the series holds.
 */
function points(g: GameState): Point[] {
  const byAge = new Map<number, number>()
  for (const r of lifeRows(g)) byAge.set(r.age, r.netWorth)
  const age = g.character.age
  if (typeof age === 'number' && Number.isFinite(age)) {
    const at = Math.round(age)
    const live = liveWorth(g)
    if (live !== null && at >= 0 && at <= MAX_AGE) byAge.set(at, live)
  }
  return [...byAge].sort((a, b) => a[0] - b[0]).map(([a, worth]) => ({ age: a, worth }))
}

/** The first index of the highest and of the lowest worth. */
function extremes(list: readonly Point[]): { peak: number; low: number } {
  let peak = 0
  let low = 0
  list.forEach((p, i) => {
    if (p.worth > list[peak]!.worth) peak = i
    if (p.worth < list[low]!.worth) low = i
  })
  return { peak, low }
}

/**
 * Net worth by age as a timeline: x is the age, one series 'Net worth'. More than CHART_LIMITS.points points are cut with
 * `downsample`, keeping the first, the last, the peak and the low. Marks come from the series itself and nowhere else: the
 * peak, the low point when it is below zero, and now. Null under two points.
 */
export function netWorthSpec(g: GameState): ChartSpec | null {
  const all = points(g)
  if (all.length < 2) return null
  const full = extremes(all)
  const shown = all.length > CHART_LIMITS.points ? downsample(all, CHART_LIMITS.points, (_, i) => i === full.peak || i === full.low) : all
  const { peak, low } = extremes(shown)
  const top = shown[peak]!
  const bottom = shown[low]!
  const last = shown[shown.length - 1]!

  const marks: ChartMark[] = [{ at: peak, label: fit(`Peak ${moneyLabel(g, top.worth)}`, SPEC_LIMITS.label) }]
  if (bottom.worth < 0 && bottom.worth < top.worth) marks.push({ at: low, label: fit(`Low point ${moneyLabel(g, bottom.worth)}`, SPEC_LIMITS.label) })
  marks.push({ at: shown.length - 1, label: 'Now' })

  return reveal({
    v: 1,
    kind: 'timeline',
    title: 'Your net worth by age',
    unit: 'money',
    x: shown.map((p) => p.age),
    series: [{ id: 'worth', label: 'Net worth', tone: 'c1', values: shown.map((p) => p.worth) }],
    marks,
    basis: priceBasisYear(g),
    summary: fit(`Net worth ${moneyLabel(g, last.worth)} at age ${last.age}, peak ${moneyLabel(g, top.worth)} at age ${top.age}.`),
  })
}
