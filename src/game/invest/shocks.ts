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
import type { BizState } from '../business/state'
import { exchangeByKey, exchangeInfo, isRealSecId, slotPlan } from './engine'

export const SHOCKS_KEY = 'marketShocks'
export const BREAKTHROUGHS_KEY = 'marketBreakthroughs'

/** A compact snapshot of the listings actually open when world-changing news broke.
 * Slot generations stop a later replacement/IPO inheriting an old company's repricing. */
export interface MarketBreakthrough {
  id: string; name: string; year: number; mult: number
  exchanges: { key: string; stocks: (number | null)[]; pennies: (number | null)[]; indexId: string; ends?: number }[]
  businesses: string[]
}

export function marketBreakthroughs(g: GameState): MarketBreakthrough[] {
  const raw = g.flags[BREAKTHROUGHS_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).filter(r => typeof r.id === 'string' && r.id && finite(r.year) && finite(r.mult) && r.mult >= 1 && Array.isArray(r.exchanges)).map(r => ({
    id: String(r.id), name: typeof r.name === 'string' ? r.name.slice(0, 100) : 'An invention', year: r.year as number, mult: Math.min(100, r.mult as number),
    exchanges: (r.exchanges as Json[]).filter(isRecord).filter(x => typeof x.key === 'string' && !!exchangeByKey(x.key) && Array.isArray(x.stocks) && Array.isArray(x.pennies)).map(x => ({
      key: String(x.key), indexId: typeof x.indexId === 'string' ? x.indexId : '', ends: typeof x.ends === 'number' && Number.isFinite(x.ends) && x.ends > (r.year as number) ? x.ends : 0,
      stocks: (x.stocks as Json[]).slice(0, 256).map(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null),
      pennies: (x.pennies as Json[]).slice(0, 256).map(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null),
    })), businesses: Array.isArray(r.businesses) ? r.businesses.filter((x): x is string => typeof x === 'string').slice(0, 4096) : [],
  }))
}

export function addMarketBreakthrough(g: GameState, event: MarketBreakthrough): boolean {
  const list = marketBreakthroughs(g)
  if (list.some(x => x.id === event.id)) return false
  g.flags[BREAKTHROUGHS_KEY] = [...list, event] as unknown as Json
  return true
}

const cappedFactor = (n: number): number => Math.max(1, Math.min(1e12, Number.isFinite(n) ? n : 1e12))

export function breakthroughStockFactor(g: GameState, secId: string, year: number): number {
  const match = /^(.*)#([sp])(\d+)g(\d+)$/.exec(secId)
  if (!match || !Number.isFinite(year)) return 1
  let factor = 1
  for (const event of marketBreakthroughs(g)) {
    if (event.year > year) continue
    const ex = event.exchanges.find(x => x.key === match[1])
    const generations = match[2] === 'p' ? ex?.pennies : ex?.stocks
    if ((!ex?.ends || year < ex.ends) && generations?.[Number(match[3])] === Number(match[4])) factor = cappedFactor(factor * event.mult)
  }
  return factor
}

/** Explicit index identity avoids exporting a repricing to an exchange that opens later. */
export function breakthroughIndexFactor(g: GameState, exKey: string, year: number, indexId = `${exKey}#fund`): number {
  let factor = 1
  for (const event of marketBreakthroughs(g)) if (event.year <= year) {
    const ex = event.exchanges.find(x => x.key === exKey)
    if (ex?.indexId && ex.indexId === indexId && (!ex.ends || year < ex.ends)) factor = cappedFactor(factor * event.mult)
  }
  return factor
}

/** Only companies already public when announced participate; future IPOs cannot replay news. */
export function publicBusinessShockFactor(g: GameState, b: BizState, year: number): number {
  const a = g.assets.find(x => x.kind === 'business' && x.details === b as unknown as Record<string, Json>)
  if (!a) return 1
  let factor = 1
  for (const event of marketBreakthroughs(g)) if (event.year <= year && event.businesses.includes(a.id)) {
    const ex = event.exchanges.find(x => x.key === exchangeInfo(b.countryId).key)
    if (ex && (!ex.ends || year < ex.ends)) factor = cappedFactor(factor * event.mult)
  }
  return factor
}

export type ShockCause = 'ban' | 'probe' | 'nationalize' | 'contract' | 'deregulate' | 'endorse' | 'liquidity'

export const SHOCK_CAUSES: ShockCause[] = ['ban', 'probe', 'nationalize', 'contract', 'deregulate', 'endorse', 'liquidity']

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
  // One order-flow record per listing per year, so repeated trades don't bloat saves.
  const prior = s.cause === 'liquidity' ? list.find(x => x.cause === 'liquidity' && x.secId === s.secId && x.year === s.year) : undefined
  if (prior) {
    prior.mult = Math.max(1e-12, Math.min(1e12, prior.mult * s.mult))
    g.flags[SHOCKS_KEY] = list as unknown as Json
    return prior
  }
  const shock: MarketShock = {
    ...s,
    id: `shock${g.year}-${list.length}-${s.secId}`,
    // A damaging story never sticks to a real company: it has no effect on its price.
    mult: !shockable(s.secId, s.asset, s.cause) ? 1 : Math.max(s.cause === 'liquidity' ? 1e-12 : .05, Math.min(s.cause === 'liquidity' ? 1e12 : 5, Number.isFinite(s.mult) ? s.mult : 1)),
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
  let f = breakthroughStockFactor(g, secId, year)
  for (const s of marketShocks(g)) if (s.secId === secId) f *= factorOf(s, year)
  return Number.isFinite(f) && f > 0 ? f : 1
}

/**
 * Factor on an exchange's index (and its index fund): each listed company is an equal slice, so
 * a company that loses half its value drags the index down by half its weight.
 */
export function indexShockFactor(g: GameState, exKey: string, year: number, indexId = `${exKey}#fund`): number {
  // An index tracks company fundamentals/news, not the player's temporary execution
  // pressure in a single order book. Otherwise a tiny stock order pumps an unlimited fund.
  const list = marketShocks(g).filter((s) => s.asset === 'stock' && s.exKey === exKey && s.cause !== 'liquidity')
  const breakthrough = breakthroughIndexFactor(g, exKey, year, indexId)
  if (!list.length) return breakthrough
  const info = exchangeByKey(exKey)
  const n = Math.max(4, info ? slotPlan(info).length : 10)
  const companies = new Map<string, number>()
  for (const s of list) companies.set(s.secId, (companies.get(s.secId) ?? 1) * factorOf(s, year))
  let sum = 0
  for (const factor of companies.values()) sum += factor - 1
  return breakthrough * Math.max(0.5, Math.min(1.5, 1 + sum / n))
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
    .filter((s) => (s.cause === 'liquidity' || Math.abs(factorOf(s, g.year) - 1) >= 0.005) && alive(s))
  // Even a tiny permanent order-flow adjustment is part of today's quote. Discarding it
  // next year would manufacture a predictable rebound. Political-news storage stays bounded.
  const news = keep.filter(s => s.cause !== 'liquidity').slice(-MAX_SHOCKS)
  const orders = keep.filter(s => s.cause === 'liquidity')
  if (keep.length) g.flags[SHOCKS_KEY] = [...news, ...orders] as unknown as Json
  else delete g.flags[SHOCKS_KEY]
}
