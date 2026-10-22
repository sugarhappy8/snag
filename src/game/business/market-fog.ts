// R3-G1 (H.4): what the market screens may show of a rival. A rival's quality, its technology and the quality of each product
// line are numbers the player cannot see, so in Realistic mode they read through the estimate core (knowledge/contract.ts) and
// come back as a range with a confidence; in Exact mode, and wherever a truth cannot be fogged, they are today's text.
//
//   rivalStars(g, b, r, 'quality')           the stars of a profile row: '2 stars to 4 stars', 'about 3 stars', or the exact stars
//   rivalLine(g, b, rivalId, family, q)      the number in 'Sells: Street Lighting (64)': '45 to 85', 'about 65', or '64'
//   rivalRead / lineRead                     the Estimate behind them (the band tests and the Look closer rows read these)
//   rivalTruth(g, key)                       the true value behind a riv: key, found through the companies the player owns
//
// R3-G2 (H.4) adds the markets and forecasts the player cannot read as numbers:
//
//   knownMarket(g, b, country, industry?)    the one line that says which markets are the player's (see D27 below)
//   demandRead / shareBand                   a market's size and a share in it, for a market that is not the player's
//   profitRead / forecastRead                the profit of a what-if move: a range, not a point
//   antitrustRead                            the yearly chance regulators open a case: a word, a percent only with a talent or a read
//   marketTruth / scenarioScope / antitrustTruth   the keys' truths, for a Look closer read
//
// Keys. `riv:<scope>:quality`, `riv:<scope>:tech` and `riv:<scope>:<family>:line`. The scope is a short hash of (industry, market,
// rival id), because one rival id stands for different numbers in different markets (a restaurant chain is stronger at home than
// abroad, and a fictional challenger `f41` is a different company in each market). So a report bought for a rival in one market
// never sharpens the same name in another. The family is a slug of its name (unique inside an industry, pinned by the test).
// Nothing here reads g.rng or writes the state: a read is a hashed draw (knowledge/normal.ts).
import { hashKey } from '../kernel/streams'
import { isExact, know, type Estimate } from '../knowledge/contract'
import type { Asset, GameState } from '../types'
import { marketViewOf, shareText, type RivalView } from './competition'
import { marketKey } from './competition-core'
import { shieldsOf } from './lab-state'
import { rivalLines } from './product-market'
import { countryDetail, localField } from './market-view'
import { businessAssets, readBiz, type BizState } from './state'
import { money, stars } from './util'

export type Conf = 0 | 1 | 2 | 3

/** A piece of a menu row: its text, and the confidence and age of the reading behind it (both undefined in Exact mode). */
export interface Fogged {
  text: string
  conf?: Conf
  asOf?: number
}

/** True when a screen should speak in estimates (Realistic mode). */
export function fogOn(): boolean {
  return !isExact()
}

type Market = Pick<BizState, 'industry' | 'countryId'>

/** The part of a key that names one rival in one market. */
export function rivalScope(b: Market, rivalId: string): string {
  return (hashKey(`${b.industry}|${marketKey(b)}|${rivalId}`) >>> 0).toString(36)
}

/** A product family as a key part: 'Street Lighting' is 'street-lighting'. */
export function familySlug(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x'
}

export type RivalField = 'quality' | 'tech'

export const rivalKey = (b: Market, rivalId: string, what: RivalField): string => `riv:${rivalScope(b, rivalId)}:${what}`

export const lineKey = (b: Market, rivalId: string, family: string): string => `riv:${rivalScope(b, rivalId)}:${familySlug(family)}:line`

/** The product lines a rival sells in the company's market, best-selling first (a kind one of the company's patents holds is left out). */
export function rivalLinesOf(g: GameState, b: BizState, r: Pick<RivalView, 'id' | 'tier' | 'quality'>) {
  return rivalLines(r, b.industry, marketKey(b), g.year, shieldsOf(b))
}

/** The estimate of a rival's quality or technology (0 to 100). */
export function rivalRead(g: GameState, b: Market, r: RivalView, what: RivalField): Estimate {
  return know(g, rivalKey(b, r.id, what), r[what])
}

/** The estimate of a rival's quality in one product family (0 to 100). */
export function lineRead(g: GameState, b: Market, rivalId: string, family: string, quality: number): Estimate {
  return know(g, lineKey(b, rivalId, family), quality)
}

/** The stars a profile row has always shown: a real company never reads under three. */
const starsOf = (v: number, real: boolean): string => stars(real ? Math.max(3, v / 20) : v / 20)

/** A score estimate in stars: the stars at each end of the band, 'about' one number, or a word when the reading is too loose. */
function starText(e: Estimate, real: boolean): string {
  switch (e.conf) {
    case 3:
      return starsOf(e.mid, real)
    case 1: {
      const lo = starsOf(e.lo, real)
      const hi = starsOf(e.hi, real)
      if (lo !== hi) return `${lo} to ${hi}`
      return `about ${starsOf(e.mid, real)}`
    }
    case 2:
      return `about ${starsOf(e.mid, real)}`
    default:
      return e.words
  }
}

const aged = (e: Estimate): Pick<Fogged, 'asOf'> => (e.asOf !== undefined ? { asOf: e.asOf } : {})

/** A rival's quality or technology as the stars of a profile row. Exact mode: the stars of the true number. */
export function rivalStars(g: GameState, b: Market, r: RivalView, what: RivalField): Fogged {
  const e = rivalRead(g, b, r, what)
  if (e.exact) return { text: starsOf(r[what], r.real) }
  return { text: starText(e, r.real), conf: e.conf, ...aged(e) }
}

/** The quality in 'Sells: Street Lighting (64)'. Exact mode: the number itself. */
export function rivalLine(g: GameState, b: Market, rivalId: string, family: string, quality: number): Fogged {
  const e = lineRead(g, b, rivalId, family, quality)
  if (e.exact) return { text: String(quality) }
  return { text: e.words, conf: e.conf, ...aged(e) }
}

/** The weakest confidence and the oldest reading among several pieces of one row (what its chip should say). */
export function weakest(parts: readonly Fogged[]): Pick<Fogged, 'conf' | 'asOf'> {
  let conf: Conf | undefined
  let asOf: number | undefined
  for (const p of parts) {
    if (p.conf !== undefined) conf = conf === undefined ? p.conf : (Math.min(conf, p.conf) as Conf)
    if (p.asOf !== undefined) asOf = asOf === undefined ? p.asOf : Math.min(asOf, p.asOf)
  }
  return { ...(conf !== undefined ? { conf } : {}), ...(asOf !== undefined ? { asOf } : {}) }
}

/**
 * The true number behind a riv: key, found through the companies the player owns (null when none of them still meets that rival
 * in that market, or the key is not one of ours). A purchased report is paid for by key, and this is how the key finds its truth.
 */
export function rivalTruth(g: GameState, key: string): number | null {
  const p = key.split(':')
  if (p[0] !== 'riv' || (p.length !== 3 && p.length !== 4)) return null
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    for (const r of marketViewOf(g, b).rivals) {
      if (rivalScope(b, r.id) !== p[1]) continue
      if (p.length === 3) return p[2] === 'quality' ? r.quality : p[2] === 'tech' ? r.tech : null
      if (p[3] !== 'line') return null
      return rivalLinesOf(g, b, r).find((l) => familySlug(l.family) === p[2])?.quality ?? null
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// R3-G2: markets, forecasts and the antitrust odds

/**
 * True when the player may read this market's size, shares, rank and leaders as numbers. The owner's rule (D27): the player's own
 * industry is known, in every country of it ("published leaderboards and size classes are always known"); so a market of any
 * industry the player has a company in is known, and so is everything in Exact mode. What is left is a market of an industry
 * the player has no company in (a screen that shows one asks for it with `industry`). This is the one place the rule lives:
 * narrowing it to the countries where the company sells, or widening it, is an edit to this function and nothing else.
 */
export function knownMarket(g: GameState, b: Pick<BizState, 'industry'>, _countryId: string, industry: string = b.industry): boolean {
  if (isExact() || industry === b.industry) return true
  return businessAssets(g).some((a) => readBiz(g, a).industry === industry)
}

/** What a row builder needs to speak in estimates about a market: present only for a market the player does not know. */
export interface MarketFog {
  g: GameState
  b: BizState
  industry: string
}

export function unknownMarket(g: GameState, b: BizState, countryId: string, industry: string = b.industry): MarketFog | undefined {
  return knownMarket(g, b, countryId, industry) ? undefined : { g, b, industry }
}

/** A short key part for a name or an id (a key part is at most 40 characters of letters, digits and . _ ~ -). */
const part = (s: string): string => (hashKey(s) >>> 0).toString(36)

export const marketSizeKey = (industry: string, countryId: string): string => `mkt:${industry}:${countryId}:size`

/** The share key of a country's leader (no `who`) or of one named player in it (the champions, the local top). */
export const marketShareKey = (industry: string, countryId: string, who?: string): string =>
  who === undefined ? `mkt:${industry}:${countryId}:share` : `mkt:${industry}:${countryId}.${part(who)}:share`

/** What a market of the player's own books says: the exact text; of another market: the words, with the chip. */
const fogged = (e: Estimate, exactText: string): Fogged => (e.exact ? { text: exactText } : { text: e.words, conf: e.conf, ...aged(e) })

/** The demand of a country's market. Exact mode: `money(truth)`, the number the row has always had. */
export function demandRead(g: GameState, fog: Pick<MarketFog, 'industry'>, countryId: string, truth: number): Fogged {
  return fogged(know(g, marketSizeKey(fog.industry, countryId), truth), money(truth))
}

/** A share in a market (`who` names a player other than the leader). Exact mode: `shareText(truth)`. */
export function shareBand(g: GameState, fog: Pick<MarketFog, 'industry'>, countryId: string, truth: number, who?: string): Fogged {
  return fogged(know(g, marketShareKey(fog.industry, countryId, who), truth), shareText(truth))
}

/**
 * The true number behind an mkt: key, found through the companies the player owns in that industry (null when there is none, or
 * the key is not one of ours). A report bought for a market is paid for by key, and this is how the key finds its truth.
 */
export function marketTruth(g: GameState, key: string): number | null {
  const p = key.split(':')
  if (p[0] !== 'mkt' || p.length !== 4) return null
  const [industry, where, field] = [p[1]!, p[2]!, p[3]!]
  const [country, who] = where.split('.') as [string, string | undefined]
  if (field !== 'size' && field !== 'share') return null
  if (field === 'size' && who !== undefined) return null
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    if (b.industry !== industry) continue
    const v = marketViewOf(g, b)
    if (v.scope === 'world') {
      const d = countryDetail(g, b, v, country)
      if (!d) continue
      if (field === 'size') return d.row.demand
      if (who === undefined) return d.row.leader?.share ?? null
      return d.champions.find((c) => part(c.name) === who)?.share ?? null
    }
    const f = localField(g, b, v, country)
    if (field === 'size') return f.demand
    if (who === undefined) return f.top[0]?.share ?? null
    return f.top.find((t) => part(t.name) === who)?.share ?? null
  }
  return null
}

/** The part of a key that names one company of the player: forecasts and odds are about that company, not about "offense". */
export const scenarioScope = (a: Pick<Asset, 'id'>): string => part(a.id)

export const scenarioKey = (scope: string, scenarioId: string): string => `scn:${scope}:${scenarioId}:value`

/** A forecast is read against the larger of its own size and this share of last year's sales, so a small move never reads as a rounding error of a big firm. */
export const FORECAST_FLOOR = 0.1

/** The estimate of what a what-if move should earn (a signed amount of money). */
export function forecastRead(g: GameState, b: Pick<BizState, 'last'>, scope: string, scenarioId: string, truth: number): Estimate {
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return know(g, scenarioKey(scope, scenarioId), truth, { scale: Math.max(Math.abs(truth), revenue * FORECAST_FLOOR) })
}

const signed = (v: number): string => `${v >= 0 ? '+' : '-'}${money(Math.abs(v))}`

/** The profit of a what-if move the way the menu has always said it: 'about +$32M profit'. */
export const exactProfit = (v: number): string => `about ${signed(v)} profit`

/** The profit of a what-if move as the end of a sentence: 'about +$32M profit' (Exact), 'roughly +$20M to +$45M profit', or 'profit: a gain in the millions'. */
export function profitRead(g: GameState, b: Pick<BizState, 'last'>, scope: string, scenarioId: string, truth: number): Fogged {
  const e = forecastRead(g, b, scope, scenarioId, truth)
  if (e.exact) return { text: exactProfit(truth) }
  return { text: e.conf === 0 ? `profit: ${e.words}` : `${e.words} profit`, conf: e.conf, ...aged(e) }
}

export const antitrustKey = (scope: string): string => `odds:${scope}:antitrust:p`

/** The estimate of the yearly chance regulators open a case (0 to 1). */
export function antitrustEstimate(g: GameState, scope: string, p: number): Estimate {
  return know(g, antitrustKey(scope), p)
}

/**
 * The chance of an antitrust case, as the player may read it: null in Exact mode (the row keeps its percent), else a word ('a long
 * shot', 'likely'), and 'about 5% a year' once a talent or a read makes the estimate tight enough to print a percent.
 */
export function antitrustRead(g: GameState, scope: string, p: number): Fogged | null {
  const e = antitrustEstimate(g, scope, p)
  if (e.exact) return null
  return { text: e.conf >= 2 ? `${e.words} a year` : e.words, conf: e.conf, ...aged(e) }
}

/** The true chance behind an odds: key of ours (`odds:<company>:antitrust:p`), found through the companies the player owns. */
export function antitrustTruth(g: GameState, key: string): number | null {
  const p = key.split(':')
  if (p[0] !== 'odds' || p.length !== 4 || p[2] !== 'antitrust' || p[3] !== 'p') return null
  for (const a of businessAssets(g)) if (scenarioScope(a) === p[1]) return marketViewOf(g, readBiz(g, a)).antitrust.p
  return null
}
