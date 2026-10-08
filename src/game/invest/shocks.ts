// Market shocks: news that really moves one security's price, on top of the deterministic market
// engine. A head of government bans a company, a governor hands it a fat state contract, a
// president "endorses" a coin... Each shock is plain JSON in g.flags.marketShocks and is applied
// wherever prices are read: the Investments menu (listings, holdings, the yearly move, the index
// fund of that exchange) and single-stock options / coin shorts (computer/money-stocks.ts), so the
// player's own portfolio and every other holding on that market feel it too.
//
// A shock moves the price at once (the year it is announced) and stays: the market prices the news
// in on the day, and the company's own ups and downs carry on from there. (A shock may fade, but
// a scheduled fade is a predictable rebound anyone could buy into the year after, so the
// announcements in special/politics.ts never fade.) Nothing here touches g.rng.
import type { GameState, Json } from '../types'
import { exchangeByKey, isRealSecId, slotPlan } from './engine'

export const SHOCKS_KEY = 'marketShocks'

export type ShockCause = 'ban' | 'probe' | 'nationalize' | 'contract' | 'deregulate' | 'endorse'

export const SHOCK_CAUSES: ShockCause[] = ['ban', 'probe', 'nationalize', 'contract', 'deregulate', 'endorse']

export interface MarketShock {
  id: string
  /** A listed company (by exchange slot) or a cryptocurrency (by coin slot). */
  asset: 'stock' | 'coin'
  /** Security id (invest/engine companyDef / coinDef): the shock ends with that listing. */
  secId: string
  /** Exchange key for stocks, 'crypto' for coins. */
  exKey: string
  slot: number
  name: string
  symbol: string
  cause: ShockCause
  /** Calendar year of the announcement: the price moves at once. */
  year: number
  /** Price multiplier at the announcement (0.45 = -55%, 1.5 = +50%). */
  mult: number
  /** Share of the move that fades each year after the year-end following the announcement (0 = permanent). */
  fade: number
  /** Country whose government made the announcement. */
  countryId: string
}

// ---------------------------------------------------------------------------
// Reading and writing (plain JSON, validated so old or hand-edited saves can't break prices)

function isRecord(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function finite(v: Json | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function valid(v: Json): boolean {
  if (!isRecord(v)) return false
  return (
    typeof v.id === 'string' &&
    (v.asset === 'stock' || v.asset === 'coin') &&
    typeof v.secId === 'string' &&
    typeof v.exKey === 'string' &&
    finite(v.slot) &&
    typeof v.name === 'string' &&
    typeof v.symbol === 'string' &&
    SHOCK_CAUSES.includes(v.cause as ShockCause) &&
    finite(v.year) &&
    finite(v.mult) &&
    v.mult > 0 &&
    finite(v.fade) &&
    typeof v.countryId === 'string'
  )
}

/** Every shock on record (read-only; safe in menus). */
export function marketShocks(g: GameState): MarketShock[] {
  const raw = g.flags[SHOCKS_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(valid) as unknown as MarketShock[]
}

/** The causes that hurt a company's price (a ban, an investigation, a nationalization). */
export function isNegativeCause(cause: ShockCause): boolean {
  return cause === 'ban' || cause === 'probe' || cause === 'nationalize'
}

/**
 * True when a made-up political decision may hit this security. Real companies of the registry are
 * never banned, probed or nationalized by invented news (their real ups and downs are the market's
 * own); made-up companies and coins take the whole blow.
 */
export function shockable(secId: string, asset: 'stock' | 'coin', cause: ShockCause): boolean {
  return !(asset === 'stock' && isRealSecId(secId) && isNegativeCause(cause))
}

/** Record a shock (the price moves at once). Returns it. */
export function addMarketShock(g: GameState, s: Omit<MarketShock, 'id'>): MarketShock {
  const list = marketShocks(g)
  const shock: MarketShock = {
    ...s,
    id: `shock${g.year}-${list.length}-${s.secId}`,
    // A damaging story never sticks to a real company: it has no effect on its price.
    mult: !shockable(s.secId, s.asset, s.cause) ? 1 : Math.max(0.05, Math.min(5, Number.isFinite(s.mult) ? s.mult : 1)),
    fade: Math.max(0, Math.min(1, Number.isFinite(s.fade) ? s.fade : 0)),
  }
  list.push(shock)
  g.flags[SHOCKS_KEY] = list as unknown as Json
  return shock
}

/** One shock's price factor in a calendar year (1 = no effect). */
export function factorOf(s: MarketShock, year: number): number {
  if (!Number.isFinite(year) || year < s.year) return 1
  const fadeYears = Math.max(0, year - s.year - 1)
  return 1 + (s.mult - 1) * Math.pow(1 - s.fade, fadeYears)
}

/** Combined price factor of every shock on one security in a year (1 = untouched). */
export function shockFactor(g: GameState, secId: string, year: number): number {
  let f = 1
  for (const s of marketShocks(g)) if (s.secId === secId) f *= factorOf(s, year)
  return Number.isFinite(f) && f > 0 ? f : 1
}

/**
 * Factor on an exchange's index (and its index fund): each listed company is an equal slice, so
 * a company that loses half its value drags the index down by half its weight.
 */
export function indexShockFactor(g: GameState, exKey: string, year: number): number {
  const list = marketShocks(g).filter((s) => s.asset === 'stock' && s.exKey === exKey)
  if (!list.length) return 1
  const info = exchangeByKey(exKey)
  const n = Math.max(4, info ? slotPlan(info).length : 10)
  let sum = 0
  for (const s of list) sum += factorOf(s, year) - 1
  return Math.max(0.5, Math.min(1.5, 1 + sum / n))
}

/** Adjust an engine price and its yearly change for a factor (this year vs last year). */
export function shockedMove(price: number, ret: number | null, now: number, before: number): { price: number; ret: number | null } {
  const p = Number.isFinite(price) ? price * now : price
  if (ret === null || !Number.isFinite(ret)) return { price: p, ret }
  const r = (1 + ret) * (now / (before > 0 ? before : 1)) - 1
  return { price: p, ret: Math.max(-1, r) }
}

/** Shocks announced this year (for the financial news). */
export function shocksThisYear(g: GameState): MarketShock[] {
  return marketShocks(g).filter((s) => s.year === g.year)
}

/** Most shocks kept on record (one announcement a year at most, so a lifetime fits easily). */
const MAX_SHOCKS = 60

/**
 * Drop shocks that have faded out, or whose listing has been replaced (bankrupt / bought out).
 * `alive(s)` says whether the shocked security still trades. Keeps the save small. Permanent
 * shocks stay as long as their company or coin trades (dropping one would snap its price back).
 */
export function pruneMarketShocks(g: GameState, alive: (s: MarketShock) => boolean): void {
  const raw = g.flags[SHOCKS_KEY]
  if (raw === undefined) return
  const keep = marketShocks(g)
    .filter((s) => Math.abs(factorOf(s, g.year) - 1) >= 0.005 && alive(s))
    .slice(-MAX_SHOCKS)
  if (keep.length) g.flags[SHOCKS_KEY] = keep as unknown as Json
  else delete g.flags[SHOCKS_KEY]
}
