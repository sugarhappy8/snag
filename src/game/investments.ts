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
import { addMoney, count, earnIncome, formatMoney, inPrison, log, notice, shortMoney, spend } from './core'
import { localMarket, marketOf } from './data/markets'
import { incomeTax, taxAdditionalIncome } from './finance'
import {
  bankCrisisChance,
  bondRate,
  coinDef,
  companyDef,
  countryStress,
  cryptoYear,
  defaultChance,
  depositInsurance,
  exchangeByKey,
  exchangeInfo,
  exchangeYear,
  expectedDepreciation,
  fundFee,
  fxYear,
  goldHedge,
  goldYear,
  hasOwnExchange,
  indexYield,
  localWords,
  pennyDef,
  reitYield,
  savingsRate,
  SECTORS,
  termRate,
  type ExInfo,
  type ExYear,
  type SecYear,
} from './invest/engine'
import { gutLikes, instinctLine, listPicks, marketInstinct, type Instinct } from './invest/instinct'
import { indexShockFactor, pruneMarketShocks, shockedMove, shockFactor, shocksThisYear, type MarketShock } from './invest/shocks'
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
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}%`
}

function priceText(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '$0'
  if (p >= 1_000) return formatMoney(p)
  if (p >= 1) return `$${p.toFixed(2)}`
  if (p >= 0.01) return `$${p.toFixed(3)}`
  return `$${p.toPrecision(2)}`
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
  return (g.lifeId || 'life').replace(/-g\d+$/, '')
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
  return g.assets.filter((a) => a.kind === 'investment')
}

function typeOf(a: Asset): InvestType {
  const t = str(a.details.type)
  return isType(t) ? t : 'stock'
}

function units(a: Asset): number {
  const u = a.details.units
  if (typeof u === 'number' && Number.isFinite(u)) return Math.max(0, u)
  // A holding saved without positions (older data): one unit worth its recorded value.
  return a.value > 0 ? 1 : 0
}

function unitPrice(a: Asset): number {
  const u = units(a)
  const p = num(a.details.price)
  if (p > 0) return p
  return u > 0 ? Math.max(0, a.value) / u : 0
}

function basis(a: Asset): number {
  return Math.max(0, num(a.details.basis, a.purchasePrice))
}

function holdingValue(a: Asset): number {
  return Math.max(0, Math.round(units(a) * unitPrice(a)))
}

function setPosition(a: Asset, u: number, price: number, cost: number): void {
  const safeU = Number.isFinite(u) ? Math.max(0, u) : 0
  const safeP = Number.isFinite(price) ? Math.max(0, price) : 0
  a.details.units = safeU
  a.details.price = safeP
  a.details.basis = Math.max(0, Math.round(Number.isFinite(cost) ? cost : 0))
  a.purchasePrice = a.details.basis
  a.value = Math.max(0, Math.round(safeU * safeP))
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
  const rate = brokerRate(cid)
  const min = brokerMin(cid)
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
  return Math.max(0, num(g.flags.investLossCarry))
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
  const cash = Math.max(0, Math.round(net))
  const gn = Math.round(gain)
  if (gn <= 0) {
    g.flags.investLossCarry = Math.round(carry - gn)
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
function estimateTax(g: GameState, a: Asset, gross: number): { fee: number; penalty: number; gain: number; tax: number } {
  const v = holdingValue(a)
  const frac = v > 0 ? Math.min(1, gross / v) : 1
  const fee = feeFor(feePlan(g, typeOf(a)), gross)
  const penalty = earlyPenalty(g, a, gross)
  const gain = Math.round(gross - fee - penalty - basis(a) * frac)
  const taxable = Math.max(0, gain - Math.min(lossCarry(g), Math.max(0, gain)))
  const before = Math.max(0, num(g.flags.taxableIncome))
  const tax = taxable > 0 ? Math.max(0, incomeTax(g.character.countryId, before + taxable) - incomeTax(g.character.countryId, before)) : 0
  return { fee, penalty, gain, tax }
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
}

function exDetails(info: ExInfo): Record<string, Json> {
  return {
    exKey: info.key,
    exchange: info.ex.code,
    exName: info.ex.name,
    market: info.ex.index,
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

function stockQuote(info: ExInfo, s: SecYear, penny: boolean): Quote {
  const def = penny ? pennyDef(info, s.slot, s.gen) : companyDef(info, s.slot, s.gen)
  const sector = def.sector === 'penny' ? 'Penny stock' : SECTORS[def.sector].label
  return {
    type: penny ? 'penny' : 'stock',
    secId: def.id,
    name: def.name,
    symbol: def.symbol,
    emoji: penny ? TYPE_EMOJI.penny : def.sector === 'penny' ? TYPE_EMOJI.stock : SECTORS[def.sector].emoji,
    price: s.price,
    risk: def.risk,
    yield: def.dy,
    ret: s.event === 'ipo' ? null : s.ret,
    sector,
    blurb: def.blurb,
    blocked: null,
    details: { type: penny ? 'penny' : 'stock', secId: def.id, symbol: def.symbol, risk: def.risk, yield: def.dy, sector, blurb: def.blurb, slot: s.slot, gen: s.gen, beta: def.beta, vol: def.idio, country: info.home, ...exDetails(info) },
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

function bondRisk(countryId: string): number {
  return Math.max(1, Math.min(5, 1 + Math.round(countryStress(countryId) * 4)))
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

function listing(g: GameState): Listing {
  const cid = g.character.countryId
  const m = localMarket(g)
  const info = exchangeInfo(cid)
  const f = fam(g)
  const an = anchor(g)
  const ey = exchangeYear(f, an, info, g.year)
  const country = countryName(cid)
  const homeWord = localWords(info.home)[0]
  const stocks = ey.stocks.map((s) => withShock(g, stockQuote(info, s, false), shockFactor(g, companyDef(info, s.slot, s.gen).id, g.year), shockFactor(g, companyDef(info, s.slot, s.gen).id, g.year - 1)))
  const pennies = ey.pennies.map((s) => stockQuote(info, s, true))
  const fundId = ey.fund.id
  const fund: Quote = {
    type: 'index',
    secId: fundId,
    name: `${info.ex.index} Index Fund`,
    symbol: `${info.ex.code.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}X`,
    emoji: TYPE_EMOJI.index,
    price: ey.fund.price,
    risk: info.ex.volatility >= 0.3 ? 3 : 2,
    yield: indexYield(info),
    ret: ey.year === an ? null : ey.fund.ret,
    sector: 'Index fund',
    blurb: `Owns every company in the ${info.ex.index} in one go. Yearly fee: ${rateText(fundFee(info))}.`,
    blocked: null,
    details: {},
  }
  fund.details = { type: 'index', secId: fundId, symbol: fund.symbol, risk: fund.risk, yield: fund.yield, sector: fund.sector, blurb: fund.blurb, country: info.home, ...exDetails(info) }
  Object.assign(fund, withShock(g, fund, indexShockFactor(g, info.key, g.year), indexShockFactor(g, info.key, g.year - 1)))
  const reitName = `${homeWord} Property Trust`
  const reit: Quote = {
    type: 'reit',
    secId: ey.reit.id,
    name: reitName,
    symbol: `${reitName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}R`,
    emoji: TYPE_EMOJI.reit,
    price: ey.reit.price,
    risk: 3,
    yield: reitYield(info),
    ret: ey.year === an ? null : ey.reit.ret,
    sector: 'Real estate',
    blurb: `Owns malls, offices and apartment blocks in ${theCountry(info.home)} and pays out most of the rent. It rises and falls with local house prices.`,
    blocked: null,
    details: {},
  }
  reit.details = { type: 'reit', secId: reit.secId, symbol: reit.symbol, risk: reit.risk, yield: reit.yield, sector: reit.sector, blurb: reit.blurb, country: info.home, ...exDetails(info) }

  const br = bondRate(cid)
  const pDef = defaultChance(cid)
  const bond: Quote = {
    type: 'bond',
    secId: `bond:${cid}:${g.year}`,
    name: `${country} Government Bond (due ${g.year + BOND_YEARS})`,
    symbol: `${cid.toUpperCase()}10Y`,
    emoji: TYPE_EMOJI.bond,
    price: 1_000,
    risk: bondRisk(cid),
    yield: br,
    ret: null,
    sector: 'Government bond',
    blurb: `A loan to the government of ${theCountry(cid)}, paid back in the local currency (${m.currencyName}). Default risk: ${defaultRiskLabel(pDef)}.`,
    blocked: null,
    details: {},
  }
  bond.details = { type: 'bond', secId: bond.secId, symbol: bond.symbol, risk: bond.risk, yield: br, sector: bond.sector, blurb: bond.blurb, country: cid, currency: m.currencyName, maturity: g.year + BOND_YEARS }
  const bank = bankName(cid)
  const sr = savingsRate(cid)
  const savings: Quote = {
    type: 'savings',
    secId: `savings:${cid}`,
    name: `Savings Account (${bank})`,
    symbol: '',
    emoji: TYPE_EMOJI.savings,
    price: 1,
    risk: Math.max(1, Math.min(4, 1 + Math.round(countryStress(cid) * 3))),
    yield: sr,
    ret: null,
    sector: 'Savings',
    blurb: `Interest follows the central bank's rate. Withdraw anytime. Deposits are insured up to ${formatMoney(depositInsurance(cid))}.`,
    blocked: null,
    details: {},
  }
  savings.details = { type: 'savings', product: 'savings', secId: savings.secId, symbol: '', risk: savings.risk, yield: sr, sector: 'Savings', blurb: savings.blurb, country: cid, bank, currency: m.currencyName }
  const tr = termRate(cid)
  const term: Quote = {
    ...savings,
    secId: `term:${cid}:${g.year}`,
    name: `${TERM_YEARS}-Year Term Deposit (${bank})`,
    yield: tr,
    sector: 'Term deposit',
    blurb: `A fixed ${rateText(tr)} for ${TERM_YEARS} years. Take the money out early and you give back a year of interest.`,
    details: {},
  }
  term.details = { ...savings.details, product: 'term', secId: term.secId, yield: tr, sector: 'Term deposit', blurb: term.blurb, maturity: g.year + TERM_YEARS }

  const gy = goldYear(f, an, g.year)
  const hedge = goldHedge(cid)
  const gold: Quote = {
    type: 'gold',
    secId: `gold:${cid}`,
    name: 'Gold Bullion',
    symbol: 'XAU',
    emoji: TYPE_EMOJI.gold,
    price: gy.price,
    risk: 2,
    yield: 0,
    ret: g.year === an ? null : gy.ret,
    sector: 'Precious metals',
    blurb:
      hedge > 0
        ? `Priced in dollars worldwide, so it doesn't care when the ${m.currencyName} loses value. With inflation here at ${rateText(m.inflation)}, local gold has been beating the world price by about ${rateText(hedge)} a year.`
        : 'Priced in dollars worldwide. It pays nothing, but it tends to hold up when stock markets panic.',
    blocked: null,
    details: {},
  }
  gold.details = { type: 'gold', secId: gold.secId, symbol: 'XAU', risk: 2, yield: 0, sector: gold.sector, blurb: gold.blurb, country: cid }

  const cy = cryptoYear(f, an, g.year)
  const banned = CRYPTO_BANNED.has(cid) ? `Crypto trading is banned in ${theCountry(cid)}.` : null
  const crypto = cy.coins.map((c): Quote => {
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
      ret: c.event === 'ipo' || g.year === an ? null : c.ret,
      sector: def.stable ? 'Stablecoin' : 'Cryptocurrency',
      blurb: def.blurb,
      blocked: banned,
      details: { type: 'crypto', secId: def.id, symbol: def.symbol, risk: def.risk, yield: def.yield, sector: def.stable ? 'Stablecoin' : 'Cryptocurrency', blurb: def.blurb, slot: c.slot, gen: c.gen, country: cid },
    }, shockFactor(g, def.id, g.year), shockFactor(g, def.id, g.year - 1))
  })
  return { info, year: ey, stocks, pennies, fund, reit, bond, savings, term, gold, crypto }
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
          : null,
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

function buyBlock(g: GameState, q: Quote): string | null {
  const b = tradeBlock(g)
  if (b) return b
  if (q.blocked) return q.blocked
  const min = minTrade(g)
  if (g.character.money < min) return `You need at least ${formatMoney(min)} in the bank to invest.`
  if (!(q.price > 0)) return 'This security is not trading right now.'
  return null
}

/** Buy `amount` dollars of a security (fees come out of the amount). Returns true on success. */
export function buySecurity(g: GameState, secId: string, amount: number): boolean {
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
  if (amt > g.character.money) {
    notice(g, 'Insufficient Funds', `You only have ${formatMoney(g.character.money)} in the bank.`, { emoji: '💸', tone: 'bad' })
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
  const newUnits = invested / price
  let a = held
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
  count(g, 'investTrades')
  count(g, 'moneyInvested', amt)
  const what = q.type === 'savings' ? `put ${formatMoney(invested)} into a ${q.sector.toLowerCase()}` : `bought ${unitsText(newUnits)} ${unitLabel(q)} of ${q.name}${q.symbol ? ` (${q.symbol})` : ''}`
  const feeLine = fee > 0 ? ` ${formatMoney(fee)} went to fees.` : ''
  notice(g, 'Order Filled', `You ${what} for ${formatMoney(amt)}.${feeLine} Your position is now worth ${formatMoney(a.value)}.`, { emoji: q.emoji, tone: 'good' })
  log(g, q.type === 'savings' ? `I put ${formatMoney(amt)} in the bank.` : `I invested ${formatMoney(amt)} in ${q.name}.`)
  return true
}

interface SaleResult {
  gross: number
  fee: number
  penalty: number
  net: number
  realized: Realized
}

function sellCore(g: GameState, a: Asset, grossWanted: number): SaleResult | null {
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
  const net = Math.max(0, sold - fee - penalty)
  const basisPart = basis(a) * frac
  if (all) g.assets = g.assets.filter((x) => x.id !== a.id)
  else setPosition(a, units(a) * (1 - frac), unitPrice(a), basis(a) - basisPart)
  const realized = realize(g, net, net - basisPart, true)
  count(g, 'investTrades')
  return { gross: sold, fee, penalty, net, realized }
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
  const a = g.assets.find((x) => x.id === assetId && x.kind === 'investment')
  if (!a) return false
  const block = tradeBlock(g)
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
  const extra = [res.fee > 0 ? `Fees: ${formatMoney(res.fee)}.` : '', res.penalty > 0 ? `Early withdrawal penalty: ${formatMoney(res.penalty)}.` : ''].filter(Boolean).join(' ')
  const verb = t === 'savings' ? `withdrew ${formatMoney(res.gross)} from your ${str(a.details.product) === 'term' ? 'term deposit' : 'savings account'}` : `sold ${formatMoney(res.gross)} of ${a.name}`
  notice(g, t === 'savings' ? 'Withdrawal' : 'Order Filled', `You ${verb}. ${extra ? `${extra} ` : ''}${formatMoney(res.net)} landed in your bank account. ${gainLine(res.realized)}`, { emoji: a.emoji, tone: res.realized.gain >= 0 ? 'good' : 'bad' })
  log(g, t === 'savings' ? `I withdrew ${formatMoney(res.gross)} from the bank.` : res.realized.gain >= 0 ? `I sold some ${a.name} at a profit.` : `I sold some ${a.name} at a loss.`, res.realized.gain >= 0 ? 'good' : 'bad')
  return true
}

/** Sell every holding at once. */
export function liquidatePortfolio(g: GameState): boolean {
  const block = tradeBlock(g)
  if (block) {
    notice(g, 'Order Rejected', block, { emoji: '🚫' })
    return false
  }
  const list = investmentHoldings(g)
  if (!list.length) return false
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
  notice(g, 'Portfolio Liquidated', `You sold everything for ${formatMoney(gross)}. Fees and penalties: ${formatMoney(fees)}. ${formatMoney(net)} landed in your bank account. ${result}`, { emoji: '💰', tone: gain >= 0 ? 'good' : 'bad' })
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
    value += Math.max(0, a.value)
    cost += basis(a)
    if (num(a.details.updatedYear) === g.year) {
      const s = num(a.details.yearStart)
      start += s
      moved += s * num(a.details.lastChange)
    }
  }
  return { value, basis: cost, year: start > 0 ? moved / start : null }
}

function marketLine(info: ExInfo, ey: ExYear): string {
  const r = ey.index.ret
  const verb = r >= 0.005 ? 'up' : r <= -0.005 ? 'down' : 'flat'
  const amount = verb === 'flat' ? '' : ` ${absPct(r, 1)}`
  return `${ey.index.regime.emoji} ${info.ex.index} ${verb}${amount} this year · ${ey.index.regime.label}`
}

function historyLine(g: GameState, info: ExInfo): string {
  const f = fam(g)
  const an = anchor(g)
  const from = Math.max(an + 1, g.year - 4)
  const parts: string[] = []
  for (let y = from; y <= g.year; y++) parts.push(`'${String(y).slice(-2)} ${pct(exchangeYear(f, an, info, y).index.ret, 0)}`)
  return parts.length ? `Recent years: ${parts.join(' · ')}` : ''
}

function localNote(g: GameState): string {
  const cid = g.character.countryId
  const m = localMarket(g)
  const info = exchangeInfo(cid)
  const lines: string[] = []
  if (!hasOwnExchange(cid)) lines.push(`${countryName(cid)} has no stock exchange of its own, so your broker trades on the ${info.ex.name} (${info.ex.code}).`)
  else lines.push(`You trade on the ${info.ex.name} (${info.ex.code}).`)
  lines.push(`Policy rate ${rateText(m.interestRate)}, inflation ${rateText(m.inflation)}.`)
  const dep = expectedDepreciation(cid)
  if (dep >= 0.05) lines.push(`The ${m.currencyName} loses about ${rateText(dep)} a year against the dollar, so local bonds and savings shrink in dollar terms.`)
  else if (m.interestRate < m.inflation) lines.push('Interest here is below inflation, so cash in the bank slowly loses buying power.')
  return lines.join(' ')
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
  return {
    type: 'action',
    id: `inv-buy-${q.secId}`,
    label: held ? (q.type === 'savings' ? 'Deposit More' : 'Buy More') : q.type === 'savings' ? 'Deposit' : 'Buy',
    emoji: '💵',
    subtitle: `${plan.label} · Minimum ${formatMoney(min)}`,
    disabledReason: (gg) => buyBlock(gg, q),
    input: {
      kind: 'number',
      label: `How many dollars? You have ${formatMoney(cash)}.`,
      placeholder: String(Math.max(min, suggestion)),
      min,
      max: Math.max(min, cash),
      defaultValue: () => String(Math.max(min, suggestion)),
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
      subtitle: `${feePlan(g, t).label}${earlyPenalty(g, a, 100) > 0 ? ' · Early withdrawal penalty' : ''}`,
      visible: () => value > 1,
      disabledReason: (gg) => tradeBlock(gg),
      input: { kind: 'number', label: `How many dollars' worth? It's worth ${formatMoney(value)}.`, placeholder: String(Math.round(value / 2)), min, max: Math.max(min, value), defaultValue: () => String(Math.max(min, Math.round(value / 2))) },
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
      subtitle: `About ${formatMoney(Math.max(0, value - feeFor(feePlan(g, t), value) - earlyPenalty(g, a, value)))} after fees`,
      disabledReason: (gg) => tradeBlock(gg),
      confirm: (gg) => {
        const cur = gg.assets.find((x) => x.id === a.id)
        if (!cur) return null
        const v = holdingValue(cur)
        const est = estimateTax(gg, cur, v)
        const bits = [`${deposit ? 'Withdraw' : 'Sell'} all of your ${cur.name} for about ${formatMoney(v)}?`]
        if (est.fee > 0) bits.push(`Fees: ${formatMoney(est.fee)}.`)
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
  const gain = v - cost
  const gp = cost > 0 ? gain / cost : 0
  rows.push(`Invested: ${formatMoney(cost)}${t !== 'savings' && u > 0 ? ` (avg ${priceText(cost / u)})` : ''} · ${gain >= 0 ? 'Gain' : 'Loss'}: ${formatMoney(Math.abs(gain))} (${pct(gp)})`)
  if (num(d.updatedYear) === g.year) rows.push(`This year: ${change(num(d.lastChange))}`)
  const y = num(d.yield)
  const income = num(d.income)
  const cid = str(d.country, g.character.countryId)
  switch (t) {
    case 'bond': {
      const p = defaultChance(cid)
      rows.push(`Coupon: ${rateText(y)} a year · Default risk: ${defaultRiskLabel(p)}${income > 0 ? ` · Collected ${formatMoney(income)}` : ''}`)
      const dep = expectedDepreciation(cid)
      if (dep >= 0.03) rows.push(`The ${str(d.currency, 'local currency')} tends to lose about ${rateText(dep)} a year against the dollar, which eats into the coupon.`)
      if (num(d.maturity) > 0) rows.push(`Matures in ${num(d.maturity)}, when the government pays back the face value (in ${str(d.currency, 'the local currency')}).`)
      break
    }
    case 'savings': {
      const m = marketOf(cid)
      const rate = str(d.product) === 'term' ? y : savingsRate(cid)
      const real = rate - m.inflation
      rows.push(`Interest: ${rateText(rate)} a year${income > 0 ? ` · Earned ${formatMoney(income)}` : ''}`)
      rows.push(`Inflation runs about ${rateText(m.inflation)}, so your real return is roughly ${pct(real)} a year. Insured up to ${formatMoney(depositInsurance(cid))}.`)
      const dep = expectedDepreciation(cid)
      if (dep >= 0.03) rows.push(`The balance is kept in ${m.currencyName}, which tends to lose about ${rateText(dep)} a year against the dollar, so it shrinks in dollar terms while the interest piles up.`)
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
  const nodes: MenuNode[] = holdingInfo(g, a).map((text, i): MenuNode => ({ type: 'info', id: `inv-info-${a.id}-${i}`, text }))
  nodes.push({ type: 'heading', id: `inv-actions-${a.id}`, label: 'Actions' })
  const q = holdingQuote(g, a)
  if (!q.closed) nodes.push(buyAction(g, q, true))
  nodes.push(...sellActions(g, a))
  return nodes
}

export function investmentAssetSubtitle(_g: GameState, a: Asset): string {
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
      rows.push(`${q.sector} · ${riskText(q.risk)}`)
      if (q.type === 'bond') rows.push(`Coupon: ${rateText(q.yield)} a year, paid as taxable income. Sold in $1,000 bonds.`)
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
    parts.push(`'${String(y).slice(-2)} ${pct(ret, 0)}`)
  }
  return parts.length ? `Recent years: ${parts.join(' · ')}` : 'Recently listed: no track record yet.'
}

const stocksMenu: MenuGroup = {
  type: 'menu',
  id: 'inv-stocks',
  label: 'Stocks',
  emoji: '📈',
  subtitle: (g) => {
    const info = exchangeInfo(g.character.countryId)
    return `Companies listed on the ${info.ex.code}`
  },
  hint: (g) => gutGroupHint(g, ['stock']),
  header: (g) => {
    const l = listing(g)
    return `${marketLine(l.info, l.year)}\n${l.info.ex.name} (${l.info.ex.code}): the biggest companies in ${theCountry(l.info.home)}. Prices move once a year, and every stock rides the market's mood.`
  },
  children: (g) => {
    const l = listing(g)
    return l.stocks.map((q) => offerNode(g, q, [stockHistory(g, l.info, num(q.details.slot), num(q.details.gen), false)]))
  },
}

const pennyMenu: MenuGroup = {
  type: 'menu',
  id: 'inv-penny',
  label: 'Penny Stocks',
  emoji: '🎟️',
  subtitle: 'Tiny companies, huge swings',
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
  hint: (g) => gutGroupHint(g, ['crypto']),
  header: (g) => {
    const cy = cryptoYear(fam(g), anchor(g), g.year)
    const mood = cy.winter ? 'A crypto winter wiped out most of the market this year.' : cy.mania ? 'Crypto mania: everyone and their dentist bought coins this year.' : `The crypto market moved ${pct(cy.ret, 0)} this year.`
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
  subtitle: (g) => `Bonds ${rateText(bondRate(g.character.countryId))} · Savings ${rateText(savingsRate(g.character.countryId))}`,
  header: (g) => {
    const cid = g.character.countryId
    const m = localMarket(g)
    const bits = [`The central bank's rate in ${theCountry(cid)} is ${rateText(m.interestRate)} and inflation runs about ${rateText(m.inflation)}.`]
    if (m.interestRate < m.inflation) bits.push('Savings pay less than inflation, so they lose buying power over time.')
    if (defaultChance(cid) >= 0.01) bits.push('High yields here come with a real chance the government defaults.')
    if (bankCrisisChance(cid) >= 0.005) bits.push(`Banks have been known to freeze deposits; only ${formatMoney(depositInsurance(cid))} per account is guaranteed.`)
    return bits.join(' ')
  },
  children: (g) => {
    const l = listing(g)
    const cid = g.character.countryId
    const m = localMarket(g)
    const real = (r: number) => `After ${rateText(m.inflation)} inflation, that's a real return of about ${pct(r - m.inflation)} a year.`
    return [
      offerNode(g, l.bond, [real(l.bond.yield), `Default risk: ${defaultRiskLabel(defaultChance(cid))}.`]),
      offerNode(g, l.savings, [real(l.savings.yield)]),
      offerNode(g, l.term, [real(l.term.yield)]),
    ]
  },
}

function fundNode(g: GameState): MenuGroup {
  const l = listing(g)
  return offerNode(g, l.fund, [historyLine(g, l.info) || 'A brand-new fund: no history yet.', `Index level: ${Math.round(l.year.level).toLocaleString('en-US')} points.`])
}

function reitNode(g: GameState): MenuGroup {
  const l = listing(g)
  return offerNode(g, l.reit, [`Local house prices ${l.year.year === anchor(g) ? 'are holding steady' : `moved ${pct(l.year.housing, 0)} this year`}.`])
}

function goldNode(g: GameState): MenuGroup {
  const l = listing(g)
  return offerNode(g, l.gold, ['Sold by the troy ounce (fractions welcome).'])
}

// ---------------------------------------------------------------------------
// Financial news

const ANALYST_FIRMS = ['Goldfinch & Partners', 'Morgan Stanwell', 'Bullhorn Capital', 'Lynch & Merrily', 'Bearington Research', 'Hedgehog Advisors']

function newsLines(g: GameState): string[] {
  const l = listing(g)
  const f = fam(g)
  const an = anchor(g)
  const ey = l.year
  const lines: string[] = [marketLine(l.info, ey)]
  if (ey.year > an) {
    const movers = ey.stocks.filter((s) => s.event !== 'ipo').map((s) => ({ s, def: companyDef(l.info, s.slot, s.gen) }))
    if (movers.length) {
      const best = movers.reduce((a, b) => (b.s.ret > a.s.ret ? b : a))
      const worst = movers.reduce((a, b) => (b.s.ret < a.s.ret ? b : a))
      lines.push(`🏆 Top performer: ${best.def.name} (${best.def.symbol}) ${pct(best.s.ret, 0)}`)
      if (worst.s.ret < 0) lines.push(`🧯 Worst performer: ${worst.def.name} (${worst.def.symbol}) ${pct(worst.s.ret, 0)}`)
    }
    for (const sh of shocksThisYear(g)) lines.push(shockHeadline(sh))
    for (const s of ey.stocks) {
      const def = companyDef(l.info, s.slot, s.gen)
      if (s.ended) {
        const old = s.ended.id.match(/s(\d+)g(\d+)$/)
        const prev = old ? companyDef(l.info, Number(old[1]), Number(old[2])) : null
        if (prev) lines.push(s.ended.kind === 'bankrupt' ? `💀 ${prev.name} went bankrupt. Its shares are worthless.` : `🤝 ${prev.name} was bought out at a ${Math.round(s.ended.premium * 100)}% premium.`)
        lines.push(`🔔 New listing: ${def.name} (${def.symbol}) went public.`)
      } else if (s.event === 'split' && s.ratio) lines.push(`✂️ ${def.name} did a ${s.ratio}-for-1 stock split.`)
      else if (s.event === 'scandal') lines.push(`🚨 ${def.name} plunged after an accounting scandal.`)
      else if (s.event === 'surge') lines.push(`🚀 ${def.name} soared on a blockbuster product launch.`)
    }
    const cy = cryptoYear(f, an, g.year)
    lines.push(cy.winter ? `🥶 Crypto winter: the crypto market fell ${absPct(cy.ret)}.` : cy.mania ? `🤑 Crypto mania: the crypto market rose ${absPct(cy.ret)}.` : `🪙 Crypto market ${pct(cy.ret, 0)} this year.`)
    for (const c of cy.coins) {
      if (c.ended) {
        const old = c.ended.id.match(/c(\d+)g(\d+)$/)
        const prev = old ? coinDef(Number(old[1]), Number(old[2])) : null
        if (prev) lines.push(`💥 ${prev.name} (${prev.symbol}) collapsed to zero. ${coinDef(c.slot, c.gen).name} launched in its place.`)
      }
    }
    const gy = goldYear(f, an, g.year)
    lines.push(`🥇 Gold ${pct(gy.ret, 0)} to ${formatMoney(gy.price)} an ounce.`)
    const fx = fxYear(f, g.character.countryId, g.year)
    const m = localMarket(g)
    if (fx.defaulted) lines.push(`🏛️ The government of ${theCountry(g.character.countryId)} defaulted on its bonds.`)
    if (fx.bankCrisis) lines.push(`🏦 A banking crisis hit ${theCountry(g.character.countryId)}: deposits were frozen.`)
    if (fx.dep >= 0.1) lines.push(`💱 The ${m.currencyName} lost ${rateText(fx.dep)} against the dollar.`)
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
  }
}

function seededTip(g: GameState, info: ExInfo): string | null {
  const f = fam(g)
  const an = anchor(g)
  const now = exchangeYear(f, an, info, g.year)
  const next = exchangeYear(f, an, info, g.year + 1)
  const key = `${f}|tip|${info.key}|${g.year}`
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0
  const candidates = now.stocks.filter((s) => next.stocks[s.slot] && next.stocks[s.slot].gen === s.gen)
  if (!candidates.length) return null
  const s = candidates[h % candidates.length]
  const def = companyDef(info, s.slot, s.gen)
  const up = next.stocks[s.slot].ret > 0
  const right = (h >>> 8) % 3 !== 0
  const bullish = right ? up : !up
  const firm = ANALYST_FIRMS[(h >>> 4) % ANALYST_FIRMS.length]
  return bullish ? `📣 ${firm} rates ${def.name} (${def.symbol}) a strong buy for next year.` : `📣 ${firm} warns that ${def.name} (${def.symbol}) is overvalued going into next year.`
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
    const top = investmentHoldings(g).length
      ? `Portfolio: ${formatMoney(s.value)} · ${gain >= 0 ? 'Gain' : 'Loss'}: ${formatMoney(Math.abs(gain))} (${pct(s.basis > 0 ? gain / s.basis : 0)})`
      : "You don't own any investments yet."
    return `${top}\n${marketLine(info, ey)}\nCash: ${formatMoney(g.character.money)} · ${feePlan(g, 'stock').label}`
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
  ended?: { kind: 'bankrupt' | 'acquired' | 'delisted' | 'matured'; perUnit: number; premium: number }
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
      const ey = exchangeYear(f, an, info, g.year)
      if (t === 'index') return shockMove(pathMove(ey.fund.id === str(d.secId) ? ey.fund : undefined, a, price), indexShockFactor(g, info.key, g.year), indexShockFactor(g, info.key, g.year - 1))
      if (t === 'reit') return pathMove(ey.reit.id === str(d.secId) ? ey.reit : undefined, a, price)
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
      const gy = goldYear(f, an, g.year)
      const ret = (1 + gy.ret) * (1 + goldHedge(str(d.country, g.character.countryId))) - 1
      return { price: Math.max(0.01, price * (1 + ret)), ratio: 1, ret, payout: 0 }
    }
    case 'bond': {
      const cid = str(d.country, g.character.countryId)
      const fx = fxYear(f, cid, g.year)
      const coupon = Math.max(0, num(d.yield)) * (1 - Math.max(0, fx.dep) / 2)
      let ret = (1 - fx.dep) * (1 + fx.bondMove) - 1
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
      const rate = str(d.product) === 'term' ? Math.max(0, num(d.yield)) : savingsRate(cid)
      if (str(d.product) !== 'term') d.yield = rate
      // Interest is credited to the account in local money, so the balance compounds while the
      // currency's slide shrinks it in dollar terms.
      const ret = -fx.dep
      return { price: Math.max(0.0001, price * (1 + ret)), ratio: 1, ret, payout: 0, compound: rate * (1 - Math.max(0, fx.dep)) }
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
        return { priority: 80, title: 'Buyout!', text: `${label} was bought by a bigger rival at a ${Math.round(mv.ended.premium * 100)}% premium. Your shares were cashed out automatically.`, emoji: '🤝', tone: 'good', log: `${a.name} was bought out and my shares were cashed out at a premium.` }
      case 'matured':
        return { priority: 35, title: 'Bond Matured', text: `Your ${a.name} matured, and the government paid back ${formatMoney(valueBefore * (1 + mv.ret))}.`, emoji: '🏛️', tone: 'neutral', log: `My ${a.name} matured and paid me back ${formatMoney(valueBefore * (1 + mv.ret))}.` }
      case 'delisted':
        return { priority: 30, title: 'Delisted', text: `${label} was delisted, and your shares were paid out at their last price.`, emoji: '📤', tone: 'neutral', log: `${a.name} was delisted and my shares were paid out.` }
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
    if (!best || Math.abs(ey.index.ret) > Math.abs(best.ey.index.ret)) best = { info, ey }
  }
  if (best && Math.abs(best.ey.index.ret) > 0.15) {
    const { info, ey } = best
    const r = ey.index.ret
    const up = r > 0
    const text = up
      ? `${ey.index.boom ? 'Euphoria on the trading floor: the' : 'The'} ${info.ex.index} rose ${absPct(r)} this year. ${pick(g, ['Taxi drivers are giving stock tips again.', 'Everyone at work suddenly thinks they are a genius investor.', 'Analysts who predicted a crash are quietly deleting their posts.'])}`
      : `${ey.index.crash ? 'Panic on the trading floor: the' : 'The'} ${info.ex.index} fell ${absPct(r)} this year. ${pick(g, ['Investors are selling everything that isn\'t nailed down.', 'Financial TV hosts are wearing their serious ties.', 'Somewhere, a man who keeps his savings in a mattress feels very smug.'])}`
    return { priority: up ? 50 : 60, title: 'Financial News', text, emoji: '📰', tone: up ? 'good' : 'bad', log: up ? `The ${info.ex.index} had a great year (${pct(r, 0)}).` : `The ${info.ex.index} had a terrible year (${pct(r, 0)}).` }
  }
  const crypto = held.filter((a) => typeOf(a) === 'crypto')
  if (crypto.length) {
    const cy = cryptoYear(fam(g), anchor(g), g.year)
    if (cy.winter) return { priority: 62, title: 'Crypto Winter', text: `The crypto market fell ${absPct(cy.ret)} this year. Laser-eyed profile pictures are being quietly changed back.`, emoji: '🥶', tone: 'bad', log: 'A crypto winter hammered my coins.' }
    if (cy.mania) return { priority: 52, title: 'Crypto Mania', text: `The crypto market rose ${absPct(cy.ret)} this year. Your barber asked if you've heard of ${pick(g, ['Corgicoin', 'Bitbuck', 'Aetherium'])}.`, emoji: '🤑', tone: 'good', log: 'Crypto went wild this year and my coins soared.' }
  }
  return null
}

const CRYPTO_EXCHANGES = ['CoinVault', 'BlockBarn', 'HODLHub', 'Satoshi Safe', 'CryptoCastle', 'MoonBase Exchange']

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
    return !!info && exchangeYear(f, an, info, last).stocks[sh.slot]?.id === sh.secId
  })
}

/**
 * Re-price the player's stocks, index funds and coins at today's quotes, right after news moved
 * the market mid-year (a ban, a contract...). Unrealized: nothing is taxed or sold.
 */
export function revalueHoldings(g: GameState): void {
  const quotes = allQuotes(listing(g))
  for (const a of investmentHoldings(g)) {
    const t = typeOf(a)
    if (t !== 'stock' && t !== 'index' && t !== 'crypto') continue
    const q = quotes.find((x) => x.secId === str(a.details.secId))
    const old = unitPrice(a)
    if (!q || !(q.price > 0) || !(old > 0) || Math.abs(q.price / old - 1) < 1e-9) continue
    if (num(a.details.updatedYear) === g.year) a.details.lastChange = Math.round(((1 + num(a.details.lastChange)) * (q.price / old) - 1) * 10000) / 10000
    setPosition(a, units(a), q.price, basis(a))
  }
}

/** Yearly hook (aging.ts, after business, before finance): prices move, dividends and coupons pay out. */
export function yearlyInvestments(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  pruneShocks(g)
  const held = investmentHoldings(g)
  if (!held.length) {
    // Non-investors only hear about the really big days.
    if (c.age >= 18 && !inPrison(g)) {
      const info = exchangeInfo(c.countryId)
      const ey = exchangeYear(fam(g), anchor(g), info, g.year)
      if (ey.index.crash) log(g, `The ${info.ex.index} crashed ${absPct(ey.index.ret)} this year. Good thing I had nothing in it.`)
      else if (ey.index.boom) log(g, `The ${info.ex.index} boomed ${absPct(ey.index.ret)} this year. I wish I had invested.`)
    }
    return
  }
  const news: News[] = []
  let income = 0
  let credited = 0
  let cashOut = 0
  for (const a of held) {
    const d = a.details
    const before = holdingValue(a)
    const u = units(a)
    const mv = moveHolding(g, a, news)
    const pay = Math.max(0, Math.round(before * (Number.isFinite(mv.payout) ? mv.payout : 0)))
    if (pay > 0) {
      income += pay
      d.income = Math.round(num(d.income) + pay)
    }
    const ev = eventNews(a, mv, before)
    if (ev) news.push(ev)
    if (mv.ended) {
      const proceeds = Math.max(0, Math.round(u * mv.ended.perUnit))
      realize(g, proceeds, proceeds - basis(a), false)
      cashOut += proceeds
      if (mv.ended.kind === 'bankrupt') count(g, 'investWipeouts')
      g.assets = g.assets.filter((x) => x.id !== a.id)
      continue
    }
    d.yearStart = before
    d.updatedYear = g.year
    d.lastChange = Math.round((Number.isFinite(mv.ret) ? mv.ret : 0) * 10000) / 10000
    setPosition(a, u * (mv.ratio > 0 ? mv.ratio : 1), mv.price, basis(a))
    const interest = Math.max(0, Math.round(before * (Number.isFinite(mv.compound) ? (mv.compound ?? 0) : 0)))
    if (interest > 0 && mv.price > 0) {
      // Taxed as income this year, but it stays in the account (and joins the cost basis).
      earnIncome(g, interest)
      addMoney(g, -interest)
      credited += interest
      d.income = Math.round(num(d.income) + interest)
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
    if (!fx.bankCrisis) continue
    // The guarantee is per depositor, so it covers all of your accounts there together.
    const insured = depositInsurance(cid)
    const total = deposits.reduce((sum, a) => sum + holdingValue(a), 0)
    const kept = Math.min(total, insured) + Math.max(0, total - insured) * fx.recovery
    const lost = Math.round(total - kept)
    if (total > 0) for (const a of deposits) setPosition(a, units(a) * (kept / total), unitPrice(a), basis(a))
    if (lost >= 1) {
      news.push({
        priority: 96,
        title: 'Bank Collapse',
        text: `${str(deposits[0].details.bank, 'Your bank')} froze withdrawals and collapsed. The government guaranteed ${formatMoney(insured)} per depositor; you got back ${Math.round(fx.recovery * 100)} cents on the dollar for the rest. You lost ${formatMoney(lost)}.`,
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
    const lost = Math.round(victim.value * share)
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
// AI summary

/** One line for the AI prompt about the player's portfolio ('' when none). */
export function investmentsSummary(g: GameState): string {
  const held = investmentHoldings(g)
  if (!held.length) return ''
  const s = portfolioStats(g)
  const by = (t: InvestType) => held.filter((a) => typeOf(a) === t)
  const parts: string[] = []
  for (const a of by('index')) parts.push(`${str(a.details.market, a.name)} index fund`)
  const stocks = by('stock').length
  if (stocks) parts.push(stocks === 1 ? `${by('stock')[0].name} stock` : `${stocks} stocks`)
  if (by('bond').length) parts.push('government bonds')
  if (by('reit').length) parts.push('a REIT')
  if (by('gold').length) parts.push('gold')
  if (by('savings').length) parts.push('bank deposits')
  if (by('penny').length) parts.push('penny stocks')
  const cryptoValue = by('crypto').reduce((sum, a) => sum + a.value, 0)
  if (by('crypto').length) parts.push(cryptoValue > s.value * 0.5 ? 'mostly crypto' : 'some crypto')
  const year = s.year !== null ? `; ${s.year >= 0 ? 'up' : 'down'} ${absPct(s.year)} this year` : ''
  return `Portfolio ${shortMoney(s.value)}: ${parts.slice(0, 6).join(', ')}${year}`
}
