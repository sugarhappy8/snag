// Investment firms 2.0: the pure market math shared by the year simulation, the hired CEO and every
// Business-talent hint. Returns come from the same deterministic engine the player's own
// investments use (invest/engine indexMove with the timeline family seed), so a fund's year and a
// personal index fund move together at the same birthday. Nothing here touches g's RNG or state.
import { seeded } from '../assets'
import { marketOf } from '../data/markets'
import { economyOf } from '../economy'
import { techAdoption, type TechId } from '../history/timeline'
import { realWealthFactor } from '../history/events-people'
import { exchangeInfo, exchangeStatus, fundName, indexMove, indexName, inflationRate, policyRate, type ExInfo } from '../invest/engine'
import { indexShockFactor } from '../invest/shocks'
import { hasTalent } from '../talents'
import { outcomeTag, timelineFamily } from '../timeMachine'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { ceoSkill } from './economy'
import type { FundState, FundStyle, HedgeStrategy, MacroCall } from './fund-state'
import { leadershipPower } from './leadership'
import { financeLeadershipSkill } from './finance-leadership'
import type { BizState } from './state'
import { clampN } from './util'

type SRng = ReturnType<typeof seeded>

/** Roughly standard-normal draw from a seeded stream. */
export function normal(r: SRng): number {
  let t = 0
  for (let i = 0; i < 6; i++) t += r.next()
  return (t - 3) * Math.SQRT2
}

/** The investments module's family seed (prices the player can already see). */
export function marketFamily(g: GameState): string {
  return timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))
}

/** A stable identity for a firm (survives normalization and heirs). */
export function firmKey(b: Pick<BizState, 'countryId' | 'city' | 'founded' | 'founderName'>): string {
  return `${b.countryId}|${b.city}|${b.founded}|${b.founderName}`
}

/** Fiscal outcomes of `year` for this firm: rerolled after a Time Machine jump, never g's RNG. */
export function fundRng(g: GameState, b: Pick<BizState, 'countryId' | 'city' | 'founded' | 'founderName'>, year: number, tag: string): SRng {
  return seeded(`${g.lifeId}${outcomeTag(g, year)}|fund2|${firmKey(b)}|${year}|${tag}`)
}

/** The fiscal year booked at a birthday uses that birthday's market move (the next calendar year). */
export function marketYearOf(fiscal: number): number {
  return fiscal + 1
}

export function techAt(countryId: string, tech: TechId, year: number): boolean {
  return techAdoption(countryId, tech, year) >= .02
}

export function exchangeOf(countryId: string): ExInfo {
  return exchangeInfo(countryId)
}

/** Total real return (price + dividends) of the firm's home index in `year`, market shocks included. */
export function marketMove(g: GameState, countryId: string, year: number): number {
  const info = exchangeInfo(countryId)
  const move = indexMove(marketFamily(g), info, year)
  const total = Math.exp(Math.max(-5, Math.min(3, move.logRet))) - 1
  const now = indexShockFactor(g, info.key, year), before = indexShockFactor(g, info.key, year - 1)
  const shocked = (1 + total) * (before > 0 ? now / before : 1) - 1
  return clampN(shocked, -.9, 3)
}

/** Did the market crash or boom (for stories and redemption panics)? */
export function marketRegime(g: GameState, countryId: string, year: number): { crash: boolean; boom: boolean; label: string; emoji: string } {
  const move = indexMove(marketFamily(g), exchangeInfo(countryId), year)
  return { crash: move.crash, boom: move.boom, label: move.regime.label, emoji: move.regime.emoji }
}

export function indexLabel(countryId: string, year: number): string {
  return indexName(exchangeInfo(countryId), year)
}

const WORLD = ['us', 'gb', 'jp', 'de']
/** A rough world portfolio: the big hubs' index moves (no player shocks). */
export function worldMove(g: GameState, year: number): number {
  const fam = marketFamily(g)
  const moves = WORLD.map(c => { const m = indexMove(fam, exchangeInfo(c), year); return Math.exp(Math.max(-5, Math.min(3, m.logRet))) - 1 })
  return clampN(moves.reduce((t, x) => t + x, 0) / moves.length, -.9, 3)
}

/** Real return of local government bonds: rates minus inflation, plus a flight-to-safety bump. */
export function bondMove(countryId: string, year: number, home: number, r: SRng): number {
  const rate = policyRate(countryId, year), infl = inflationRate(countryId, year)
  const realRate = (1 + clampN(rate, -.05, 3)) / (1 + clampN(infl, -.2, 50)) - 1
  return clampN(realRate + .008 + (home < -.15 ? .03 : 0) + .02 * normal(r), -.4, .3)
}

// ---------------------------------------------------------------------------
// Firm types

export const TYPE_INFO: Record<import('./fund-state').FundType, { label: string; emoji: string; blurb: string }> = {
  asset: { label: 'Asset Manager', emoji: '📈', blurb: 'Earn a fee on clients’ money. Beat your peers and the money flows in.' },
  hedge: { label: 'Hedge Fund', emoji: '🦈', blurb: '2-and-20: a fee plus a cut of the gains. Bold strategies, big market calls.' },
  vc: { label: 'Venture Capital', emoji: '🦄', blurb: 'Raise funds, back startups, hunt unicorns. Most bets fail.' },
  broker: { label: 'Brokerage', emoji: '🧾', blurb: 'Commissions on clients’ trades. Simple and steady.' },
}

// ---------------------------------------------------------------------------
// Asset-manager styles

export interface StyleDef {
  id: FundStyle
  label: string
  emoji: string
  blurb: string
  beta: number
  /** Yearly swing of a manager's picks against the style (active risk). */
  active: number
  /** How much a manager's skill shows up in this style. */
  alpha: number
  /** What clients usually pay for it. */
  normFee: number
  /** Common style factor drift and swing (value/growth/global years). */
  tilt: number
  swing: number
}

export const STYLES: Record<FundStyle, StyleDef> = {
  index: { id: 'index', label: 'Index', emoji: '🏛️', blurb: 'Track the market cheaply. Wins on fees and size.', beta: 1, active: .004, alpha: .1, normFee: .002, tilt: 0, swing: 0 },
  value: { id: 'value', label: 'Value', emoji: '💎', blurb: 'Cheap, boring companies. Steadier, slower.', beta: .9, active: .05, alpha: 1, normFee: .008, tilt: .005, swing: .05 },
  growth: { id: 'growth', label: 'Growth', emoji: '🚀', blurb: 'Hot companies. Big years, big crashes.', beta: 1.2, active: .065, alpha: 1.1, normFee: .009, tilt: 0, swing: .07 },
  global: { id: 'global', label: 'Global', emoji: '🌍', blurb: 'Spread across the world’s big markets.', beta: 1, active: .035, alpha: .8, normFee: .009, tilt: 0, swing: .03 },
  bonds: { id: 'bonds', label: 'Bonds', emoji: '💵', blurb: 'Government bonds. Low drama, low fees.', beta: 0, active: .015, alpha: .35, normFee: .004, tilt: 0, swing: 0 },
}

/** Why a style can't be picked here and now (index funds only exist from their local era). */
export function styleBlock(style: FundStyle, countryId: string, year: number): string | null {
  if (style === 'index' && fundName(exchangeInfo(countryId), year).trust) return 'Index funds don’t exist here yet.'
  return null
}

/** The style's own return in a market year (before the manager's picks and fees). */
export function styleReturn(g: GameState, style: FundStyle, countryId: string, year: number): number {
  const home = marketMove(g, countryId, year)
  const r = seeded(`${marketFamily(g)}|fundstyle|${exchangeInfo(countryId).key}|${style}|${year}`)
  const def = STYLES[style]
  if (style === 'bonds') return bondMove(countryId, year, home, r)
  const factor = def.tilt + def.swing * normal(r)
  const mkt = style === 'global' ? .4 * home + .6 * worldMove(g, year) : home
  // A closed or absent exchange leaves only the dividend-like drift.
  const open = exchangeStatus(exchangeInfo(countryId), year) !== 'none'
  return clampN(def.beta * mkt + (open ? factor : 0), -.95, 4)
}

// ---------------------------------------------------------------------------
// Hedge-fund strategies

export interface StrategyDef { id: HedgeStrategy; label: string; emoji: string; blurb: string }
export const STRATEGIES: Record<HedgeStrategy, StrategyDef> = {
  longShort: { id: 'longShort', label: 'Long/Short', emoji: '⚖️', blurb: 'Own winners, short losers. Half the market’s swings.' },
  macro: { id: 'macro', label: 'Global Macro', emoji: '🌐', blurb: 'One big call on the market, with leverage.' },
  quant: { id: 'quant', label: 'Quant', emoji: '🤖', blurb: 'Models and data. Small edges, many trades.' },
  event: { id: 'event', label: 'Event-driven', emoji: '📰', blurb: 'Bet on mergers closing. Steady until a deal breaks.' },
}
export const CALLS: Record<MacroCall, { label: string; emoji: string; blurb: string }> = {
  bull: { label: 'Bull', emoji: '📈', blurb: 'The market rises' },
  bear: { label: 'Bear', emoji: '📉', blurb: 'The market falls' },
  flat: { label: 'Flat', emoji: '➡️', blurb: 'The market goes nowhere' },
}

/** Quant trading needs institutional computing (late in poorer countries). */
export function quantBlock(countryId: string, year: number): string | null {
  const lag = Math.round((1 - Math.min(1, getCountry(countryId).wealth ?? 1)) * 24)
  return year >= 1975 + lag ? null : 'Quant trading isn’t possible here yet.'
}

/** Hedge funds start with the first long/short pool (1949). */
export function hedgeBlock(year: number): string | null {
  return year >= 1949 ? null : 'Hedge funds haven’t been invented yet (the first opens in 1949).'
}
export function ventureBlock(year: number): string | null {
  return year >= 1946 ? null : 'Venture capital firms don’t exist yet (the first opens in 1946).'
}

/** A macro call's payoff (per 1× of leverage) given the market's real move. */
export function callPayoff(call: MacroCall, market: number): number {
  if (call === 'bull') return market
  if (call === 'bear') return -market - .01
  return .06 - 1.3 * Math.max(0, Math.abs(market) - .05)
}

/** The gross return of a hedge strategy (before fees) in a market year. Pure given the seeded stream. */
export function hedgeGross(strategy: HedgeStrategy, market: number, alpha: number, quantEdge: number, f: Pick<FundState, 'call' | 'lev'>, financing: number, r: SRng): number {
  if (strategy === 'macro') {
    const lev = clampN(f.lev, 1, 3)
    return clampN(lev * callPayoff(f.call, market) - (lev - 1) * financing + alpha * .5 + .03 * normal(r), -.95, 4)
  }
  if (strategy === 'quant') return clampN(.1 * market + .03 + quantEdge + alpha * .6 + .05 * normal(r), -.95, 4)
  if (strategy === 'event') {
    const breaks = r.next() < .1 + (market < -.15 ? .25 : 0)
    return clampN(.3 * market + .055 + alpha * .8 + .035 * normal(r) - (breaks ? .12 : 0), -.95, 4)
  }
  return clampN(.45 * market + .025 + alpha * 1.2 + .07 * normal(r), -.95, 4)
}

/** What borrowing costs the fund per 1× of extra leverage (real). */
export function financingCost(countryId: string, year: number): number {
  const rate = policyRate(countryId, year), infl = inflationRate(countryId, year)
  return clampN((1 + clampN(rate, -.05, 3)) / (1 + clampN(infl, -.2, 50)) - 1 + .015, 0, .2)
}

// ---------------------------------------------------------------------------
// Skill, peers and flows

/** The leader's investing skill: owner (smarts, schooling, talents) or the hired CEO. */
export function leaderSkill(g: GameState, b: BizState): number {
  if (b.ceo === 'manager') return financeLeadershipSkill(b, b.manager)
  return clampN(ceoSkill(g, b) + (g.character.alive && hasTalent(g, 'Investing') ? 8 : 0), 0, 100)
}

/** The firm's investing skill 0-100: the CEO plus the portfolio manager and researcher. */
export function fundSkill(g: GameState, b: BizState): number {
  return clampN(leaderSkill(g, b) * .62 + leadershipPower(b, 'finance') * 14 + leadershipPower(b, 'quality') * 9 + 6, 5, 100)
}

/** Expected yearly edge from skill (about -1% for a novice, +3% for the very best). Never certain. */
export function alphaMean(skill: number): number {
  return (clampN(skill, 0, 100) - 50) * .0006
}

/** Big books dilute any edge (a $100B fund can't nimbly buy small winners). */
export function capacityFactor(aum: number, skill: number, b: BizState): number {
  const cap = 4e9 * (1 + leadershipPower(b, 'quality') * .5) * (.5 + skill / 100)
  return clampN(Math.sqrt(cap / Math.max(1, aum)), 0, 1)
}

/** Every dollar a country's savers could hand to managers in `year` (rough, constant dollars). */
export function poolSize(countryId: string, year: number): number {
  const m = marketOf(countryId)
  const gdp = Math.max(1e9, m.populationM * 1e6 * m.gdpPerCapita) * realWealthFactor(year)
  const depth = year < 1950 ? .4 : year < 1980 ? .4 + (year - 1950) / 30 * .4 : year < 2000 ? .8 + (year - 1980) / 20 * .7 : Math.min(2.2, 1.5 + (year - 2000) / 26 * .7)
  return gdp * depth
}

/** A fund's return to clients after a fee charged on year-end assets. */
export function afterFee(gross: number, fee: number): number {
  return (1 + gross) * (1 - fee) - 1
}

/** Forty peer funds' net returns this year (deterministic per market, style and year). */
export function peerReturns(g: GameState, kind: string, countryId: string, year: number, styleRet: number, active: number, fee: number): number[] {
  const r = seeded(`${marketFamily(g)}|fundpeers|${exchangeInfo(countryId).key}|${kind}|${year}`)
  return Array.from({ length: 40 }, () => afterFee(Math.max(-.95, styleRet + active * normal(r)), fee))
}

/** Share of peers this return beat (0-1). */
export function rankAmong(peers: readonly number[], mine: number): number {
  if (!peers.length) return .5
  return peers.filter(p => p < mine).length / peers.length
}

/** Hedge-fund peers: a mixed crowd running 2-and-20. */
export function hedgePeers(g: GameState, countryId: string, year: number, market: number): number[] {
  const r = seeded(`${marketFamily(g)}|hedgepeers|${exchangeInfo(countryId).key}|${year}`)
  return Array.from({ length: 40 }, () => {
    const gross = .35 * market + .035 + .09 * normal(r)
    const afterMgmt = gross - .02
    return afterMgmt - Math.max(0, afterMgmt) * .2
  })
}

export interface FlowInputs { rep: number; rank: number; fee: number; normFee: number; sales: number; boost: number; age: number; aum: number; pool: number; crash: boolean; confidence: number }

/** Net new client money as a share of AUM (asset managers). The hint and the year use this. */
export function assetFlow(x: FlowInputs): number {
  const perf = .45 * (x.rep - .5) + .25 * (x.rank - .5)
  const price = (x.normFee - x.fee) * 20
  const young = x.age < 3 ? .05 : 0
  let flow = .03 + perf + price + .05 * x.sales + x.boost + young + (x.confidence - .5) * .04 - (x.crash ? .08 * (1.2 - x.rep) : 0)
  if (flow > 0) flow *= clampN(1 - x.aum / Math.max(1, x.pool * .12), 0, 1) / (1 + x.aum / Math.max(1, x.pool * .03))
  return clampN(flow, -.4, .6)
}

export interface HedgeFlowInputs { rep: number; rank: number; net: number; mgmt: number; perf: number; underWater: boolean; sales: number; boost: number; age: number; aum: number; pool: number }
export function hedgeFlow(x: HedgeFlowInputs): number {
  let flow = .06 + .5 * (x.rep - .5) + .3 * (x.rank - .5) + (x.net - .05) * .8 - (x.underWater ? .05 : 0)
    - (x.mgmt - .02) * 10 - (x.perf - .2) * .5 + .05 * x.sales + x.boost + (x.age < 3 ? .04 : 0)
  if (flow > 0) flow *= clampN(1 - x.aum / Math.max(1, x.pool * .004), 0, 1)
  return clampN(flow, -.6, .6)
}

/** Track record: a slow average of peer ranks (0-1). */
export function nextRep(rep: number, rank: number): number {
  return clampN(rep * .6 + rank * .4, 0, 1)
}

/** Investor mood in the firm's country (0-1, 0.5 normal). */
export function confidenceOf(g: GameState, countryId: string, year: number): number {
  return clampN(.5 + (economyOf(g, countryId, year).confidence - 1) * .5, 0, 1)
}

// ---------------------------------------------------------------------------
// Brokerage eras

export interface BrokerEra { trades: number; normCommission: number; servicing: number; execution: number; growth: number; label: string; electronic: boolean }

/** Trading volume and prices by era: fixed commissions, discount brokers, the online boom, the meme frenzy. */
export function brokerEra(countryId: string, year: number): BrokerEra {
  const electronic = techAt(countryId, 'onlineBrokerage', year) && techAt(countryId, 'internet', year)
  if (!electronic) {
    const fixed = year < 1975
    return { trades: fixed ? 4 : 6, normCommission: fixed ? .015 : .006, servicing: 25, execution: fixed ? 6 : 4, growth: .07, label: fixed ? 'Fixed-commission era' : 'Discount-broker era', electronic: false }
  }
  const zero = year >= 2019
  const meme = year >= 2020 && year <= 2021
  const boom = year >= 1996 && year <= 2000
  return { trades: meme ? 50 : boom ? 26 : 20, normCommission: zero ? 0 : year < 2005 ? .002 : .0008, servicing: 6, execution: .6,
    growth: meme ? .35 : boom ? .25 : .11, label: meme ? 'Meme-stock frenzy' : boom ? 'Online trading boom' : zero ? 'Zero-commission era' : 'Online trading', electronic: true }
}

/** What a typical client trade is worth here and now (constant dollars). */
export function tradeSize(countryId: string, _year: number): number {
  return 8_000 * clampN(getCountry(countryId).wealth ?? 1, .15, 2)
}

/** A brokerage client's account size. */
export function accountSize(countryId: string, _year: number): number {
  return 30_000 * clampN(getCountry(countryId).wealth ?? 1, .15, 2)
}

/** Activity and account growth as a function of the commission against the era's going rate. */
export function commissionEffect(commission: number, norm: number): { activity: number; growth: number } {
  const ratio = (clampN(commission, 0, .03) + .0005) / (norm + .0005)
  // Undercutting rivals wins some extra trading and sign-ups. Charging more than they do drives
  // active traders away fast (moving an account takes an afternoon), so overpricing never pays.
  const above = ratio > 1
  return { activity: clampN(Math.pow(ratio, above ? -1.6 : -.4), .02, 2.5), growth: clampN((above ? -.25 : -.12) * Math.log(ratio), -.45, .15) }
}

/** Payment for order flow per trade once commissions hit zero. */
export function orderFlowPay(countryId: string, year: number): number {
  return year >= 2019 && techAt(countryId, 'onlineBrokerage', year) ? 2 * clampN(getCountry(countryId).wealth ?? 1, .3, 1.5) : 0
}

/** Spread earned on clients' idle cash (nominal rate minus a sliver, capped). */
export function cashSpread(countryId: string, year: number): number {
  return clampN(policyRate(countryId, year) - .005, 0, .03)
}
