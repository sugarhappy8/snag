// The history and cash builders (R1 charts, G.1): a company's booked years become a profit line, a cost structure, a cash
// walk and a cash line, the Annual Report gets four KPI tiles, and a player with several companies gets a strip of them.
// Pure: they read settled years (b.last, b.history, the live cash and debt) and write nothing, draw no random number and
// look at no year after the statement's. A builder that cannot build returns null (or an empty list), never throws and
// never puts a number that is not a finite, sane size into a spec.
//
// A year row from before R1 has the nine old fields and no books (cash, debt, the statement lines). Those rows still draw
// the profit line and the tiles; the builders that need the books skip them and say where the books start.
import type { MarketView } from '../business/competition'
import { readDividend } from '../business/dividend-policy'
import { businessAssets, HISTORY_ROWS, readBiz, runsIt, stakeValue, type BizState, type YearRecord } from '../business/state'
import type { GameState } from '../types'
import { deltaLabel, fit, moneyLabel, pctLabel, priceBasisYear, whole } from './money'
import { reveal } from './reveal'
import { SPEC_LIMITS, type ChartMark, type ChartSeries, type ChartSpec, type ChartStep, type ChartTone } from './spec'

/** One row of the strip above the company list: a company's last net profit, its change and a small trend. */
export interface StripRow {
  id: string
  name: string
  emoji: string
  /** Net profit of the last booked year. */
  net: number
  /** Against the year before; null when there is no earlier year. */
  delta: number | null
  /** The last eight years of net profit, oldest first; a gap is null. */
  spark: (number | null)[]
  /** A hired CEO runs it (the player does not). */
  managed: boolean
}

/**
 * The six groups the cost structure stacks, in stacking order. `keys` are the year row fields each group adds up; the
 * tax group takes the sales tax and the corporate tax (`tax`), and the last group is interest plus one-off costs minus
 * other income, never below nothing.
 */
export const COST_GROUPS: readonly { id: string; label: string; tone: ChartTone; keys: readonly string[] }[] = [
  { id: 'materials', label: 'Materials', tone: 'c1', keys: ['cogs'] },
  { id: 'people', label: 'People', tone: 'c2', keys: ['wages', 'keyStaff', 'ownerPay'] },
  { id: 'premises', label: 'Premises and upkeep', tone: 'c3', keys: ['rent', 'upkeep'] },
  { id: 'marketing', label: 'Marketing', tone: 'c4', keys: ['marketing'] },
  { id: 'taxes', label: 'Taxes', tone: 'c5', keys: ['salesTax', 'tax'] },
  { id: 'other', label: 'Interest and one-offs, net', tone: 'c6', keys: ['interest', 'other', 'otherIncome'] },
]

/** The group that is net of other income. */
const NET_GROUP = 'other'
/** Years of history a chart draws (a player company keeps this many rows). */
const YEARS = HISTORY_ROWS
/** Years a KPI tile draws. */
const KPI_YEARS = 10
/** Years of profit in a strip row. */
const STRIP_SPARK = 8
/** Companies in the strip. */
const STRIP_MAX = 12
/** A cost share above this (10,000% of sales) is not a share any more; it is clipped so the spec stays a sane size. */
const MAX_SHARE = 100
/** The most a book amount may be for the cash walk: fewer than 32 of them can never reach the spec's magnitude limit. */
const WALK_BOUND = SPEC_LIMITS.magnitude / 32
const WALK_NOTE = "Moves the books don't name yet sit in everything else."

/** A whole-dollar amount a spec can carry, or null when the book holds no usable number there. */
function amount(v: unknown, bound: number = SPEC_LIMITS.magnitude): number | null {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= bound ? whole(v) : null
}

/** A year row with its year as a whole number. */
interface Booked {
  year: number
  r: YearRecord
}

/**
 * The company's year rows in year order, one a year (the later row wins), at most thirty. A row that is not an object or
 * has no sane year is left out, so a damaged history gives fewer rows, not a throw.
 */
function bookRows(b: BizState): Booked[] {
  const list: unknown = b.history
  const byYear = new Map<number, YearRecord>()
  if (Array.isArray(list)) {
    for (const item of list as unknown[]) {
      if (item === null || typeof item !== 'object') continue
      const y = (item as YearRecord).year
      if (typeof y !== 'number' || !Number.isFinite(y)) continue
      const year = Math.round(y)
      if (year < 1 || year > 9999) continue
      byYear.set(year, item as YearRecord)
    }
  }
  return [...byYear.entries()]
    .sort((p, q) => p[0] - q[0])
    .slice(-YEARS)
    .map(([year, r]) => ({ year, r }))
}

/** The year of a statement as a whole number, or null when it is not a sane year. */
function yearOf(b: BizState): number | null {
  const s = b.last
  if (!s || typeof s.year !== 'number' || !Number.isFinite(s.year)) return null
  const year = Math.round(s.year)
  return year >= 1 && year <= 9999 ? year : null
}

function hasBooks(r: YearRecord): boolean {
  return typeof r.cogs === 'number' && Number.isFinite(r.cogs)
}

// ---------------------------------------------------------------------------
// Profit

/**
 * Net profit by year, up to thirty years, in the prices of the chart's basis year. Needs two booked years with a number
 * in them. Old rows count: the profit is one of the nine fields every row has.
 */
export function profitSpec(g: GameState, b: BizState): ChartSpec | null {
  const rows = bookRows(b)
  if (rows.length < 2) return null
  const values = rows.map((p) => amount(p.r.profit))
  const known: { v: number; i: number }[] = []
  values.forEach((v, i) => {
    if (v !== null) known.push({ v, i })
  })
  if (known.length < 2) return null
  const first = known[0]!
  const last = known[known.length - 1]!
  const best = known.reduce((top, p) => (p.v > top.v ? p : top), first)
  const x = rows.map((p) => p.year)
  const summary = `Net profit from ${x[first.i]} to ${x[last.i]}: ${moneyLabel(g, first.v)} to ${moneyLabel(g, last.v)}, best ${moneyLabel(g, best.v)} in ${x[best.i]}.`
  return reveal({
    v: 1,
    kind: 'line',
    title: 'Net profit by year',
    unit: 'money',
    x,
    series: [{ id: 'net', label: 'Net profit', tone: 'c1', values }],
    basis: priceBasisYear(g),
    summary: fit(summary),
  })
}

// ---------------------------------------------------------------------------
// Cost structure

/** What one group costs in one year row: its fields added up (the last group is net of other income, never below nothing). */
function groupAmount(id: string, keys: readonly string[], r: YearRecord): number {
  const row = r as unknown as Record<string, unknown>
  const v = (k: string): number => amount(row[k]) ?? 0
  if (id === NET_GROUP) return Math.max(0, v('interest') + v('other') - v('otherIncome'))
  return keys.reduce((t, k) => t + v(k), 0)
}

/** A cost as a share of the year's sales, to four decimals, between 0 and MAX_SHARE. */
function shareOf(cost: number, sales: number): number {
  const frac = Math.min(MAX_SHARE, Math.max(0, cost / sales))
  return Math.round(frac * 10000) / 10000 + 0
}

/**
 * Costs as a share of sales, six stacked series, for the years that have books and some sales. Null below two such
 * years. When older rows have no books the spec says where the cost detail starts. The shares are of the sales the row
 * holds (with the sales tax in them), so the sales tax is a cost here, and a profitable year stacks to less than 100%.
 */
export function costShareSpec(_g: GameState, b: BizState): ChartSpec | null {
  const rows = bookRows(b)
  const usable = rows.filter((p) => hasBooks(p.r) && (amount(p.r.revenue) ?? 0) > 0)
  if (usable.length < 2) return null
  const series: ChartSeries[] = COST_GROUPS.map((c) => ({
    id: c.id,
    label: c.label,
    tone: c.tone,
    values: usable.map((p) => shareOf(groupAmount(c.id, c.keys, p.r), amount(p.r.revenue) ?? 1)),
  }))
  const end = usable.length - 1
  const total = series.reduce((t, s) => t + s.values[end]!, 0)
  const biggest = series.reduce((top, s) => (s.values[end]! > top.values[end]! ? s : top), series[0]!)
  const lacking = rows.some((p) => !hasBooks(p.r))
  const x = usable.map((p) => p.year)
  const summary = `Costs and taxes took ${pctLabel(total)} of sales in ${x[end]}. ${biggest.label} was the biggest at ${pctLabel(biggest.values[end]!)}.`
  return reveal({
    v: 1,
    kind: 'stack',
    title: 'Costs as a share of sales',
    unit: 'pct',
    x,
    series,
    ...(lacking ? { note: fit(`Cost detail starts in ${x[0]}.`, SPEC_LIMITS.note) } : {}),
    summary: fit(summary),
  })
}

// ---------------------------------------------------------------------------
// Cash

/**
 * Where the year's cash went: from the cash at the start of the year (the books close of the year before) to the cash
 * now, the number the report prints as "Company cash". The steps are the net profit, the inflation on idle cash, the
 * change in debt and the year's dividend, each left out when it is nothing, and one Everything else for what is left,
 * so the first total plus every step is the last total exactly. The owner's bonus is already inside the net profit, so
 * it is a mark on that row and not a step. Null with no statement, no books for the year before, or a number that is
 * not a sane size.
 */
export function cashWalkSpec(g: GameState, b: BizState): ChartSpec | null {
  const year = yearOf(b)
  const s = b.last
  if (year === null || !s) return null
  const rows = bookRows(b)
  const prev = rows.find((p) => p.year === year - 1)
  const opening = prev ? amount(prev.r.cash, WALK_BOUND) : null
  const net = amount(s.net, WALK_BOUND)
  const erosion = amount(s.cashErosion, WALK_BOUND)
  const debtNow = amount(b.debt, WALK_BOUND)
  const closing = amount(b.cash, WALK_BOUND)
  if (!prev || opening === null || net === null || erosion === null || debtNow === null || closing === null) return null
  const debtThen = amount(prev.r.debt, WALK_BOUND)
  const debtMove = debtThen === null ? 0 : debtNow - debtThen
  const dividend = readDividend(b.dividend)?.last
  const paid = dividend && dividend.year === year ? amount(dividend.paid, WALK_BOUND) ?? 0 : 0
  const rest = closing - (opening + net - erosion + debtMove - paid)

  const steps: ChartStep[] = [
    { label: 'Cash at the start', value: opening, kind: 'total' },
    { label: 'Net profit', value: net, kind: 'delta' },
  ]
  const add = (label: string, value: number): void => {
    if (value !== 0) steps.push({ label, value, kind: 'delta' })
  }
  add('Inflation on cash', 0 - erosion)
  add('Change in debt', debtMove)
  add('Dividends paid', 0 - paid)
  add('Everything else', rest)
  steps.push({ label: 'Cash now', value: closing, kind: 'total' })

  const draws = amount(rows.find((p) => p.year === year)?.r.draws)
  const marks: ChartMark[] = draws !== null && draws > 0 ? [{ at: 1, label: fit(`Includes your ${moneyLabel(g, draws)} bonus`, SPEC_LIMITS.label) }] : []
  return reveal({
    v: 1,
    kind: 'waterfall',
    title: `Where the cash went, ${year}`,
    unit: 'money',
    x: [],
    series: [],
    steps,
    ...(marks.length > 0 ? { marks } : {}),
    note: WALK_NOTE,
    summary: fit(`Cash went from ${moneyLabel(g, opening)} at the start of ${year} to ${moneyLabel(g, closing)} now.`),
  })
}

/**
 * Cash and debt at each books close, up to thirty years, in the prices of the chart's basis year. When the last row is the
 * statement's year the last point is the live cash and debt, so the chart ends where the tile and the text row end. The
 * debt line is left out when there was never any. Needs two years with books cash.
 */
export function cashLinesSpec(g: GameState, b: BizState): ChartSpec | null {
  const rows = bookRows(b).filter((p) => amount(p.r.cash) !== null)
  if (rows.length < 2) return null
  const end = rows.length - 1
  const live = yearOf(b) === rows[end]!.year
  const liveCash = live ? amount(b.cash) : null
  const liveDebt = live ? amount(b.debt) : null
  const cash = rows.map((p, i) => (i === end && liveCash !== null ? liveCash : amount(p.r.cash)))
  const debt = rows.map((p, i) => (i === end && liveDebt !== null ? liveDebt : amount(p.r.debt)))
  const hasDebt = debt.some((v) => v !== null && v > 0)
  const series: ChartSeries[] = [{ id: 'cash', label: 'Cash', tone: 'c1', values: cash }]
  if (hasDebt) series.push({ id: 'debt', label: 'Debt', tone: 'c2', values: debt })
  const firstAt = cash.findIndex((v) => v !== null)
  let lastAt = end
  while (lastAt > firstAt && cash[lastAt] === null) lastAt--
  const x = rows.map((p) => p.year)
  const lastDebt = debt[end]
  const tail = hasDebt && lastDebt !== null && lastDebt !== undefined ? ` Debt is ${moneyLabel(g, lastDebt)}.` : ''
  const summary = `Cash went from ${moneyLabel(g, cash[firstAt]!)} in ${x[firstAt]} to ${moneyLabel(g, cash[lastAt]!)} in ${x[lastAt]}.${tail}`
  return reveal({ v: 1, kind: 'line', title: 'Cash and debt', unit: 'money', x, series, basis: priceBasisYear(g), summary: fit(summary) })
}

// ---------------------------------------------------------------------------
// KPI tiles

/** 'back in profit', 'into a loss' or the change in dollars. */
function profitNote(g: GameState, prev: number, now: number): string {
  if (prev < 0 && now > 0) return 'back in profit'
  if (prev > 0 && now < 0) return 'into a loss'
  return deltaLabel(g, now - prev)
}

/** 'up 20%', 'down 8%', 'up 3.4%' or 'unchanged'; null when last year sold nothing to compare with. */
function salesNote(prev: number, now: number): string | null {
  if (!(prev > 0)) return null
  const frac = (now - prev) / prev
  if (Math.abs(frac) < 0.0005) return 'unchanged'
  const size = Math.abs(frac)
  // One decimal under 10%, and only when it is not a zero: 'up 3.4%' and 'down 8%'.
  return `${frac > 0 ? 'up' : 'down'} ${pctLabel(size, size < 0.1 ? 1 : 0).replace(/\.0%$/, '%')}`
}

/** One KPI tile: a one-series spec whose last point is the number the tile prints. Null when that number is missing. */
function tile(g: GameState, id: string, label: string, tone: ChartTone, x: number[], values: (number | null)[], lead: (now: number) => string, note: string | null): ChartSpec | null {
  const now = values[values.length - 1]
  if (now === null || now === undefined) return null
  const shown = note === null ? null : fit(note, SPEC_LIMITS.note)
  return reveal({
    v: 1,
    kind: 'kpi',
    title: label,
    unit: 'money',
    x,
    series: [{ id, label, tone, values }],
    basis: priceBasisYear(g),
    ...(shown ? { note: shown } : {}),
    summary: fit(`${lead(now)}${shown ? ` (${shown})` : ''}.`),
  })
}

/** The last two points of a series when both are numbers. */
function lastTwo(values: (number | null)[]): [number, number] | null {
  const prev = values[values.length - 2]
  const now = values[values.length - 1]
  return typeof prev === 'number' && typeof now === 'number' ? [prev, now] : null
}

/**
 * The Annual Report's four tiles: Net profit, Sales, Cash and Value, each the last ten years of the matching field with
 * its last point as the tile's number. Net profit and Sales end at the statement when it is of the last booked year;
 * Cash and Value end at the live cash and valuation. The notes are the change in profit, the change in sales, the debt,
 * and the market rank (when the caller passes a booked market view) or else the owner's stake. A first-year company gets
 * one-point tiles. A tile whose number is missing is left out; no history gives an empty list.
 */
export function companyKpis(g: GameState, b: BizState, view: MarketView | null): ChartSpec[] {
  const rows = bookRows(b).slice(-KPI_YEARS)
  const end = rows.length - 1
  if (end < 0) return []
  const x = rows.map((p) => p.year)
  const s = b.last
  const fresh = !!s && yearOf(b) === rows[end]!.year
  const column = (pick: (r: YearRecord) => unknown, live: unknown): (number | null)[] =>
    rows.map((p, i) => (i === end ? amount(live) ?? amount(pick(p.r)) : amount(pick(p.r))))

  const profit = column((r) => r.profit, fresh ? s!.net : undefined)
  const sales = column((r) => r.revenue, fresh ? s!.revenue : undefined)
  const cash = column((r) => r.cash, b.cash)
  const value = column((r) => r.valuation, b.valuation)
  const year = x[end]!

  const profitPair = lastTwo(profit)
  const salesPair = lastTwo(sales)
  const debt = amount(b.debt) ?? 0
  const ranked = !!view && view.booked === true && Number.isInteger(view.rank) && view.rank >= 1 && Array.isArray(view.rivals)
  const m = (n: number): string => moneyLabel(g, n)

  const out = [
    tile(g, 'net', 'Net profit', 'c1', x, profit, (n) => `Net ${n < 0 ? 'loss' : 'profit'} ${m(Math.abs(n))} in ${year}`, profitPair ? profitNote(g, profitPair[0], profitPair[1]) : null),
    tile(g, 'sales', 'Sales', 'c2', x, sales, (n) => `Sales ${m(n)} in ${year}`, salesPair ? salesNote(salesPair[0], salesPair[1]) : null),
    tile(g, 'cash', 'Cash', 'c3', x, cash, (n) => `Cash ${m(n)} now`, `Debt ${m(debt)}`),
    tile(g, 'value', 'Value', 'c4', x, value, (n) => `Value ${m(n)} now`, ranked ? `#${view.rank} of ${1 + view.rivals.length}` : `Your stake ${m(stakeValue(b))}`),
  ]
  return out.filter((t): t is ChartSpec => t !== null)
}

// ---------------------------------------------------------------------------
// The strip

/**
 * Every booked company the player owns, best net profit first (a tie goes to the name, then the id), at most twelve. A
 * company with no statement is left out. `delta` is against the year before the statement's, `spark` the last eight
 * years of profit, and `managed` is true when a hired CEO runs the company.
 */
export function companyStrip(g: GameState): StripRow[] {
  const out: StripRow[] = []
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    const year = yearOf(b)
    const net = b.last ? amount(b.last.net) : null
    if (year === null || net === null) continue
    const rows = bookRows(b)
    const before = [...rows].reverse().find((p) => p.year < year)
    const prev = before ? amount(before.r.profit) : null
    const spark = rows.slice(-STRIP_SPARK).map((p) => amount(p.r.profit))
    // The statement is the books of record for its own year.
    if (rows.length > 0 && rows[rows.length - 1]!.year === year) spark[spark.length - 1] = net
    out.push({ id: a.id, name: a.name, emoji: a.emoji, net, delta: prev === null ? null : net - prev, spark, managed: !runsIt(g, a) })
  }
  out.sort((p, q) => q.net - p.net || (p.name < q.name ? -1 : p.name > q.name ? 1 : 0) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0))
  return out.slice(0, STRIP_MAX)
}
