// The two saved hedge fund records and their readers. A Personal or Family fund is one Asset that
// carries a HedgeFund in details.hf; a company's cash at work is a CompanyHedge in BizState.hedge.
// Both are plain JSON. Every read of a stored record goes through readHedge or readCompanyHedge: they
// return a clean copy, never throw and never touch what they were given, so a damaged save can lower
// a number but never print money. This file imports nothing at run time, because business/state.ts
// imports it (a value import of fund-state.ts would make a cycle through state.ts).
import type { HedgeStrategy, MacroCall } from './fund-state'

/** The yearly cost of running a fund, as a share of its assets. There is no other fee. */
export const RUNNING_COST = 0.005
/** Most relatives in one family fund. */
export const MAX_HOLDERS = 24
/** The firm's lists, repeated here; a test pins them equal to fund-state.ts. */
export const HEDGE_STRATEGY_IDS: readonly HedgeStrategy[] = ['longShort', 'macro', 'quant', 'event']
export const MACRO_CALL_IDS: readonly MacroCall[] = ['bull', 'bear', 'flat']

/** Money and unit limits. A pool above MONEY_MAX is damage; units are capped so sums stay finite. */
const MONEY_MAX = 1e15
const UNITS_MAX = 1e30
const UNITS_MIN = 1e-6
const MARKS_KEPT = 12
/** Booked years a company keeps: the valuation looks at three. */
const COMPANY_MARKS_KEPT = 3
const WHY_MAX = 80

/** A relative's part of a family fund. */
export interface Holder {
  id: string
  units: number
}

/** One booked year: the fund's net return and the market's. */
export interface HedgeMark {
  y: number
  r: number
  m: number
}

/**
 * A Personal or Family fund. nav is the pool in dollars, units are all the units, mine are the player's
 * (Asset.value is mine at the unit price), cost is the player's cost basis. A family fund's holders are
 * the relatives; units is never below mine plus theirs.
 */
export interface HedgeFund {
  v: 1
  owner: 'person' | 'family'
  countryId: string
  founded: number
  strategy: HedgeStrategy
  call: MacroCall
  /** 1 to 3 in halves. */
  lev: number
  nav: number
  units: number
  mine: number
  cost: number
  holders: Holder[]
  lastYear: number
  last: { year: number; gross: number; net: number; market: number } | null
  marks: HedgeMark[]
}

/** A company's cash at work. The cash stays in BizState.cash; this is the rule and the last result. */
export interface CompanyHedge {
  v: 1
  target: number
  strategy: HedgeStrategy
  call: MacroCall
  lev: number
  total: number
  last?: { year: number; work: number; gross: number; net: number; market: number; pnl: number; why?: string }
  /**
   * What the fund made in each of the last three booked years (y is the fiscal year). The result is
   * cash already, so the valuation takes it out of the earnings it capitalizes (hedgeResultFor).
   */
  marks?: { y: number; pnl: number }[]
}

type Rec = Record<string, unknown>

function plain(v: unknown): Rec | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null
}

function fin(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Rounded, never -0. */
function whole(v: number): number {
  return Math.round(v) || 0
}

function pick<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback
}

/** Dollars: finite, 0 to 1e15, else 0. */
function dollars(v: unknown): number {
  return fin(v) ? clamp(v, 0, MONEY_MAX) : 0
}

/** Leverage: 1 to 3 in halves, else 1. */
function readLev(v: unknown): number {
  return fin(v) ? Math.round(clamp(v, 1, 3) * 2) / 2 : 1
}

/** A calendar year that is a whole number from 1800 to 2300, or null. */
function readYear(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1800 && v <= 2300 ? v : null
}

function readHolders(v: unknown): Holder[] {
  if (!Array.isArray(v)) return []
  const byId = new Map<string, number>()
  for (const item of v) {
    const h = plain(item)
    if (!h || typeof h.id !== 'string' || h.id.length < 1 || h.id.length > 64 || !fin(h.units) || !(h.units > 0)) continue
    const before = byId.get(h.id)
    if (before === undefined && byId.size >= MAX_HOLDERS) continue
    byId.set(h.id, Math.min(UNITS_MAX, (before ?? 0) + h.units))
  }
  return [...byId].map(([id, units]) => ({ id, units }))
}

function readFundLast(v: unknown): HedgeFund['last'] {
  const x = plain(v)
  const year = x ? readYear(x.year) : null
  if (!x || year === null || !fin(x.gross) || !fin(x.net) || !fin(x.market)) return null
  return { year, gross: clamp(x.gross, -1, 10), net: clamp(x.net, -1, 10), market: clamp(x.market, -1, 10) }
}

function readMarks(v: unknown): HedgeMark[] {
  if (!Array.isArray(v)) return []
  const out: HedgeMark[] = []
  for (const item of v) {
    const m = plain(item)
    if (m && fin(m.y) && fin(m.r) && fin(m.m)) out.push({ y: whole(clamp(m.y, -1e5, 1e5)), r: clamp(m.r, -1, 10), m: clamp(m.m, -1, 10) })
  }
  return out.slice(-MARKS_KEPT)
}

/** A clean copy of a stored fund record, or null when it is not one. */
export function readHedge(raw: unknown): HedgeFund | null {
  const x = plain(raw)
  if (!x || x.v !== 1 || (x.owner !== 'person' && x.owner !== 'family')) return null
  const owner = x.owner
  const nav = dollars(x.nav)
  const mine = dollars(x.mine)
  const holders = owner === 'family' ? readHolders(x.holders) : []
  const held = mine + holders.reduce((s, h) => s + h.units, 0)
  // Units never fall below what is held, so damage can lower a price but never raise one.
  const stored = fin(x.units) && x.units > 0 ? Math.min(x.units, UNITS_MAX) : nav > 0 ? nav : 1
  const units = Math.max(stored, held, UNITS_MIN)
  return {
    v: 1,
    owner,
    countryId: typeof x.countryId === 'string' && x.countryId.length >= 1 && x.countryId.length <= 8 ? x.countryId : 'us',
    founded: fin(x.founded) ? whole(clamp(x.founded, 1949, 2300)) : 1949,
    strategy: pick(x.strategy, HEDGE_STRATEGY_IDS, 'longShort'),
    call: pick(x.call, MACRO_CALL_IDS, 'flat'),
    lev: readLev(x.lev),
    nav,
    units,
    mine,
    cost: dollars(x.cost),
    holders,
    lastYear: fin(x.lastYear) ? whole(clamp(x.lastYear, -1, 2300)) : -1,
    last: readFundLast(x.last),
    marks: readMarks(x.marks),
  }
}

function readCompanyLast(v: unknown): CompanyHedge['last'] | undefined {
  const x = plain(v)
  const year = x ? readYear(x.year) : null
  if (!x || year === null || !fin(x.work) || !fin(x.gross) || !fin(x.net) || !fin(x.market) || !fin(x.pnl)) return undefined
  const out: NonNullable<CompanyHedge['last']> = {
    year,
    work: clamp(x.work, 0, MONEY_MAX),
    gross: clamp(x.gross, -1, 10),
    net: clamp(x.net, -1, 10),
    market: clamp(x.market, -1, 10),
    pnl: whole(clamp(x.pnl, -MONEY_MAX, MONEY_MAX)),
  }
  if (typeof x.why === 'string') out.why = x.why.slice(0, WHY_MAX)
  return out
}

/** The booked years, oldest first, one per year (the later entry wins), the last three. */
function readCompanyMarks(v: unknown): NonNullable<CompanyHedge['marks']> {
  if (!Array.isArray(v)) return []
  const byYear = new Map<number, number>()
  for (const item of v) {
    const m = plain(item)
    const y = m ? readYear(m.y) : null
    if (!m || y === null || !fin(m.pnl)) continue
    byYear.set(y, whole(clamp(m.pnl, -MONEY_MAX, MONEY_MAX)))
  }
  return [...byYear].sort((p, q) => p[0] - q[0]).slice(-COMPANY_MARKS_KEPT).map(([y, pnl]) => ({ y, pnl }))
}

/** A clean copy of a company's stored hedge record, or null when it is not one. */
export function readCompanyHedge(raw: unknown): CompanyHedge | null {
  const x = plain(raw)
  if (!x || x.v !== 1) return null
  const last = readCompanyLast(x.last)
  const marks = readCompanyMarks(x.marks)
  return {
    v: 1,
    target: fin(x.target) ? whole(clamp(x.target, 0, MONEY_MAX)) : 0,
    strategy: pick(x.strategy, HEDGE_STRATEGY_IDS, 'longShort'),
    call: pick(x.call, MACRO_CALL_IDS, 'flat'),
    lev: readLev(x.lev),
    total: fin(x.total) ? whole(clamp(x.total, -MONEY_MAX, MONEY_MAX)) : 0,
    ...(last ? { last } : {}),
    ...(marks.length ? { marks } : {}),
  }
}

/**
 * What a company's fund made in fiscal `year`, in dollars (0 when it booked nothing). The valuation
 * subtracts it from that year's profit, the way it subtracts one-off franchise fees: the result is in
 * the company's cash, which it already counts, so capitalizing it as earnings would count it twice.
 */
export function hedgeResultFor(b: { hedge?: unknown }, year: number): number {
  if (!b.hedge) return 0
  return readCompanyHedge(b.hedge)?.marks?.find((m) => m.y === year)?.pnl ?? 0
}

/**
 * How much of a year's recorded profit (after corporate tax) was the company fund's result: the result less
 * the tax it added, or plus the tax it saved. The valuation takes this out of the earnings it capitalizes,
 * the way it takes out one-off franchise fees: the result is in the cash it already counts. The tax is read
 * back from the year's own record, so a year that paid none keeps the whole result. 0 for a year with no result.
 */
export function hedgeProfitIn(b: { hedge?: unknown }, r: { year: number; profit: number; tax: number }): number {
  const pnl = hedgeResultFor(b, r.year)
  if (pnl === 0) return 0
  const pbt = r.profit + r.tax
  if (!Number.isFinite(pbt) || !(r.tax > 0) || !(pbt > 0)) return pnl
  // Tax scales with the profit before tax, so what the year would have paid without the result follows from it.
  return pnl - r.tax * (1 - Math.max(0, pbt - pnl) / pbt)
}

/** For normalizeBiz: the record to keep, or nothing. */
export function companyHedgeField(raw: unknown): { hedge?: CompanyHedge } {
  const hedge = readCompanyHedge(raw)
  return hedge ? { hedge } : {}
}

/** What one unit is worth: the pool over its units, and 1 when there are none. */
export function unitPrice(f: Pick<HedgeFund, 'nav' | 'units'>): number {
  return f.units > 0 ? f.nav / f.units : 1
}

/** What `units` of this fund are worth in dollars. */
export function unitsValue(f: Pick<HedgeFund, 'nav' | 'units'>, units: number): number {
  return units * unitPrice(f)
}
