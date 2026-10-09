// Economic history: how markets, inflation, interest rates and business cycles really moved in
// each year and region (1929, the 1970s oil shocks, 1987, Japan's 1990 bust, 1997 Asia, the
// dot-com crash, 2008, the euro crisis, 2020...). invest/engine.ts, investments.ts, finance.ts
// and business/economy.ts cycleOf read it so a life lived through history feels it.
//
// Everything here is a pure function of (country, year): no game state, no RNG. Years from
// PRESENT_YEAR on return null (the procedural future takes over), so a life born today plays
// exactly as before. Returns are REAL (inflation-adjusted), because engine money is constant
// PRESENT_YEAR dollars; inflation and rates are the nominal figures of the day, for display and
// for turning nominal interest into real returns.
//
// Data: history/markets-us.ts (the US, year by year), markets-major.ts (the big markets),
// markets-world.ts (proxies, events and the rules of each era), markets-assets.ts (gold, oil,
// crypto). Countries without a hand-written series follow their region's real returns through a
// beta plus deterministic local noise, with the famous local events written in by hand.
import { exchangeFor, marketOf } from '../data/markets'
import { COUNTRIES, getCountry } from '../world'
import { COIN_HISTORY, CRYPTO_FROM, GOLD_FROM, GOLD_NOMINAL, OIL_ANCHORS } from './markets-assets'
import { ECB_RATES, EURO_FROM, MAJOR_MARKETS, type CountryHistory, type EquitySegment } from './markets-major'
import { US_FROM, US_HOUSING_REAL, US_MORTGAGE_ANCHORS, US_POLICY_RATE, US_SECTOR_NOMINAL, US_STOCKS_NOMINAL } from './markets-us'
import {
  BANK_CRISES,
  BLOCKED_INVESTING,
  CYCLE_EVENTS,
  DEFAULTS,
  DEPOSIT_INSURANCE_FROM,
  EQUITY_EVENTS,
  EXCHANGE_RULES,
  GOLD_BANS,
  HOUSING_EVENTS,
  INFLATION_EVENTS,
  LOCAL_NOTES,
  LOCAL_SECTOR_EVENTS,
  US_DEPOSIT_LIMITS,
  WORLD_NOTES,
} from './markets-world'
import { HISTORY_START, PRESENT_YEAR, priceLevel, usInflation } from './timeline'

export interface MarketYear {
  /** Real (inflation-adjusted) total return of the country's stock index that year, e.g. -0.38. */
  index?: number
  crash?: boolean
  boom?: boolean
  /** Real returns of specific sectors (invest/engine.ts SectorId keys), e.g. { tech: -0.6 }. */
  sectors?: Partial<Record<string, number>>
  /** Real return of crypto that year (null before crypto existed). */
  crypto?: number | null
  gold?: number
  housing?: number
  /** Local consumer inflation that year. */
  inflation?: number
  /** Central bank policy rate that year. */
  rate?: number
  /** Short note for the news, e.g. 'The dot-com bubble bursts.' */
  note?: string
}

// ---------------------------------------------------------------------------
// Small helpers

const LAST = PRESENT_YEAR - 1
const SPAN = LAST - HISTORY_START + 1

/** True for years this module has real history for. */
export function inHistory(year: number): boolean {
  return Number.isFinite(year) && Math.round(year) >= HISTORY_START && Math.round(year) <= LAST
}

function clampN(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
}

function safeLog(r: number): number {
  return Math.log(Math.max(0.02, 1 + r))
}

/** Deterministic standard-normal noise for (key, year): no game RNG involved. */
function noise(key: string, year: number): number {
  let h = 2166136261
  const s = `${key}|${year}`
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  let sum = 0
  for (let i = 0; i < 6; i++) {
    // mulberry32 steps
    h = (h + 0x6d2b79f5) >>> 0
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    sum += ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return (sum - 3) * Math.SQRT2
}

/** Step function over (year, value) anchors: the last anchor at or before `year`. */
function stepAt(anchors: readonly (readonly [number, number])[], year: number): number | null {
  let v: number | null = null
  for (const [y, x] of anchors) {
    if (y <= year) v = x
    else break
  }
  return v
}

/** Geometric interpolation between anchors (for prices like oil). */
function interpAt(anchors: readonly (readonly [number, number])[], year: number): number {
  if (year <= anchors[0][0]) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [y1, v1] = anchors[i]
    if (year <= y1) {
      const [y0, v0] = anchors[i - 1]
      return v0 * Math.pow(v1 / v0, (year - y0) / (y1 - y0))
    }
  }
  return anchors[anchors.length - 1][1]
}

function inRanges(ranges: readonly (readonly [number, number])[] | undefined, year: number): boolean {
  return !!ranges && ranges.some(([a, b]) => year >= a && year <= b)
}

function wealthOf(countryId: string): number {
  const w = getCountry(countryId).wealth
  return typeof w === 'number' && Number.isFinite(w) ? w : 0.5
}

// ---------------------------------------------------------------------------
// Inflation and interest rates

/** Inflation of a typical rich country in each era (%), the base of the proxies. */
function eraInflation(year: number): number {
  if (year <= 1913) return 1
  if (year <= 1918) return 12
  if (year <= 1920) return 12
  if (year <= 1922) return -8
  if (year <= 1929) return 1
  if (year <= 1933) return -5
  if (year <= 1939) return 2
  if (year <= 1945) return 9
  if (year <= 1948) return 8
  if (year <= 1969) return 3
  if (year <= 1972) return 5
  if (year <= 1975) return 12
  if (year <= 1979) return 9
  if (year <= 1981) return 11
  if (year <= 1985) return 6
  if (year <= 1990) return 4
  if (year <= 1999) return 3
  if (year <= 2007) return 2.3
  if (year === 2008) return 4
  if (year === 2009) return 0.5
  if (year <= 2020) return 1.5
  if (year === 2021) return 4
  if (year === 2022) return 8
  if (year === 2023) return 5
  if (year === 2024) return 3
  return 2.5
}

function segmentValue(segs: readonly { from: number; values: readonly number[] }[], year: number): number | null {
  let v: number | null = null
  for (const s of segs) {
    const i = year - s.from
    if (i >= 0 && i < s.values.length) v = s.values[i]
  }
  return v
}

function proxyInflation(countryId: string, year: number): number {
  const w = wealthOf(countryId)
  const base = eraInflation(year)
  let mult = 1
  if (w < 0.4) mult = year >= 1970 && year <= 1999 ? 1.8 : year >= 1950 ? 1.5 : 1.2
  else if (w < 0.7) mult = year >= 1970 && year <= 1999 ? 1.3 : 1.1
  let v = base > 0 ? base * mult : base
  // Recent years lean toward the country's present-day inflation.
  if (year >= 2015) {
    const now = marketOf(countryId).inflation * 100
    if (Number.isFinite(now)) v = 0.5 * v + 0.5 * Math.min(now, 60)
  }
  return v
}

/**
 * Consumer inflation in `countryId` during `year` (0.05 = 5%), or null outside history.
 * Hyperinflations can be astronomical (Germany 1923, Hungary 1946, Zimbabwe 2008).
 */
export function historicalInflation(countryId: string, year: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  if (countryId === 'us') return usInflation(y)
  const ev = INFLATION_EVENTS[countryId]?.[y]
  if (typeof ev === 'number') return ev / 100
  const major: CountryHistory | undefined = MAJOR_MARKETS[countryId]
  if (major) {
    const v = segmentValue(major.inflation, y)
    if (v !== null) return v / 100
    if (major.inflationLike) return historicalInflation(major.inflationLike, y)
  }
  return proxyInflation(countryId, y) / 100
}

/** Real interest the era paid on top of inflation (proxy rates). */
function eraRealRate(year: number): number {
  if (year <= 1913) return 3.5
  if (year <= 1918) return 0
  if (year <= 1929) return 3
  if (year <= 1945) return 1
  if (year <= 1970) return 1
  if (year <= 1979) return -1.5
  if (year <= 1990) return 3
  if (year <= 2007) return 2.5
  if (year <= 2021) return -0.5
  if (year === 2022) return -3
  return 1.5
}

/** Currencies pegged to the dollar: their rates follow the Fed (from the year of the peg). */
const DOLLAR_PEGS: Readonly<Record<string, number>> = {
  sa: 1986, ae: 1980, kw: 1975, qa: 1980, jo: 1995, pa: 1904, bs: 1973, bz: 1976, sv: 2001, ec: 2000, pr: 1900, aw: 1986, dj: 1949,
}

/** The central bank's policy rate in `year` (0.05 = 5%), or null outside history. */
export function historicalPolicyRate(countryId: string, year: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  if (countryId === 'us') return US_POLICY_RATE[y - US_FROM] / 100
  const euro = EURO_FROM[countryId]
  if (euro !== undefined && y >= euro) return (stepAt(ECB_RATES, y) ?? 2) / 100
  const peg = DOLLAR_PEGS[countryId]
  if (peg !== undefined && y >= peg) return (US_POLICY_RATE[y - US_FROM] + 0.75) / 100
  const major = MAJOR_MARKETS[countryId]
  if (major) {
    const r = stepAt(major.rates, y)
    if (r !== null) return r / 100
  }
  const infl = (historicalInflation(countryId, y) ?? 0.03) * 100
  const rate = infl > 50 ? infl * 0.7 : infl + eraRealRate(y)
  return clampN(rate, 0, 1e7) / 100
}

/** A typical home-loan rate in `year` (nominal), or null outside history. */
export function historicalMortgageRate(countryId: string, year: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  if (countryId === 'us') return (stepAt(US_MORTGAGE_ANCHORS, y) ?? 6) / 100
  const policy = historicalPolicyRate(countryId, y) ?? 0.05
  const infl = historicalInflation(countryId, y) ?? 0.03
  const spread = wealthOf(countryId) >= 0.7 ? 0.018 : 0.035
  // Lenders can't charge much below inflation for long, nor wildly above it.
  const r = Math.max(policy + spread, Math.min(infl, 2) + 0.01)
  return clampN(r, 0.015, Math.max(0.3, Math.min(infl, 1e6) + 0.15))
}

// ---------------------------------------------------------------------------
// Stock markets

/** The real return from an explicit segment, or null when no segment covers the year. */
function segmentReal(countryId: string, seg: EquitySegment, year: number): number | null {
  const i = year - seg.from
  const isLevel = seg.kind === 'level' || seg.kind === 'usdLevel'
  if (isLevel) {
    if (i < 1 || i >= seg.values.length) return null
    const price = seg.values[i] / seg.values[i - 1] - 1
    const dy = (typeof seg.dividend === 'number' ? seg.dividend : seg.dividend ? (stepAt(seg.dividend, year) ?? 0) : 0) / 100
    const nominal = price + dy
    const infl = seg.kind === 'usdLevel' ? usInflation(year) : historicalInflation(countryId, year) ?? 0
    return (1 + nominal) / (1 + infl) - 1
  }
  if (i < 0 || i >= seg.values.length) return null
  const v = seg.values[i] / 100
  if (seg.kind === 'real') return v
  if (seg.kind === 'usd') return (1 + v) / (1 + usInflation(year)) - 1
  const infl = historicalInflation(countryId, year) ?? 0
  return (1 + v) / (1 + infl) - 1
}

/** A hand-written real return for the year (the US series, a major market's segments), or null. */
function explicitReal(countryId: string, year: number): number | null {
  if (countryId === 'us') {
    const i = year - US_FROM
    return i >= 0 && i < US_STOCKS_NOMINAL.length ? (1 + US_STOCKS_NOMINAL[i] / 100) / (1 + usInflation(year)) - 1 : null
  }
  const major = MAJOR_MARKETS[countryId]
  if (!major) return null
  let v: number | null = null
  for (const seg of major.equity) {
    const r = segmentReal(countryId, seg, year)
    if (r !== null) v = r
  }
  return v
}

type Factor = 'world' | 'europe' | 'asia' | 'latam' | 'mideast' | 'africa' | 'oceania'

const FACTOR_MEMBERS: Readonly<Record<Exclude<Factor, 'world' | 'mideast'>, readonly string[]>> = {
  europe: ['gb', 'de', 'fr'],
  asia: ['jp', 'hk', 'kr', 'tw', 'in'],
  latam: ['br', 'mx'],
  africa: ['za'],
  oceania: ['au'],
}

let factorCache: Map<Factor, Float64Array> | null = null
let factorMeans: Map<Factor, number> | null = null

function oilLog(year: number): number {
  return Math.log(interpAt(OIL_ANCHORS, year) / interpAt(OIL_ANCHORS, year - 1)) - Math.log(1 + usInflation(year))
}

function buildFactors(): void {
  const cache = new Map<Factor, Float64Array>()
  const means = new Map<Factor, number>()
  const world = new Float64Array(SPAN)
  for (let i = 0; i < SPAN; i++) {
    const y = HISTORY_START + i
    world[i] = 0.5 * safeLog(explicitReal('us', y) ?? 0) + 0.5 * safeLog(explicitReal('gb', y) ?? 0)
  }
  cache.set('world', world)
  for (const f of ['europe', 'asia', 'latam', 'africa', 'oceania'] as const) {
    const arr = new Float64Array(SPAN)
    for (let i = 0; i < SPAN; i++) {
      const y = HISTORY_START + i
      const vals = y >= 1950 ? FACTOR_MEMBERS[f].map((c) => explicitReal(c, y)).filter((v): v is number => v !== null) : []
      arr[i] = vals.length ? vals.reduce((s, v) => s + safeLog(v), 0) / vals.length : world[i]
    }
    cache.set(f, arr)
  }
  const mid = new Float64Array(SPAN)
  for (let i = 0; i < SPAN; i++) {
    const y = HISTORY_START + i
    mid[i] = y >= 1973 ? 0.5 * world[i] + 0.3 * clampN(oilLog(y), -1, 1) + 0.02 : world[i]
  }
  cache.set('mideast', mid)
  // Regional factors are only used from 1950 (before that every proxy follows the world).
  for (const [k, arr] of cache) {
    const from = k === 'world' ? 0 : 1950 - HISTORY_START
    const used = arr.slice(from)
    means.set(k, used.reduce((s, v) => s + v, 0) / used.length)
  }
  factorCache = cache
  factorMeans = means
}

function factorOf(countryId: string): Factor {
  const c = getCountry(countryId)
  switch (c.continent) {
    case 'Europe':
      return 'europe'
    case 'Asia':
      return 'asia'
    case 'Middle East':
      return 'mideast'
    case 'Africa':
      return 'africa'
    case 'Oceania':
      return 'oceania'
    case 'South America':
      return 'latam'
    default:
      return countryId === 'us' || countryId === 'ca' ? 'world' : 'latam'
  }
}

interface ProxyParams {
  mean: number
  beta: number
  vol: number
}

/** Long-run proxy behaviour (log real return per year, factor beta, local noise). */
const PROXY_OVERRIDES: Readonly<Record<string, Partial<ProxyParams>>> = {
  ca: { mean: 0.055, beta: 0.9, vol: 0.06 },
  au: { mean: 0.065, beta: 0.9, vol: 0.09 },
  hk: { mean: 0.05, vol: 0.15 },
  in: { mean: 0.03, vol: 0.14 },
  kr: { mean: 0.06, vol: 0.25 },
  tw: { mean: 0.08, vol: 0.3 },
  za: { mean: 0.07, beta: 0.9, vol: 0.12 },
  br: { mean: 0.03, beta: 1.3, vol: 0.3 },
  mx: { mean: 0.03, beta: 1.2, vol: 0.25 },
  ar: { mean: 0.0, beta: 1.3, vol: 0.3 },
  ru: { mean: 0.04, vol: 0.15 },
  cn: { mean: 0.03, vol: 0.2 },
  ch: { mean: 0.045, beta: 0.85, vol: 0.06 },
  se: { mean: 0.06, vol: 0.09 },
  dk: { mean: 0.05, vol: 0.08 },
  nl: { mean: 0.05, vol: 0.07 },
  it: { mean: 0.03, beta: 1.1, vol: 0.12 },
  es: { mean: 0.035, beta: 1.05, vol: 0.1 },
  be: { mean: 0.025, vol: 0.08 },
  at: { mean: 0.01, beta: 1.1, vol: 0.12 },
  nz: { mean: 0.06, beta: 0.85, vol: 0.08 },
  sg: { mean: 0.05, beta: 1.1, vol: 0.12 },
}

function proxyParams(countryId: string): ProxyParams {
  const w = wealthOf(countryId)
  const base: ProxyParams =
    w >= 0.8 ? { mean: 0.045, beta: 1.0, vol: 0.08 } : w >= 0.5 ? { mean: 0.05, beta: 1.15, vol: 0.14 } : w >= 0.3 ? { mean: 0.05, beta: 1.25, vol: 0.18 } : { mean: 0.04, beta: 1.3, vol: 0.22 }
  return { ...base, ...PROXY_OVERRIDES[countryId] }
}

const seriesCache = new Map<string, Float64Array>()

/** The country's real stock returns for every historical year (cached). */
function equitySeries(countryId: string): Float64Array {
  const hit = seriesCache.get(countryId)
  if (hit) return hit
  if (!factorCache || !factorMeans) buildFactors()
  const arr = new Float64Array(SPAN)
  const p = proxyParams(countryId)
  const fKey = factorOf(countryId)
  const events = EQUITY_EVENTS[countryId]
  // Proxy years: the region's moves through the country's beta, plus local noise. Within each
  // quarter century the noise is re-centred so the proxy and hand-written event years together
  // average what the region did (a crash written in by hand is followed by a recovery, not
  // stacked on top of an average decade).
  const isProxy = new Uint8Array(SPAN)
  const isEvent = new Uint8Array(SPAN)
  const expected = new Float64Array(SPAN)
  const logs = new Float64Array(SPAN)
  for (let i = 0; i < SPAN; i++) {
    const y = HISTORY_START + i
    const ex = explicitReal(countryId, y)
    const ev = events?.[y]
    const fk: Factor = y >= 1950 ? fKey : 'world'
    expected[i] = p.mean + p.beta * (factorCache!.get(fk)![i] - factorMeans!.get(fk)!)
    if (ex !== null) logs[i] = safeLog(ex)
    else if (typeof ev === 'number') {
      logs[i] = safeLog(ev / 100)
      isEvent[i] = 1
    } else {
      logs[i] = expected[i] + p.vol * noise(`eq|${countryId}`, y)
      isProxy[i] = 1
    }
  }
  for (let start = 0; start < SPAN; start += 25) {
    const end = Math.min(SPAN, start + 25 + (SPAN - start - 25 < 10 ? SPAN : 0))
    let n = 0
    let gap = 0
    let proxies = 0
    for (let i = start; i < end; i++) {
      if (!isProxy[i] && !isEvent[i]) continue
      n++
      gap += expected[i] - logs[i]
      if (isProxy[i]) proxies++
    }
    if (proxies >= 5) {
      const shift = clampN(gap / proxies, -0.08, 0.08)
      for (let i = start; i < end; i++) if (isProxy[i]) logs[i] += shift
    }
    if (end >= SPAN) break
  }
  for (let i = 0; i < SPAN; i++) arr[i] = clampN(Math.exp(logs[i]) - 1, -0.97, 12)
  seriesCache.set(countryId, arr)
  return arr
}

/** The real total return (dividends included) of the country's stock market in `year`, or null. */
export function historicalIndexReturn(countryId: string, year: number): number | null {
  if (!inHistory(year)) return null
  return equitySeries(countryId)[Math.round(year) - HISTORY_START]
}

/** Sectors whose stories travel the world (the rest are local, like property booms). */
const LOCAL_ONLY_SECTORS = new Set(['property', 'construction', 'utilities'])
/** Years US bank stories were global ones. */
const GLOBAL_BANK_YEARS = new Set([1929, 1930, 1931, 1932, 1933, 1973, 1974, 2007, 2008, 2009, 2011, 2012, 2020])

function usSectorExcess(sector: string, year: number): number | null {
  const sec = US_SECTOR_NOMINAL[sector]?.[year]
  if (typeof sec !== 'number') return null
  const mkt = US_STOCKS_NOMINAL[year - US_FROM]
  if (typeof mkt !== 'number') return null
  return safeLog(sec / 100) - safeLog(mkt / 100)
}

/**
 * A sector's excess log return over its local market in `year` (e.g. tech in 2000: about -0.4),
 * or null when the sector simply moved with the market (and always for the future).
 */
export function historicalSectorExcess(countryId: string, sector: string, year: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  const local = LOCAL_SECTOR_EVENTS[countryId]?.[sector]?.[y]
  if (typeof local === 'number') return safeLog(local / 100)
  if (countryId === 'us') return usSectorExcess(sector, y)
  if (LOCAL_ONLY_SECTORS.has(sector)) return null
  if (sector === 'banks' && !GLOBAL_BANK_YEARS.has(y)) return null
  const us = usSectorExcess(sector, y)
  return us === null ? null : us * 0.7
}

/** Real house-price change in `year`, or null outside history. */
export function historicalHousing(countryId: string, year: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  if (countryId === 'us') return US_HOUSING_REAL[y - US_FROM] / 100
  const major = MAJOR_MARKETS[countryId]?.housing?.[y]
  if (typeof major === 'number') return major / 100
  const ev = HOUSING_EVENTS[countryId]?.[y]
  if (typeof ev === 'number') return ev / 100
  // Otherwise houses drift with the economy: a little of the stock market's mood.
  const eq = historicalIndexReturn(countryId, y) ?? 0
  const p = proxyParams(countryId)
  return clampN(0.004 + 0.2 * (safeLog(eq) - p.mean) + 0.025 * noise(`house|${countryId}`, y), -0.25, 0.25)
}

// ---------------------------------------------------------------------------
// Exchanges, access and the rules of each era

export type ExchangeStatus = 'open' | 'closed' | 'none'

export interface ExchangeState {
  status: ExchangeStatus
  /** A revolution nationalized every listed company this year. */
  expropriated: boolean
  /** First year the exchange ever traded. */
  opened: number
}

/** Whether `homeCountryId`'s stock exchange traded in `year` (always open outside history). */
export function exchangeState(homeCountryId: string, year: number): ExchangeState {
  const rules = EXCHANGE_RULES[homeCountryId]
  const opened = rules?.opened ?? HISTORY_START
  if (!inHistory(year)) return { status: 'open', expropriated: false, opened }
  const y = Math.round(year)
  if (!rules) return { status: 'open', expropriated: false, opened }
  if (rules.expropriated?.includes(y)) return { status: 'none', expropriated: true, opened }
  if (y < rules.opened || inRanges(rules.none, y)) return { status: 'none', expropriated: false, opened }
  if (inRanges(rules.closed, y)) return { status: 'closed', expropriated: false, opened }
  return { status: 'open', expropriated: false, opened }
}

/** Why `homeCountryId`'s exchange was shut in `year` (a clause like 'civil war has split the country.'), or null. */
export function exchangeClosedReason(homeCountryId: string, year: number): string | null {
  if (exchangeState(homeCountryId, year).status !== 'closed') return null
  return EXCHANGE_RULES[homeCountryId]?.closedWhy ?? null
}

/** Why residents of `countryId` couldn't invest privately in `year` (null when they could). */
export function investingBlocked(countryId: string, year: number): string | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  if (!inRanges(BLOCKED_INVESTING[countryId], y)) return null
  const name = getCountry(countryId).name
  if (countryId === 'cu' || y >= 1945) return `There's no private investing in ${name} right now: the state owns the companies, and buying foreign shares is out of the question.`
  return `Private investing has been abolished in ${name}: the state owns the companies now.`
}

export interface GoldBan {
  note: string
  /** The first year of the ban: privately held gold must be handed in (sold at the official price). */
  recall: boolean
}

/** Whether owning gold was illegal or restricted in `countryId` in `year`. */
export function goldBan(countryId: string, year: number): GoldBan | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  for (const b of GOLD_BANS[countryId] ?? []) if (y >= b.from && y <= b.to) return { note: b.note, recall: !!b.recall && y === b.from }
  if (inRanges(BLOCKED_INVESTING[countryId], y)) return { note: 'Private gold dealing is banned: the state buys and sells all of it.', recall: false }
  return null
}

/** The share of a government bond's value lost in a default that year, or null. */
export function sovereignDefault(countryId: string, year: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  const h = DEFAULTS[countryId]?.[y]
  if (typeof h === 'number') return clampN(h, 0, 1)
  return EXCHANGE_RULES[countryId]?.expropriated?.includes(y) ? 0.9 : null
}

/** A banking crisis that cost depositors money that year: the share of uninsured deposits recovered. */
export function bankingCrisis(countryId: string, year: number): number | null {
  if (!inHistory(year)) return null
  const r = BANK_CRISES[countryId]?.[Math.round(year)]
  return typeof r === 'number' ? clampN(r, 0, 1) : null
}

/**
 * How much of a deposit the government guaranteed in `year`, in engine (constant) dollars, given
 * the present-day guarantee `present`. Before deposit insurance existed: nothing.
 */
export function historicalDepositInsurance(countryId: string, year: number, present: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  if (countryId === 'us') {
    const nominal = stepAt(US_DEPOSIT_LIMITS, y)
    return nominal === null ? 0 : Math.round(nominal / priceLevel(y))
  }
  const from = DEPOSIT_INSURANCE_FROM[countryId] ?? (wealthOf(countryId) >= 0.6 ? 2000 : 2010)
  if (y < from) return 0
  return Math.round(y < 2008 ? present * 0.5 : present)
}

// ---------------------------------------------------------------------------
// Gold and crypto

/** The real price of gold (engine dollars per ounce) at the end of `year`, or null outside history. */
export function historicalGoldPrice(year: number): number | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  const nominal = GOLD_NOMINAL[y - GOLD_FROM]
  return typeof nominal === 'number' ? nominal / priceLevel(y) : null
}

export interface CoinYearHistory {
  /** The coin generation in this slot this year (invest/engine.ts coinDef). */
  gen: number
  /** False before the slot's first coin launched, or after a collapse until the next launch. */
  listed: boolean
  /** Real price (engine dollars) at the end of the year (the launch price when unlisted). */
  price: number
  /** The coin launched this year. */
  ipo: boolean
  /** The generation that collapsed to zero this year. */
  collapsed?: number
  /** Year-end market size in engine dollars (the early markets were tiny). */
  marketCap: number
}

/** A coin slot's real history in `year` (null outside history). */
export function historicalCoin(slot: number, year: number): CoinYearHistory | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  const h = COIN_HISTORY[slot]
  if (!h) return null
  const pl = priceLevel(y)
  let gen = -1
  for (let i = 0; i < h.gens.length; i++) if (h.gens[i].launch <= y) gen = i
  const first = h.gens[0]
  if (gen < 0) return { gen: 0, listed: false, price: (first.prices[first.launch] ?? 1) / priceLevel(first.launch), ipo: false, marketCap: 0 }
  const g = h.gens[gen]
  const collapsedNow = h.gens.findIndex((x) => x.collapsed === y)
  if (g.collapsed !== undefined && g.collapsed <= y) {
    return { gen: gen + 1, listed: false, price: (h.gens[gen + 1]?.prices[h.gens[gen + 1]?.launch ?? 0] ?? 1) / pl, ipo: false, collapsed: collapsedNow >= 0 ? collapsedNow : undefined, marketCap: 0 }
  }
  const nominal = g.prices[y] ?? g.prices[g.launch] ?? 1
  const supply = (stepAt(h.supplyM, y) ?? 0) * 1e6
  return { gen, listed: true, price: nominal / pl, ipo: g.launch === y, collapsed: collapsedNow >= 0 ? collapsedNow : undefined, marketCap: (nominal * supply) / pl }
}

/** The crypto market's real move in `year` (the first coin's), or null before crypto or outside history. */
export function historicalCryptoReturn(year: number): number | null {
  if (!inHistory(year) || year <= CRYPTO_FROM) return null
  const now = historicalCoin(0, year)
  const before = historicalCoin(0, year - 1)
  if (!now?.listed || !before?.listed || !(before.price > 0)) return null
  return now.price / before.price - 1
}

/** True when any cryptocurrency existed in `year` (always true for the present and future). */
export function cryptoExists(year: number): boolean {
  return !inHistory(year) || Math.round(year) >= CRYPTO_FROM
}

// ---------------------------------------------------------------------------
// News

/** The year's market headline where `countryId` trades ('' when nothing notable happened). */
export function marketNote(countryId: string, year: number): string {
  if (!inHistory(year)) return ''
  const y = Math.round(year)
  return LOCAL_NOTES[countryId]?.[y] ?? WORLD_NOTES[y] ?? ''
}

// ---------------------------------------------------------------------------
// The contract

/** The country whose exchange residents of `countryId` trade on (itself, or the regional hub). */
function exchangeHome(countryId: string): string {
  if (marketOf(countryId).exchange) return countryId
  const ex = exchangeFor(countryId)
  return COUNTRIES.find((c) => marketOf(c.id).exchange === ex)?.id ?? 'us'
}

const SECTOR_KEYS = [
  'banks', 'insurance', 'telecom', 'utilities', 'oil', 'mining', 'automakers', 'electronics', 'industrials', 'tech', 'games',
  'ecommerce', 'media', 'entertainment', 'pharma', 'hotels', 'airlines', 'shipping', 'agri', 'construction', 'property',
  'supermarkets', 'food', 'brewers', 'fashion', 'cosmetics', 'leisure', 'semis', 'ai', 'robotics', 'biotech', 'space', 'ev',
  'quantum', 'cyber',
]

/** What really happened to this country's markets in this year, or null for the future/no data. */
export function marketHistory(countryId: string, year: number): MarketYear | null {
  if (!inHistory(year)) return null
  const y = Math.round(year)
  const home = exchangeHome(countryId)
  const index = historicalIndexReturn(home, y) ?? 0
  const sectors: Partial<Record<string, number>> = {}
  for (const s of SECTOR_KEYS) {
    const ex = historicalSectorExcess(home, s, y)
    if (ex !== null) sectors[s] = Math.exp(safeLog(index) + ex) - 1
  }
  const gold = historicalGoldPrice(y)
  const goldBefore = historicalGoldPrice(y - 1)
  return {
    index,
    crash: index <= -0.25,
    boom: index >= 0.3,
    sectors,
    crypto: historicalCryptoReturn(y),
    gold: gold !== null && goldBefore !== null && goldBefore > 0 ? gold / goldBefore - 1 : undefined,
    housing: historicalHousing(countryId, y) ?? undefined,
    inflation: historicalInflation(countryId, y) ?? undefined,
    rate: historicalPolicyRate(countryId, y) ?? undefined,
    note: marketNote(home, y) || undefined,
  }
}

/** The rich economies that feel a world event in full (others feel its `reach`). */
const WORLD_CORE = ['us', 'gb', 'de', 'fr', 'it', 'nl', 'be', 'ch', 'at', 'se', 'dk', 'no', 'fi', 'ie', 'es', 'pt', 'ca', 'au', 'nz', 'jp']

/** The recession (-1) … boom (+1) score of `countryId` in `year` from the cycle events. */
export function cycleScore(countryId: string, year: number): number {
  if (!inHistory(year)) return 0
  const y = Math.round(year)
  let s = 0
  for (const e of CYCLE_EVENTS) {
    if (y < e.from || y > e.to) continue
    if (e.where === 'world') s += e.score * ((e.core ?? WORLD_CORE).includes(countryId) ? 1 : (e.reach ?? 0.6))
    else if (e.where.includes(countryId)) s += e.score
  }
  return clampN(s, -1, 1)
}

/**
 * The business-cycle demand multiplier for a country and year: real history (recessions,
 * booms) blended with the procedural `synthetic` value, which is returned unchanged for the future.
 */
export function historicalCycle(countryId: string, year: number, synthetic: number): number {
  const safeSynthetic = Number.isFinite(synthetic) ? synthetic : 1
  if (!inHistory(year)) return safeSynthetic
  const hist = 1 + 0.32 * cycleScore(countryId, year)
  return clampN(hist + 0.5 * (safeSynthetic - 1), 0.55, 1.4)
}
