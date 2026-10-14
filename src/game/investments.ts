// Investments: stocks, bonds, funds, crypto, penny stocks, gold and REITs on your country's
// exchange (Assets › Investments). BitLife's Stock Market / Investor pack, made local: you trade
// on your own market (the Nikkei in Japan, the FTSE in Britain, the Tadawul in Saudi Arabia...),
// whose listed companies follow the country's strongest industries, whose bonds and savings pay
// the local interest rate, and whose inflation and corruption decide how risky they are.
//
// Each holding is an Asset of kind 'investment' (value = market value). Prices come from the
// deterministic market engine in invest/engine.ts. Taxes: dividends, coupons and interest are
// taxable income (earnIncome, taxed by yearlyFinance); realized capital gains are taxed as income
// too, right away when you sell (taxAdditionalIncome), with losses carried forward.
//
// History: a life lived in the past trades in the past. The engine follows real market history
// (the 1929 crash, the dot-com bust, 2008...), companies wear the names of their era, index
// funds, REITs and crypto only appear when they were invented, exchanges close in wars and
// vanish after revolutions, gold was illegal to hoard in some places, and savings and bonds pay
// the nominal rates of the day while inflation eats them (engine money is constant dollars).
import { currencyOf } from './data/currencies'
import { bound, economyMarketFactor, economyOf, economyState, economicRoll, initialCountry } from './economy'
import { timelineFamily } from './timeMachine'
import { addMoney, count, earnIncome, formatMoney, formatPrice, inPrison, log, notice, shortMoney, spend } from './core'
import { localMarket, marketOf } from './data/markets'
import { gameIncomeTax, taxAdditionalIncome } from './finance'
import { exchangeClosedReason, exchangeState, goldBan, investingBlocked, marketNote } from './history/markets'
import { brokerEraMult, reitSince } from './invest/era'
import { allFundProviderNames } from './invest/funds'
import {
  bankCrisisChance,
  bondRate,
  coinDef,
  coinListed,
  coinMarketCap,
  companyDef,
  countryStress,
  cryptoYear,
  defaultChance,
  depositInsurance,
  eraIdentity,
  exchangeByKey,
  exchangeExpropriated,
  exchangeInfo,
  exchangeName,
  exchangeStatus,
  exchangeYear,
  expectedDepreciation,
  fundFee,
  fundName,
  fxYear,
  goldHedge,
  goldYear,
  hasOwnExchange,
  indexName,
  indexYield,
  inflationRate,
  isHistoryYear,
  isRealSecId,
  listedCoins,
  localWords,
  pennyDef,
  realPlanOf,
  reitYield,
  savingsRate,
  sizeLabelOf,
  sizeRankOf,
  termRate,
  type ExInfo,
  type ExYear,
  type SecYear,
} from './invest/engine'
import { gutLikes, instinctLine, listPicks, marketInstinct, type Instinct } from './invest/instinct'
import { addMarketShock, indexShockFactor, marketBreakthroughs, orderFlowFactor, pruneMarketShocks, shockedMove, shockFactor, shocksThisYear, type MarketShock } from './invest/shocks'
import { buyImpact, saleImpact } from './invest/liquidity'
import { chance, pick, randFloat, uid } from './rng'
import { HINT_EMOJI, talentHint } from './talents'
import type { Asset, GameState, Json, MenuAction, MenuGroup, MenuNode, Tone } from './types'
import { getCountry } from './world'

export type InvestType = 'stock' | 'index' | 'bond' | 'savings' | 'penny' | 'crypto' | 'gold' | 'reit'

const TYPES: InvestType[] = ['stock', 'index', 'bond', 'savings', 'penny', 'crypto', 'gold', 'reit']

const TYPE_LABEL: Record<InvestType, string> = {
  stock: 'Stock',
  index: 'Index fund',
  bond: 'Government bond',
  savings: 'Bank deposit',
  penny: 'Penny stock',
  crypto: 'Cryptocurrency',
  gold: 'Gold',
  reit: 'Real estate fund (REIT)',
}

const TYPE_EMOJI: Record<InvestType, string> = {
  stock: '📈',
  index: '🧺',
  bond: '🏛️',
  savings: '🏦',
  penny: '🎟️',
  crypto: '🪙',
  gold: '🥇',
  reit: '🏢',
}

/** Countries where buying crypto is banned outright. */
const CRYPTO_BANNED = new Set(['cn', 'dz', 'eg', 'np', 'bd', 'af', 'iq', 'qa'])

const TERM_YEARS = 3
const BOND_YEARS = 10
/** A defensive cap shared with other durable economy ledgers. */
const MAX_INVESTMENT_VALUE = 1e15

// ---------------------------------------------------------------------------
// Small helpers

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** Signed percentage, e.g. '+12.3%', '-4%', '0%'. */
function pct(x: number, digits = 1): string {
  const v = Number.isFinite(x) ? x * 100 : 0
  const s = Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : digits)
  if (Number(s) === 0) return '0%'
  return `${v < 0 ? '-' : '+'}${s}%`
}

/** Unsigned percentage of a magnitude, e.g. '23%'. */
function absPct(x: number, digits = 0): string {
  return pct(Math.abs(x), digits).replace('+', '')
}

function arrow(x: number): string {
  return x > 0.0005 ? '▲' : x < -0.0005 ? '▼' : '•'
}

function change(x: number): string {
  return `${arrow(x)}${absPct(x, 1)}`
}

function rateText(r: number): string {
  const v = Math.max(0, r) * 100
  return `${v >= 10 ? Math.round(v).toLocaleString('en-US') : Math.round(v * 10) / 10}%`
}

function priceText(p: number): string {
  return formatPrice(p)
}

function unitsText(u: number): string {
  if (!Number.isFinite(u) || u <= 0) return '0'
  if (u >= 1_000) return Math.round(u).toLocaleString('en-US')
  if (u >= 10) return (Math.round(u * 10) / 10).toLocaleString('en-US')
  if (u >= 1) return u.toFixed(2)
  return u.toPrecision(3)
}

const RISK_LABEL = ['', 'Very low', 'Low', 'Moderate', 'High', 'Very high']

export function riskMeter(risk: number): string {
  const r = Math.max(1, Math.min(5, Math.round(risk) || 1))
  return `${'●'.repeat(r)}${'○'.repeat(5 - r)}`
}

function riskText(risk: number): string {
  const r = Math.max(1, Math.min(5, Math.round(risk) || 1))
  return `Risk ${riskMeter(r)} ${RISK_LABEL[r]}`
}

function isType(v: string): v is InvestType {
  return (TYPES as string[]).includes(v)
}

/** The family's market seed: stays the same across generations so heirs see the same market. */
function fam(g: GameState): string {
  return timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))
}

/** The first year the family's market history starts from. */
function anchor(g: GameState): number {
  const first = g.ancestors?.[0]?.bornYear
  const own = g.year - g.character.age
  const a = typeof first === 'number' && Number.isFinite(first) ? Math.min(first, own) : own
  return Number.isFinite(a) ? a : g.year
}

function countryName(id: string): string {
  return getCountry(id).name
}

function theCountry(id: string): string {
  const n = countryName(id)
  return /^(United|Netherlands|Philippines|Bahamas|Czech|Dominican|Central African|Democratic|Republic|Maldives|Gambia|Solomon|Marshall)/.test(n) ? `the ${n}` : n
}

// ---------------------------------------------------------------------------
// What a year's world lets you trade (history: closed exchanges, banned gold, no crypto yet)

/** Why the local stock market can't be traded this year (null when it can). */
function stockMarketBlock(g: GameState, info: ExInfo): string | null {
  const y = g.year
  const blocked = investingBlocked(g.character.countryId, y)
  if (blocked) return blocked
  const status = exchangeStatus(info, y)
  if (status === 'open') return null
  const name = exchangeName(info, y)
  if (status === 'closed') {
    const why = exchangeClosedReason(info.home, y)
    return `The ${name} is closed${why ? `: ${why}` : '.'} Nobody can trade until it reopens.`
  }
  if (exchangeExpropriated(info, y) || y >= exchangeState(info.home, y).opened) return `There is no stock market in ${theCountry(info.home)} anymore: the state took over the companies.`
  return `${countryName(info.home)} doesn't have a stock exchange yet.`
}

/** True when there's no stock market to trade on at all this year (none yet, abolished, or banned). */
function noStockMarket(g: GameState, info: ExInfo): boolean {
  return !!investingBlocked(g.character.countryId, g.year) || exchangeStatus(info, g.year) === 'none'
}

/** Why gold can't be bought here this year (null when it can). */
function goldBlock(g: GameState): string | null {
  const ban = goldBan(g.character.countryId, g.year)
  return ban ? ban.note : investingBlocked(g.character.countryId, g.year)
}

/** Why a listed property trust can't be bought this year (null when it can). */
function reitBlock(g: GameState, info: ExInfo): string | null {
  const since = reitSince(info.home)
  return isHistoryYear(g.year) && g.year < since ? `Listed property trusts don't exist here yet (the first ones arrive around ${since}).` : null
}


// ---------------------------------------------------------------------------
// The Investing talent's gut feeling (invest/instinct.ts): purple hints on what looks set to rise

/** Next year's gut feeling, for an adult who can trade here (null without the talent). */
export function investInstinct(g: GameState): Instinct | null {
  if (g.character.age < 18 || inPrison(g)) return null
  return marketInstinct(g, !CRYPTO_BANNED.has(g.character.countryId))
}

/** The purple hint on one security the gut likes ('' or null when it doesn't). */
function gutHint(g: GameState, secId: string): string | null {
  const inst = investInstinct(g)
  return inst && gutLikes(inst, secId) ? talentHint(g, 'Investing', `Your gut says this one rises in ${inst.year}`) : null
}

/** The purple hint on a category row: the picks of that kind, if any. */
function gutGroupHint(g: GameState, kinds: string[]): string | null {
  const inst = investInstinct(g)
  if (!inst) return null
  const mine = inst.picks.filter((p) => kinds.includes(p.kind))
  return mine.length ? talentHint(g, 'Investing', `Your gut likes ${listPicks(mine)} for ${inst.year}`) : null
}

// ---------------------------------------------------------------------------
// Holdings

export function investmentHoldings(g: GameState): Asset[] {
  return g.assets.filter((a) => a.kind === 'investment' && a.details.type !== 'npcEquity')
}

function typeOf(a: Asset): InvestType {
  const t = str(a.details.type)
  return isType(t) ? t : 'stock'
}

function units(a: Asset): number {
  const u = a.details.units
  if (typeof u === 'number' && Number.isFinite(u)) return Math.max(0, u)
  // A holding saved without positions (older data): one unit worth its recorded value.
  return Number.isFinite(a.value) && a.value > 0 ? 1 : 0
}

function unitPrice(a: Asset): number {
  const u = units(a)
  const p = num(a.details.price)
  if (p > 0) return Math.min(MAX_INVESTMENT_VALUE, p)
  return u > 0 && Number.isFinite(a.value) ? Math.min(MAX_INVESTMENT_VALUE, Math.max(0, a.value) / u) : 0
}

function basis(a: Asset): number {
  return Math.min(MAX_INVESTMENT_VALUE, Math.max(0, num(a.details.basis, a.purchasePrice)))
}

/** Market value: units at the quote. Trades size against it (the order book starts at the quote). */
function holdingValue(a: Asset): number {
  const u = units(a), p = unitPrice(a)
  if (!(u > 0) || !(p > 0)) return 0
  return Math.round(u >= MAX_INVESTMENT_VALUE / p ? MAX_INVESTMENT_VALUE : u * p)
}

/**
 * How far the player's own net buying has lifted this holding's quote (1 when it hasn't). Your
 * orders move a thin market for everyone else, but your own position is valued, paid dividends and
 * bought out at the price you didn't make yourself; unwinding through the same book is what it
 * really fetches. (Net selling only lowers the quote, so it is never added back.)
 */
function ownFlow(a: Asset): number {
  const f = num(a.details.flow, 1)
  return f > 1 && Number.isFinite(f) ? f : 1
}

/** What the holding counts for in net worth, dividends and buyouts (holdingValue without own flow). */
function markedValue(a: Asset): number {
  return Math.round(holdingValue(a) / ownFlow(a))
}

/** Refresh the stored own-flow lift from the shock record (trades, revaluations, the yearly step). */
function syncOwnFlow(g: GameState, a: Asset): void {
  const t = typeOf(a)
  const f = t === 'stock' || t === 'penny' || t === 'crypto' ? orderFlowFactor(g, str(a.details.secId), g.year) : 1
  if (f > 1 + 1e-12 && Number.isFinite(f)) a.details.flow = f
  else delete a.details.flow
  a.value = Math.max(0, Math.min(MAX_INVESTMENT_VALUE, markedValue(a)))
}

// ---------------------------------------------------------------------------
// When the units were bought (insider-trading timing: special/politics.ts)
//
// `details.buys` maps a game year to the units bought that year and still held, and keeps the
// current and previous year only: two numbers, however long the holding is kept. A holding saved
// before this existed has no `buys`; it falls back on `boughtYear` (the first purchase), all units
// or none. `details.buys` is damaged-save safe: every read and write goes through these helpers.

function buysOf(a: Asset): Record<string, Json> | null {
  const raw = a.details.buys
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
}

function buyPart(raw: Record<string, Json>, year: number): number {
  const v = raw[String(year)]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** The two newest years with units in them, newest first (bounded however many keys a save holds). */
function recentBuys(raw: Record<string, Json>): [number, number][] {
  const top: [number, number][] = []
  for (const key of Object.keys(raw)) {
    const year = Number(key), v = raw[key]
    if (!Number.isInteger(year) || typeof v !== 'number' || !Number.isFinite(v) || !(v > 0)) continue
    top.push([year, v])
    top.sort((p, q) => q[0] - p[0])
    if (top.length > 2) top.pop()
  }
  return top
}

/** Write the per-year units back: two years at most, never more units than the holding has (oldest trimmed first). */
function storeBuys(a: Asset, entries: [number, number][]): void {
  const newest = new Map<number, number>()
  for (const [year, v] of entries) if (Number.isInteger(year) && Number.isFinite(v) && v > 0) newest.set(year, (newest.get(year) ?? 0) + v)
  let room = units(a)
  // Rounding dust (a sale that should have used a year up exactly) is not a position.
  const dust = room * 1e-9
  const out: Record<string, Json> = {}
  for (const [year, v] of [...newest].sort((p, q) => q[0] - p[0]).slice(0, 2)) {
    const keep = Math.min(v, room)
    if (keep > dust) { out[String(year)] = keep; room -= keep }
  }
  a.details.buys = out
}

/** Units bought in `year - 1` and in `year`, as the holding stands (a holding without `buys` is read from `boughtYear`). */
function buysNow(a: Asset, year: number): { prev: number; cur: number } {
  const u = units(a)
  const raw = buysOf(a)
  if (raw) {
    const cur = Math.min(u, buyPart(raw, year))
    return { prev: Math.min(u - cur, buyPart(raw, year - 1)), cur }
  }
  const by = a.details.boughtYear
  if (!(u > 0) || typeof by !== 'number' || !(by >= year - 1)) return { prev: 0, cur: 0 }
  return by >= year ? { prev: 0, cur: u } : { prev: u, cur: 0 }
}

/** Units of this holding bought in `year` or the year before, and still held (shares an official could be accused of timing). */
export function freshUnits(a: Asset, year: number): number {
  if (!Number.isFinite(year)) return 0
  const { prev, cur } = buysNow(a, year)
  return Math.max(0, prev + cur)
}

/** The fresh part of a holding, 0 to 1 (an empty holding has none). */
export function freshShare(a: Asset, year: number): number {
  const u = units(a)
  return u > 0 ? Math.min(1, freshUnits(a, year) / u) : 0
}

/** The unit count changed without a trade (a split, a re-anchored price, interest, a loss): the bought-per-year split follows it. */
function rescaleBuys(a: Asset, was: number, now: number): void {
  const raw = buysOf(a)
  if (!raw || was === now) return
  const k = was > 0 ? now / was : 0
  storeBuys(a, recentBuys(raw).map(([year, v]) => [year, v * k] as [number, number]))
}

function setPosition(a: Asset, u: number, price: number, cost: number): void {
  const safeP = Number.isFinite(price) ? Math.max(0, Math.min(MAX_INVESTMENT_VALUE, price)) : 0
  const unitCap = safeP > 0 ? MAX_INVESTMENT_VALUE / safeP : MAX_INVESTMENT_VALUE
  const safeU = Number.isFinite(u) ? Math.max(0, Math.min(unitCap, u)) : 0
  const was = units(a)
  a.details.units = safeU
  rescaleBuys(a, was, safeU)
  a.details.price = safeP
  a.details.basis = Math.max(0, Math.min(MAX_INVESTMENT_VALUE, Math.round(Number.isFinite(cost) ? cost : 0)))
  a.purchasePrice = a.details.basis
  a.value = Math.max(0, Math.min(MAX_INVESTMENT_VALUE, Math.round(safeU * safeP / ownFlow(a))))
}

/**
 * Cash out a security that stopped trading. A malformed save can contain reciprocal extremes such
 * as 1e308 units at 1e-300 each: the displayed holding is finite, but multiplying those units by a
 * takeover price overflows. In that case rebuild the settlement from the bounded pre-event value
 * and the event return instead of turning arithmetic overflow into a maximum-size windfall.
 */
function endedProceeds(a: Asset, before: number, perUnit: number, premium: number): number {
  const u = units(a)
  if (!(u > 0) || !(perUnit > 0)) return 0
  // A buyout pays on the quote without the holder's own buying (before is already marked that way).
  const raw = u * perUnit / ownFlow(a)
  if (Number.isFinite(raw)) return Math.max(0, Math.min(MAX_INVESTMENT_VALUE, Math.round(raw)))

  const prior = Math.max(0, Math.min(MAX_INVESTMENT_VALUE, Number.isFinite(before) ? before : 0))
  const multiple = Number.isFinite(premium) ? Math.max(0, 1 + premium) : 1
  if (!(prior > 0) || !(multiple > 0)) return 0
  return Math.round(prior >= MAX_INVESTMENT_VALUE / multiple ? MAX_INVESTMENT_VALUE : prior * multiple)
}

function findHolding(g: GameState, secId: string): Asset | undefined {
  return g.assets.find((a) => a.kind === 'investment' && str(a.details.secId) === secId)
}

function unitLabel(a: { type: InvestType; symbol: string }): string {
  switch (a.type) {
    case 'stock':
    case 'penny':
    case 'reit':
      return 'shares'
    case 'index':
      return 'fund units'
    case 'gold':
      return 'oz'
    case 'crypto':
      return a.symbol
    case 'bond':
      return 'bonds'
    default:
      return 'units'
  }
}

// ---------------------------------------------------------------------------
// Fees and taxes

interface FeePlan {
  rate: number
  min: number
  label: string
}

function brokerRate(countryId: string): number {
  const ease = Math.max(0, Math.min(100, marketOf(countryId).easeOfBusiness))
  return Math.round((0.001 + 0.004 * (1 - ease / 100)) * 10000) / 10000
}

function brokerMin(countryId: string): number {
  const w = getCountry(countryId).wealth ?? 1
  return Math.max(1, Math.round(6 * Math.max(0.1, Math.min(1.5, w))))
}

function feePlan(g: GameState, type: InvestType): FeePlan {
  const cid = g.character.countryId
  // Brokers charged fixed commissions until the mid-1970s, and a lot more than today until online trading.
  const era = brokerEraMult(g.year)
  const rate = Math.min(0.025, Math.round(brokerRate(cid) * era * 10000) / 10000)
  const min = Math.round(brokerMin(cid) * Math.min(3, era))
  switch (type) {
    case 'savings':
      return { rate: 0, min: 0, label: 'No fees' }
    case 'bond':
      return { rate: 0.001, min: 0, label: 'Fee 0.1%' }
    case 'crypto':
      return { rate: 0.015, min: 0, label: 'Exchange fee 1.5%' }
    case 'gold':
      return { rate: 0.02, min: 0, label: 'Dealer spread 2%' }
    case 'penny':
      return { rate: rate + 0.02, min, label: `Broker fee ${rateText(rate)} + 2% spread` }
    default:
      return { rate, min, label: `Broker fee ${rateText(rate)} (min ${formatMoney(min)})` }
  }
}

function feeFor(plan: FeePlan, amount: number): number {
  if (!(amount > 0) || plan.rate <= 0) return 0
  return Math.min(Math.round(amount * 0.5), Math.max(plan.min, Math.round(amount * plan.rate)))
}

/** Smallest trade the broker accepts (scaled to local incomes). */
export function minTrade(g: GameState): number {
  const w = getCountry(g.character.countryId).wealth ?? 1
  return Math.max(20, Math.round((100 * Math.max(0.2, Math.min(1, w))) / 10) * 10)
}

function lossCarry(g: GameState): number {
  return Math.min(MAX_INVESTMENT_VALUE, Math.max(0, num(g.flags.investLossCarry)))
}

interface Realized {
  gain: number
  taxable: number
  offset: number
  tax: number
}

/**
 * Pays `net` into the bank account and records the capital gain or loss. Gains (after using up
 * carried-forward losses) count as taxable income; `immediate` taxes them now (menu trades),
 * otherwise yearlyFinance taxes them with the rest of the year's income.
 */
function realize(g: GameState, net: number, gain: number, immediate: boolean): Realized {
  const carry = lossCarry(g)
  const cash = Math.max(0, Math.min(MAX_INVESTMENT_VALUE, Math.round(Number.isFinite(net) ? net : 0)))
  const gn = Math.max(-MAX_INVESTMENT_VALUE, Math.min(MAX_INVESTMENT_VALUE, Math.round(Number.isFinite(gain) ? gain : 0)))
  if (gn <= 0) {
    g.flags.investLossCarry = Math.min(MAX_INVESTMENT_VALUE, Math.round(carry - gn))
    addMoney(g, cash)
    return { gain: gn, taxable: 0, offset: 0, tax: 0 }
  }
  const offset = Math.min(carry, gn)
  g.flags.investLossCarry = Math.round(carry - offset)
  const taxable = Math.min(cash, Math.max(0, gn - offset))
  addMoney(g, cash - taxable)
  earnIncome(g, taxable)
  const tax = immediate && taxable > 0 ? taxAdditionalIncome(g, taxable) : 0
  return { gain: gn, taxable, offset, tax }
}

/** Estimated tax on selling a holding for `gross` right now. */
function estimateTax(g: GameState, a: Asset, gross: number): { fee: number; penalty: number; gain: number; tax: number; impact: number } {
  const v = holdingValue(a)
  const frac = v > 0 ? Math.min(1, gross / v) : 1
  const fee = feeFor(feePlan(g, typeOf(a)), gross)
  const penalty = earlyPenalty(g, a, gross)
  const depth = tradingDepth(g, typeOf(a), a.details)
  const impact = depth ? gross - saleImpact(gross, depth).proceeds : 0
  const gain = Math.round(gross - impact - fee - penalty - basis(a) * frac)
  const taxable = Math.max(0, gain - Math.min(lossCarry(g), Math.max(0, gain)))
  const before = Math.max(0, num(g.flags.taxableIncome))
  const tax = taxable > 0 ? Math.max(0, gameIncomeTax(g, before + taxable) - gameIncomeTax(g, before)) : 0
  return { fee, penalty, gain, tax, impact }
}

/** What selling the whole holding right now would pay, before tax: the Sell All row's figure. */
function saleEstimate(g: GameState, a: Asset): number {
  const value = holdingValue(a)
  const est = estimateTax(g, a, value)
  return Math.max(0, value - est.fee - est.penalty - est.impact)
}

/** True when a sale would pay clearly something else than the marked value (more than 5% apart): then it is worth saying. */
function sellsApart(sale: number, marked: number): boolean {
  return Math.abs(sale - marked) > 0.05 * Math.max(0, marked)
}

/**
 * The size of a buy order, in the money that reaches the market, at which price impact starts to cost
 * more than `1 - keep` of it (the default asks where an order first loses over 10%). It is the order at
 * which buyImpact returns `keep` of the money, found by halving because that share only falls as the
 * order grows. 0 when the depth is not a positive number.
 */
export function buyImpactLimit(depth: number, keep = 0.9): number {
  if (!(depth > 0) || !Number.isFinite(depth)) return 0
  const share = Number.isFinite(keep) ? Math.min(0.999, Math.max(0.01, keep)) : 0.9
  let lo = 0
  let hi = depth * 1e6
  if (!Number.isFinite(hi)) return 0
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (buyImpact(mid, depth).value / mid > share) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** The order that leaves `invested` for the market once the broker's fee is taken out of it. */
function orderFor(plan: FeePlan, invested: number): number {
  let amount = invested
  for (let i = 0; i < 6; i++) amount = invested + feeFor(plan, amount)
  return Math.round(amount)
}

/** The largest whole order whose money for the market, after the fee, is not past `invested` (orderFor rounds). */
function safeOrder(plan: FeePlan, invested: number): number {
  let amount = Math.floor(orderFor(plan, invested))
  for (let i = 0; i < 4 && amount > 0 && amount - feeFor(plan, amount) > invested; i++) amount--
  return Math.max(0, amount)
}

/** Down to two significant figures (191,936,123 -> 190,000,000), so a suggested amount reads as a round number. */
function roundDown(x: number): number {
  if (!(x >= 1) || !Number.isFinite(x)) return 0
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1)
  return Math.floor(x / unit) * unit
}

function earlyPenalty(g: GameState, a: Asset, gross: number): number {
  if (typeOf(a) !== 'savings' || str(a.details.product) !== 'term') return 0
  if (g.year >= num(a.details.maturity)) return 0
  return Math.round(gross * Math.max(0, num(a.details.yield)))
}

// ---------------------------------------------------------------------------
// Quotes: what you can buy here, and at what price

interface Quote {
  type: InvestType
  secId: string
  name: string
  symbol: string
  emoji: string
  price: number
  risk: number
  yield: number
  /** This year's change (null when it just listed). */
  ret: number | null
  sector: string
  blurb: string
  /** Why it can't be bought right now (other than age/prison/cash). */
  blocked: string | null
  /** An issue that no longer takes new money (an old bond or term deposit). */
  closed?: boolean
  /** Template for a new holding's details. */
  details: Record<string, Json>
  /** Rough size class of a real listed company ('Large-cap'); empty for everything else. */
  size?: string
  /** Menu ordering by size (bigger first). */
  rank?: number
}

/**
 * The market engine's version stamped on a holding's details. Holdings from before real companies
 * (no stamp) are re-anchored once to today's quotes without changing their value (normalizeHoldings).
 */
const ENGINE_V = 2

function exDetails(info: ExInfo, year: number): Record<string, Json> {
  return {
    exKey: info.key,
    exchange: info.ex.code,
    exName: exchangeName(info, year),
    market: indexName(info, year),
    exVol: info.ex.volatility,
    exDrift: info.ex.drift,
    exHome: info.home,
  }
}

/** The exchange a holding trades on (rebuilt from its details if the data has changed). */
function holdingExchange(a: Asset): ExInfo {
  const d = a.details
  const key = str(d.exKey)
  const known = key ? exchangeByKey(key) : undefined
  if (known) return known
  const code = str(d.exchange, 'NYSE')
  const index = str(d.market, 'S&P 500')
  return {
    key: key || `${code}:${index}`,
    ex: { name: str(d.exName, code), code, index, volatility: num(d.exVol, 0.18), drift: num(d.exDrift, 0.07) },
    home: str(d.exHome, str(d.country, 'us')),
  }
}

function stockQuote(info: ExInfo, s: SecYear, penny: boolean, year: number, blocked: string | null): Quote {
  const def = penny ? pennyDef(info, s.slot, s.gen) : companyDef(info, s.slot, s.gen)
  // The company as it looked that year (a 1925 'tech' company makes tabulating machines).
  const era = eraIdentity(def, year)
  const sector = era.label
  const sized = !penny && realPlanOf(info) !== null
  return {
    type: penny ? 'penny' : 'stock',
    secId: def.id,
    name: era.name,
    symbol: def.symbol,
    emoji: penny ? TYPE_EMOJI.penny : era.emoji,
    price: s.price,
    risk: def.risk,
    yield: def.dy,
    ret: s.event === 'ipo' ? null : s.ret,
    sector,
    blurb: era.blurb,
    blocked,
    size: sized ? sizeLabelOf(def, year) : undefined,
    rank: sized ? sizeRankOf(def, year) : undefined,
    details: { type: penny ? 'penny' : 'stock', secId: def.id, symbol: def.symbol, risk: def.risk, yield: def.dy, sector, blurb: era.blurb, slot: s.slot, gen: s.gen, beta: def.beta, vol: def.idio, country: info.home, eng: ENGINE_V, ...exDetails(info, year) },
  }
}

function bankName(countryId: string): string {
  const words = localWords(countryId)
  const w = words[Math.abs(hashWord(countryId)) % words.length]
  return `${w} Savings Bank`
}

function hashWord(s: string): number {
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function defaultRiskLabel(p: number): string {
  if (p <= 0) return 'very low'
  if (p < 0.01) return 'low'
  if (p < 0.03) return 'moderate'
  if (p < 0.06) return 'high'
  return 'very high'
}

function bondRisk(countryId: string, year?: number): number {
  return Math.max(1, Math.min(5, 1 + Math.round(countryStress(countryId, year) * 4)))
}

/** A quote with any market shock applied (a ban, a state contract, a presidential endorsement...). */
function withShock(_g: GameState, q: Quote, now: number, before: number): Quote {
  if (now === 1 && before === 1) return q
  const mv = shockedMove(q.price, q.ret, now, before)
  return { ...q, price: Math.max(0.0001, mv.price), ret: mv.ret }
}

interface Listing {
  info: ExInfo
  year: ExYear
  stocks: Quote[]
  pennies: Quote[]
  fund: Quote
  reit: Quote
  bond: Quote
  savings: Quote
  term: Quote
  gold: Quote
  crypto: Quote[]
}

export function liveDepositRate(g: GameState, country: string, product: 'savings' | 'term' | 'bond'): number {
  const base = product === 'savings' ? savingsRate(country, g.year) : product === 'term' ? termRate(country, g.year) : bondRate(country, g.year)
  const delta = economyOf(g, country).rate - initialCountry(country, g.year).rate
  return bound(base + delta * (product === 'savings' ? .7 : .9), 0, isHistoryYear(g.year) ? 10 : .4)
}

function listing(g: GameState): Listing {
  const cid = g.character.countryId
  const y = g.year
  const m = localMarket(g)
  const info = exchangeInfo(cid)
  const f = fam(g)
  const an = anchor(g)
  const ey = exchangeYear(f, an, info, y)
  const country = countryName(cid)
  const homeWord = localWords(info.home)[0]
  const index = indexName(info, y)
  const marketBlock = stockMarketBlock(g, info)
  const blocked = investingBlocked(cid, y)
  const stocks = ey.stocks.map((s) => withShock(g, stockQuote(info, s, false, y, marketBlock), shockFactor(g, companyDef(info, s.slot, s.gen).id, y), shockFactor(g, companyDef(info, s.slot, s.gen).id, y - 1)))
  const pennies = ey.pennies.map((s) => withShock(g, stockQuote(info, s, true, y, marketBlock), shockFactor(g, s.id, y), shockFactor(g, s.id, y - 1)))
  const fundId = ey.fund.id
  // Before index funds existed (1976 in the US), the closest thing was a pricey investment trust.
  const fn = fundName(info, y)
  const realFund = !fn.trust
  const fee = fundFee(info, y)
  const fund: Quote = {
    type: 'index',
    secId: fundId,
    name: fn.name,
    symbol: `${info.ex.code.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}X`,
    emoji: TYPE_EMOJI.index,
    price: ey.fund.price,
    risk: info.ex.volatility >= 0.3 ? 3 : 2,
    yield: indexYield(info),
    ret: ey.year === an ? null : ey.fund.ret,
    sector: realFund ? 'Index fund' : 'Investment trust',
    blurb: realFund
      ? `Tracks the ${index}: every company in it in one go. Yearly fee in this game: ${rateText(fee)}.`
      : `Owns shares in most of the big companies on the ${exchangeName(info, y)}. Index funds haven't been invented yet, so a manager charges ${rateText(fee)} a year to do roughly the same thing.`,
    blocked: marketBlock,
    details: {},
  }
  fund.details = { type: 'index', secId: fundId, symbol: fund.symbol, risk: fund.risk, yield: fund.yield, sector: fund.sector, blurb: fund.blurb, country: info.home, eng: ENGINE_V, ...exDetails(info, y) }
  Object.assign(fund, withShock(g, fund, indexShockFactor(g, info.key, y, fundId), indexShockFactor(g, info.key, y - 1, fundId)))
  const reitName = `${homeWord} Property Trust`
  const reit: Quote = {
    type: 'reit',
    secId: ey.reit.id,
    name: reitName,
    symbol: `${reitName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}R`,
    emoji: TYPE_EMOJI.reit,
    price: ey.reit.price,
    risk: 3,
    yield: reitYield(info, y),
    ret: ey.year === an ? null : ey.reit.ret,
    sector: 'Real estate',
    blurb: `Owns malls, offices and apartment blocks in ${theCountry(info.home)} and pays out most of the rent. It rises and falls with local house prices.`,
    blocked: marketBlock ?? reitBlock(g, info),
    details: {},
  }
  reit.details = { type: 'reit', secId: reit.secId, symbol: reit.symbol, risk: reit.risk, yield: reit.yield, sector: reit.sector, blurb: reit.blurb, country: info.home, eng: ENGINE_V, ...exDetails(info, y) }
  Object.assign(reit, withShock(g, reit, economyMarketFactor(g, info.home, y, true), economyMarketFactor(g, info.home, y - 1, true)))

  const br = liveDepositRate(g, cid, 'bond')
  const pDef = defaultChance(cid, y)
  const bond: Quote = {
    type: 'bond',
    secId: `bond:${cid}:${y}`,
    name: `${country} Government Bond (due ${y + BOND_YEARS})`,
    symbol: `${cid.toUpperCase()}10Y`,
    emoji: TYPE_EMOJI.bond,
    price: 1_000,
    risk: bondRisk(cid, y),
    yield: br,
    ret: null,
    sector: 'Government bond',
    blurb: `A loan to the government of ${theCountry(cid)}, paid back in the local currency (${currencyOf(g.character.countryId, g.year).name}). Default risk: ${defaultRiskLabel(pDef)}.`,
    blocked: null,
    details: {},
  }
  bond.details = { type: 'bond', secId: bond.secId, symbol: bond.symbol, risk: bond.risk, yield: br, sector: bond.sector, blurb: bond.blurb, country: cid, currency: currencyOf(g.character.countryId, g.year).name, maturity: y + BOND_YEARS }
  const bank = bankName(cid)
  const sr = liveDepositRate(g, cid, 'savings')
  const insured = depositInsurance(cid, y)
  const savings: Quote = {
    type: 'savings',
    secId: `savings:${cid}`,
    name: `Savings Account (${bank})`,
    symbol: '',
    emoji: TYPE_EMOJI.savings,
    price: 1,
    risk: Math.max(1, Math.min(4, 1 + Math.round(countryStress(cid, y) * 3))),
    yield: sr,
    ret: null,
    sector: 'Savings',
    blurb: `Interest follows the central bank's rate. Withdraw anytime. ${insured > 0 ? `Deposits are insured up to ${formatMoney(insured)}.` : "Deposits aren't insured: if the bank fails, you join the queue with everyone else."}`,
    blocked: null,
    details: {},
  }
  savings.details = { type: 'savings', product: 'savings', secId: savings.secId, symbol: '', risk: savings.risk, yield: sr, sector: 'Savings', blurb: savings.blurb, country: cid, bank, currency: currencyOf(g.character.countryId, g.year).name }
  const tr = liveDepositRate(g, cid, 'term')
  const term: Quote = {
    ...savings,
    secId: `term:${cid}:${y}`,
    name: `${TERM_YEARS}-Year Term Deposit (${bank})`,
    yield: tr,
    sector: 'Term deposit',
    blurb: `A fixed ${rateText(tr)} for ${TERM_YEARS} years. Take the money out early and you give back a year of interest.`,
    details: {},
  }
  term.details = { ...savings.details, product: 'term', secId: term.secId, yield: tr, sector: 'Term deposit', blurb: term.blurb, maturity: y + TERM_YEARS }

  const gy = goldYear(f, an, y)
  const hedge = goldHedge(cid, y)
  const gold: Quote = {
    type: 'gold',
    secId: `gold:${cid}`,
    name: 'Gold Bullion',
    symbol: 'XAU',
    emoji: TYPE_EMOJI.gold,
    price: gy.price,
    risk: 2,
    yield: 0,
    ret: y === an ? null : gy.ret,
    sector: 'Precious metals',
    blurb:
      hedge > 0
        ? `Priced in dollars worldwide, so it doesn't care when the ${currencyOf(g.character.countryId, g.year).name} loses value. With inflation here at ${rateText(m.inflation)}, local gold has been beating the world price by about ${rateText(hedge)} a year.`
        : 'Priced in dollars worldwide. It pays nothing, but it tends to hold up when stock markets panic.',
    blocked: goldBlock(g),
    details: {},
  }
  gold.details = { type: 'gold', secId: gold.secId, symbol: 'XAU', risk: 2, yield: 0, sector: gold.sector, blurb: gold.blurb, country: cid }

  const cy = cryptoYear(f, an, y)
  const banned = blocked ?? (CRYPTO_BANNED.has(cid) ? `Crypto trading is banned in ${theCountry(cid)}.` : null)
  // Only coins that exist this year (none before 2009; later coins appear in their eras).
  const crypto = listedCoins(cy).map((c): Quote => {
    const def = coinDef(c.slot, c.gen)
    return withShock(g, {
      type: 'crypto',
      secId: def.id,
      name: def.name,
      symbol: def.symbol,
      emoji: def.stable ? '💵' : TYPE_EMOJI.crypto,
      price: c.price,
      risk: def.risk,
      yield: def.yield,
      ret: c.event === 'ipo' || y === an ? null : c.ret,
      sector: def.stable ? 'Stablecoin' : 'Cryptocurrency',
      blurb: def.blurb,
      blocked: banned,
      details: { type: 'crypto', secId: def.id, symbol: def.symbol, risk: def.risk, yield: def.yield, sector: def.stable ? 'Stablecoin' : 'Cryptocurrency', blurb: def.blurb, slot: c.slot, gen: c.gen, country: cid },
    }, shockFactor(g, def.id, y), shockFactor(g, def.id, y - 1))
  })
  // This year's moves read like the index line and "Recent years" beside them: in the money of
  // the year (reportedMove), not constant dollars ("FTSE 100 up 14.8%" over an ETF "▲10.0%").
  const shown = (q: Quote): Quote => (q.ret === null ? q : { ...q, ret: reportedMove(info, y, q.ret).pct })
  return { info, year: ey, stocks: stocks.map(shown), pennies: pennies.map(shown), fund: shown(fund), reit: shown(reit), bond, savings, term, gold: shown(gold), crypto: crypto.map(shown) }
}

/** What a resident can buy right now (used by tests and tools): id, type, name, ticker, price, risk. */
export function investmentListing(g: GameState): { secId: string; type: InvestType; name: string; symbol: string; price: number; risk: number; yield: number; exchange: string }[] {
  const l = listing(g)
  return allQuotes(l).map((q) => ({ secId: q.secId, type: q.type, name: q.name, symbol: q.symbol, price: q.price, risk: q.risk, yield: q.yield, exchange: q.type === 'stock' || q.type === 'penny' || q.type === 'index' || q.type === 'reit' ? l.info.ex.code : '' }))
}

function allQuotes(l: Listing): Quote[] {
  return [...l.stocks, ...l.pennies, l.fund, l.reit, l.bond, l.savings, l.term, l.gold, ...l.crypto]
}

/** Bonds and term deposits are bought one issue at a time; older issues can't be topped up. */
function closedIssue(a: Asset): boolean {
  const t = typeOf(a)
  return t === 'bond' || (t === 'savings' && str(a.details.product) === 'term')
}

/** A quote for an existing holding (it may trade on another country's exchange after a move). */
function holdingQuote(g: GameState, a: Asset): Quote {
  const local = allQuotes(listing(g)).find((q) => q.secId === str(a.details.secId))
  if (local) return { ...local, price: typeOf(a) === 'gold' || typeOf(a) === 'bond' || typeOf(a) === 'savings' ? unitPrice(a) : local.price }
  const t = typeOf(a)
  return {
    type: t,
    secId: str(a.details.secId, a.id),
    name: a.name,
    symbol: str(a.details.symbol),
    emoji: a.emoji,
    price: unitPrice(a),
    risk: num(a.details.risk, 3),
    yield: num(a.details.yield),
    ret: null,
    sector: str(a.details.sector, TYPE_LABEL[t]),
    blurb: str(a.details.blurb),
    blocked:
      t === 'crypto' && CRYPTO_BANNED.has(g.character.countryId)
        ? `Crypto trading is banned in ${theCountry(g.character.countryId)}.`
        : closedIssue(a)
          ? 'This issue is closed to new money. Buy a new one instead.'
          : holdingMarketBlock(g, a),
    closed: closedIssue(a),
    details: { ...a.details },
  }
}

// ---------------------------------------------------------------------------
// Trading

function tradeBlock(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return "You're dead. Your portfolio belongs to your heirs now."
  if (inPrison(g)) return "You can't trade from prison. Your holdings keep moving without you."
  if (c.age < 18) return 'You must be at least 18 years old to open a brokerage account.'
  return null
}

/** Exchange-traded holdings can't be traded while their exchange is shut. */
function isListed(t: InvestType): boolean {
  return t === 'stock' || t === 'penny' || t === 'index' || t === 'reit'
}

/** Why this holding's market is shut this year (null when it trades). */
function holdingMarketBlock(g: GameState, a: Asset): string | null {
  if (!isListed(typeOf(a))) return null
  const info = holdingExchange(a)
  const status = exchangeStatus(info, g.year)
  if (status === 'open') return null
  if (status === 'closed') {
    const why = exchangeClosedReason(info.home, g.year)
    return `The ${exchangeName(info, g.year)} is closed${why ? `: ${why}` : '.'} Nobody can trade until it reopens.`
  }
  return 'There is no stock market to trade on right now.'
}

/** Why a holding can't be sold right now (null when it can). */
function sellBlock(g: GameState, a: Asset): string | null {
  return tradeBlock(g) ?? holdingMarketBlock(g, a)
}

/** Most of a coin you can buy in a historical year: the early crypto market was tiny. */
function cryptoRoom(g: GameState, q: Quote): number | null {
  if (q.type !== 'crypto' || !isHistoryYear(g.year)) return null
  const cap = coinMarketCap(Math.round(num(q.details.slot, -1)), g.year)
  if (cap === null) return null
  const raw = g.flags.cryptoBuys
  const rec = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.year === g.year ? raw : null
  const used = rec ? num(rec[q.secId]) : 0
  return Math.max(0, Math.floor(cap * 0.02 - used))
}

function noteCryptoBuy(g: GameState, secId: string, amount: number): void {
  const raw = g.flags.cryptoBuys
  const rec: Record<string, Json> = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.year === g.year ? raw : { year: g.year }
  rec[secId] = num(rec[secId]) + Math.max(0, Math.round(amount))
  g.flags.cryptoBuys = rec
}

function buyBlock(g: GameState, q: Quote): string | null {
  const b = tradeBlock(g)
  if (b) return b
  if (q.blocked) return q.blocked
  const min = minTrade(g)
  if (g.character.money < min) return `You need at least ${formatMoney(min)} in the bank to invest.`
  if (!(q.price > 0)) return 'This security is not trading right now.'
  const room = cryptoRoom(g, q)
  if (room !== null && room < min) return `Hardly anyone trades ${q.name} yet: the whole market is a few hobbyists on internet forums, and nobody is selling more this year.`
  return null
}

/** Buy `amount` dollars of a security (fees come out of the amount). Returns true on success. */
export function buySecurity(g: GameState, secId: string, amount: number): boolean {
  // An old holding may be swapped for its slot's company on the spot: "buy more" follows it.
  const old = findHolding(g, secId)
  normalizeHoldings(g)
  if (old) secId = str(old.details.secId, secId)
  const held = findHolding(g, secId)
  const q = allQuotes(listing(g)).find((x) => x.secId === secId) ?? (held ? holdingQuote(g, held) : undefined)
  if (!q) {
    notice(g, 'Order Rejected', 'That security is no longer listed.', { emoji: '🚫' })
    return false
  }
  const block = buyBlock(g, q)
  if (block) {
    notice(g, 'Order Rejected', block, { emoji: '🚫' })
    return false
  }
  const min = minTrade(g)
  const amt = Math.floor(Number.isFinite(amount) ? amount : 0)
  if (amt < min) {
    notice(g, 'Order Rejected', `The minimum order is ${formatMoney(min)}.`, { emoji: '🚫' })
    return false
  }
  if (amt > MAX_INVESTMENT_VALUE || (held && (basis(held) > MAX_INVESTMENT_VALUE - amt || holdingValue(held) > MAX_INVESTMENT_VALUE - amt))) {
    notice(g, 'Order Rejected', 'That order is too large for one brokerage position.', { emoji: '🚫' })
    return false
  }
  if (amt > g.character.money) {
    notice(g, 'Insufficient Funds', `You only have ${formatMoney(g.character.money)} in the bank.`, { emoji: '💸', tone: 'bad' })
    return false
  }
  const room = cryptoRoom(g, q)
  if (room !== null && amt > room) {
    notice(g, 'Not Enough Sellers', `The ${q.name} market is still tiny: about ${formatMoney(room)} more is all anyone will sell you this year.`, { emoji: '🪙' })
    return false
  }
  const fee = feeFor(feePlan(g, q.type), amt)
  const invested = amt - fee
  // Gold, bonds and deposits track their own unit price per holding; listed securities use the market price.
  const price = held && (q.type === 'gold' || q.type === 'bond' || q.type === 'savings') ? unitPrice(held) || q.price : q.price
  if (!(price > 0) || invested <= 0 || !spend(g, amt)) {
    notice(g, 'Order Rejected', 'The order could not be filled.', { emoji: '🚫' })
    return false
  }
  const depth = tradingDepth(g, q.type, q.details)
  const order = depth ? buyImpact(invested, depth) : { value: invested, end: 1 }
  const newUnits = order.value / price
  let a = held
  // What was bought in the last two years before this order (a holding saved without it is read from boughtYear).
  const bought = a ? buysNow(a, g.year) : { prev: 0, cur: 0 }
  if (a) {
    const oldUnits = units(a)
    const oldValue = holdingValue(a)
    if (q.type === 'bond' || q.type === 'savings') {
      // Blend the fixed rate by value.
      a.details.yield = Math.round(((num(a.details.yield) * oldValue + q.yield * invested) / Math.max(1, oldValue + invested)) * 10000) / 10000
    }
    setPosition(a, oldUnits + newUnits, price, basis(a) + amt)
  } else {
    a = {
      id: uid(g, 'a'),
      kind: 'investment',
      name: q.name,
      emoji: q.emoji,
      purchasePrice: amt,
      value: 0,
      condition: 100,
      purchasedAge: g.character.age,
      upkeep: 0,
      details: { ...q.details, income: 0, boughtYear: g.year },
    }
    setPosition(a, newUnits, price, amt)
    g.assets.push(a)
  }
  storeBuys(a, [[g.year - 1, bought.prev], [g.year, bought.cur + newUnits]])
  count(g, 'investTrades')
  count(g, 'moneyInvested', amt)
  if (depth) recordOrderFlow(g, a, order.end)
  if (room !== null) noteCryptoBuy(g, q.secId, amt)
  const what = q.type === 'savings' ? `put ${formatMoney(invested)} into ${str(q.details.product) === 'term' ? 'a term deposit' : 'savings'}` : `bought ${unitsText(newUnits)} ${unitLabel(q)} of ${q.name}${q.symbol ? ` (${q.symbol})` : ''}`
  const feeLine = fee > 0 ? ` ${formatMoney(fee)} went to fees.` : ''
  // Price impact past the 10% mark (the mark the Buy row names), measured on the money that reached the market:
  // the fee is not price impact.
  const lost = depth && invested > 0 ? 1 - order.value / invested : 0
  const impactLine = lost > 0.1
    ? ` The order moved the price, so on paper it lost ${lost >= 0.9995 ? 'over 99.9%' : absPct(lost, 1)} of what you paid.`
    : depth ? ' Order-book depth affects your execution price; large orders move the market.' : ''
  // The position's marked value and what selling it all returns, each said once and the sale last, whenever they
  // are more than 5% apart (the Investments header's rule). That covers a big order, a top-up of a lifted
  // position, and a fee or an early-withdrawal penalty that eats into a small one.
  const sale = saleEstimate(g, a)
  const valueLine = sellsApart(sale, a.value)
    ? ` Your position is valued at ${formatMoney(a.value)}. ${q.type === 'savings' ? 'Closing it now' : 'A full sale'} would return about ${formatMoney(sale)}, before tax.`
    : ` Your position is now worth ${formatMoney(a.value)}.`
  notice(g, 'Order Filled', `You ${what} for ${formatMoney(amt)}.${feeLine}${impactLine}${valueLine}`, { emoji: q.emoji, tone: 'good' })
  log(g, q.type === 'savings' ? `I put ${formatMoney(amt)} in the bank.` : `I invested ${formatMoney(amt)} in ${q.name}.`)
  return true
}

interface SaleResult {
  gross: number
  fee: number
  penalty: number
  net: number
  realized: Realized
  impact?: number
}

/** Gameplay liquidity, not a claim about a real exchange's current order book. */
function tradingDepth(g: GameState, type: InvestType, details: Record<string, Json>): number | null {
  if (type !== 'stock' && type !== 'penny' && type !== 'crypto') return null
  const cap = type === 'crypto' ? coinMarketCap(Math.round(num(details.slot, -1)), g.year) : null
  const base = type === 'penny' ? 5_000_000 : type === 'crypto' ? Math.max(50_000, (cap ?? 1_000_000_000) * .05) : 500_000_000
  return base * shockFactor(g, str(details.secId), g.year)
}

function recordOrderFlow(g: GameState, a: Asset, mult: number): void {
  const d = a.details
  const before = shockFactor(g, str(d.secId), g.year)
  addMarketShock(g, { asset: typeOf(a) === 'crypto' ? 'coin' : 'stock', secId: str(d.secId), exKey: str(d.exKey, 'crypto'), slot: num(d.slot), name: a.name, symbol: str(d.symbol), cause: 'liquidity', year: g.year, mult, fade: 0, countryId: str(d.country, g.character.countryId) })
  // Foreign holdings may not occur in the player's current-country quote list.
  if (g.assets.includes(a)) {
    syncOwnFlow(g, a)
    setPosition(a, units(a), unitPrice(a) * shockFactor(g, str(d.secId), g.year) / before, basis(a))
  }
  revalueHoldings(g)
}

function sellCore(g: GameState, a: Asset, grossWanted: number): SaleResult | null {
  if (a.details.type === 'npcEquity') return null
  const value = holdingValue(a)
  if (value <= 0) {
    g.assets = g.assets.filter((x) => x.id !== a.id)
    return { gross: 0, fee: 0, penalty: 0, net: 0, realized: realize(g, 0, -basis(a), true) }
  }
  const gross = Math.max(0, Math.min(value, Math.round(grossWanted)))
  if (gross <= 0) return null
  const all = value - gross < Math.max(1, minTrade(g) / 10)
  const frac = all ? 1 : gross / value
  const sold = all ? value : gross
  const fee = feeFor(feePlan(g, typeOf(a)), sold)
  const penalty = earlyPenalty(g, a, sold)
  const depth = tradingDepth(g, typeOf(a), a.details)
  const order = depth ? saleImpact(sold, depth) : { proceeds: sold, end: 1 }
  const net = Math.max(0, order.proceeds - fee - penalty)
  const basisPart = basis(a) * frac
  if (all) g.assets = g.assets.filter((x) => x.id !== a.id)
  else {
    // Selling what you just bought is not timing: a sale takes this year's units first, then last
    // year's, and only then the older ones. A holding without per-year data keeps reading from boughtYear.
    const tracked = buysOf(a) !== null
    const bought = buysNow(a, g.year)
    const soldUnits = units(a) * frac
    setPosition(a, units(a) * (1 - frac), unitPrice(a), basis(a) - basisPart)
    if (tracked) {
      const cur = Math.max(0, bought.cur - soldUnits)
      const prev = Math.max(0, bought.prev - Math.max(0, soldUnits - bought.cur))
      storeBuys(a, [[g.year - 1, prev], [g.year, cur]])
    }
  }
  const realized = realize(g, net, net - basisPart, true)
  if (depth) recordOrderFlow(g, a, order.end)
  count(g, 'investTrades')
  return { gross: sold, fee, penalty, net, realized, impact: sold - order.proceeds }
}

function gainLine(r: Realized): string {
  if (r.gain > 0) {
    const off = r.offset > 0 ? ` ${formatMoney(r.offset)} of it was covered by earlier losses.` : ''
    return `Profit: ${formatMoney(r.gain)}.${off}${r.tax > 0 ? ` You owe ${formatMoney(r.tax)} in tax on it at your income tax rate.` : r.taxable > 0 ? ' It falls under your tax-free allowance this year.' : ''}`
  }
  if (r.gain < 0) return `Loss: ${formatMoney(-r.gain)}. It will offset tax on future profits.`
  return 'You broke even.'
}

/** Sell `amount` dollars of a holding ('all' sells everything). */
export function sellHolding(g: GameState, assetId: string, amount: number | 'all'): boolean {
  // Old saves may still contain index NAVs inflated by personal order flow.
  revalueHoldings(g, true)
  const a = g.assets.find((x) => x.id === assetId && x.kind === 'investment')
  if (!a) return false
  const block = sellBlock(g, a)
  if (block) {
    notice(g, 'Order Rejected', block, { emoji: '🚫' })
    return false
  }
  const value = holdingValue(a)
  const want = amount === 'all' ? value : Math.floor(Number.isFinite(amount) ? amount : 0)
  if (amount !== 'all' && want <= 0) {
    notice(g, 'Order Rejected', 'Enter an amount to sell.', { emoji: '🚫' })
    return false
  }
  const res = sellCore(g, a, want)
  if (!res) return false
  const t = typeOf(a)
  const extra = [res.fee > 0 ? `Fees: ${formatMoney(res.fee)}.` : '', res.penalty > 0 ? `Early withdrawal penalty: ${formatMoney(res.penalty)}.` : '', (res.impact ?? 0) >= 1 ? `Market depth reduced proceeds by ${formatMoney(res.impact!)} and moved the quote. Splitting an order does not avoid the price impact.` : ''].filter(Boolean).join(' ')
  const verb = t === 'savings' ? `withdrew ${formatMoney(res.gross)} from your ${str(a.details.product) === 'term' ? 'term deposit' : 'savings account'}` : `sold ${formatMoney(res.gross)} of ${a.name}`
  notice(g, t === 'savings' ? 'Withdrawal' : 'Order Filled', `You ${verb}. ${extra ? `${extra} ` : ''}${formatMoney(res.net)} landed in your bank account. ${gainLine(res.realized)}`, { emoji: a.emoji, tone: res.realized.gain >= 0 ? 'good' : 'bad' })
  log(g, t === 'savings' ? `I withdrew ${formatMoney(res.gross)} from the bank.` : res.realized.gain >= 0 ? `I sold some ${a.name} at a profit.` : `I sold some ${a.name} at a loss.`, res.realized.gain >= 0 ? 'good' : 'bad')
  return true
}

/** Sell every holding at once. */
export function liquidatePortfolio(g: GameState): boolean {
  revalueHoldings(g, true)
  const block = tradeBlock(g)
  if (block) {
    notice(g, 'Order Rejected', block, { emoji: '🚫' })
    return false
  }
  // Holdings on a shut exchange stay put until it reopens.
  const list = investmentHoldings(g).filter((a) => !holdingMarketBlock(g, a))
  const stuck = investmentHoldings(g).length - list.length
  if (!list.length) {
    if (stuck) notice(g, 'Order Rejected', 'Your stock market is shut, so none of your holdings can be sold right now.', { emoji: '🚫' })
    return false
  }
  let gross = 0
  let fees = 0
  let net = 0
  let gain = 0
  let tax = 0
  for (const a of list) {
    const r = sellCore(g, a, holdingValue(a))
    if (!r) continue
    gross += r.gross
    fees += r.fee + r.penalty
    net += r.net
    gain += r.realized.gain
    tax += r.realized.tax
  }
  const result = gain > 0 ? `Overall profit: ${formatMoney(gain)}${tax > 0 ? `, and ${formatMoney(tax)} of tax on it` : ''}.` : gain < 0 ? `Overall loss: ${formatMoney(-gain)}, which will offset tax on future profits.` : 'You broke even.'
  const stuckLine = stuck ? ` ${stuck === 1 ? 'One holding is' : `${stuck} holdings are`} stuck on a closed exchange.` : ''
  notice(g, 'Portfolio Liquidated', `You sold ${stuck ? 'what you could' : 'everything'} for ${formatMoney(gross)}. Fees and penalties: ${formatMoney(fees)}. ${formatMoney(net)} landed in your bank account. ${result}${stuckLine}`, { emoji: '💰', tone: gain >= 0 ? 'good' : 'bad' })
  log(g, 'I sold my entire investment portfolio.', gain >= 0 ? 'good' : 'bad')
  return true
}

// ---------------------------------------------------------------------------
// Portfolio stats

interface PortfolioStats {
  value: number
  basis: number
  /** Value-weighted change of holdings that moved this year (null if none did). */
  year: number | null
}

function portfolioStats(g: GameState): PortfolioStats {
  let value = 0
  let cost = 0
  let start = 0
  let moved = 0
  for (const a of investmentHoldings(g)) {
    value = Math.min(MAX_INVESTMENT_VALUE, value + markedValue(a))
    cost = Math.min(MAX_INVESTMENT_VALUE, cost + basis(a))
    if (num(a.details.updatedYear) === g.year) {
      const s = Math.min(MAX_INVESTMENT_VALUE, Math.max(0, num(a.details.yearStart)))
      start = Math.min(MAX_INVESTMENT_VALUE, start + s)
      const contribution = s * num(a.details.lastChange)
      moved = Math.max(-MAX_INVESTMENT_VALUE, Math.min(MAX_INVESTMENT_VALUE, moved + (Number.isFinite(contribution) ? contribution : 0)))
    }
  }
  // Reported like the market lines: in the money of the year (see reportedMove).
  return { value, basis: cost, year: start > 0 ? reportedMove(exchangeInfo(g.character.countryId), g.year, moved / start).pct : null }
}

/**
 * An index's move the way the news reported it: in past years the nominal change of the day (when
 * inflation was tame), with the real change alongside when inflation made a difference.
 */
function reportedMove(info: ExInfo, year: number, ret: number): { pct: number; real: number | null; afterInflation: boolean } {
  if (!isHistoryYear(year)) return { pct: ret, real: null, afterInflation: false }
  const infl = inflationRate(info.home, year)
  if (!(infl < 0.25)) return { pct: ret, real: null, afterInflation: true }
  const nominal = (1 + ret) * (1 + infl) - 1
  return { pct: nominal, real: Math.abs(nominal - ret) >= 0.03 ? ret : null, afterInflation: false }
}

/** '12.3%' / '12.3% after inflation' / '10.1% (13% after inflation)'. */
function moveText(m: { pct: number; real: number | null; afterInflation: boolean }, digits = 1): string {
  if (m.afterInflation) return `${absPct(m.pct, digits)} after inflation`
  return m.real !== null ? `${absPct(m.pct, digits)} (${pct(m.real, 0)} after inflation)` : absPct(m.pct, digits)
}

function indexReturn(g: GameState, info: ExInfo, year: number, ret: number): number {
  return shockedMove(1, ret, indexShockFactor(g, info.key, year), indexShockFactor(g, info.key, year - 1)).ret ?? ret
}

function marketLine(g: GameState, info: ExInfo, ey: ExYear): string {
  const m = reportedMove(info, ey.year, indexReturn(g, info, ey.year, ey.index.ret))
  const r = m.pct
  const verb = r >= 0.005 ? 'up' : r <= -0.005 ? 'down' : 'flat'
  const amount = verb === 'flat' ? '' : ` ${moveText(m)}`
  if (isHistoryYear(ey.year) && exchangeStatus(info, ey.year) === 'none') return `🚫 No stock market trades here this year`
  const breakthrough = marketBreakthroughs(g).some(event => event.year === ey.year && event.exchanges.some(ex => ex.key === info.key))
  return `${breakthrough ? '🌐' : ey.index.regime.emoji} ${indexName(info, ey.year)} ${verb}${amount} this year · ${breakthrough ? 'Technology breakthrough' : ey.index.regime.label}`
}

function historyLine(g: GameState, info: ExInfo): string {
  const f = fam(g)
  const an = anchor(g)
  const from = Math.max(an + 1, g.year - 4)
  const parts: string[] = []
  for (let y = from; y <= g.year; y++) {
    if (isHistoryYear(y) && exchangeStatus(info, y) === 'none') continue
    const m = reportedMove(info, y, indexReturn(g, info, y, exchangeYear(f, an, info, y).index.ret))
    parts.push(`'${String(y).slice(-2)} ${pct(m.pct, 0)}`)
  }
  return parts.length ? `Recent years: ${parts.join(' · ')}` : ''
}

function localNote(g: GameState): string {
  const cid = g.character.countryId
  const info = exchangeInfo(cid)
  const y = g.year
  const lines: string[] = []
  const exName = exchangeName(info, y)
  if (!hasOwnExchange(cid)) lines.push(`${countryName(cid)} has no stock exchange of its own, so your broker trades on the ${exName} (${info.ex.code}).`)
  else lines.push(`You trade on the ${exName} (${info.ex.code}).`)
  const block = stockMarketBlock(g, info)
  if (block) lines.push(block)
  const rate = economyOf(g, cid).rate
  const infl = economyOf(g, cid).inflation
  lines.push(`Policy rate ${rateText(rate)}, inflation ${inflationText(infl)}.`)
  if (isHistoryYear(y)) {
    if (infl >= 0.5) lines.push(`Prices are rising so fast that money in the bank loses value by the week.`)
    else if (rate < infl) lines.push('Interest here is below inflation, so cash in the bank slowly loses buying power.')
    else if (rate - infl >= 0.04) lines.push('Interest rates are well above inflation: a good time to be a saver, a hard one to be a borrower.')
    return lines.join(' ')
  }
  if (rate < infl) lines.push('Interest here is below inflation, so cash in the bank slowly loses buying power.')
  return lines.join(' ')
}

/** Inflation as text, readable even in a hyperinflation. */
function inflationText(infl: number): string {
  if (!Number.isFinite(infl) || infl >= 1000) return 'astronomical (prices double every few days)'
  return infl < 0 ? `${rateText(-infl)} deflation` : rateText(infl)
}

const TAX_NOTE = 'Dividends, coupons and interest are taxed as income each year. Profits are taxed when you sell, at your income tax rate; losses carry forward against future profits.'

// ---------------------------------------------------------------------------
// Menus

function offerSubtitle(q: Quote): string {
  const parts: string[] = []
  if (q.type !== 'savings' && q.type !== 'bond') parts.push(priceText(q.price))
  if (q.ret !== null) parts.push(`${change(q.ret)} this year`)
  else if (q.type === 'stock' || q.type === 'penny' || (q.type === 'crypto' && q.yield === 0)) parts.push('New listing')
  if (q.type === 'bond') parts.push(`Coupon ${rateText(q.yield)}`)
  else if (q.type === 'savings') parts.push(`Interest ${rateText(q.yield)}`)
  else if (q.type === 'crypto' && q.yield > 0) parts.push(`Pays ${rateText(q.yield)}`)
  else if (q.yield > 0) parts.push(`Div ${rateText(q.yield)}`)
  parts.push(`Risk ${riskMeter(q.risk)}`)
  return parts.join(' · ')
}

function buyAction(g: GameState, q: Quote, held: boolean): MenuAction {
  const min = minTrade(g)
  const cash = Math.max(0, Math.floor(g.character.money))
  const plan = feePlan(g, q.type)
  const suggestion = Math.min(cash, Math.max(min, Math.round((cash * 0.25) / 100) * 100))
  // Where an order starts to lose over 10% to price impact (the Order Filled notice speaks up past the same mark).
  const depth = tradingDepth(g, q.type, q.details)
  const limit = depth ? buyImpactLimit(depth) : 0
  const impact = limit > 0 ? `Orders above about ${shortMoney(orderFor(plan, limit))} lose over 10% to price impact` : ''
  // The amount dialog opens at or under that mark: a quarter of a fortune would otherwise go far past it.
  const start = Math.max(min, limit > 0 ? Math.min(suggestion, roundDown(safeOrder(plan, limit))) : suggestion)
  return {
    type: 'action',
    id: `inv-buy-${q.secId}`,
    label: held ? (q.type === 'savings' ? 'Deposit More' : 'Buy More') : q.type === 'savings' ? 'Deposit' : 'Buy',
    emoji: '💵',
    subtitle: `${plan.label} · Minimum ${formatMoney(min)}${impact ? ` · ${impact}` : ''}`,
    disabledReason: (gg) => buyBlock(gg, q),
    input: {
      kind: 'number',
      money: true,
      label: `How much? You have ${formatMoney(cash)}.${impact ? ` ${impact}.` : ''}`,
      placeholder: String(start),
      min,
      max: Math.max(min, cash),
      defaultValue: () => String(start),
    },
    stayOpen: true,
    run: (gg, input) => {
      buySecurity(gg, q.secId, Number(input))
    },
  }
}

function sellActions(g: GameState, a: Asset): MenuNode[] {
  const value = holdingValue(a)
  const t = typeOf(a)
  const min = Math.max(1, Math.min(minTrade(g), value))
  const deposit = t === 'savings'
  const nodes: MenuNode[] = [
    {
      type: 'action',
      id: `inv-sell-${a.id}`,
      label: deposit ? 'Withdraw Some' : 'Sell Some',
      emoji: '💸',
      subtitle: `${feePlan(g, t).label}${earlyPenalty(g, a, 100) > 0 ? ' · Early withdrawal penalty' : ''}${tradingDepth(g, t, a.details) ? ' · Large orders move prices' : ''}`,
      visible: () => value > 1,
      disabledReason: (gg) => sellBlock(gg, a),
      input: { kind: 'number', money: true, label: `How much of it? It's worth ${formatMoney(value)}.`, placeholder: String(Math.round(value / 2)), min, max: Math.max(min, value), defaultValue: () => String(Math.max(min, Math.round(value / 2))) },
      stayOpen: true,
      run: (gg, input) => {
        sellHolding(gg, a.id, Number(input))
      },
    },
    {
      type: 'action',
      id: `inv-sellall-${a.id}`,
      label: deposit ? 'Close Account' : 'Sell All',
      emoji: '💰',
      subtitle: `About ${formatMoney(saleEstimate(g, a))} after fees and price impact, before tax`,
      disabledReason: (gg) => sellBlock(gg, a),
      confirm: (gg) => {
        const cur = gg.assets.find((x) => x.id === a.id)
        if (!cur) return null
        const v = holdingValue(cur)
        const est = estimateTax(gg, cur, v)
        const bits = [`${deposit ? 'Withdraw' : 'Sell'} all of your ${cur.name} for about ${formatMoney(v)}?`]
        if (est.fee > 0) bits.push(`Fees: ${formatMoney(est.fee)}.`)
        if (est.impact >= 1) bits.push(`Market impact: about ${formatMoney(est.impact)} less in proceeds. Large orders lower the quote for your remaining shares too.`)
        if (est.penalty > 0) bits.push(`It hasn't matured yet, so you'd pay a ${formatMoney(est.penalty)} early withdrawal penalty.`)
        if (est.gain > 0) bits.push(`Estimated tax on your ${formatMoney(est.gain)} profit: ${formatMoney(est.tax)}.`)
        else if (est.gain < 0) bits.push(`You'd lock in a ${formatMoney(-est.gain)} loss.`)
        return bits.join(' ')
      },
      run: (gg) => {
        sellHolding(gg, a.id, 'all')
      },
    },
  ]
  return nodes
}

function holdingInfo(g: GameState, a: Asset): string[] {
  const t = typeOf(a)
  const d = a.details
  const v = holdingValue(a)
  const cost = basis(a)
  const u = units(a)
  const rows: string[] = []
  const where =
    t === 'bond' || t === 'savings' || t === 'gold'
      ? countryName(str(d.country, g.character.countryId))
      : t === 'crypto'
        ? 'Crypto exchange (global)'
        : `${str(d.exName, str(d.exchange))} (${str(d.exchange)})`
  rows.push(`${TYPE_LABEL[t]}${str(d.symbol) ? ` · ${str(d.symbol)}` : ''} · ${where}${str(d.sector) && t === 'stock' ? ` · ${str(d.sector)}` : ''}`)
  if (t === 'savings') rows.push(`Balance: ${formatMoney(v)}`)
  else rows.push(`Value: ${formatMoney(v)} · ${unitsText(u)} ${unitLabel({ type: t, symbol: str(d.symbol) })} at ${priceText(unitPrice(a))}`)
  if (ownFlow(a) > 1.001) rows.push(`Your own buying lifted this quote ${absPct(ownFlow(a) - 1)}, so the position counts as ${formatMoney(markedValue(a))} in your net worth. Only selling back through the market can turn the lift into cash, and selling pushes the price down again.`)
  const gain = v - cost
  const gp = cost > 0 ? gain / cost : 0
  rows.push(`Invested: ${formatMoney(cost)}${t !== 'savings' && u > 0 ? ` (avg ${priceText(cost / u)})` : ''} · ${gain >= 0 ? 'Gain' : 'Loss'}: ${formatMoney(Math.abs(gain))} (${pct(gp)})`)
  if (num(d.updatedYear) === g.year) {
    // As the listing reports it (nominal in past years), not in constant dollars.
    const home = t === 'stock' || t === 'penny' || t === 'index' || t === 'reit' ? holdingExchange(a) : exchangeInfo(str(d.country, g.character.countryId))
    rows.push(`This year: ${change(reportedMove(home, g.year, num(d.lastChange)).pct)}`)
  }
  const y = num(d.yield)
  const income = num(d.income)
  const cid = str(d.country, g.character.countryId)
  switch (t) {
    case 'bond': {
      const p = defaultChance(cid, g.year)
      rows.push(`Coupon: ${rateText(y)} a year · Default risk: ${defaultRiskLabel(p)}${income > 0 ? ` · Collected ${formatMoney(income)}` : ''}`)
      const dep = expectedDepreciation(cid, g.year)
      if (isHistoryYear(g.year)) {
        const infl = inflationRate(cid, g.year)
        if (infl >= 0.03) rows.push(`Inflation runs about ${inflationText(infl)}, which eats into what the coupon and the face value will buy.`)
      } else if (dep >= 0.03) rows.push(`The ${str(d.currency, 'local currency')} tends to lose about ${rateText(dep)} a year against the dollar, which eats into the coupon.`)
      if (num(d.maturity) > 0) rows.push(`Matures in ${num(d.maturity)}, when the government pays back the face value (in ${str(d.currency, 'the local currency')}).`)
      break
    }
    case 'savings': {
      const rate = str(d.product) === 'term' ? y : liveDepositRate(g, cid, 'savings')
      const infl = economyOf(g, cid).inflation
      const real = (1 + rate) / (1 + Math.min(1e7, infl)) - 1
      const insured = depositInsurance(cid, g.year)
      rows.push(`Interest: ${rateText(rate)} a year${income > 0 ? ` · Earned ${formatMoney(income)}` : ''}`)
      rows.push(`Inflation runs about ${inflationText(infl)}, so your real return is roughly ${pct(Math.max(-1, real))} a year. ${insured > 0 ? `Insured up to ${formatMoney(insured)}.` : 'Not insured.'}`)
      if (str(d.product) === 'term') {
        const mat = num(d.maturity)
        rows.push(g.year >= mat ? 'Matured: you can withdraw without a penalty. It keeps rolling over until you do.' : `Matures in ${mat}. Withdrawing earlier costs a year of interest.`)
      }
      break
    }
    case 'gold':
      rows.push('Pays no dividends. A hedge against crashes and a melting currency.')
      break
    case 'crypto':
      rows.push(y > 0 ? `"Staking rewards": ${rateText(y)} a year${income > 0 ? ` · Collected ${formatMoney(income)}` : ''}` : 'Pays nothing. Not insured, not regulated, not boring.')
      break
    default:
      if (y > 0) rows.push(`${t === 'reit' ? 'Rent payouts' : 'Dividend yield'}: ${rateText(y)}${income > 0 ? ` · Collected ${formatMoney(income)} so far` : ''}`)
      else rows.push(t === 'penny' ? 'Pays nothing. Could go to zero, could go to the moon.' : 'Pays no dividend: it reinvests everything in growth.')
  }
  rows.push(riskText(num(d.risk, 3)))
  if (str(d.blurb)) rows.push(str(d.blurb))
  return rows
}

/** Owned-asset screen for a kind 'investment' asset (registered in menus.ts). */
export function investmentAssetView(g: GameState, a: Asset): MenuNode[] {
  if (a.details.type === 'npcEquity') return [{ type: 'info', id: `npc-equity.${a.id}`, emoji: '🤝', text: `${a.name}: ${formatMoney(a.value)} estimated value, ${(num(a.details.share) * 100).toFixed(2)}% ownership. Private, illiquid equity—not an exchange-traded stock. Manage investment or acquisition through the founder's Life & Career profile. Dividends depend on real company profits.` }]
  const nodes: MenuNode[] = holdingInfo(g, a).map((text, i): MenuNode => ({ type: 'info', id: `inv-info-${a.id}-${i}`, text }))
  nodes.push({ type: 'heading', id: `inv-actions-${a.id}`, label: 'Actions' })
  const q = holdingQuote(g, a)
  if (!q.closed) nodes.push(buyAction(g, q, true))
  nodes.push(...sellActions(g, a))
  return nodes
}

export function investmentAssetSubtitle(_g: GameState, a: Asset): string {
  if (a.details.type === 'npcEquity') return `${shortMoney(a.value)} · private company stake`
  const t = typeOf(a)
  const v = holdingValue(a)
  const cost = basis(a)
  const gp = cost > 0 ? (v - cost) / cost : 0
  const where = t === 'stock' || t === 'penny' || t === 'index' || t === 'reit' ? str(a.details.exchange) : t === 'crypto' ? str(a.details.symbol) : TYPE_LABEL[t]
  return [shortMoney(v), change(gp), where].filter(Boolean).join(' · ')
}

function holdingNode(g: GameState, a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `inv-hold-${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: investmentAssetSubtitle(g, a),
    hint: (gg) => gutHint(gg, str(a.details.secId)),
    header: (gg) => {
      const cur = gg.assets.find((x) => x.id === a.id)
      return cur ? `${cur.emoji} ${cur.name}` : 'You no longer own this.'
    },
    children: (gg) => {
      const cur = gg.assets.find((x) => x.id === a.id)
      return cur ? investmentAssetView(gg, cur) : [{ type: 'info', id: 'gone', text: 'You no longer own this.' }]
    },
  }
}

function offerNode(_g: GameState, q: Quote, extraInfo: string[] = []): MenuGroup {
  return {
    type: 'menu',
    id: `inv-offer-${q.secId}`,
    label: q.symbol && q.type !== 'bond' && q.type !== 'savings' ? `${q.name} (${q.symbol})` : q.name,
    emoji: q.emoji,
    subtitle: offerSubtitle(q),
    hint: (gg) => gutHint(gg, q.secId),
    header: () => `${q.emoji} ${q.name}\n${q.blurb}`,
    children: (gg) => {
      const held = findHolding(gg, q.secId)
      const nodes: MenuNode[] = []
      const rows: string[] = []
      if (q.type !== 'savings' && q.type !== 'bond') rows.push(`Price: ${priceText(q.price)}${q.ret !== null ? ` (${change(q.ret)} this year)` : ''}`)
      rows.push(`${q.sector} · ${q.size ? `${q.size} (rough) · ` : ''}${riskText(q.risk)}`)
      if (q.type === 'bond') rows.push(`Coupon: ${rateText(q.yield)} a year, paid as taxable income. Sold in ${formatMoney(1_000)} bonds.`)
      else if (q.type === 'savings') rows.push(`Interest: ${rateText(q.yield)} a year, added to the balance and taxed as income.`)
      else if (q.yield > 0) rows.push(`${q.type === 'crypto' ? 'Rewards' : q.type === 'reit' ? 'Payout' : 'Dividend'}: ${rateText(q.yield)} a year, taxed as income.`)
      rows.push(...extraInfo)
      rows.forEach((text, i) => nodes.push({ type: 'info', id: `inv-oinfo-${q.secId}-${i}`, text }))
      if (held) nodes.push({ type: 'info', id: `inv-oheld-${q.secId}`, text: `You own ${formatMoney(held.value)} of this (${change(basis(held) > 0 ? (held.value - basis(held)) / basis(held) : 0)} overall).`, emoji: '💼' })
      nodes.push(buyAction(gg, q, !!held))
      if (held) nodes.push(...sellActions(gg, held))
      return nodes
    },
  }
}

function stockHistory(g: GameState, info: ExInfo, slot: number, gen: number, penny: boolean): string {
  const f = fam(g)
  const an = anchor(g)
  const parts: string[] = []
  for (let y = Math.max(an + 1, g.year - 4); y <= g.year; y++) {
    const s = (penny ? exchangeYear(f, an, info, y).pennies : exchangeYear(f, an, info, y).stocks)[slot]
    if (!s || s.gen !== gen || s.event === 'ipo') continue
    const id = penny ? '' : companyDef(info, slot, gen).id
    const ret = id ? (shockedMove(1, s.ret, shockFactor(g, id, y), shockFactor(g, id, y - 1)).ret ?? s.ret) : s.ret
    parts.push(`'${String(y).slice(-2)} ${pct(reportedMove(info, y, ret).pct, 0)}`)
  }
  return parts.length ? `Recent years: ${parts.join(' · ')}` : 'Recently listed: no track record yet.'
}

/** The size headings of a Stocks list, biggest first. Every made-up company is a Small-cap. */
const STOCK_SIZES = ['Mega-cap', 'Large-cap', 'Mid-cap', 'Small-cap']

/**
 * One row of "your listed companies" in Stocks. The business module builds them (this file imports
 * nothing from business/): `exKey` is the key of the exchange the company trades on, never the bare
 * code, `size` is the heading it sits under ('Mega-cap' ... 'Small-cap') and `node` is the row.
 */
export interface OwnStockRow {
  exKey: string
  size: string
  node: MenuGroup
}

type OwnListingProvider = (g: GameState) => OwnStockRow[]

let ownListingProvider: OwnListingProvider = () => []

/**
 * Extension point for the business module: say which companies of the player's are listed on an
 * exchange, so Stocks can show them. Menus are rebuilt all the time, so the provider must not write
 * to the state or touch g.rng.
 */
export function registerOwnListings(provider: OwnListingProvider): void {
  ownListingProvider = provider
}

function ownStockRows(g: GameState): OwnStockRow[] {
  try {
    return ownListingProvider(g)
  } catch {
    return []
  }
}

/** The heading above one size section of Stocks. */
function sizeHeading(size: string): MenuNode {
  return { type: 'heading', id: `inv-stocks-h-${size}`, label: size === 'Small-cap' ? 'Smaller companies' : `${size}s (rough size)` }
}

const stocksMenu: MenuGroup = {
  type: 'menu',
  id: 'inv-stocks',
  label: 'Stocks',
  emoji: '📈',
  subtitle: (g) => {
    const info = exchangeInfo(g.character.countryId)
    if (noStockMarket(g, info)) return 'No stock market here right now'
    return `Companies listed on the ${info.ex.code}${exchangeStatus(info, g.year) === 'closed' ? ' (closed)' : ''}`
  },
  hint: (g) => gutGroupHint(g, ['stock']),
  header: (g) => {
    const l = listing(g)
    const block = stockMarketBlock(g, l.info)
    const note = isHistoryYear(g.year) && !block ? marketNote(l.info.home, g.year) : ''
    const real = realPlanOf(l.info) ? ' Company names are real; the prices are simulated from the market and its sectors, not real quotes.' : ''
    return `${marketLine(g, l.info, l.year)}${note ? `\n📰 ${note}` : ''}\n${exchangeName(l.info, g.year)} (${l.info.ex.code}): the biggest companies in ${theCountry(l.info.home)}. Prices move once a year, and every stock rides the market's mood.${real}${block ? `\n🚫 ${block}` : ''}`
  },
  children: (g) => {
    const l = listing(g)
    const own = ownStockRows(g)
    // Companies of yours that trade somewhere other than the list shown go in a block at the top.
    const block = (rows: OwnStockRow[]): MenuNode[] => (rows.length ? [{ type: 'heading', id: 'inv-stocks-own', label: 'Your listed companies' }, ...rows.map((r) => r.node)] : [])
    if (noStockMarket(g, l.info)) return [{ type: 'info', id: 'inv-stocks-none', text: stockMarketBlock(g, l.info) ?? 'There is no stock market here right now.', emoji: '🚫' }, ...block(own)]
    // Real listings come biggest first, under their rough size class (approximate, as of this year).
    const sized = l.stocks.some((q) => q.size)
    const ordered = sized ? [...l.stocks].sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0) || num(a.details.slot) - num(b.details.slot)) : l.stocks
    // Your companies on this exchange sit at the top of their size section; everything else goes to the block.
    const here = sized ? own.filter((r) => r.exKey === l.info.key && STOCK_SIZES.includes(r.size)) : []
    const elsewhere = own.filter((r) => !here.includes(r))
    const sections: { size: string; nodes: MenuNode[] }[] = []
    for (const q of ordered) {
      const open = sections[sections.length - 1]
      if (!open || (sized && q.size && q.size !== open.size)) sections.push({ size: sized ? (q.size ?? '') : '', nodes: [] })
      sections[sections.length - 1].nodes.push(offerNode(g, q, [stockHistory(g, l.info, num(q.details.slot), num(q.details.gen), false)]))
    }
    // A size the exchange has no quotes for this year still gets its heading when you own a company of it.
    for (const size of STOCK_SIZES) {
      if (!here.some((r) => r.size === size) || sections.some((s) => s.size === size)) continue
      const rank = STOCK_SIZES.indexOf(size)
      const at = sections.findIndex((s) => STOCK_SIZES.indexOf(s.size) > rank)
      sections.splice(at < 0 ? sections.length : at, 0, { size, nodes: [] })
    }
    const nodes: MenuNode[] = block(elsewhere)
    const shown = new Set<string>()
    for (const s of sections) {
      const mine = s.size && !shown.has(s.size) ? here.filter((r) => r.size === s.size) : []
      shown.add(s.size)
      if (s.size) nodes.push(sizeHeading(s.size))
      nodes.push(...mine.map((r) => r.node), ...s.nodes)
    }
    return nodes
  },
}

const pennyMenu: MenuGroup = {
  type: 'menu',
  id: 'inv-penny',
  label: 'Penny Stocks',
  emoji: '🎟️',
  subtitle: 'Tiny companies, huge swings',
  visible: (g) => !noStockMarket(g, exchangeInfo(g.character.countryId)),
  hint: (g) => gutGroupHint(g, ['penny']),
  header: (g) => {
    const info = exchangeInfo(g.character.countryId)
    return `The ${info.ex.code}'s junior board: companies that trade for pocket change. Most of them go to zero. A few go to the moon. Fees include a 2% bid-ask spread.`
  },
  children: (g) => {
    const l = listing(g)
    return l.pennies.map((q) => offerNode(g, q, [stockHistory(g, l.info, num(q.details.slot), num(q.details.gen), true)]))
  },
}

const cryptoMenu: MenuGroup = {
  type: 'menu',
  id: 'inv-crypto',
  label: 'Crypto',
  emoji: '🪙',
  subtitle: (g) => (CRYPTO_BANNED.has(g.character.countryId) ? `Banned in ${theCountry(g.character.countryId)}` : 'Coins that trade worldwide, 24/7'),
  // Crypto doesn't exist before 2009 (unless you somehow still hold some).
  visible: (g) => listedCoins(cryptoYear(fam(g), anchor(g), g.year)).length > 0 || investmentHoldings(g).some((a) => typeOf(a) === 'crypto'),
  hint: (g) => gutGroupHint(g, ['crypto']),
  header: (g) => {
    const cy = cryptoYear(fam(g), anchor(g), g.year)
    const young = isHistoryYear(g.year) && g.year <= 2012
    const mood = cy.winter ? 'A crypto winter wiped out most of the market this year.' : cy.mania ? (young ? 'Crypto mania: a magic internet money nobody had heard of a year ago is suddenly worth real money.' : 'Crypto mania: everyone and their dentist bought coins this year.') : young && cy.ret === 0 ? 'A new kind of internet money that a handful of programmers trade on forums.' : `The crypto market moved ${pct(cy.ret, 0)} this year.`
    const ban = CRYPTO_BANNED.has(g.character.countryId) ? ` Crypto trading is banned in ${theCountry(g.character.countryId)}, so you can only sell coins you already own.` : ''
    return `${mood} Crypto isn't insured or regulated, and a bad year can wipe out 70% or more. Exchange fee: 1.5%.${ban}`
  },
  children: (g) => listing(g).crypto.map((q) => offerNode(g, q)),
}

const bondsMenu: MenuGroup = {
  type: 'menu',
  id: 'inv-bonds',
  label: 'Bonds & Savings',
  emoji: '🏛️',
  subtitle: (g) => `Bonds ${rateText(liveDepositRate(g, g.character.countryId, 'bond'))} · Savings ${rateText(liveDepositRate(g, g.character.countryId, 'savings'))}`,
  header: (g) => {
    const cid = g.character.countryId
    const rate = economyOf(g, cid).rate
    const infl = economyOf(g, cid).inflation
    const insured = depositInsurance(cid, g.year)
    const bits = [`The central bank's rate in ${theCountry(cid)} is ${rateText(rate)} and inflation runs about ${inflationText(infl)}.`]
    if (rate < infl) bits.push('Savings pay less than inflation, so they lose buying power over time.')
    if (defaultChance(cid, g.year) >= 0.01) bits.push('High yields here come with a real chance the government defaults.')
    if (insured <= 0) bits.push('Bank deposits aren\'t insured yet: if a bank fails, depositors get back whatever is left.')
    else if (bankCrisisChance(cid, g.year) >= 0.005) bits.push(`Banks have been known to freeze deposits; only ${formatMoney(insured)} per depositor is guaranteed across your accounts.`)
    return bits.join(' ')
  },
  children: (g) => {
    const l = listing(g)
    const cid = g.character.countryId
    const infl = Math.min(1e7, economyOf(g, cid).inflation)
    const realOf = (r: number) => Math.max(-1, (1 + r) / (1 + infl) - 1)
    const real = (r: number) => `After ${inflationText(infl)} inflation, that's a real return of about ${pct(realOf(r))} a year.`
    return [
      offerNode(g, l.bond, [real(l.bond.yield), `Default risk: ${defaultRiskLabel(defaultChance(cid, g.year))}.`]),
      offerNode(g, l.savings, [real(l.savings.yield)]),
      offerNode(g, l.term, [real(l.term.yield)]),
    ]
  },
}

function fundNode(g: GameState): MenuGroup {
  const l = listing(g)
  const node = offerNode(g, l.fund, [historyLine(g, l.info) || 'A brand-new fund: no history yet.', `Index level: ${Math.round(l.year.level * indexShockFactor(g, l.info.key, g.year)).toLocaleString('en-US')} points.`])
  return { ...node, visible: (gg) => !noStockMarket(gg, exchangeInfo(gg.character.countryId)) }
}

function reitNode(g: GameState): MenuGroup {
  const l = listing(g)
  const node = offerNode(g, l.reit, [`Local house prices ${l.year.year === anchor(g) ? 'are holding steady' : `moved ${pct(l.year.housing, 0)} this year`}.`])
  // Property trusts appear only once they've been invented here.
  return { ...node, visible: (gg) => !noStockMarket(gg, exchangeInfo(gg.character.countryId)) && !reitBlock(gg, exchangeInfo(gg.character.countryId)) }
}

function goldNode(g: GameState): MenuGroup {
  const l = listing(g)
  return offerNode(g, l.gold, ['Sold by the troy ounce (fractions welcome).'])
}

// ---------------------------------------------------------------------------
// Financial news

const ANALYST_FIRMS = ['Fairweather Research', 'Northgate Capital', 'Bullhorn Capital', 'Harbor & Pine Securities', 'Bearington Research', 'Hedgehog Advisors']

function newsLines(g: GameState): string[] {
  const l = listing(g)
  const f = fam(g)
  const an = anchor(g)
  const ey = l.year
  const y = g.year
  const lines: string[] = [marketLine(g, l.info, ey)]
  for (const event of marketBreakthroughs(g)) if (event.year === y) lines.push(`🌐 World-changing invention: ${event.name}. Open stock markets repriced ${pct(event.mult - 1, 0)} immediately; this is a one-time repricing, not a repeating annual return.`)
  const note = isHistoryYear(y) ? marketNote(l.info.home, y) : ''
  if (note) lines.push(`📰 ${note}`)
  const marketOpen = !isHistoryYear(y) || exchangeStatus(l.info, y) !== 'none'
  const nameOf = (slot: number, gen: number) => eraIdentity(companyDef(l.info, slot, gen), y).name
  if (ey.year > an) {
    const movers = marketOpen ? ey.stocks.filter((s) => s.event !== 'ipo').map((s) => ({ s, def: companyDef(l.info, s.slot, s.gen) })) : []
    if (movers.length) {
      const best = movers.reduce((a, b) => (b.s.ret > a.s.ret ? b : a))
      const worst = movers.reduce((a, b) => (b.s.ret < a.s.ret ? b : a))
      lines.push(`🏆 Top performer: ${nameOf(best.s.slot, best.s.gen)} (${best.def.symbol}) ${pct(best.s.ret, 0)}`)
      if (worst.s.ret < 0) lines.push(`🧯 Worst performer: ${nameOf(worst.s.slot, worst.s.gen)} (${worst.def.symbol}) ${pct(worst.s.ret, 0)}`)
    }
    for (const sh of shocksThisYear(g)) lines.push(shockHeadline(sh))
    const takenOver = isHistoryYear(y) && exchangeExpropriated(l.info, y)
    if (takenOver) lines.push(`🏛️ The new government nationalized every listed company. Shareholders got nothing.`)
    for (const s of ey.stocks) {
      const def = companyDef(l.info, s.slot, s.gen)
      if (takenOver) break
      if (s.ended) {
        const old = s.ended.id.match(/s(\d+)g(\d+)$/)
        const prev = old ? eraIdentity(companyDef(l.info, Number(old[1]), Number(old[2])), y - 1).name : null
        const real = isRealSecId(s.ended.id)
        if (prev) lines.push(s.ended.kind === 'bankrupt' ? `💀 ${prev} went bankrupt. Its shares are worthless.` : real ? `🤝 ${prev} merged with, or was taken over by, another company.${s.ended.premium < 0 ? ' Its shareholders were paid out at well below the last price.' : ' Its shareholders were paid out.'}` : `🤝 ${prev} was bought out at a ${Math.round(s.ended.premium * 100)}% premium.`)
        lines.push(`🔔 New listing: ${nameOf(s.slot, s.gen)} (${def.symbol}) joined the market.`)
      } else if (s.event === 'split' && s.ratio) lines.push(`✂️ ${nameOf(s.slot, s.gen)} did a ${s.ratio}-for-1 stock split.`)
      else if (s.event === 'scandal') lines.push(`🚨 ${nameOf(s.slot, s.gen)} plunged after an accounting scandal.`)
      else if (s.event === 'surge') lines.push(`🚀 ${nameOf(s.slot, s.gen)} soared on a blockbuster product launch.`)
    }
    const cy = cryptoYear(f, an, y)
    if (listedCoins(cy).length || cy.coins.some((c) => c.ended)) {
      if (cy.coins.some((c) => c.event === 'ipo' && c.slot === 0 && !c.unlisted && isHistoryYear(y))) lines.push('🪙 A mysterious programmer launches a new internet currency. Almost nobody notices.')
      else lines.push(cy.winter ? `🥶 Crypto winter: the crypto market fell ${absPct(cy.ret)}.` : cy.mania ? `🤑 Crypto mania: the crypto market rose ${absPct(cy.ret)}.` : `🪙 Crypto market ${pct(cy.ret, 0)} this year.`)
    }
    for (const c of cy.coins) {
      if (c.ended) {
        const old = c.ended.id.match(/c(\d+)g(\d+)$/)
        const prev = old ? coinDef(Number(old[1]), Number(old[2])) : null
        if (prev) lines.push(coinListed(c) ? `💥 ${prev.name} (${prev.symbol}) collapsed to zero. ${coinDef(c.slot, c.gen).name} launched in its place.` : `💥 ${prev.name} (${prev.symbol}) collapsed to zero.`)
      }
    }
    const gy = goldYear(f, an, y)
    const ban = goldBan(g.character.countryId, y)
    lines.push(`🥇 Gold ${pct(gy.ret, 0)} to ${formatMoney(gy.price)} an ounce.${ban ? ' (Private gold dealing is restricted here.)' : ''}`)
    const fx = fxYear(f, g.character.countryId, y)
    if (fx.defaulted) lines.push(`🏛️ The government of ${theCountry(g.character.countryId)} defaulted on its bonds.`)
    if (fx.bankCrisis) lines.push(`🏦 A banking crisis hit ${theCountry(g.character.countryId)}: deposits were frozen.`)
    if (isHistoryYear(y)) {
      const infl = inflationRate(g.character.countryId, y)
      if (infl >= 0.5) lines.push(`💸 Hyperinflation: prices rose ${inflationText(infl)} this year.`)
      else if (infl >= 0.1) lines.push(`💸 Inflation ran at ${rateText(infl)} this year.`)
      else if (infl <= -0.02) lines.push(`📉 Prices fell ${rateText(-infl)} this year: deflation.`)
    } else if (fx.dep >= 0.1) lines.push(`💱 The ${currencyOf(g.character.countryId, g.year).name} lost ${rateText(fx.dep)} against the dollar.`)
  }
  // An analyst call about next year: right about two times in three.
  const tip = seededTip(g, l.info)
  if (tip) lines.push(tip)
  const inst = investInstinct(g)
  if (inst) lines.push(`${HINT_EMOJI} ${instinctLine(inst)}`)
  return lines
}

/** A headline for a market shock announced this year. */
export function shockHeadline(sh: MarketShock): string {
  const move = `${sh.mult >= 1 ? 'jumped' : 'plunged'} ${absPct(sh.mult - 1)}`
  const label = `${sh.name} (${sh.symbol})`
  switch (sh.cause) {
    case 'liquidity':
      return `📊 ${label} moved ${absPct(sh.mult - 1)} ${sh.mult >= 1 ? 'up' : 'down'} as your orders used market liquidity.`
    case 'ban':
      return `🚫 ${label} ${move} after the government announced a ban.`
    case 'probe':
      return `🔎 ${label} ${move} when the government ordered an investigation.`
    case 'nationalize':
      return `🏛️ ${label} ${move} on talk of nationalization.`
    case 'contract':
      return `📜 ${label} ${move} after landing a huge government contract.`
    case 'deregulate':
      return `✂️ ${label} ${move} after its industry was deregulated.`
    case 'endorse':
      return `🎤 ${label} ${move} after a government endorsement.`
    case 'policy':
      return `🏛️ ${label} ${move} after a new law hit its industry.`
  }
}

function seededTip(g: GameState, info: ExInfo): string | null {
  const f = fam(g)
  const an = anchor(g)
  const now = exchangeYear(f, an, info, g.year)
  const next = exchangeYear(f, an, info, g.year + 1)
  if (stockMarketBlock(g, info)) return null
  const key = `${f}|tip|${info.key}|${g.year}`
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0
  const candidates = now.stocks.filter((s) => next.stocks[s.slot] && next.stocks[s.slot].gen === s.gen)
  if (!candidates.length) return null
  const s = candidates[h % candidates.length]
  const def = companyDef(info, s.slot, s.gen)
  const right = (h >>> 8) % 3 !== 0
  const firm = ANALYST_FIRMS[(h >>> 4) % ANALYST_FIRMS.length]
  if (def.real) {
    // No opinions about real companies: the call is about the company's whole sector on this market.
    const peers = candidates.filter((c) => companyDef(info, c.slot, c.gen).sector === def.sector)
    const avg = peers.reduce((sum, c) => sum + next.stocks[c.slot].ret, 0) / Math.max(1, peers.length)
    const label = eraIdentity(def, g.year).label.toLowerCase()
    const bullishSector = right ? avg > 0 : !(avg > 0)
    return bullishSector ? `📣 ${firm} is bullish on ${label} stocks for next year.` : `📣 ${firm} is cautious on ${label} stocks going into next year.`
  }
  const name = eraIdentity(def, g.year).name
  const up = next.stocks[s.slot].ret > 0
  const bullish = right ? up : !up
  return bullish ? `📣 ${firm} rates ${name} (${def.symbol}) a strong buy for next year.` : `📣 ${firm} warns that ${name} (${def.symbol}) is overvalued going into next year.`
}

const newsMenu: MenuGroup = {
  type: 'menu',
  id: 'inv-news',
  label: 'Financial News',
  emoji: '📰',
  subtitle: 'Headlines, movers and analyst calls',
  header: () => 'This year in the markets. Analysts are right about as often as they are confident, which is to say not always.',
  children: (g) => newsLines(g).map((text, i): MenuNode => ({ type: 'info', id: `inv-news-${i}`, text })),
}

const liquidateAction: MenuAction = {
  type: 'action',
  id: 'inv-liquidate',
  label: 'Sell Everything',
  emoji: '🧨',
  subtitle: 'Liquidate your whole portfolio',
  visible: (g) => investmentHoldings(g).length > 0,
  disabledReason: (g) => tradeBlock(g),
  confirm: (g) => `Sell all ${investmentHoldings(g).length} of your investments (worth ${formatMoney(portfolioStats(g).value)}) and move the money to your bank account?`,
  run: (g) => {
    liquidatePortfolio(g)
  },
  stayOpen: true,
}

export const investmentsMenu: MenuGroup = {
  type: 'menu',
  id: 'investments',
  label: 'Investments',
  emoji: '\u{1F4C8}',
  subtitle: (g) => {
    if (g.character.age < 18) return 'Stocks, bonds, funds and crypto'
    const s = portfolioStats(g)
    if (s.value <= 0 && investmentHoldings(g).length === 0) return 'Stocks, bonds, funds and crypto'
    return `Portfolio ${shortMoney(s.value)}${s.year !== null ? ` · ${change(s.year)} this year` : ''}`
  },
  visible: (g) => !inPrison(g),
  disabledReason: (g) => tradeBlock(g),
  header: (g) => {
    const s = portfolioStats(g)
    const info = exchangeInfo(g.character.countryId)
    const ey = exchangeYear(fam(g), anchor(g), info, g.year)
    const gain = s.value - s.basis
    // Marked figures are deliberate (your own order flow is not counted). When a sale would pay clearly
    // something else, say what it would pay.
    const sells = Math.min(MAX_INVESTMENT_VALUE, investmentHoldings(g).reduce((sum, a) => sum + saleEstimate(g, a), 0))
    const sellsLine = sellsApart(sells, s.value) ? ` · Sells for about ${formatMoney(Math.round(sells))}` : ''
    const top = investmentHoldings(g).length
      ? `Portfolio: ${formatMoney(s.value)} · ${gain >= 0 ? 'Gain' : 'Loss'}: ${formatMoney(Math.abs(gain))} (${pct(s.basis > 0 ? gain / s.basis : 0)})${sellsLine}`
      : "You don't own any investments yet."
    return `${top}\n${marketLine(g, info, ey)}\nCash: ${formatMoney(g.character.money)} · ${feePlan(g, 'stock').label}`
  },
  children: (g) => {
    const info = exchangeInfo(g.character.countryId)
    const nodes: MenuNode[] = []
    const inst = investInstinct(g)
    if (inst) nodes.push({ type: 'info', id: 'inv-instinct', text: instinctLine(inst), emoji: HINT_EMOJI })
    const history = historyLine(g, info)
    if (history) nodes.push({ type: 'info', id: 'inv-history', text: history, emoji: '📊' })
    nodes.push({ type: 'info', id: 'inv-local', text: localNote(g), emoji: getCountry(g.character.countryId).flag })
    const held = investmentHoldings(g)
    nodes.push({ type: 'heading', id: 'inv-portfolio', label: held.length ? `Your Portfolio (${held.length})` : 'Your Portfolio' })
    if (held.length) for (const a of [...held].sort((x, y) => y.value - x.value)) nodes.push(holdingNode(g, a))
    else nodes.push({ type: 'info', id: 'inv-empty', text: 'Nothing here yet. Even a small index fund is a start.', emoji: '🌱' })
    nodes.push({ type: 'heading', id: 'inv-buy', label: 'Invest' })
    nodes.push(stocksMenu, fundNode(g), bondsMenu, reitNode(g), goldNode(g), pennyMenu, cryptoMenu)
    nodes.push({ type: 'heading', id: 'inv-tools', label: 'News & Tools' })
    nodes.push(newsMenu, liquidateAction)
    nodes.push({ type: 'info', id: 'inv-tax', text: TAX_NOTE, emoji: '🧾' })
    return nodes
  },
}

// ---------------------------------------------------------------------------
// The yearly market

interface News {
  priority: number
  title: string
  text: string
  emoji: string
  tone: Tone
  log: string
}

interface YearlyMove {
  /** New unit price (after any split). */
  price: number
  /** Units multiplier (splits). */
  ratio: number
  /** Price change this year (before splits). */
  ret: number
  /** Income as a share of the start-of-year value. */
  payout: number
  /** The security ended: holders receive `perUnit` per unit (0 = wiped out). */
  ended?: { kind: 'bankrupt' | 'acquired' | 'delisted' | 'matured' | 'nationalized' | 'recalled'; perUnit: number; premium: number }
  /** Interest credited into the holding itself, as a share of the start-of-year value. */
  compound?: number
  event?: string
}

function pathMove(cur: SecYear | undefined, a: Asset, price: number): YearlyMove {
  const id = str(a.details.secId)
  if (!cur) return { price, ratio: 1, ret: 0, payout: 0, ended: { kind: 'delisted', perUnit: price, premium: 0 } }
  if (cur.id === id) return { price: cur.price, ratio: cur.ratio ?? 1, ret: cur.ret, payout: cur.payout, event: cur.event }
  if (cur.ended && cur.ended.id === id) return { price: cur.ended.perUnit, ratio: 1, ret: cur.ended.kind === 'bankrupt' ? -1 : cur.ended.premium, payout: 0, ended: { kind: cur.ended.kind, perUnit: cur.ended.perUnit, premium: cur.ended.premium } }
  // An older listing we lost track of (e.g. data changed): cash it out at its last price.
  return { price, ratio: 1, ret: 0, payout: 0, ended: { kind: 'delisted', perUnit: price, premium: 0 } }
}

/** A holding's yearly move with market shocks applied (a takeover pays a premium on the shocked price). */
function shockMove(mv: YearlyMove, now: number, before: number): YearlyMove {
  if (now === 1 && before === 1) return mv
  if (mv.ended) {
    // Only the engine's buyouts: a 'delisted' fallback is already at the holding's (shocked) price.
    if (mv.ended.kind !== 'acquired' || !(mv.ended.perUnit > 0) || !(now > 0) || now === 1) return mv
    return { ...mv, price: mv.price * now, ended: { ...mv.ended, perUnit: mv.ended.perUnit * now } }
  }
  const adj = shockedMove(mv.price, mv.ret, now, before)
  return { ...mv, price: Math.max(0.0001, adj.price), ret: adj.ret ?? mv.ret }
}

function moveHolding(g: GameState, a: Asset, news: News[]): YearlyMove {
  const t = typeOf(a)
  const d = a.details
  const f = fam(g)
  const an = anchor(g)
  const price = unitPrice(a)
  switch (t) {
    case 'stock':
    case 'penny':
    case 'index':
    case 'reit': {
      const info = holdingExchange(a)
      // A revolution nationalized every listed company: shareholders get nothing.
      if (isHistoryYear(g.year) && exchangeExpropriated(info, g.year)) return { price: 0, ratio: 1, ret: -1, payout: 0, ended: { kind: 'nationalized', perUnit: 0, premium: -1 } }
      const ey = exchangeYear(f, an, info, g.year)
      if (t === 'index') return shockMove(pathMove(ey.fund.id === str(d.secId) ? ey.fund : undefined, a, price), indexShockFactor(g, info.key, g.year, str(d.secId)), indexShockFactor(g, info.key, g.year - 1, str(d.secId)))
      if (t === 'reit') return shockMove(pathMove(ey.reit.id === str(d.secId) ? ey.reit : undefined, a, price), economyMarketFactor(g, info.home, g.year, true), economyMarketFactor(g, info.home, g.year - 1, true))
      const list = t === 'penny' ? ey.pennies : ey.stocks
      const id = str(d.secId)
      return shockMove(pathMove(list[Math.round(num(d.slot, -1))], a, price), shockFactor(g, id, g.year), shockFactor(g, id, g.year - 1))
    }
    case 'crypto': {
      const cy = cryptoYear(f, an, g.year)
      const id = str(d.secId)
      return shockMove(pathMove(cy.coins[Math.round(num(d.slot, -1))], a, price), shockFactor(g, id, g.year), shockFactor(g, id, g.year - 1))
    }
    case 'gold': {
      const cid = str(d.country, g.character.countryId)
      // A gold ban's first year: private gold must be sold to the state at the official price.
      const ban = goldBan(cid, g.year)
      if (ban?.recall) {
        news.push({ priority: 93, title: 'Gold Recalled', text: `${ban.note} Your ${a.name} was bought from you at last year's price.`, emoji: '🥇', tone: 'bad', log: 'The government made me hand in my gold.' })
        return { price, ratio: 1, ret: 0, payout: 0, ended: { kind: 'recalled', perUnit: price, premium: 0 } }
      }
      const gy = goldYear(f, an, g.year)
      const ret = (1 + gy.ret) * (1 + goldHedge(cid, g.year)) - 1
      return { price: Math.max(0.01, price * (1 + ret)), ratio: 1, ret, payout: 0 }
    }
    case 'bond': {
      const cid = str(d.country, g.character.countryId)
      const fx = fxYear(f, cid, g.year)
      // History is in real terms: the coupon is paid in money that lost `dep` of its value this year.
      const live = !isHistoryYear(g.year) && !!economyState(g)
      const dep = live ? 1 - 1 / (1 + economyOf(g, cid).inflation) : fx.dep
      const coupon = Math.max(0, num(d.yield)) * (live ? 1 - dep : isHistoryYear(g.year) ? 1 - Math.max(0, dep) : 1 - Math.max(0, dep) / 2)
      const rateMove = live ? bound((economyOf(g, cid, g.year - 1).rate - economyOf(g, cid).rate) * 2, -.2, .2) : 0
      let ret = (1 - dep) * (1 + fx.bondMove + rateMove) - 1
      if (fx.defaulted) {
        ret = (1 + ret) * (1 - fx.haircut) - 1
        news.push({
          priority: 95,
          title: 'Government Default',
          text: `The government of ${theCountry(cid)} defaulted on its debt. Bondholders like you were offered new bonds worth ${Math.round((1 - fx.haircut) * 100)} cents on the dollar, take it or leave it. Your ${a.name} lost ${Math.round(fx.haircut * 100)}% of its value.`,
          emoji: '🏛️',
          tone: 'bad',
          log: `The government of ${theCountry(cid)} defaulted on the bonds I owned.`,
        })
      }
      const newPrice = Math.max(0.01, price * (1 + ret))
      const payout = fx.defaulted ? 0 : coupon
      const maturity = num(d.maturity)
      if (maturity > 0 && g.year >= maturity) return { price: newPrice, ratio: 1, ret, payout, ended: { kind: 'matured', perUnit: newPrice, premium: 0 } }
      return { price: newPrice, ratio: 1, ret, payout }
    }
    case 'savings': {
      const cid = str(d.country, g.character.countryId)
      const fx = fxYear(f, cid, g.year)
      const rate = str(d.product) === 'term' ? Math.max(0, num(d.yield)) : liveDepositRate(g, cid, 'savings')
      if (str(d.product) !== 'term') d.yield = rate
      // Interest is credited to the account in local money, so the balance compounds while the
      // currency's slide (in history: that year's inflation) shrinks it in real terms.
      const dep = !isHistoryYear(g.year) && economyState(g) ? 1 - 1 / (1 + economyOf(g, cid).inflation) : fx.dep
      const ret = -dep
      if (isHistoryYear(g.year) && fx.dep >= 0.3 && price > 0) {
        news.push({
          priority: 94,
          title: 'Hyperinflation',
          text: `Prices rose ${inflationText(inflationRate(cid, g.year))} this year. The money in your ${str(d.product) === 'term' ? 'term deposit' : 'savings account'} at ${str(d.bank, 'the bank')} buys ${absPct(fx.dep)} less than it did in January, interest and all.`,
          emoji: '💸',
          tone: 'bad',
          log: 'Inflation ate my savings this year.',
        })
      }
      return { price: Math.max(0.0001, price * (1 + ret)), ratio: 1, ret, payout: 0, compound: rate * (1 - dep) }
    }
  }
}

function eventNews(a: Asset, mv: YearlyMove, valueBefore: number): News | null {
  const t = typeOf(a)
  const sym = str(a.details.symbol)
  const label = `${a.name}${sym && t !== 'bond' && t !== 'savings' ? ` (${sym})` : ''}`
  if (mv.ended) {
    switch (mv.ended.kind) {
      case 'bankrupt':
        if (t === 'crypto')
          return { priority: 92, title: 'Coin Collapsed', text: `${label} collapsed to zero in a matter of days. The founders posted "we're exploring options" and then deleted their accounts. Your ${formatMoney(valueBefore)} stake is gone.`, emoji: '💥', tone: 'bad', log: `My ${a.name} coins became worthless overnight.` }
        return {
          priority: t === 'penny' ? 78 : 100,
          title: t === 'penny' ? 'Penny Stock Wiped Out' : 'Bankruptcy',
          text: t === 'penny' ? `${label} ran out of money and was delisted. Your ${formatMoney(valueBefore)} stake is now a souvenir.` : `${label} filed for bankruptcy. Shareholders are last in line, so your ${formatMoney(valueBefore)} stake is worth nothing.`,
          emoji: '💀',
          tone: 'bad',
          log: `${a.name} went bankrupt and my shares became worthless.`,
        }
      case 'acquired':
        if (isRealSecId(str(a.details.secId))) {
          if (mv.ended.premium < 0) return { priority: 80, title: 'Merger', text: `${label} was taken over by another company and stopped trading under its own name. Your shares were cashed out at well below their last price in the deal.`, emoji: '🤝', tone: 'bad', log: `${a.name} was taken over and my shares were cashed out at a loss.` }
          return { priority: 80, title: 'Merger', text: `${label} merged with, or was taken over by, another company and stopped trading under its own name. Your shares were cashed out in the deal.`, emoji: '🤝', tone: 'good', log: `${a.name} was merged away and my shares were cashed out.` }
        }
        return { priority: 80, title: 'Buyout!', text: `${label} was bought by a bigger rival at a ${Math.round(mv.ended.premium * 100)}% premium. Your shares were cashed out automatically.`, emoji: '🤝', tone: 'good', log: `${a.name} was bought out and my shares were cashed out at a premium.` }
      case 'matured':
        return { priority: 35, title: 'Bond Matured', text: `Your ${a.name} matured, and the government paid back ${formatMoney(valueBefore * (1 + mv.ret))}.`, emoji: '🏛️', tone: 'neutral', log: `My ${a.name} matured and paid me back ${formatMoney(valueBefore * (1 + mv.ret))}.` }
      case 'delisted':
        return { priority: 30, title: 'Delisted', text: `${label} was delisted, and your shares were paid out at their last price.`, emoji: '📤', tone: 'neutral', log: `${a.name} was delisted and my shares were paid out.` }
      case 'nationalized':
        return { priority: 99, title: 'Nationalized', text: `The new government nationalized every company on the stock exchange, ${label} included. Shareholders got nothing: your ${formatMoney(valueBefore)} stake is gone.`, emoji: '🏛️', tone: 'bad', log: `The government nationalized ${a.name} and my shares became worthless.` }
      default:
        return null
    }
  }
  if (mv.event === 'split' && mv.ratio > 1) return { priority: 15, title: 'Stock Split', text: `${label} did a ${mv.ratio}-for-1 stock split. You own ${mv.ratio}x the shares, each worth 1/${mv.ratio} as much.`, emoji: '✂️', tone: 'neutral', log: `${a.name} did a ${mv.ratio}-for-1 stock split.` }
  if (mv.event === 'scandal') return { priority: 65, title: 'Accounting Scandal', text: `${label} admitted its accounts were "more optimistic than accurate". The stock fell ${absPct(mv.ret)} this year.`, emoji: '🚨', tone: 'bad', log: `${a.name} crashed after an accounting scandal.` }
  if (mv.event === 'surge') return { priority: 55, title: 'Blockbuster Year', text: `${label} had a blockbuster product launch, and the stock rose ${absPct(mv.ret)} this year.`, emoji: '🚀', tone: 'good', log: `${a.name} soared after a blockbuster launch.` }
  if (mv.event === 'moon') return { priority: 85, title: 'To the Moon', text: `${label} announced a "transformational partnership" and the stock went up ${absPct(mv.ret)}. Your stake is now worth ${formatMoney(valueBefore * (1 + mv.ret))}.`, emoji: '🌕', tone: 'good', log: `My penny stock ${a.name} went to the moon.` }
  return null
}

function marketNews(g: GameState, held: Asset[]): News | null {
  // The biggest market move among exchanges where you own something.
  const seen = new Set<string>()
  let best: { info: ExInfo; ey: ExYear } | null = null
  for (const a of held) {
    const t = typeOf(a)
    if (t !== 'stock' && t !== 'index' && t !== 'penny' && t !== 'reit') continue
    const info = holdingExchange(a)
    if (seen.has(info.key)) continue
    seen.add(info.key)
    const ey = exchangeYear(fam(g), anchor(g), info, g.year)
    if (!best || Math.abs(indexReturn(g, info, g.year, ey.index.ret)) > Math.abs(indexReturn(g, best.info, g.year, best.ey.index.ret))) best = { info, ey }
  }
  if (best && Math.abs(indexReturn(g, best.info, g.year, best.ey.index.ret)) > 0.15) {
    const { info, ey } = best
    const r = indexReturn(g, info, g.year, ey.index.ret)
    const up = r > 0
    const hist = isHistoryYear(g.year)
    const idx = indexName(info, g.year)
    const m = reportedMove(info, g.year, r)
    const note = hist ? marketNote(info.home, g.year) : ''
    const lead = note ? `${note} ` : ''
    const upQuips = hist && g.year < 2005 ? ['Shoeshine boys are giving stock tips again.', 'Everyone at work suddenly thinks they are a genius investor.', 'Analysts who predicted a crash have gone very quiet.'] : ['Taxi drivers are giving stock tips again.', 'Everyone at work suddenly thinks they are a genius investor.', 'Analysts who predicted a crash are quietly deleting their posts.']
    const downQuips = hist && g.year < 1960 ? ['Investors are selling everything that isn\'t nailed down.', 'The newspapers are printing their gloomiest headlines in their biggest type.', 'Somewhere, a man who keeps his savings in a mattress feels very smug.'] : ['Investors are selling everything that isn\'t nailed down.', 'Financial TV hosts are wearing their serious ties.', 'Somewhere, a man who keeps his savings in a mattress feels very smug.']
    const text = up
      ? `${lead}${ey.index.boom ? 'Euphoria on the trading floor: the' : 'The'} ${idx} rose ${moveText(m)} this year. ${pick(g, upQuips)}`
      : `${lead}${ey.index.crash ? 'Panic on the trading floor: the' : 'The'} ${idx} fell ${moveText(m)} this year. ${pick(g, downQuips)}`
    return { priority: up ? 50 : 60, title: 'Financial News', text, emoji: '📰', tone: up ? 'good' : 'bad', log: up ? `The ${idx} had a great year (${pct(m.pct, 0)}).` : `The ${idx} had a terrible year (${pct(m.pct, 0)}).` }
  }
  const crypto = held.filter((a) => typeOf(a) === 'crypto')
  if (crypto.length) {
    const cy = cryptoYear(fam(g), anchor(g), g.year)
    if (cy.winter) return { priority: 62, title: 'Crypto Winter', text: `The crypto market fell ${absPct(cy.ret)} this year. ${isHistoryYear(g.year) && g.year < 2020 ? 'Early believers say they are "just holding" and have stopped checking the price.' : 'Laser-eyed profile pictures are being quietly changed back.'}`, emoji: '🥶', tone: 'bad', log: 'A crypto winter hammered my coins.' }
    if (cy.mania) {
      // Only coins that exist yet (no Ethereum before 2015).
      const live = listedCoins(cy).map((c) => coinDef(c.slot, c.gen)).filter((d) => !d.stable).map((d) => d.name)
      const names = isHistoryYear(g.year) ? (live.length ? live : ['Bitcoin']) : ['Dogecoin', 'Bitcoin', 'Ethereum']
      return { priority: 52, title: 'Crypto Mania', text: `The crypto market rose ${absPct(cy.ret)} this year. Your barber asked if you've heard of ${pick(g, names)}.`, emoji: '🤑', tone: 'good', log: 'Crypto went wild this year and my coins soared.' }
    }
  }
  return null
}

const CRYPTO_EXCHANGES = ['Coinucopia', 'BlockBarn', 'HODLHub', 'Satoshi Safe', 'CryptoCastle', 'MoonBase Exchange']

/** A stock or penny stock holding takes its company's name for the new era (logged once). */
function renameForEra(g: GameState, a: Asset): void {
  const t = typeOf(a)
  if (t === 'index') {
    // The fund follows its index's new name (the Dow gives way to the S&P 500 in 1957), and the
    // old investment trusts turn into cheap index funds once those are invented.
    const info = holdingExchange(a)
    if (str(a.details.secId) !== `${info.key}#fund`) return
    const fn = fundName(info, g.year)
    if (fn.name === a.name) return
    // Real fund providers are different products: the holding moves into the new one, it is not a rename.
    const real = allFundProviderNames()
    const switched = (real.includes(a.name) || real.includes(fn.name)) && !(a.name.startsWith('Lyxor') && fn.name.startsWith('Amundi'))
    log(g, switched ? `My ${a.name} holding moved into the ${fn.name}.` : str(a.details.sector) === 'Investment trust' && !fn.trust ? `My ${a.name} cut its fees and became the ${fn.name}.` : `My ${a.name} is now called the ${fn.name}.`)
    a.name = fn.name
    a.details.market = indexName(info, g.year)
    a.details.sector = fn.trust ? 'Investment trust' : 'Index fund'
    return
  }
  if (t !== 'stock' && t !== 'penny') return
  const info = holdingExchange(a)
  const slot = Math.round(num(a.details.slot, -1))
  const gen = Math.round(num(a.details.gen, -1))
  if (slot < 0 || gen < 0) return
  const def = t === 'penny' ? pennyDef(info, slot, gen) : companyDef(info, slot, gen)
  if (def.id !== str(a.details.secId)) return
  const era = eraIdentity(def, g.year)
  if (era.name === a.name) return
  log(g, `${a.name} renamed itself ${era.name}.`)
  a.name = era.name
  a.details.sector = era.label
  a.details.blurb = era.blurb
  if (t === 'stock') a.emoji = era.emoji
}

/**
 * Forget market shocks that have faded out or whose company / coin stopped trading before this
 * year (a shock stays through the year its company is bought out, so the takeover price and any
 * bets on it settle on the shocked price).
 */
function pruneShocks(g: GameState): void {
  const f = fam(g)
  const an = anchor(g)
  const last = g.year - 1
  pruneMarketShocks(g, (sh) => {
    if (sh.year >= g.year) return true
    if (sh.asset === 'coin') return cryptoYear(f, an, last).coins[sh.slot]?.id === sh.secId
    const info = exchangeByKey(sh.exKey)
    if (!info) return false
    const ey = exchangeYear(f, an, info, last)
    return ey.stocks[sh.slot]?.id === sh.secId || ey.pennies[sh.slot]?.id === sh.secId
  })
}

/**
 * Holdings from before the market named real companies keep their value: the first time they are
 * touched they are re-anchored to the quote of their exchange (same value, new unit price), and a
 * stock whose company is no longer in its slot becomes a share of the slot's company, in a share
 * swap that costs nothing. Holdings bought since carry the engine stamp and are left alone. In the
 * yearly step the holding is priced as of last year-end, so the coming year's move still applies.
 */
function normalizeHoldings(g: GameState, yearly = false): void {
  const asOf = yearly ? g.year - 1 : g.year
  for (const a of investmentHoldings(g)) {
    const t = typeOf(a)
    if (t !== 'stock' && t !== 'penny' && t !== 'index' && t !== 'reit') continue
    if (num(a.details.eng) >= ENGINE_V) continue
    const info = holdingExchange(a)
    const ey = exchangeYear(fam(g), anchor(g), info, asOf)
    const id = str(a.details.secId)
    const value = holdingValue(a)
    let cur: SecYear | undefined
    let factor = 1
    if (t === 'index') {
      cur = ey.fund
      factor = indexShockFactor(g, info.key, asOf, cur.id)
    } else if (t === 'reit') cur = ey.reit
    else {
      cur = (t === 'penny' ? ey.pennies : ey.stocks)[Math.round(num(a.details.slot, -1))]
      if (cur) factor = shockFactor(g, cur.id, asOf)
    }
    if (!cur || !(cur.price > 0) || !(factor > 0)) continue
    const price = cur.price * factor
    if (cur.id !== id && (t === 'stock' || t === 'penny')) {
      const q = stockQuote(info, cur, t === 'penny', asOf, null)
      const before = a.name
      a.details = { ...a.details, ...q.details }
      a.name = q.name
      a.emoji = q.emoji
      if (before !== q.name) log(g, `My shares in ${before} were swapped for shares in ${q.name} when the market's listings were reorganised.`)
    }
    setPosition(a, value / price, price, basis(a))
    a.details.eng = ENGINE_V
  }
}

/**
 * Re-price the player's stocks, index funds and coins at today's quotes, right after news moved
 * the market mid-year (a ban, a contract...). Unrealized: nothing is taxed or sold.
 */
export function revalueHoldings(g: GameState, indicesOnly = false, allExchanges = false): void {
  normalizeHoldings(g)
  const quotes = allQuotes(listing(g))
  for (const a of investmentHoldings(g)) {
    syncOwnFlow(g, a)
    const t = typeOf(a)
    if (indicesOnly && t !== 'index') continue
    if (t !== 'stock' && t !== 'penny' && t !== 'index' && t !== 'crypto') continue
    const q = quotes.find((x) => x.secId === str(a.details.secId))
    let price = q?.price
    if (t === 'index') {
      const info = holdingExchange(a)
      const fund = exchangeYear(fam(g), anchor(g), info, g.year).fund
      if (fund.id === str(a.details.secId)) price = fund.price * indexShockFactor(g, info.key, g.year, fund.id)
    } else if (allExchanges && (t === 'stock' || t === 'penny')) {
      // Holdings can be on a foreign exchange after travel or inheritance.
      // Advancing a foreign quote to today's engine year is explicit for world news;
      // ordinary order-flow adjusts that holding's already booked quote in place.
      const info = holdingExchange(a), ey = exchangeYear(fam(g), anchor(g), info, g.year)
      const cur = (t === 'penny' ? ey.pennies : ey.stocks)[Math.round(num(a.details.slot, -1))]
      if (cur?.id === str(a.details.secId)) price = cur.price * shockFactor(g, cur.id, g.year)
    }
    const old = unitPrice(a)
    if (!price || !(price > 0) || !(old > 0) || Math.abs(price / old - 1) < 1e-9) continue
    if (num(a.details.updatedYear, -1) < g.year && num(a.details.marketMarkedYear, -1) !== g.year) {
      a.details.marketMarkedYear = g.year
      a.details.marketIncomeBase = markedValue(a)
    }
    if (num(a.details.updatedYear) === g.year) a.details.lastChange = Math.round(((1 + num(a.details.lastChange)) * (price / old) - 1) * 10000) / 10000
    setPosition(a, units(a), price, basis(a))
  }
}

/** Yearly hook (aging.ts, after business, before finance): prices move, dividends and coupons pay out. */
export function yearlyInvestments(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const settled = num(g.flags.investmentsSettledYear, -1)
  if (settled === g.year) return
  // A corrupt future marker must not freeze the portfolio forever.
  if (settled > g.year) g.flags.investmentsSettledYear = g.year - 1
  g.flags.investmentsSettledYear = g.year
  pruneShocks(g)
  normalizeHoldings(g, true)
  const held = investmentHoldings(g)
  if (!held.length) {
    // Non-investors only hear about the really big days.
    if (c.age >= 18 && !inPrison(g)) {
      const info = exchangeInfo(c.countryId)
      const ey = exchangeYear(fam(g), anchor(g), info, g.year)
      const idx = indexName(info, g.year)
      const m = reportedMove(info, g.year, indexReturn(g, info, g.year, ey.index.ret))
      if (stockMarketBlock(g, info)) return
      if (ey.index.crash) log(g, `The ${idx} crashed ${moveText(m, 0)} this year. Good thing I had nothing in it.`)
      else if (ey.index.boom) log(g, `The ${idx} boomed ${moveText(m, 0)} this year. I wish I had invested.`)
    }
    return
  }
  const news: News[] = []
  let income = 0
  let credited = 0
  let cashOut = 0
  for (const a of held) {
    const d = a.details
    if (num(d.updatedYear, -1) >= g.year) continue
    syncOwnFlow(g, a)
    const before = num(d.marketMarkedYear, -1) === g.year ? Math.max(0, num(d.marketIncomeBase, markedValue(a))) : markedValue(a)
    const u = units(a)
    const mv = moveHolding(g, a, news)
    const rawPay = before * (Number.isFinite(mv.payout) ? mv.payout : 0)
    const pay = Math.max(0, Math.min(MAX_INVESTMENT_VALUE, Math.round(Number.isFinite(rawPay) ? rawPay : 0)))
    if (pay > 0) {
      income = Math.min(MAX_INVESTMENT_VALUE, income + pay)
      d.income = Math.min(MAX_INVESTMENT_VALUE, Math.round(num(d.income) + pay))
    }
    const ev = eventNews(a, mv, before)
    if (ev) news.push(ev)
    if (mv.ended) {
      const proceeds = endedProceeds(a, before, mv.ended.perUnit, mv.ended.premium)
      realize(g, proceeds, proceeds - basis(a), false)
      cashOut = Math.min(MAX_INVESTMENT_VALUE, cashOut + proceeds)
      if (mv.ended.kind === 'bankrupt' || mv.ended.kind === 'nationalized') count(g, 'investWipeouts')
      g.assets = g.assets.filter((x) => x.id !== a.id)
      continue
    }
    // Companies take the names of their era (a tabulating firm becomes a computer company).
    renameForEra(g, a)
    d.yearStart = before
    d.updatedYear = g.year
    delete d.marketMarkedYear; delete d.marketIncomeBase
    d.lastChange = Math.round((Number.isFinite(mv.ret) ? mv.ret : 0) * 10000) / 10000
    setPosition(a, u * (mv.ratio > 0 ? mv.ratio : 1), mv.price, basis(a))
    const rawInterest = before * (Number.isFinite(mv.compound) ? (mv.compound ?? 0) : 0)
    const interest = Math.max(0, Math.min(MAX_INVESTMENT_VALUE, Math.round(Number.isFinite(rawInterest) ? rawInterest : 0)))
    if (interest > 0 && mv.price > 0) {
      // Taxed as income this year, but it stays in the account (and joins the cost basis).
      earnIncome(g, interest)
      addMoney(g, -interest)
      credited = Math.min(MAX_INVESTMENT_VALUE, credited + interest)
      d.income = Math.min(MAX_INVESTMENT_VALUE, Math.round(num(d.income) + interest))
      setPosition(a, units(a) + interest / mv.price, mv.price, basis(a) + interest)
      if (before > 0) d.lastChange = Math.round((a.value / before - 1) * 10000) / 10000
    }
    if (a.value < 1 && before >= 1) {
      // Worth less than a dollar: the broker writes it off.
      realize(g, 0, -basis(a), false)
      g.assets = g.assets.filter((x) => x.id !== a.id)
      log(g, `My ${a.name} position became worthless, so my broker wrote it off.`, 'bad')
    }
  }

  // Banking crises hit every deposit in that country at once.
  const banks = new Map<string, Asset[]>()
  for (const a of investmentHoldings(g)) if (typeOf(a) === 'savings') banks.set(str(a.details.country, c.countryId), [...(banks.get(str(a.details.country, c.countryId)) ?? []), a])
  for (const [cid, deposits] of banks) {
    const fx = fxYear(fam(g), cid, g.year)
    const localEconomy = economyOf(g, cid)
    const systemicRun = !isHistoryYear(g.year) && localEconomy.defaults > .055 && economicRoll(`${fam(g)}|bank-run|${cid}|${g.year}`) < Math.max(0, .25 - localEconomy.liquidity) + (localEconomy.defaults - .055)
    if (!fx.bankCrisis && !systemicRun) continue
    // The guarantee is per depositor, so it covers all of your accounts there together.
    const insured = depositInsurance(cid, g.year)
    const total = deposits.reduce((sum, a) => Math.min(MAX_INVESTMENT_VALUE, sum + holdingValue(a)), 0)
    const recovery = systemicRun ? Math.min(fx.recovery, bound(.95 - localEconomy.defaults * 2, .3, .9)) : fx.recovery
    const kept = Math.min(total, insured) + Math.max(0, total - insured) * recovery
    const lost = Math.round(total - kept)
    if (total > 0) for (const a of deposits) setPosition(a, units(a) * (kept / total), unitPrice(a), basis(a))
    if (lost >= 1) {
      news.push({
        priority: 96,
        title: 'Bank Collapse',
        text: `${str(deposits[0].details.bank, 'Your bank')} froze withdrawals and collapsed. The government guaranteed ${formatMoney(insured)} per depositor; you got back ${Math.round(recovery * 100)} cents on the dollar for the rest. You lost ${formatMoney(lost)}.`,
        emoji: '🏦',
        tone: 'bad',
        log: `My bank collapsed and I lost ${formatMoney(lost)} of my savings.`,
      })
    }
  }

  // Crypto exchanges get hacked. Not your keys, not your coins.
  const coins = investmentHoldings(g).filter((a) => typeOf(a) === 'crypto' && a.value > 0)
  if (coins.length && chance(g, 0.025)) {
    const victim = pick(g, coins)
    const share = Math.round(randFloat(g, 0.3, 1) * 100) / 100
    const lost = Math.round(holdingValue(victim) * share)
    const venue = pick(g, CRYPTO_EXCHANGES)
    // Stolen coins count as a realized loss against future gains.
    const stolenBasis = share >= 0.99 ? basis(victim) : basis(victim) * share
    if (share >= 0.99) g.assets = g.assets.filter((x) => x.id !== victim.id)
    else setPosition(victim, units(victim) * (1 - share), unitPrice(victim), basis(victim) - stolenBasis)
    realize(g, 0, -stolenBasis, false)
    news.push({
      priority: 90,
      title: 'Exchange Hacked',
      text: `${venue}, the exchange holding your ${victim.name}, was hacked. ${share >= 0.99 ? 'All of your coins are gone' : `${Math.round(share * 100)}% of your coins are gone`} (${formatMoney(lost)}). The CEO says he's "looking into it" from a country without an extradition treaty.`,
      emoji: '🏴‍☠️',
      tone: 'bad',
      log: `Hackers stole ${formatMoney(lost)} of my crypto.`,
    })
  }

  if (income > 0) {
    earnIncome(g, income)
    count(g, 'investIncome', income)
    log(g, `My investments paid out ${formatMoney(income)} in dividends and coupons.`, 'good')
  }
  if (credited > 0) log(g, `My bank deposits earned ${formatMoney(credited)} in interest.`, 'good')
  if (cashOut > 0) log(g, `${formatMoney(cashOut)} from investments that closed this year landed in my bank account.`)

  const market = marketNews(g, held)
  if (market) news.push(market)
  news.sort((x, y) => y.priority - x.priority)
  const [top, ...rest] = news
  if (top && top.priority >= 40) {
    const stats = portfolioStats(g)
    const tail = stats.value > 0 && stats.year !== null && top.title === 'Financial News' ? ` Your portfolio ${stats.year >= 0 ? 'gained' : 'lost'} ${absPct(stats.year)} and is now worth ${formatMoney(stats.value)}.` : ''
    notice(g, top.title, top.text + tail, { emoji: top.emoji, tone: top.tone })
    log(g, top.log, top.tone)
  } else if (top) log(g, top.log, top.tone)
  for (const n of rest.slice(0, 3)) log(g, n.log, n.tone)
}

// ---------------------------------------------------------------------------
// Profile summary

/** One line about the player's portfolio for the profile ('' when none). */
export function investmentsSummary(g: GameState): string {
  const held = investmentHoldings(g)
  if (!held.length) return ''
  const s = portfolioStats(g)
  const by = (t: InvestType) => held.filter((a) => typeOf(a) === t)
  const parts: string[] = []
  for (const a of by('index')) parts.push(str(a.details.sector) === 'Investment trust' ? a.name : `${str(a.details.market, a.name)} index fund`)
  const stocks = by('stock').length
  if (stocks) parts.push(stocks === 1 ? `${by('stock')[0].name} stock` : `${stocks} stocks`)
  if (by('bond').length) parts.push('government bonds')
  if (by('reit').length) parts.push('a REIT')
  if (by('gold').length) parts.push('gold')
  if (by('savings').length) parts.push('bank deposits')
  if (by('penny').length) parts.push('penny stocks')
  const cryptoValue = by('crypto').reduce((sum, a) => Math.min(MAX_INVESTMENT_VALUE, sum + holdingValue(a)), 0)
  if (by('crypto').length) parts.push(cryptoValue > s.value * 0.5 ? 'mostly crypto' : 'some crypto')
  const year = s.year !== null ? `; ${s.year >= 0 ? 'up' : 'down'} ${absPct(s.year)} this year` : ''
  // In the past, the year's real market story (the dot-com bust, 2008...).
  const note = isHistoryYear(g.year) ? marketNote(exchangeInfo(g.character.countryId).home, g.year) : ''
  return `Portfolio ${shortMoney(s.value)}: ${parts.slice(0, 6).join(', ')}${year}${note ? `. Market news: ${note}` : ''}`
}
