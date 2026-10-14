// The manager's mandate and the yearly plan (pure). A mandate is three dials the player sets: the share of the
// money in stock funds, the cash to keep in the bank, and the most of the pool that may change hands in a year.
// `planYear` turns the managed book (investments.ts) into the orders for one year. It reads nothing but its
// arguments, writes nothing and never touches g.rng, so the Money Team menu previews the same plan the
// yearly step then runs. Skill is execution, not returns: it sets the drift band, the slippage and the odds of
// a blunder. Every function is total: a bad number reads as the nearest legal one.
import type { ManagedBook, MandateBucket } from '../investments'

/** Tuning for how well a manager works. The skill formulas below are the only readers. */
export const PLAN = { bandBase: 3, bandPerPoint: 0.1, slipPerPoint: 0.00005, blunderMax: 0.12, swing: 25, dust: 0.005 } as const

/** stocks 0 to 100 in fives, reserve in dollars, limit 10 to 100 (a percent of the pool that may move a year). */
export interface Mandate {
  stocks: number
  reserve: number
  limit: number
}

export interface Order {
  bucket: MandateBucket
  side: 'buy' | 'sell'
  dollars: number
}

export interface Plan {
  /** Sells first, then buys. Each bucket appears at most once a side. */
  orders: Order[]
  /** Fund, bonds and savings values plus the cash above the reserve. */
  pool: number
  /** The cash above the reserve that is free to invest (0 when nothing can be traded). */
  spare: number
  /** The share of the pool aimed at stock funds, 0 to 1, after the tilt and the closed doors. */
  target: number
  /** Dollars the orders move: buys plus sells. */
  moved: number
  /** What the limit holds back: the moved dollars with no limit, less `moved`. */
  held: number
  /** Why there is nothing to do, when that is the book's doing (null otherwise). */
  note: string | null
}

/** Largest money figure the planner works with, the same ceiling the engine puts on a holding. */
const CEILING = 1e15

/** A money figure as a finite number from 0 to the ceiling (bad numbers read as 0, huge ones as the ceiling). */
function money(x: unknown): number {
  return typeof x === 'number' && x > 0 ? Math.min(x, CEILING) : 0
}

/** Clamp without turning a bad number into NaN: anything that is not a number reads as `fallback`. */
function within(x: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof x !== 'number' || Number.isNaN(x)) return fallback
  return Math.min(hi, Math.max(lo, x))
}

/** A skill that is not finite reads as 50, then is clamped to 0 to 100. */
function skillOf(skill: unknown): number {
  return typeof skill === 'number' && Number.isFinite(skill) ? Math.min(100, Math.max(0, skill)) : 50
}

/** Cash above the reserve, whole dollars. */
function spareOf(book: ManagedBook, reserve: unknown): number {
  return Math.max(0, Math.floor(money(book.cash) - money(reserve)))
}

/** Fund + bonds + savings + the cash above the reserve. */
export function poolOf(book: ManagedBook, reserve: number): number {
  return money(book.stocks.value) + money(book.bonds.value) + money(book.savings.value) + spareOf(book, reserve)
}

/** Where safe money goes: bonds when open and clearly better than savings (or savings is shut), else savings. */
export function safeBucket(book: ManagedBook): 'bonds' | 'savings' | null {
  const bondsOpen = !book.bonds.buyBlock
  const savingsOpen = !book.savings.buyBlock
  if (bondsOpen && (!savingsOpen || book.bonds.yield > book.savings.yield + 0.005)) return 'bonds'
  return savingsOpen ? 'savings' : null
}

/** The drift a manager tolerates before selling, as a share of the pool: wider for a weaker manager. */
export function bandOf(skill: number): number {
  return (PLAN.bandBase + (100 - skillOf(skill)) * PLAN.bandPerPoint) / 100
}

/** What trading costs a weaker manager, as a share of the money moved. */
export function slipRate(skill: number): number {
  return (100 - skillOf(skill)) * PLAN.slipPerPoint
}

/** The yearly chance of a blunder: 0 for a perfect manager, 12% for the worst. */
export function blunderOdds(skill: number): number {
  return (PLAN.blunderMax * (100 - skillOf(skill))) / 100
}

function plainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Round to a multiple of five inside a range. NaN and non-numbers read as the default. */
function snap(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(v / 5) * 5))
}

/** The mandate a record holds, as the nearest legal one. Null unless it is a plain object. */
export function readMandate(v: unknown): Mandate | null {
  if (!plainObject(v)) return null
  const reserve = v.reserve
  return {
    stocks: snap(v.stocks, 0, 100, 60),
    reserve: typeof reserve === 'number' && !Number.isNaN(reserve) ? Math.min(CEILING, Math.max(0, Math.round(reserve))) : 0,
    limit: snap(v.limit, 10, 100, 50),
  }
}

/** Up to two significant digits, rounded up (so a floor such as twice the income is never undercut). */
function niceRound(x: number): number {
  if (!(x > 0)) return 0
  let unit = 1
  while (x / unit >= 100) unit *= 10
  return Math.min(CEILING, Math.ceil(x / unit) * unit)
}

/** 60% stocks, a yearly limit of 50, and a reserve of two years of typical income or a tenth of the money, whichever is more. */
export function defaultMandate(book: ManagedBook, income: number): Mandate {
  const holdings = money(book.stocks.value) + money(book.bonds.value) + money(book.savings.value)
  const tenth = (money(book.cash) + holdings) / 10
  return { stocks: 60, reserve: niceRound(Math.max(2 * money(income), tenth)), limit: 50 }
}

const SELL_ORDER: readonly MandateBucket[] = ['stocks', 'savings', 'bonds']
const BUY_ORDER: readonly MandateBucket[] = ['stocks', 'bonds', 'savings']

function zero(): Record<MandateBucket, number> {
  return { stocks: 0, bonds: 0, savings: 0 }
}

/** Everything the plan reads, worked out once. */
interface Frame {
  S: number
  B: number
  V: number
  spare: number
  pool: number
  minOrder: number
  fundOpen: boolean
  fundSellable: boolean
  savingsSellable: boolean
  bondsSellable: boolean
  safe: 'bonds' | 'savings' | null
  targetS: number
  targetSafe: number
  safeNow: number
  band: number
}

/** Orders for a given cap on the money that may change hands (Infinity for none). */
function build(f: Frame, cap: number): Order[] {
  const buy = zero()
  const sell = zero()

  // 1. Spare cash goes to the deficits, in proportion.
  const needS = f.fundOpen ? Math.max(0, f.targetS - f.S) : 0
  const needSafe = f.safe ? Math.max(0, f.targetSafe - f.safeNow) : 0
  const need = needS + needSafe
  const invest = Math.max(0, Math.min(f.spare, cap, need))
  let buyS = 0
  let buySafe = invest
  if (needSafe <= 0) {
    buyS = invest
    buySafe = 0
  } else if (needS > 0) {
    buyS = (invest * needS) / need
    buySafe = invest - buyS
  }
  buy.stocks += Math.floor(buyS)
  if (f.safe) buy[f.safe] += Math.floor(buySafe)
  let used = invest

  // 2. Drift past the band is sold from the heavy side and bought on the other.
  const overweight = f.S - f.targetS
  if (f.safe && overweight > f.band && f.fundSellable) {
    const x = Math.min(overweight, (cap - used) / 2)
    if (x > 0) {
      sell.stocks += Math.floor(x)
      buy[f.safe] += Math.floor(x)
      used += 2 * x
    }
  } else if (f.fundOpen && f.safeNow - f.targetSafe > f.band) {
    const fromSavings = f.savingsSellable ? f.V : 0
    const fromBonds = f.bondsSellable ? f.B : 0
    const x = Math.min(f.safeNow - f.targetSafe, fromSavings + fromBonds, (cap - used) / 2)
    if (x > 0) {
      const a = Math.floor(Math.min(x, fromSavings))
      const b = Math.floor(Math.min(x - Math.min(x, fromSavings), fromBonds))
      sell.savings += a
      sell.bonds += b
      buy.stocks += a + b
      used += 2 * x
    }
  }

  // 3. Whole dollars, no dust, and nothing bought that the sales and the spare cash do not pay for.
  const floor = Math.max(1, f.minOrder, PLAN.dust * f.pool)
  const sells: Order[] = SELL_ORDER.filter((b) => sell[b] >= floor).map((bucket) => ({ bucket, side: 'sell', dollars: sell[bucket] }))
  const buys: Order[] = BUY_ORDER.filter((b) => buy[b] >= floor).map((bucket) => ({ bucket, side: 'buy', dollars: buy[bucket] }))
  let excess = buys.reduce((s, o) => s + o.dollars, 0) - (f.spare + sells.reduce((s, o) => s + o.dollars, 0))
  while (excess > 0) {
    const biggest = buys.reduce<Order | null>((best, o) => (!best || o.dollars > best.dollars ? o : best), null)
    if (!biggest || biggest.dollars <= 0) break
    const cut = Math.min(excess, biggest.dollars)
    biggest.dollars -= cut
    excess -= cut
  }
  return [...sells, ...buys.filter((o) => o.dollars >= floor)]
}

function moved(orders: Order[]): number {
  return orders.reduce((s, o) => s + o.dollars, 0)
}

/**
 * The year's orders for a managed book. `tilt` shifts the target for a blunder (a manager who mixed up the mix).
 * Pure: the same arguments give the same plan, and nothing passed in is changed.
 */
export function planYear(book: ManagedBook, m: Mandate, skill: number, tilt = 0): Plan {
  const s = skillOf(skill)
  const reserve = money(m?.reserve)
  const limit = within(m?.limit, 0, 100, 50)
  const pct = within(within(m?.stocks, 0, 100, 60) + within(tilt, -100, 100, 0), 0, 100, 60)

  const idle = book.idle ? book.idle : null
  const S = money(book.stocks.value)
  const B = money(book.bonds.value)
  const V = money(book.savings.value)
  const spare = idle ? 0 : spareOf(book, reserve)
  const pool = S + B + V + spare
  const minOrder = money(book.minOrder)
  const fundOpen = !book.stocks.buyBlock
  const safe = safeBucket(book)

  // The target: nothing in a fund that is shut, everything in one when there is no safe door.
  const target = !safe ? 1 : !fundOpen ? 0 : pct / 100
  const nothing = (note: string | null): Plan => ({ orders: [], pool, spare, target, moved: 0, held: 0, note })
  if (idle) return nothing(idle)
  if (pool < Math.max(1, minOrder)) return nothing('Nothing to run yet.')
  if (!fundOpen && !safe) return nothing('Nothing can be bought right now.')

  const targetS = !safe ? pool : !fundOpen ? 0 : (pool * pct) / 100
  const f: Frame = {
    S,
    B,
    V,
    spare,
    pool,
    minOrder,
    fundOpen,
    fundSellable: !book.stocks.sellBlock,
    savingsSellable: !book.savings.sellBlock,
    bondsSellable: !book.bonds.sellBlock,
    safe,
    targetS,
    targetSafe: pool - targetS,
    safeNow: B + V,
    band: bandOf(s) * pool,
  }
  const orders = build(f, (limit * pool) / 100)
  const total = moved(orders)
  return { orders, pool, spare, target, moved: total, held: Math.max(0, moved(build(f, Infinity)) - total), note: null }
}
