// Banking 2.0 state: the bank's books (plain JSON in BizState.financeFirm, kind 'bank'), the product
// catalog and a pure reader that also migrates the legacy v2.1 finance record.
//
// The books follow one identity: the client side always balances.
//   performing loans + recoverable bad loans + reserves + bonds = customer deposits + advance
// Deposits and the loan book are customers' money; b.cash is the shareholders' capital. Losses are
// paid by the shareholders (out of profit, so out of b.cash) into the client reserves. `advance` is
// funding the shareholders' side put into the client book during a run (an emergency central-bank
// loan carried as company debt, b.debt), so regulatory capital is b.cash − b.debt + advance.
import type { Json } from '../types'
import { historicalPolicyRate } from '../history/markets'
import { marketOf } from '../data/markets'
import { realWealthFactor } from '../history/events-people'
import { getCountry } from '../world'
import { financeView } from './finance-firm-state'
import type { BizState } from './state'
import { clampN, num, rec, str } from './util'

export const BANK_VERSION = 1

export type Appetite = 'prime' | 'balanced' | 'highYield'
export type LendLine = 'business' | 'mortgage' | 'auto' | 'cards'
export type ProductId = LendLine | 'wealth' | 'ib' | 'app' | 'crypto'

export const LEND_LINES: readonly LendLine[] = ['business', 'mortgage', 'auto', 'cards']
export const PRODUCT_IDS: readonly ProductId[] = ['business', 'mortgage', 'auto', 'cards', 'wealth', 'ib', 'app', 'crypto']

export interface ProductDef {
  id: ProductId
  emoji: string
  label: string
  /** What switching it on does, in a few words. */
  blurb: string
  /** First calendar year it can be offered anywhere. */
  from: number
  /** One-off setup cost in rich-country (US) dollars before local scaling. */
  setup: number
  /** Lending lines only: share of deposits that customers want to borrow at market rates. */
  share?: number
  /** Lending lines: yield over the market mortgage rate. */
  premium?: number
  /** Lending lines: yearly default probability in a normal economy with balanced underwriting. */
  pd?: number
  /** Lending lines: share of a defaulted loan that is lost. */
  lgd?: number
  /** Lending lines: regulatory risk weight. */
  rw?: number
  /** Lending lines: share of the line repaid each year. */
  maturity?: number
}

export const PRODUCTS: Record<ProductId, ProductDef> = {
  business: { id: 'business', emoji: '🏢', label: 'Business loans', blurb: 'Lend to local firms: solid yield, cyclical defaults', from: 1800, setup: 0, share: .4, premium: .0075, pd: .016, lgd: .5, rw: 1, maturity: .3 },
  mortgage: { id: 'mortgage', emoji: '🏠', label: 'Mortgages', blurb: 'Big, safe, slow: low yield, low losses, fixed rates', from: 1800, setup: 300_000, share: .45, premium: 0, pd: .007, lgd: .25, rw: .5, maturity: .1 },
  auto: { id: 'auto', emoji: '🚗', label: 'Auto loans', blurb: 'Car buyers: a better yield, middling risk', from: 1920, setup: 200_000, share: .12, premium: .0175, pd: .018, lgd: .45, rw: .75, maturity: .3 },
  cards: { id: 'cards', emoji: '💳', label: 'Credit cards', blurb: 'Fat yields, fat losses when times turn', from: 1958, setup: 800_000, share: .1, premium: .11, pd: .045, lgd: .85, rw: 1, maturity: .5 },
  wealth: { id: 'wealth', emoji: '💼', label: 'Wealth management', blurb: 'Fees on rich clients’ portfolios; loves trust', from: 1970, setup: 500_000 },
  ib: { id: 'ib', emoji: '🏛️', label: 'Investment banking', blurb: 'Lumpy deal fees; booms pay, busts bite', from: 1900, setup: 5_000_000 },
  app: { id: 'app', emoji: '📱', label: 'Mobile app', blurb: 'Cheaper deposits and faster growth; hackers notice', from: 2008, setup: 1_500_000 },
  crypto: { id: 'crypto', emoji: '₿', label: 'Crypto desk', blurb: 'Trades a slice of capital in crypto. Wild swings', from: 2015, setup: 2_000_000 },
}

export const APPETITES: Record<Appetite, { emoji: string; label: string; blurb: string; yield: number; pd: number; volume: number; rw: number; cushion: number; liquidity: number }> = {
  prime: { emoji: '🛡️', label: 'Prime only', blurb: 'Fewer, safer loans and a fat capital cushion', yield: -.006, pd: .45, volume: .75, rw: .85, cushion: .05, liquidity: .12 },
  balanced: { emoji: '⚖️', label: 'Balanced', blurb: 'Ordinary borrowers at ordinary rates', yield: 0, pd: 1, volume: 1, rw: 1, cushion: .025, liquidity: .06 },
  highYield: { emoji: '🎲', label: 'High-yield', blurb: 'Lend to anyone who pays more. Thrilling until it isn’t', yield: .028, pd: 2.3, volume: 1.3, rw: 1.25, cushion: .005, liquidity: .02 },
}

/** A run that started at year end and still has depositors queuing (the popup decides how it ends). */
export interface PendingRun { year: number; wave: number; severity: number }

/** What the last settled year looked like (the dashboard and the report read this). */
export interface BankLast {
  year: number
  interest: number
  bondIncome: number
  fees: number
  depositCost: number
  creditLosses: number
  liquidityLosses: number
  trading: number
  costs: number
  fine: number
  profit: number
  deposits: number
  depositFlow: number
  loans: number
  loanFlow: number
  badRate: number
  ratio: number
  minRatio: number
  trust: number
  withdrawals: number
  runWithdrawals: number
  /** Realized losses on the client book (credit + forced-sale discounts): the economy's bankLoss. */
  bankLoss: number
  shrink: number
  regulator: string
  crisis: number
  crisisName: string
  rank: number
  rankOf: number
  savings: number
  loanRate: number
  marketSavings: number
  marketLoan: number
}

export interface BankHist { y: number; profit: number; deposits: number; loans: number; ratio: number; trust: number }

export interface BankBook {
  kind: 'bank'
  bv: number
  deposits: number
  loans: Record<LendLine, number>
  badNet: number
  reserves: number
  bonds: number
  bondYield: number
  /** Contract rate of the fixed-rate lines (mortgages, auto loans): new loans reprice, old ones don't. */
  fixed: Record<'mortgage' | 'auto', number>
  advance: number
  cbOwed: number
  trust: number
  savingsGap: number
  loanGap: number
  appetite: Appetite
  products: Partial<Record<ProductId, number>>
  reach: number
  campaignYear: number
  campaignBoost: number
  /** One-year multiplier on deposit growth from events (fintech rival, outage...). */
  shock: number
  /** Last year's loan growth (rapid growth strains underwriting). */
  growth: number
  strikes: number
  seize: boolean
  run: PendingRun | null
  heat: number
  lastYear: number
  dramaYear: number
  /** The fiscal year the hired CEO last planned rates and appetite for (no replanning mid-year). */
  planned: number
  cool: Record<string, number>
  last: BankLast | null
  hist: BankHist[]
}

const finite = (v: Json | undefined, fallback: number, lo = 0, hi = 1e15): number => clampN(num(v, fallback), lo, hi)

export function isBankIndustry(industry: string): boolean {
  return industry === 'bank' || industry === 'onlineBank'
}

/** Total performing loans. */
export function loanTotal(book: Pick<BankBook, 'loans'>): number {
  return LEND_LINES.reduce((s, k) => s + book.loans[k], 0)
}

/** The country's whole banking system: deposits of every bank (constant dollars, era-scaled). */
export function nationalDeposits(countryId: string, year: number): number {
  const m = marketOf(countryId)
  const gdp = Math.max(2e9, m.populationM * 1e6 * Math.max(300, m.gdpPerCapita))
  const depth = .45 + .3 * Math.min(1, Math.max(0, getCountry(countryId).wealth ?? .5))
  // Engine wages and prices are constant-dollar and not era-scaled, so deposits shrink only gently
  // into the past (otherwise every historical bank would drown in present-day costs).
  return gdp * depth * (.55 + .45 * realWealthFactor(year))
}

/** Bank branches nationwide (one per ~4,000 people in rich countries, fewer in poor ones). */
function nationalBranches(countryId: string): number {
  const m = marketOf(countryId), w = clampN(getCountry(countryId).wealth ?? .5, .05, 1.2)
  return Math.max(30, m.populationM * 1e6 / (4_000 + 40_000 * Math.pow(1 - Math.min(1, w), 1.5)))
}

/** Deposits a mature branch can gather (the capacity each office adds). */
export function perBranch(countryId: string, year: number): number {
  return nationalDeposits(countryId, year) / nationalBranches(countryId)
}

/** Market rates the bank's sliders are labelled against (pure, baseline economy). */
export function baselineRates(countryId: string, year: number): { savings: number; mortgage: number; bond: number; policy: number } {
  return ratesFrom(historicalPolicyRate(countryId, year) ?? marketOf(countryId).interestRate)
}

/** Hyperinflation-era policy rates are kept readable (a 900% rate becomes about 25%). */
export function tameRate(r: number): number {
  if (!Number.isFinite(r)) return .04
  if (r <= .12) return Math.max(0, r)
  return Math.min(.25, .12 + .3 * (r - .12))
}

export function ratesFrom(rawPolicy: number, stress = 0): { savings: number; mortgage: number; bond: number; policy: number } {
  const policy = tameRate(rawPolicy)
  const savings = Math.max(0, policy * .75 - .003)
  const mortgage = Math.max(policy + .009 + .06 * Math.min(policy, .05), .03)
  const bond = policy + .006 + .05 * clampN(stress, 0, 1)
  return { savings, mortgage, bond, policy }
}

function fresh(b: Pick<BizState, 'countryId' | 'founded' | 'cash' | 'debt' | 'outlets' | 'industry'>): BankBook {
  const year = Math.max(1800, Math.round(b.founded))
  const branches = Math.max(1, b.outlets.reduce((s, o) => s + o.count, 0))
  const online = b.industry === 'onlineBank'
  const cap = perBranch(b.countryId, year) * (online ? 2 : branches)
  const capital = Math.max(0, b.cash - b.debt)
  const deposits = Math.round(clampN(capital * 6, cap * .1, cap * .5))
  const r = baselineRates(b.countryId, year)
  // A new bank starts with business loans only, sized to what its capital supports.
  const lendable = Math.min(deposits * .45, capital / (minCapitalRatio(b.countryId, year) + APPETITES.balanced.cushion) * .8)
  const business = Math.round(Math.max(0, lendable))
  const reserves = Math.round(deposits * reserveRequirement(b.countryId, year) + deposits * .04)
  const bonds = Math.max(0, deposits - business - reserves)
  return {
    kind: 'bank', bv: BANK_VERSION, deposits, loans: { business, mortgage: 0, auto: 0, cards: 0 }, badNet: 0,
    reserves: deposits - business - bonds, bonds, bondYield: r.bond, fixed: { mortgage: r.mortgage, auto: r.mortgage + (PRODUCTS.auto.premium ?? 0) }, advance: 0, cbOwed: 0, trust: 55,
    savingsGap: 0, loanGap: 0, appetite: 'balanced', products: { business: year }, reach: online ? 2 : 0,
    campaignYear: 0, campaignBoost: 0, shock: 1, growth: 0, strikes: 0, seize: false, run: null, heat: 0,
    lastYear: -1, dramaYear: -1, planned: -1, cool: {}, last: null, hist: [],
  }
}

/** Minimum capital ratio regulators demand (country/era approximation, not a legal schedule). */
export function minCapitalRatio(countryId: string, year: number): number {
  const base = year < 1988 ? .06 : year < 2010 ? .08 : .105
  const lax = marketOf(countryId).corruption >= 65 ? .01 : 0
  return Math.max(.04, base - lax)
}

/** Share of deposits that must sit as cash reserves. */
export function reserveRequirement(countryId: string, year: number): number {
  const regulation = marketOf(countryId).easeOfBusiness
  return clampN(.06 + (100 - regulation) / 1000 + (year < 1935 ? .06 : 0), .06, .2)
}

/** Old v2.1 records: the same client books, confidence becomes trust, rates become gaps. */
function migrate(b: Pick<BizState, 'industry' | 'countryId' | 'founded' | 'cash' | 'debt' | 'outlets' | 'financeFirm' | 'last'>): BankBook {
  const f = financeView(b)
  if (f.lastYear < 0 && !b.last) return fresh(b)
  const year = f.lastYear >= 0 ? f.lastYear + 1 : Math.max(1800, Math.round(b.founded))
  const r = baselineRates(b.countryId, year)
  const loans = { business: f.loanBook * .6, mortgage: f.loanBook * .4, auto: 0, cards: 0 }
  const book: BankBook = {
    ...fresh(b), deposits: f.deposits, loans, badNet: 0, reserves: f.reserves, bonds: f.bonds, bondYield: r.bond,
    fixed: { mortgage: clampN(f.loanRate - (PRODUCTS.business.premium ?? 0), .005, .5), auto: clampN(f.loanRate + .01, .005, .5) },
    trust: clampN(f.confidence, 0, 100), savingsGap: clampN(f.depositRate - r.savings, -.03, .03),
    loanGap: clampN(f.loanRate - (r.mortgage + PRODUCTS.business.premium!), -.03, .05),
    appetite: f.strategy === 'cautious' ? 'prime' : f.strategy === 'aggressive' ? 'highYield' : 'balanced',
    products: { business: Math.round(b.founded), mortgage: Math.round(b.founded) },
    lastYear: f.lastYear, dramaYear: f.lastYear,
  }
  return book
}

function readLast(v: Json | undefined): BankLast | null {
  const x = rec(v)
  if (!x) return null
  const n = (k: string, lo = -1e15, hi = 1e15) => finite(x[k], 0, lo, hi)
  return {
    year: Math.round(n('year', -1, 100_000)), interest: n('interest'), bondIncome: n('bondIncome'), fees: n('fees'), depositCost: n('depositCost'),
    creditLosses: n('creditLosses'), liquidityLosses: n('liquidityLosses'), trading: n('trading'), costs: n('costs'), fine: n('fine'),
    profit: n('profit'), deposits: n('deposits', 0), depositFlow: n('depositFlow'), loans: n('loans', 0), loanFlow: n('loanFlow'),
    badRate: n('badRate', 0, 1), ratio: n('ratio', 0, 10), minRatio: n('minRatio', 0, 1), trust: n('trust', 0, 100),
    withdrawals: n('withdrawals', 0), runWithdrawals: n('runWithdrawals', 0), bankLoss: n('bankLoss', 0), shrink: n('shrink', 0),
    regulator: str(x.regulator).slice(0, 200), crisis: n('crisis', 0, 1), crisisName: str(x.crisisName).slice(0, 80),
    rank: Math.round(n('rank', 0, 1e7)), rankOf: Math.round(n('rankOf', 0, 1e7)), savings: n('savings', 0, 1), loanRate: n('loanRate', 0, 2),
    marketSavings: n('marketSavings', 0, 1), marketLoan: n('marketLoan', 0, 2),
  }
}

/**
 * The bank's books, normalized (pure: never writes). Missing or damaged fields fall back to safe
 * values, the client side is rebalanced to the deposits, and legacy records are migrated.
 */
export function readBank(b: Pick<BizState, 'industry' | 'countryId' | 'founded' | 'cash' | 'debt' | 'outlets' | 'financeFirm' | 'last'>): BankBook {
  const x = rec(b.financeFirm)
  if (!x || x.kind !== 'bank') return x ? migrate(b) : fresh(b)
  // Defaults for missing fields only (building a fresh book is the slow part of a read).
  const complete = typeof x.deposits === 'number' && typeof x.bondYield === 'number' && typeof x.reach === 'number' && !!rec(x.fixed)
  const base = complete ? null : fresh(b)
  const d = (k: 'deposits' | 'bondYield' | 'reach', fallback: number) => base ? base[k] : fallback
  const lr = rec(x.loans) ?? {}
  const loans = { business: finite(lr.business, 0), mortgage: finite(lr.mortgage, 0), auto: finite(lr.auto, 0), cards: finite(lr.cards, 0) }
  const products: Partial<Record<ProductId, number>> = {}
  const pr = rec(x.products) ?? {}
  for (const id of PRODUCT_IDS) if (typeof pr[id] === 'number' && Number.isFinite(pr[id])) products[id] = Math.round(pr[id] as number)
  const cool: Record<string, number> = {}
  for (const [k, v] of Object.entries(rec(x.cool) ?? {}).slice(0, 40)) if (typeof v === 'number' && Number.isFinite(v)) cool[k.slice(0, 24)] = Math.round(v)
  const runRec = rec(x.run)
  const run = runRec ? { year: Math.round(finite(runRec.year, 0, 0, 100_000)), wave: finite(runRec.wave, 0), severity: finite(runRec.severity, 0, 0, 1) } : null
  const hist = (Array.isArray(x.hist) ? x.hist : []).flatMap((h) => {
    const r = rec(h)
    return r ? [{ y: Math.round(finite(r.y, 0, 0, 100_000)), profit: finite(r.profit, 0, -1e15), deposits: finite(r.deposits, 0), loans: finite(r.loans, 0), ratio: finite(r.ratio, 0, 0, 10), trust: finite(r.trust, 50, 0, 100) }] : []
  }).slice(-12)
  const book: BankBook = {
    kind: 'bank', bv: BANK_VERSION,
    deposits: finite(x.deposits, d('deposits', 0)), loans, badNet: finite(x.badNet, 0), reserves: finite(x.reserves, 0), bonds: finite(x.bonds, 0),
    bondYield: finite(x.bondYield, d('bondYield', .04), 0, .5),
    fixed: { mortgage: finite(rec(x.fixed)?.mortgage, base?.fixed.mortgage ?? .05, 0, .5), auto: finite(rec(x.fixed)?.auto, base?.fixed.auto ?? .07, 0, .5) },
    advance: finite(x.advance, 0), cbOwed: Math.min(finite(x.cbOwed, 0), Math.max(0, b.debt)),
    trust: finite(x.trust, 55, 0, 100), savingsGap: finite(x.savingsGap, 0, -.03, .03), loanGap: finite(x.loanGap, 0, -.03, .05),
    appetite: x.appetite === 'prime' || x.appetite === 'highYield' ? x.appetite : 'balanced',
    products: Object.keys(products).length ? products : { business: Math.round(b.founded) },
    reach: finite(x.reach, d('reach', 0), 0, 1e6), campaignYear: Math.round(finite(x.campaignYear, 0, 0, 100_000)), campaignBoost: finite(x.campaignBoost, 0, 0, .5),
    shock: finite(x.shock, 1, .5, 1.5), growth: finite(x.growth, 0, -1, 10), strikes: Math.round(finite(x.strikes, 0, 0, 9)), seize: x.seize === true,
    run: run && run.wave > 0 ? run : null, heat: finite(x.heat, 0, 0, 100),
    lastYear: Math.round(finite(x.lastYear, -1, -1, 100_000)), dramaYear: Math.round(finite(x.dramaYear, -1, -1, 100_000)), planned: Math.round(finite(x.planned, -1, -1, 100_000)),
    cool, last: readLast(x.last), hist,
  }
  // Client books always balance: a damaged save rebalances through reserves (never b.cash).
  const other = loanTotal(book) + book.badNet + book.bonds
  const owed = book.deposits + book.advance
  if (Math.abs(other + book.reserves - owed) > 1) {
    if (owed >= other) book.reserves = owed - other
    else {
      const k = other > 0 ? owed / other : 0
      for (const line of LEND_LINES) book.loans[line] *= k
      book.badNet *= k; book.bonds *= k; book.reserves = 0
    }
  }
  return book
}

export function saveBank(b: BizState, book: BankBook): void {
  b.financeFirm = JSON.parse(JSON.stringify(book)) as Json
}

/** True once a product line is switched on. */
export function hasProduct(book: Pick<BankBook, 'products'>, id: ProductId): boolean {
  return typeof book.products[id] === 'number'
}
