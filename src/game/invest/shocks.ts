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
import { economyMarketFactor } from '../economy'

export const SHOCKS_KEY = 'marketShocks'
export const BREAKTHROUGHS_KEY = 'marketBreakthroughs'

/** A compact snapshot of the listings actually open when world-changing news broke.
 * Slot generations stop a later replacement/IPO inheriting an old company's repricing. */
export interface MarketBreakthrough {
  id: string; name: string; year: number; mult: number
  exchanges: { key: string; stocks: (number | null)[]; pennies: (number | null)[]; indexId: string; ends?: number }[]
  businesses: string[]
}

const MIN_FACTOR = 1e-12
const MAX_FACTOR = 1e12
const MAX_MARKET_PRICE = 1e15
const MAX_READ_SHOCKS = 2048
const safeYear = (value: number): number => Math.max(-10_000, Math.min(100_000, Math.round(value)))
const safeGeneration = (value: Json): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(1e9, Math.floor(value)) : null
const safeText = (value: Json | undefined, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : ''

export function marketBreakthroughs(g: GameState): MarketBreakthrough[] {
  const raw = g.flags[BREAKTHROUGHS_KEY]
  if (!Array.isArray(raw)) return []
  const out: MarketBreakthrough[] = [], seen = new Set<string>()
  for (const r of raw.slice(-MAX_READ_SHOCKS)) {
    if (!isRecord(r) || !finite(r.year) || !finite(r.mult) || r.mult < 1 || !Array.isArray(r.exchanges)) continue
    const id = safeText(r.id, 120)
    if (!id || seen.has(id)) continue
    const year = safeYear(r.year), exchanges: MarketBreakthrough['exchanges'] = [], exchangeKeys = new Set<string>()
    for (const value of r.exchanges.slice(0, 256)) {
      if (!isRecord(value) || !Array.isArray(value.stocks) || !Array.isArray(value.pennies)) continue
      const key = safeText(value.key, 80)
      if (!key || exchangeKeys.has(key) || !exchangeByKey(key)) continue
      exchangeKeys.add(key)
      exchanges.push({
        key,
        indexId: safeText(value.indexId, 160),
        ends: finite(value.ends) && value.ends > year ? safeYear(value.ends) : 0,
        stocks: value.stocks.slice(0, 256).map(safeGeneration),
        pennies: value.pennies.slice(0, 256).map(safeGeneration),
      })
    }
    const businesses: string[] = [], businessIds = new Set<string>()
    if (Array.isArray(r.businesses)) for (const value of r.businesses.slice(0, 4096)) {
      const assetId = safeText(value, 160)
      if (assetId && !businessIds.has(assetId)) { businessIds.add(assetId); businesses.push(assetId) }
    }
    seen.add(id)
    out.push({ id, name: safeText(r.name, 100) || 'An invention', year, mult: Math.min(100, r.mult), exchanges, businesses })
  }
  return out
}

export function addMarketBreakthrough(g: GameState, event: MarketBreakthrough): boolean {
  const list = marketBreakthroughs(g)
  if (list.some(x => x.id === event.id)) return false
  g.flags[BREAKTHROUGHS_KEY] = [...list, event] as unknown as Json
  return true
}

const cappedFactor = (n: number): number => Math.max(1, Math.min(MAX_FACTOR, Number.isFinite(n) ? n : MAX_FACTOR))
const boundedFactor = (n: number): number => Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, Number.isFinite(n) ? n : 1))
const multiplyFactor = (a: number, b: number): number => {
  const left = boundedFactor(a), right = boundedFactor(b)
  if (left >= MAX_FACTOR / right) return MAX_FACTOR
  if (left <= MIN_FACTOR / right) return MIN_FACTOR
  return boundedFactor(left * right)
}

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

/** Every shock on record (read-only; safe in menus). */
export function marketShocks(g: GameState): MarketShock[] {
  const raw = g.flags[SHOCKS_KEY]
  if (!Array.isArray(raw)) return []
  const out: MarketShock[] = [], seen = new Set<string>()
  for (const value of raw.slice(-MAX_READ_SHOCKS)) {
    if (!isRecord(value) || (value.asset !== 'stock' && value.asset !== 'coin') || !SHOCK_CAUSES.includes(value.cause as ShockCause) || !finite(value.slot) || !finite(value.year) || !finite(value.mult) || value.mult <= 0 || !finite(value.fade)) continue
    const id = safeText(value.id, 160), secId = safeText(value.secId, 160), exKey = safeText(value.exKey, 80)
    if (!id || !secId || !exKey || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      asset: value.asset,
      secId,
      exKey,
      slot: Math.max(0, Math.min(255, Math.floor(value.slot))),
      name: safeText(value.name, 100) || 'Unknown security',
      symbol: safeText(value.symbol, 20) || '?',
      cause: value.cause as ShockCause,
      year: safeYear(value.year),
      mult: boundedFactor(value.mult),
      fade: Math.max(0, Math.min(1, value.fade)),
      countryId: safeText(value.countryId, 80),
    })
  }
  return out
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
  const secId = typeof s.secId === 'string' ? s.secId.trim().slice(0, 160) : ''
  const year = Number.isFinite(s.year) ? safeYear(s.year) : safeYear(g.year)
  // One order-flow record per listing per year, so repeated trades don't bloat saves.
  const prior = s.cause === 'liquidity' ? list.find(x => x.cause === 'liquidity' && x.secId === secId && x.year === year) : undefined
  if (prior) {
    prior.mult = multiplyFactor(prior.mult, s.mult)
    g.flags[SHOCKS_KEY] = list as unknown as Json
    return prior
  }
  const cause = SHOCK_CAUSES.includes(s.cause) ? s.cause : 'liquidity'
  const asset = s.asset === 'coin' ? 'coin' : 'stock'
  const shock: MarketShock = {
    asset,
    secId,
    exKey: typeof s.exKey === 'string' ? s.exKey.trim().slice(0, 80) : '',
    slot: Number.isFinite(s.slot) ? Math.max(0, Math.min(255, Math.floor(s.slot))) : 0,
    name: typeof s.name === 'string' ? s.name.trim().slice(0, 100) || 'Unknown security' : 'Unknown security',
    symbol: typeof s.symbol === 'string' ? s.symbol.trim().slice(0, 20) || '?' : '?',
    cause,
    year,
    countryId: typeof s.countryId === 'string' ? s.countryId.trim().slice(0, 80) : '',
    id: `shock${year}-${list.length}-${secId}`,
    // A damaging story never sticks to a real company: it has no effect on its price.
    mult: !shockable(secId, asset, cause) ? 1 : Math.max(cause === 'liquidity' ? MIN_FACTOR : .05, Math.min(cause === 'liquidity' ? MAX_FACTOR : 5, Number.isFinite(s.mult) ? s.mult : 1)),
    fade: Math.max(0, Math.min(1, Number.isFinite(s.fade) ? s.fade : 0)),
  }
  list.push(shock)
  g.flags[SHOCKS_KEY] = list as unknown as Json
  return shock
}

/** One shock's price factor in a calendar year (1 = no effect). */
export function factorOf(s: MarketShock, year: number): number {
  if (!Number.isFinite(year) || !Number.isFinite(s.year) || year < s.year) return 1
  const fadeYears = Math.max(0, Math.min(1e6, safeYear(year) - safeYear(s.year) - 1))
  const mult = boundedFactor(s.mult), fade = Math.max(0, Math.min(1, Number.isFinite(s.fade) ? s.fade : 0))
  return boundedFactor(1 + (mult - 1) * Math.pow(1 - fade, fadeYears))
}

/** Combined price factor of every shock on one security in a year (1 = untouched). */
export function shockFactor(g: GameState, secId: string, year: number): number {
  const exchange = exchangeByKey(secId.split('#')[0])
  let f = boundedFactor(breakthroughStockFactor(g, secId, year) * (exchange ? economyMarketFactor(g, exchange.home, year) : 1))
  for (const s of marketShocks(g)) if (s.secId === secId) f = multiplyFactor(f, factorOf(s, year))
  return f
}

/**
 * Factor on an exchange's index (and its index fund): each listed company is an equal slice, so
 * a company that loses half its value drags the index down by half its weight.
 */
export function indexShockFactor(g: GameState, exKey: string, year: number, indexId = `${exKey}#fund`): number {
  // An index tracks company fundamentals/news, not the player's temporary execution
  // pressure in a single order book. Otherwise a tiny stock order pumps an unlimited fund.
  const list = marketShocks(g).filter((s) => s.asset === 'stock' && s.exKey === exKey && s.cause !== 'liquidity')
  const exchange = exchangeByKey(exKey)
  const breakthrough = breakthroughIndexFactor(g, exKey, year, indexId) * (exchange ? economyMarketFactor(g, exchange.home, year) : 1)
  if (!list.length) return breakthrough
  const info = exchangeByKey(exKey)
  const n = Math.max(4, info ? slotPlan(info).length : 10)
  const companies = new Map<string, number>()
  for (const s of list) companies.set(s.secId, multiplyFactor(companies.get(s.secId) ?? 1, factorOf(s, year)))
  let sum = 0
  for (const factor of companies.values()) sum = Math.min(MAX_FACTOR, sum + factor - 1)
  return multiplyFactor(breakthrough, Math.max(0.5, Math.min(1.5, 1 + sum / n)))
}

/** Adjust an engine price and its yearly change for a factor (this year vs last year). */
export function shockedMove(price: number, ret: number | null, now: number, before: number): { price: number; ret: number | null } {
  const basePrice = Number.isFinite(price) && price > 0 ? Math.min(MAX_MARKET_PRICE, price) : 0
  const current = boundedFactor(now), prior = boundedFactor(before)
  const p = Math.min(MAX_MARKET_PRICE, basePrice * Math.min(MAX_FACTOR, current))
  if (ret === null || !Number.isFinite(ret)) return { price: p, ret: null }
  const raw = (1 + Math.max(-1, Math.min(MAX_FACTOR - 1, ret))) * Math.min(MAX_FACTOR, current / prior) - 1
  return { price: p, ret: Number.isFinite(raw) ? Math.max(-1, Math.min(MAX_FACTOR - 1, raw)) : MAX_FACTOR - 1 }
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
