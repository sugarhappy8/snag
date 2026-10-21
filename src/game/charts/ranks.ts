// The ladder and rank builders (R1 charts, G.1 and G.6): any list of scores becomes a rank ladder, a scorecard, a rank
// line or an approval line. Pure: they read the lists they are handed and write nothing, draw no random number and look
// at no year after the ones given. A builder that cannot build returns null, never throws, and never puts a number that
// is not a finite, sane size, or a string the reader would refuse, into a spec.
import type { ScoreRow } from '../business/scorecard'
import { fit, pctLabel } from './money'
import { reveal } from './reveal'
import { CHART_LIMITS, SPEC_LIMITS, type ChartSpec, type ChartUnit, type LadderRow } from './spec'

/** One entry of a ladder, as a caller knows it. Only `value` decides the order. */
export interface RankSource {
  id: string
  name: string
  value: number
  /** The value last period (null or absent when unknown). Used for the change when no `prevRanks` is given. */
  prev?: number | null
  /** The value in each earlier period, oldest first; the last ten are drawn. */
  history?: (number | null)[]
  /** The player's own entry. */
  you?: boolean
}

/** Rows a ladder shows at most (the spec reader's own limit). */
const MAX_ROWS = SPEC_LIMITS.rows
/** Points of a row's sparkline. */
const SPARK_SHOWN = 10
/** Rows of the top that a ladder always shows, and neighbours it shows on each side of the player. */
const TOP_ROWS = 5
const NEIGHBOURS = 2
/** A rank beyond this is not a rank (the spec reader's own limit). */
const MAX_RANK = 1_000_000
/** Years a line chart of rank or approval holds. */
const APPROVAL_YEARS = 12
const YEAR_MIN = 1
const YEAR_MAX = 9999
const BASIS_MIN = 1800
const BASIS_MAX = 2300
/** Ids that would be dangerous as a lookup key. */
const POISON_IDS: readonly string[] = ['__proto__', 'constructor', 'prototype']

// ---------------------------------------------------------------------------
// Small readers shared with market.ts

/**
 * Text a spec can carry: control characters become spaces, a dash character becomes a hyphen (docs/VOICE.md), runs of
 * space collapse, the ends are trimmed and the result is cut at `max` characters. Anything that is not a string reads as
 * the empty string, so the caller picks its own fallback.
 */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  const out = v
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return out.length > max ? out.slice(0, max).trim() : out
}

/** A finite number held to the spec's magnitude and rounded to six decimals (so a share of 0.1234567 stays a share). */
function sane(n: number): number {
  const held = Math.max(-SPEC_LIMITS.magnitude, Math.min(SPEC_LIMITS.magnitude, n))
  return Math.round(held * 1e6) / 1e6 + 0
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** A rank the spec reader accepts, or null. */
function rankOf(v: unknown): number | null {
  return isNum(v) && Number.isInteger(v) && v >= 1 && v <= MAX_RANK ? v : null
}

/** A year as a whole number, or null when it is not a sane year. */
function yearOf(v: unknown): number | null {
  if (!isNum(v)) return null
  const year = Math.round(v)
  return year >= YEAR_MIN && year <= YEAR_MAX ? year : null
}

/** A count from a caller's option: the fallback when it is not a number, otherwise a whole number of at least nothing. */
function count(v: number, fallback: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback
}

// ---------------------------------------------------------------------------
// Windows and changes

/**
 * Which rows a long ladder shows: the top `top` rows, then you with `around` neighbours on each side, never more than
 * twelve (the most a spec holds). Rows come back in their own order and the input is not touched. When the cap bites,
 * you stay first, then the top rows, then the neighbours nearest you. With nobody flagged as you there is nothing to
 * pin, so the head of the list is shown, up to the cap.
 */
export function windowRows<T>(rows: readonly T[], isYou: (r: T) => boolean, top: number = TOP_ROWS, around: number = NEIGHBOURS): T[] {
  const n = rows.length
  let you = -1
  for (let i = 0; i < n; i++) {
    if (isYou(rows[i]!)) {
      you = i
      break
    }
  }
  if (you < 0) return rows.slice(0, MAX_ROWS)
  const head = Math.min(count(top, TOP_ROWS), n)
  const near = Math.min(count(around, NEIGHBOURS), n)
  const keep = new Set<number>([you])
  for (let i = 0; i < head && keep.size < MAX_ROWS; i++) keep.add(i)
  for (let d = 1; d <= near && keep.size < MAX_ROWS; d++) {
    if (you - d >= 0) keep.add(you - d)
    if (you + d < n && keep.size < MAX_ROWS) keep.add(you + d)
  }
  return [...keep].sort((p, q) => p - q).map((i) => rows[i]!)
}

/**
 * What changed since last period, in words and a direction for the glyph. `dir` is 1 for a move up the ladder (a smaller
 * rank number), -1 for a move down and 0 for no change or a newcomer. The UI adds an arrow glyph next to the words and
 * never leans on colour alone.
 */
export function rankChange(rank: number, prevRank: number | null): { dir: -1 | 0 | 1; text: string } {
  if (prevRank === null || !isNum(prevRank) || !isNum(rank)) return { dir: 0, text: 'new' }
  const moved = Math.round(prevRank) - Math.round(rank)
  if (moved > 0) return { dir: 1, text: `up ${moved}` }
  if (moved < 0) return { dir: -1, text: `down ${-moved}` }
  return { dir: 0, text: 'no change' }
}

// ---------------------------------------------------------------------------
// The generic ladder

interface Entry {
  src: RankSource
  idx: number
  value: number
  you: boolean
}

/** A row id the spec reader accepts and no other row has: the entry's own id when it can be, else r{rank}. */
function rowId(wanted: unknown, rank: number, used: Set<string>): string {
  let id = cleanText(wanted, SPEC_LIMITS.id)
  if (id === '' || POISON_IDS.includes(id) || used.has(id)) {
    id = `r${rank}`
    for (let n = 2; used.has(id); n++) id = `r${rank}-${n}`
  }
  used.add(id)
  return id
}

/** An own property of a record, so nothing is read through the prototype chain. */
function ownRank(o: Readonly<Record<string, number>>, key: unknown): number | null {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(o, key) ? rankOf(o[key]) : null
}

/**
 * A ranking of any list: sorted by value (high to low unless `higherIsBetter` is false), ranked 1 and up in that order
 * (a tie goes to the player, then to the order given), and cut to a window of at most twelve rows. The change since last
 * period comes from `prevRanks` (an entry missing there reads as new) or, with none given, from each row's `prev` value:
 * the rows that have one are ranked among themselves, and a row with none reads as new. A row with no usable value is
 * left out; no rows gives null. `history` becomes the sparkline (the last ten points).
 */
export function ladderSpec(o: {
  title: string
  unit: ChartUnit
  rows: readonly RankSource[]
  higherIsBetter?: boolean
  summary?: string
  prevRanks?: Readonly<Record<string, number>>
  basis?: number
}): ChartSpec | null {
  if (o === null || typeof o !== 'object' || !Array.isArray(o.rows)) return null
  const higher = o.higherIsBetter !== false
  const entries: Entry[] = []
  const list = o.rows as readonly unknown[]
  for (let i = 0; i < list.length; i++) {
    const r = list[i] as RankSource | null | undefined
    if (r === null || r === undefined || typeof r !== 'object' || !isNum(r.value)) continue
    entries.push({ src: r, idx: i, value: sane(r.value), you: r.you === true })
  }
  if (entries.length === 0) return null

  const order = (value: (e: Entry) => number) => (a: Entry, b: Entry): number => {
    const d = higher ? value(b) - value(a) : value(a) - value(b)
    if (d !== 0) return d
    if (a.you !== b.you) return a.you ? -1 : 1
    return a.idx - b.idx
  }
  const ranked = [...entries].sort(order((e) => e.value))

  // Last period's rank: given, or worked out from the rows that carry a previous value (at least two of them).
  const given = o.prevRanks !== null && typeof o.prevRanks === 'object' ? o.prevRanks : null
  const derived = new Map<Entry, number>()
  if (!given) {
    const before = entries.filter((e) => isNum(e.src.prev))
    if (before.length >= 2) before.sort(order((e) => sane(e.src.prev as number))).forEach((e, i) => derived.set(e, i + 1))
  }

  const places = ranked.map((entry, i) => ({ entry, rank: i + 1 }))
  const shown = windowRows(places, (p) => p.entry.you)
  const used = new Set<string>()
  const nameOf = (e: Entry, rank: number): string => cleanText(e.src.name, SPEC_LIMITS.label) || (e.you ? 'You' : `Entry ${rank}`)
  const rows: LadderRow[] = shown.map(({ entry: e, rank }) => {
    const prev = isNum(e.src.prev) ? sane(e.src.prev) : null
    const trail: unknown = e.src.history
    const spark = Array.isArray(trail) ? (trail.slice(-SPARK_SHOWN) as unknown[]).map((v) => (isNum(v) ? sane(v) : null)) : []
    const prevRank = given ? ownRank(given, e.src.id) : derived.get(e) ?? null
    return {
      id: rowId(e.src.id, rank, used),
      name: nameOf(e, rank),
      value: e.value,
      rank,
      prevRank,
      prev,
      spark,
      ...(e.you ? { you: true as const } : {}),
    }
  })

  // The summary: the caller's, or who is first and where the player stands.
  const n = ranked.length
  const youAt = ranked.findIndex((e) => e.you)
  const first = nameOf(ranked[0]!, 1)
  let said: string
  if (n === 1) said = youAt === 0 ? "You're the only entry." : `${first} is the only entry.`
  else if (youAt === 0) said = `You're first of ${n}. ${nameOf(ranked[1]!, 2)} is next.`
  else if (youAt > 0) said = `You're #${youAt + 1} of ${n}. ${first} is first.`
  else said = `${first} is first of ${n}.`
  const summary = fit(cleanText(o.summary, 400)) || fit(said)

  const title = fit(cleanText(o.title, 400), CHART_LIMITS.title) || 'Ranking'
  const basis = isNum(o.basis) && o.basis >= BASIS_MIN && o.basis <= BASIS_MAX ? Math.round(o.basis) : null
  return reveal({ v: 1, kind: 'ladder', title, unit: o.unit, x: [], series: [], rows, ...(basis !== null ? { basis } : {}), summary })
}

// ---------------------------------------------------------------------------
// Scorecards

/**
 * Where one set of figures stands among everyone else's: a meter chart with one row for each score, your figure, the
 * market mean and the best on the board, and the rank text ("3 of 9") for each row in the marks. At most eight rows (one
 * mark each); a figure that is not a number reads as 0, as `scoreRow` reads it. Null for no rows.
 */
export function scorecardSpec(title: string, rows: readonly ScoreRow[]): ChartSpec | null {
  const list: unknown = rows
  if (!Array.isArray(list)) return null
  const kept: ScoreRow[] = []
  for (const r of list as unknown[]) {
    if (r !== null && typeof r === 'object') kept.push(r as ScoreRow)
    if (kept.length >= CHART_LIMITS.marks) break
  }
  if (kept.length === 0) return null
  const figure = (v: unknown): number => (isNum(v) ? sane(v) : 0)
  const place = (v: unknown): number => (isNum(v) ? Math.min(MAX_RANK, Math.max(1, Math.round(v))) : 1)
  const x = kept.map((r, i) => cleanText(r.label, SPEC_LIMITS.label) || cleanText(r.id, SPEC_LIMITS.label) || `Row ${i + 1}`)
  const standing = kept.map((r) => ({ rank: place(r.rank), of: place(r.of) }))

  const firsts = standing.filter((s) => s.rank === 1).length
  let weakest = 0
  standing.forEach((s, i) => {
    if (s.rank / s.of > standing[weakest]!.rank / standing[weakest]!.of) weakest = i
  })
  const w = standing[weakest]!
  let said: string
  if (kept.length === 1) said = `${x[0]}: you rank ${w.rank} of ${w.of}.`
  else if (firsts === kept.length) said = `You rank first on all ${kept.length}.`
  else said = `You rank first on ${firsts} of ${kept.length}. Weakest: ${x[weakest]}, ${w.rank} of ${w.of}.`

  return reveal({
    v: 1,
    kind: 'meter',
    title: fit(cleanText(title, 400), CHART_LIMITS.title) || 'Scorecard',
    unit: 'count',
    x,
    series: [
      { id: 'mine', label: 'Yours', tone: 'c1', values: kept.map((r) => figure(r.mine)) },
      { id: 'market', label: 'Market', tone: 'c2', values: kept.map((r) => figure(r.market)) },
      { id: 'best', label: 'Best', tone: 'c3', values: kept.map((r) => figure(r.best)) },
    ],
    marks: standing.map((s, i) => ({ at: i, label: `${s.rank} of ${s.of}` })),
    summary: fit(said),
  })
}

// ---------------------------------------------------------------------------
// Rank and approval lines

/**
 * Your rank in a peer field, year by year (the careers kit keeps a `YearRow` for each). A year with no peers (rank 0 of 0,
 * or any rank or field below 1) is left out; one row a year, the later one winning; at most sixty-four years. Needs two
 * years. The unit is `rank`, so the UI draws it with 1 at the top.
 */
export function standingSpec(title: string, rows: readonly { y: number; rank: number; of: number }[]): ChartSpec | null {
  const list: unknown = rows
  if (!Array.isArray(list)) return null
  const byYear = new Map<number, { rank: number; of: number }>()
  for (const r of list as unknown[]) {
    if (r === null || typeof r !== 'object') continue
    const row = r as { y: unknown; rank: unknown; of: unknown }
    const year = yearOf(row.y)
    const rank = rankOf(row.rank)
    const of = rankOf(row.of)
    if (year === null || rank === null || of === null) continue
    byYear.set(year, { rank, of })
  }
  const kept = [...byYear.entries()].sort((p, q) => p[0] - q[0]).slice(-CHART_LIMITS.points)
  if (kept.length < 2) return null
  const [firstYear, first] = kept[0]!
  const [lastYear, last] = kept[kept.length - 1]!
  return reveal({
    v: 1,
    kind: 'line',
    title: fit(cleanText(title, 400), CHART_LIMITS.title) || 'Your rank by year',
    unit: 'rank',
    x: kept.map(([year]) => year),
    series: [{ id: 'rank', label: 'Your rank', tone: 'c1', values: kept.map(([, r]) => r.rank) }],
    summary: fit(`You were #${last.rank} of ${last.of} in ${lastYear}, from #${first.rank} of ${first.of} in ${firstYear}.`),
  })
}

/**
 * A nation's approval rating, year by year (`ReportRow.approval`, 0 to 100): the last twelve years as shares of 1. A
 * value outside 0 to 100 is held to it; a year with no number is left out. Needs two years.
 */
export function approvalSpec(reports: readonly { year: number; approval: number }[]): ChartSpec | null {
  const list: unknown = reports
  if (!Array.isArray(list)) return null
  const byYear = new Map<number, number>()
  for (const r of list as unknown[]) {
    if (r === null || typeof r !== 'object') continue
    const row = r as { year: unknown; approval: unknown }
    const year = yearOf(row.year)
    if (year === null || !isNum(row.approval)) continue
    byYear.set(year, sane(Math.max(0, Math.min(100, row.approval)) / 100))
  }
  const kept = [...byYear.entries()].sort((p, q) => p[0] - q[0]).slice(-APPROVAL_YEARS)
  if (kept.length < 2) return null
  const [firstYear, first] = kept[0]!
  const [lastYear, last] = kept[kept.length - 1]!
  return reveal({
    v: 1,
    kind: 'line',
    title: 'Approval by year',
    unit: 'pct',
    x: kept.map(([year]) => year),
    series: [{ id: 'approval', label: 'Approval', tone: 'c1', values: kept.map(([, v]) => v) }],
    summary: fit(`Approval was ${pctLabel(last)} in ${lastYear}, from ${pctLabel(first)} in ${firstYear}.`),
  })
}
