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
// R3-G3 (H.4) makes those keys buyable: this file registers who owns the riv and mkt families (what a key is called, what it really is,
// how big a thing it reads), and the key sets the screens hand to Look closer:
//
//   rivalListKeys / rivalDetailKeys          the rivals list asks about its top five, one rival about quality, technology and the lines shown
//   countryKeys / localKeys                  a market the player does not know asks about the demand and the shares its rows show
//   forecastScale                            what a what-if forecast is measured against (the scn kind in market-menu.ts uses it too)
//
// Keys. `riv:<scope>:quality`, `riv:<scope>:tech` and `riv:<scope>:<family>:line`. The scope is a short hash of (industry, market,
// rival id), because one rival id stands for different numbers in different markets (a restaurant chain is stronger at home than
// abroad, and a fictional challenger `f41` is a different company in each market). So a report bought for a rival in one market
// never sharpens the same name in another. The family is a slug of its name (unique inside an industry, pinned by the test).
// Nothing here reads g.rng or writes the state: a read is a hashed draw (knowledge/normal.ts).
import { hashKey } from '../kernel/streams'
import { isExact, know, registerKeyKind, type Estimate } from '../knowledge/contract'
import type { Asset, GameState } from '../types'
import { marketViewOf, shareText, type RivalView } from './competition'
import { marketKey } from './competition-core'
import { isDeepTechIndustry } from './deeptech-state'
import { programField } from './deeptech-effort'
import { shieldsOf } from './lab-state'
import { rdField } from './rd-effort'
import { rivalLines } from './product-market'
import { ENGINE_FIELD } from './studio-effort'
import { countryDetail, localField } from './market-view'
import { businessAssets, readBiz, type BizState } from './state'
import { industryDef, isIndustry } from './industries'
import { placeName } from './market-places'
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

/** The product lines a profile row shows (the rest are counted in "+N more"), and so the lines a Look closer read asks about. */
export const LINES_SHOWN = 4
/** How many rivals the rivals list reads at once (the top of the list by share). */
export const LOOK_RIVALS = 5

/** What a riv: key names: a rival of one of the player's markets, and which of its numbers. */
interface RivalHit {
  b: BizState
  r: RivalView
  what: RivalField | { slug: string }
}

/** The rival a riv: key names, found through the companies the player owns (null when none still meets it, or the key is not one of ours). */
function rivalHit(g: GameState, key: string): RivalHit | null {
  const p = key.split(':')
  if (p[0] !== 'riv' || (p.length !== 3 && p.length !== 4)) return null
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    for (const r of marketViewOf(g, b).rivals) {
      if (rivalScope(b, r.id) !== p[1]) continue
      if (p.length === 3) return p[2] === 'quality' || p[2] === 'tech' ? { b, r, what: p[2] } : null
      return p[3] === 'line' ? { b, r, what: { slug: p[2]! } } : null
    }
  }
  return null
}

/**
 * The true number behind a riv: key, found through the companies the player owns (null when none of them still meets that rival
 * in that market, or the key is not one of ours). A purchased report is paid for by key, and this is how the key finds its truth.
 */
export function rivalTruth(g: GameState, key: string): number | null {
  const h = rivalHit(g, key)
  if (!h) return null
  if (typeof h.what === 'string') return h.r[h.what]
  const slug = h.what.slug
  return rivalLinesOf(g, h.b, h.r).find((l) => familySlug(l.family) === slug)?.quality ?? null
}

/** What a riv: key is called on the Briefing: 'Acme quality', 'Acme technology', 'Acme Street Lighting quality'. */
function rivalLabel(g: GameState, key: string): string {
  const h = rivalHit(g, key)
  if (!h) return key
  if (h.what === 'quality') return `${h.r.name} quality`
  if (h.what === 'tech') return `${h.r.name} technology`
  const slug = h.what.slug
  const line = rivalLinesOf(g, h.b, h.r).find((l) => familySlug(l.family) === slug)
  return `${h.r.name} ${line ? line.family : 'product'} quality`
}

/** The keys a rivals list reads: the quality of the first `n` rivals (the list is by share, so the biggest players). */
export function rivalListKeys(b: Market, rivals: readonly Pick<RivalView, 'id'>[], n: number = LOOK_RIVALS): string[] {
  return rivals.slice(0, n).map((r) => rivalKey(b, r.id, 'quality'))
}

/** The keys one rival's profile reads: quality, technology and the quality of each product line it shows. */
export function rivalDetailKeys(g: GameState, b: BizState, r: Pick<RivalView, 'id' | 'tier' | 'quality'>): string[] {
  return [rivalKey(b, r.id, 'quality'), rivalKey(b, r.id, 'tech'), ...rivalLinesOf(g, b, r).slice(0, LINES_SHOWN).map((l) => lineKey(b, r.id, l.family))]
}

/** The most research fields one key lists (the sink reads a plain array; a market with a hundred families still lists a few dozen). */
const REVEAL_FIELDS = 40

/**
 * The research fields whose results sharpen what a market reads: the know-how key of each product family sold in it (`rd.<family>`,
 * rd-effort.ts), of a deep-tech trade (`dt.<trade>`), and of a studio's engine (`studio.engine`). A pure read of this year's state.
 */
function marketResearch(b: Pick<BizState, 'industry'>, families: readonly string[], trade: boolean): string[] {
  const out = new Set<string>(families.map(rdField))
  if (trade && isDeepTechIndustry(b.industry)) out.add(programField(b.industry))
  if (trade && b.industry === 'gameStudio') out.add(ENGINE_FIELD)
  return [...out].slice(0, REVEAL_FIELDS)
}

/** The families one rival sells in the company's market, best-selling first (the lines a key may name). */
const familiesOfRival = (g: GameState, b: BizState, r: Pick<RivalView, 'id' | 'tier' | 'quality'>): string[] => rivalLinesOf(g, b, r).map((l) => l.family)

/** What a riv: key is revealed by: the research in the families that rival sells (one family for a line key), and the trade's own research. */
function rivalRevealedBy(g: GameState, key: string): readonly string[] {
  const h = rivalHit(g, key)
  if (!h) return []
  if (typeof h.what === 'object') {
    const slug = h.what.slug
    return marketResearch(h.b, familiesOfRival(g, h.b, h.r).filter((f) => familySlug(f) === slug), false)
  }
  return marketResearch(h.b, familiesOfRival(g, h.b, h.r), true)
}

registerKeyKind({
  kind: 'riv',
  label: rivalLabel,
  truth: rivalTruth,
  // A rival of a world market is met everywhere (the world); of a national one, in a country.
  scope: (g, key) => {
    const h = rivalHit(g, key)
    return h ? { tier: marketViewOf(g, h.b).scope === 'world' ? 3 : 2, country: h.b.countryId } : { tier: 2 }
  },
  revealedBy: rivalRevealedBy,
})

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

/** What an mkt: key names: a market of one of the player's industries, and the thing read in it (a size, or a share: the leader's, or a named player's). */
interface MarketHit {
  /** The company of the player's through which the market is read. */
  b: BizState
  industry: string
  country: string
  field: 'size' | 'share'
  truth: number | null
  /** The player the share is for (null for a size and for the leader read without a name). */
  name: string | null
}

/** The market an mkt: key names, found through the companies the player owns in that industry (null when there is none, or the key is not one of ours). */
function marketHit(g: GameState, key: string): MarketHit | null {
  const p = key.split(':')
  if (p[0] !== 'mkt' || p.length !== 4) return null
  const [industry, where, field] = [p[1]!, p[2]!, p[3]!]
  const [country, who] = where.split('.') as [string, string | undefined]
  if (field !== 'size' && field !== 'share') return null
  if (field === 'size' && who !== undefined) return null
  const hit = (b: BizState, truth: number | null, name: string | null = null): MarketHit => ({ b, industry, country, field, truth, name })
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    if (b.industry !== industry) continue
    const v = marketViewOf(g, b)
    if (v.scope === 'world') {
      const d = countryDetail(g, b, v, country)
      if (!d) continue
      if (field === 'size') return hit(b, d.row.demand)
      const lead = d.row.leader
      if (who === undefined) return hit(b, lead?.share ?? null, lead?.name ?? null)
      // A named player is a local champion or the country's leader (a foreign company can lead a market it is not from).
      const named = [...(lead ? [lead] : []), ...d.champions].find((c) => part(c.name) === who)
      return hit(b, named?.share ?? null, named?.name ?? null)
    }
    const f = localField(g, b, v, country)
    if (field === 'size') return hit(b, f.demand)
    const named = who === undefined ? f.top[0] : f.top.find((t) => part(t.name) === who)
    return hit(b, named?.share ?? null, named?.name ?? null)
  }
  return null
}

/**
 * The true number behind an mkt: key, found through the companies the player owns in that industry (null when there is none, or
 * the key is not one of ours). A report bought for a market is paid for by key, and this is how the key finds its truth.
 */
export function marketTruth(g: GameState, key: string): number | null {
  return marketHit(g, key)?.truth ?? null
}

/** What an mkt: key is called on the Briefing: 'Software demand in Japan', 'Acme share in Japan', 'Leader share in Japan'. */
function marketLabel(g: GameState, key: string): string {
  const p = key.split(':')
  if (p[0] !== 'mkt' || p.length !== 4) return key
  const where = placeName(p[2]!.split('.')[0]!)
  const trade = isIndustry(p[1]) ? industryDef(p[1]).label : p[1]!
  if (p[3] === 'size') return `${trade} demand in ${where}`
  const h = marketHit(g, key)
  return `${h?.name ?? 'Leader'} share in ${where}`
}

/** The keys a market the player does not know asks about: its demand, its leader's share and its champions' shares, as the rows show them. */
export function countryKeys(industry: string, countryId: string, leader: { name: string } | null, champions: readonly { name: string }[]): string[] {
  const named = [...(leader ? [leader] : []), ...champions].map((c) => marketShareKey(industry, countryId, c.name))
  return [...new Set([marketSizeKey(industry, countryId), ...named])]
}

/** The keys a national market the player does not know asks about: its demand and the shares of the names it shows. */
export function localKeys(industry: string, countryId: string, top: readonly { name: string }[]): string[] {
  return [...new Set([marketSizeKey(industry, countryId), ...top.map((t) => marketShareKey(industry, countryId, t.name))])]
}

registerKeyKind({
  kind: 'mkt',
  label: marketLabel,
  truth: marketTruth,
  // One country's market: a country read, priced by that country's wealth.
  scope: (_g, key) => ({ tier: 2, country: key.split(':')[2]?.split('.')[0] }),
  // What the families sold in the market teach about its size and who holds it.
  revealedBy: (g, key) => {
    const h = marketHit(g, key)
    if (!h) return []
    const families = new Set<string>()
    for (const r of marketViewOf(g, h.b).rivals.slice(0, LOOK_RIVALS * 2)) for (const l of rivalLinesOf(g, h.b, r)) families.add(l.family)
    return marketResearch(h.b, [...families], true)
  },
})

/** The part of a key that names one company of the player: forecasts and odds are about that company, not about "offense". */
export const scenarioScope = (a: Pick<Asset, 'id'>): string => part(a.id)

export const scenarioKey = (scope: string, scenarioId: string): string => `scn:${scope}:${scenarioId}:value`

/** A forecast is read against at least this share of last year's sales, so a small move never reads as a rounding error of a big firm. */
export const FORECAST_FLOOR = 0.1

/** ...and at least this much money, for a company with no sales to read against (a band of a few dollars would say nothing). */
export const FORECAST_MIN = 10_000

/** The 1, 2, 5 ladder a forecast's size is rounded up on: a band says which step the move is in, and no more. */
const LADDER = [1, 2, 5] as const

/** The smallest step of the 1-2-5 ladder at or above `x` (0 for anything that is not a positive number). */
function ladderUp(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0
  const k = Math.floor(Math.log10(x))
  for (const m of LADDER) if (m * 10 ** k >= x * (1 - 1e-12)) return m * 10 ** k
  return 10 ** (k + 1)
}

/**
 * What a forecast is measured against: the move's size rounded UP to a step of the 1-2-5 ladder, and never less than a tenth of last
 * year's sales or FORECAST_MIN. It is a ruler, not the move: the half-width of a band is BAND_Z x sd x scale, so a scale that was the
 * move itself would print the move in the width of its own band (hi - lo = 0.78 |truth|), a second and sharper reading than the stated
 * 30%. On the ladder the width says which step the move is in (the words already say as much) and never makes the band sharper than
 * stated: the scale is at least the move.
 */
export function forecastScale(b: Pick<BizState, 'last'>, truth: number): number {
  return Math.max(ladderUp(Math.abs(truth)), Math.max(0, b.last?.revenue ?? 0) * FORECAST_FLOOR, FORECAST_MIN)
}

/** The estimate of what a what-if move should earn (a signed amount of money). */
export function forecastRead(g: GameState, b: Pick<BizState, 'last'>, scope: string, scenarioId: string, truth: number): Estimate {
  return know(g, scenarioKey(scope, scenarioId), truth, { scale: forecastScale(b, truth) })
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
