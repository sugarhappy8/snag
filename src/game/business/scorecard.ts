// A market scorecard: where one number stands among everyone else's. Pure, nothing here knows about labs.
// Callers pass their own figure (`mine`), everyone else's (`field`) and, for a trend, the same figure a year earlier on the same scale.
//
// R3-G5 (H.4): published versus estimated. A board that anyone can read (the AI benchmarks) is a published row: scoreRow and
// scoreText print it exactly, as they always did. A board of rivals whose figures are their own (a chip company's rivals, a
// device company's rivals) is read through scoreFog in Realistic mode: a range for the market and for the best, a bracket for
// your rank, and "(estimated)" on the line. scoreRow and ScoreRow do not change, so a chart or a test that holds the true row
// still does; the fog is a second value that travels beside it.
import { BAND_Z, isExact, know } from '../knowledge/contract'
import { fnv1a } from '../text/hash'
import type { GameState } from '../types'

export interface ScoreRow {
  id: string
  label: string
  unit: string
  /** Your figure; a non-finite one reads as 0. */
  mine: number
  /** The mean of everyone else (0 when there is nobody else). */
  market: number
  /** The best on the board, yours included, so "best" and "rank 1" never disagree. */
  best: number
  /** 1 plus the number of others strictly above you; ties share the better rank. */
  rank: number
  /** Everyone else plus you. */
  of: number
  trend: -1 | 0 | 1
}

/** `field` is everyone else. Non-finite entries are dropped; the array is never mutated. */
export function scoreRow(id: string, label: string, unit: string, mine: number, field: readonly number[], prior?: number): ScoreRow {
  const me = Number.isFinite(mine) ? mine : 0
  const others = field.filter((n) => Number.isFinite(n))
  const market = others.length ? others.reduce((s, n) => s + n, 0) / others.length : 0
  let best = me
  let above = 0
  for (const n of others) {
    if (n > best) best = n
    if (n > me) above++
  }
  const p = typeof prior === 'number' && Number.isFinite(prior) ? prior : 0
  const trend = me > p + 0.5 ? 1 : me < p - 0.5 ? -1 : 0
  return { id, label, unit, mine: me, market, best, rank: 1 + above, of: others.length + 1, trend }
}

/** Where a line's figures came from: a published board prints exact and says so; a read through the player's own eyes is estimated. */
export type ScoreBasis = 'published' | 'estimated'

/**
 * What the player is allowed to read of one scorecard row in Realistic mode. Your own figure is not in it: it is yours and prints
 * exact. Every pair is [low, high] on the row's own scale; `rank` counts places, 1 first.
 */
export interface ScoreFog {
  basis: ScoreBasis
  /** The mean of everyone else. */
  market: [number, number]
  /** The best on the board, yours included, so it never reads below your own figure. */
  best: [number, number]
  /** The places you could hold: the first is the rank you surely have or better, the last the rank you might have. */
  rank: [number, number]
  /** The weakest confidence among the readings behind the row (0 to 3), for the chip. */
  conf: 0 | 1 | 2 | 3
}

/** The scale a cmp: score is read on (the rule table's unit `score`: 0 to 100). */
const SCALE = 100
/**
 * How each figure is read: the noise of the `score` unit (same sd, same draw) but added without the clip at 0 and 100. A mean of
 * clipped readings leans toward the middle, and on a big board that lean is larger than the band, so the band would miss.
 */
const READ = { unit: 'delta', scale: SCALE } as const
/** The longest id part of a cmp: key, so `cmp:<row>:<rival>:score` stays inside the 64 characters a key may have. */
const PART_MAX = 24

/** An id fit for a key part: kept as it is when it already is one, else cleaned and tagged with a hash of the original. */
function keyPart(id: string): string {
  const s = String(id)
  if (s.length > 0 && s.length <= PART_MAX && /^[A-Za-z0-9._~-]+$/.test(s)) return s
  const clean = s.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, PART_MAX - 9) || 'x'
  return `${clean}~${fnv1a(s).toString(36)}`
}

/** The key of one rival's figure on one row: `cmp:<row>:<rival>:score`. Any ids will do; they are cleaned to fit. */
export function cmpKey(rowId: string, memberId: string): string {
  return `cmp:${keyPart(rowId)}:${keyPart(memberId)}:score`
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * The Realistic reading of a scorecard row, or null when there is nothing to fog (Exact mode, or nobody else on the board).
 * `field` is everyone else's true figure and `keyOf(i)` the key of the one at index i (use cmpKey): each rival is read on its own
 * key, so the same rival reads the same number all year and a bought report (R3-H3) narrows exactly that rival.
 *
 *   market  the mean of the readings; the rivals' errors are independent, so the band is the root of the summed variances over n
 *           and a bigger board reads tighter
 *   best    its own reading of the best other figure (an average of readings would run high: it would pick the luckiest guess),
 *           lifted to your own figure, which you know, and to the market band
 *   rank    a bracket, not a statistic: rivals whose whole band is above you for sure, to rivals whose band reaches above you, held
 *           to what the best band allows. It is built to hold the true rank, not to be tight.
 */
export function scoreFog(g: GameState, row: ScoreRow, field: readonly number[], keyOf: (i: number) => string): ScoreFog | null {
  if (isExact()) return null
  const others = field.flatMap((v, i) => (Number.isFinite(v) ? [{ key: keyOf(i), v }] : []))
  if (others.length === 0) return null
  const reads = others.map((o) => know(g, o.key, o.v, READ))
  const top = know(g, cmpKey(row.id, `best~${fnv1a(others.map((o) => o.key).join('|')).toString(36)}`), Math.max(...others.map((o) => o.v)), READ)
  // A key the rule table does not fog reads exact: keep today's line.
  if (top.exact || reads.some((r) => r.exact)) return null

  const n = reads.length
  const mean = reads.reduce((t, r) => t + r.mid, 0) / n
  const reach = (BAND_Z * SCALE * Math.sqrt(reads.reduce((t, r) => t + r.sd * r.sd, 0))) / n
  const market: [number, number] = [clamp(mean - reach, 0, SCALE), clamp(mean + reach, 0, SCALE)]

  const bestLow = Math.max(row.mine, clamp(top.lo, 0, SCALE), market[0])
  const best: [number, number] = [bestLow, Math.max(row.mine, clamp(top.hi, 0, SCALE), bestLow)]

  let sure = 1
  let maybe = 1
  for (const r of reads) {
    if (r.lo > row.mine) sure++
    if (r.hi > row.mine) maybe++
  }
  if (best[1] <= row.mine) sure = maybe = 1
  else if (best[0] > row.mine) {
    sure = Math.max(sure, 2)
    maybe = Math.max(maybe, sure)
  }

  const conf = Math.min(top.conf, ...reads.map((r) => r.conf)) as 0 | 1 | 2 | 3
  return { basis: 'estimated', market, best, rank: [sure, maybe], conf }
}

/** "rank 3 of 9", or with a fog "rank 2 to 4 of 9". */
export function rankText(row: ScoreRow, fog?: ScoreFog | null): string {
  if (!fog || fog.rank[0] === fog.rank[1]) return `rank ${fog ? fog.rank[0] : row.rank} of ${row.of}`
  return `rank ${fog.rank[0]} to ${fog.rank[1]} of ${row.of}`
}

/**
 * The row as the player reads it: the market and the best at the middle of their bands and the rank at the middle of its
 * bracket. For a chart, which draws one number for each; the row itself is not touched. Without a fog it is the row.
 */
export function readRow(row: ScoreRow, fog?: ScoreFog | null): ScoreRow {
  if (!fog) return row
  const mid = (r: readonly [number, number]): number => (r[0] + r[1]) / 2
  return { ...row, market: mid(fog.market), best: mid(fog.best), rank: Math.round(mid(fog.rank)) }
}

/**
 * One plain line, "Coding 71. Market 64, best 78, rank 3 of 9."; `fmt` defaults to rounding. With a fog it reads
 * "Coding 71. Market about 60 to 68, best about 75 to 82, rank 2 to 4 of 9 (estimated)."
 */
export function scoreText(row: ScoreRow, fmt: (n: number) => string = (n) => String(Math.round(n)), fog?: ScoreFog | null): string {
  if (row.of <= 1) return `${row.label} ${fmt(row.mine)}. The market has no figures.`
  if (!fog) return `${row.label} ${fmt(row.mine)}. Market ${fmt(row.market)}, best ${fmt(row.best)}, rank ${row.rank} of ${row.of}.`
  const span = (r: readonly [number, number]): string => {
    const a = fmt(r[0])
    const b = fmt(r[1])
    return a === b ? `about ${a}` : `about ${a} to ${b}`
  }
  return `${row.label} ${fmt(row.mine)}. Market ${span(fog.market)}, best ${span(fog.best)}, ${rankText(row, fog)} (${fog.basis}).`
}
