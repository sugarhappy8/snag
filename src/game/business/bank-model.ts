// Banking 2.0 economics: market rates, the deterministic yearly projection shared by the real
// settlement (with a seeded roll), the Business-talent hints and the hired CEO (expected values),
// capital ratios and the national league table. Pure: nothing here writes game state.
import { economyOf } from '../economy'
import { marketOf } from '../data/markets'
import { bankingCrisis } from '../history/markets'
import { techAdoption } from '../history/timeline'
import { depositInsurance } from '../invest/engine'
import { hasTalent } from '../talents'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { cycleOf, equipmentValue, localEcon, localPay } from './economy'
import { leadershipPower } from './leadership'
import { allocatedCorporateTax } from './tax'
import { APPETITES, LEND_LINES, PRODUCTS, hasProduct, loanTotal, minCapitalRatio, nationalDeposits, perBranch, ratesFrom, readBank, reserveRequirement, type Appetite, type BankBook, type LendLine, type ProductId } from './bank-state'
import { totalOutlets, type BizState } from './state'
import { clampN } from './util'

/** Countries whose central bank lent to banks in a panic before the Fed (1913). */
const EARLY_LENDER = new Set(['gb', 'fr', 'de', 'nl', 'se', 'ch', 'jp', 'it', 'be', 'at', 'dk', 'no', 'es', 'pt'])

interface NamedCrisis { from: number; to: number; where: readonly string[] | 'all' | 'rich'; name: string; level: number }
/** Famous banking crises (history only). The economy cycle supplies the rest. */
const CRISES: readonly NamedCrisis[] = [
  { from: 1907, to: 1908, where: ['us'], name: 'the Panic of 1907', level: .6 },
  { from: 1929, to: 1933, where: 'all', name: 'the Great Depression', level: .7 },
  { from: 1973, to: 1975, where: ['gb'], name: 'the secondary banking crisis', level: .5 },
  { from: 1982, to: 1984, where: ['mx', 'ar', 'br', 'cl', 'co', 'pe', 've', 'uy'], name: 'the Latin American debt crisis', level: .6 },
  { from: 1986, to: 1991, where: ['us'], name: 'the savings and loan crisis', level: .35 },
  { from: 1990, to: 1993, where: ['se', 'fi', 'no'], name: 'the Nordic banking crisis', level: .65 },
  { from: 1997, to: 1998, where: ['th', 'kr', 'id', 'my', 'ph', 'jp'], name: 'the Asian financial crisis', level: .7 },
  { from: 1998, to: 1998, where: ['ru'], name: 'the ruble crisis', level: .7 },
  { from: 2001, to: 2002, where: ['ar', 'uy', 'tr'], name: 'a currency and banking collapse', level: .7 },
  { from: 2008, to: 2009, where: 'rich', name: 'the global financial crisis', level: .6 },
  { from: 2010, to: 2013, where: ['gr', 'ie', 'es', 'pt', 'it', 'cy'], name: 'the euro crisis', level: .55 },
  { from: 2023, to: 2023, where: ['us', 'ch'], name: 'a regional bank panic', level: .25 },
]

export function namedCrisis(countryId: string, year: number): NamedCrisis | null {
  for (const c of CRISES) {
    if (year < c.from || year > c.to) continue
    if (c.where === 'all' || (c.where === 'rich' && (getCountry(countryId).wealth ?? 0) >= .55) || (Array.isArray(c.where) && c.where.includes(countryId))) return c
  }
  return null
}

export interface BankMarket {
  policy: number
  /** Market savings rate (what other banks pay savers). */
  savings: number
  /** Market mortgage rate: the base every loan line prices from. */
  mortgage: number
  bond: number
  cycle: number
  /** 0 (calm) … 1 (full-blown banking crisis). */
  crisis: number
  crisisName: string
  defaultsMult: number
  credit: number
  growth: number
  /** Share of retail deposits a government guarantee covers (0 before deposit insurance). */
  insured: number
  /** A central bank that lends to banks in a panic. */
  lender: boolean
}

export function bankMarket(g: GameState, countryId: string, year: number): BankMarket {
  const e = economyOf(g, countryId, year)
  const cycle = cycleOf(g, countryId, year)
  const named = namedCrisis(countryId, year)
  const crisis = clampN(Math.max((.92 - cycle) / .3, e.bankStress * 1.5, bankingCrisis(countryId, year) !== null ? .9 : 0, named?.level ?? 0, (e.defaults - .035) / .05), 0, 1)
  const r = ratesFrom(e.rate, crisis)
  const insurance = depositInsurance(countryId, year)
  return {
    ...r, cycle, crisis, crisisName: named?.name ?? (crisis >= .6 ? 'a banking crisis' : ''),
    defaultsMult: (1 + 3 * crisis) * clampN(e.defaults / .025, .7, 3), credit: clampN(e.credit, .5, 1.3), growth: clampN(e.growth, -.2, .16),
    insured: insurance > 0 ? clampN(.55 + insurance / 250_000 * .37, .55, .92) : 0,
    lender: year >= 1914 || EARLY_LENDER.has(countryId),
  }
}

/** The headline loan rate (balanced business loan) the slider shows. */
export function headlineLoanRate(m: Pick<BankMarket, 'mortgage'>, gap: number): number {
  return Math.max(.005, m.mortgage + (PRODUCTS.business.premium ?? 0) + gap)
}
export function marketLoanRate(m: Pick<BankMarket, 'mortgage'>): number {
  return headlineLoanRate(m, 0)
}

/** Who runs it: the hired CEO's skill, or the owner's (smarts, discipline, talents). No foresight. */
export function bankLeaderSkill(g: GameState, b: BizState): number {
  if (b.ceo === 'manager') return clampN(b.manager?.skill ?? 40, 10, 100)
  const c = g.character
  return clampN(c.stats.smarts * .45 + c.hidden.discipline * .2 + 20 + (hasTalent(g, 'Business') ? 12 : 0) + (hasTalent(g, 'Investing') ? 5 : 0), 10, 92)
}
/** The leader plus the key staff (their skill and morale). */
export function bankTeamSkill(g: GameState, b: BizState): number {
  const staff = b.staff.length ? b.staff.reduce((s, x) => s + x.skill * (.6 + x.morale / 250), 0) / b.staff.length : 40
  return clampN(bankLeaderSkill(g, b) * .75 + staff * .25, 10, 100)
}

/** Risk-weighted assets: what regulators measure capital against. */
export function riskWeighted(book: Pick<BankBook, 'loans' | 'badNet' | 'appetite' | 'products'>, capital = 0): number {
  const k = APPETITES[book.appetite].rw
  let rwa = book.badNet
  for (const line of LEND_LINES) rwa += book.loans[line] * (PRODUCTS[line].rw ?? 1) * k
  if (hasProduct(book, 'crypto')) rwa += cryptoExposure(capital) * 2.5
  return rwa
}
/** Shareholders' regulatory capital. Borrowed cash never counts; the advance into the client book does. */
export function bankCapital(b: Pick<BizState, 'cash' | 'debt'>, book: Pick<BankBook, 'advance'>): number {
  return b.cash - b.debt + book.advance
}
export function capitalRatio(b: Pick<BizState, 'cash' | 'debt'>, book: BankBook): number {
  const capital = bankCapital(b, book), rwa = riskWeighted(book, capital)
  if (rwa < 1) return capital > 0 ? 9.99 : 0
  return clampN(capital / rwa, -9.99, 9.99)
}
/**
 * Capital the owners may take out (dividends, group sweeps, buybacks): what is left above the
 * regulatory minimum, and nothing while a run or a seizure is pending. Pure.
 */
export function bankPayoutRoom(b: BizState): number {
  const book = readBank(b)
  if (book.seize || book.run) return 0
  const year = book.lastYear >= 0 ? book.lastYear + 1 : Math.round(b.founded)
  const capital = bankCapital(b, book)
  return Math.max(0, Math.floor(capital - riskWeighted(book, capital) * minCapitalRatio(b.countryId, year)))
}
export function cryptoExposure(capital: number): number {
  return Math.max(0, capital) * .08
}

/**
 * Rank among the country's banks by deposits. The biggest bank holds `top` of the market and the
 * smallest about top / of^1.6; ranks fall on a log scale in between (a rough league table).
 */
export function bankRank(countryId: string, year: number, deposits: number): { rank: number; of: number; share: number } {
  const m = marketOf(countryId)
  const pop = Math.max(1, m.populationM)
  const of = Math.round(clampN(pop * 6 * clampN(getCountry(countryId).wealth ?? .5, .2, 1.2) + 5, 5, 6000))
  const top = clampN(.3 - .07 * Math.log10(pop), .1, .4)
  const share = Math.max(0, deposits) / Math.max(1, nationalDeposits(countryId, year))
  if (share >= top) return { rank: 1, of, share }
  if (share <= 0) return { rank: of, of, share }
  const floor = top / Math.pow(of, 1.6)
  const t = clampN(Math.log(top / share) / Math.log(top / floor), 0, 1)
  return { rank: Math.round(clampN(Math.pow(of, t), 1, of)), of, share }
}


/** Online banks need local internet access and online-banking technology (era gate). */
export function onlineBankingOpen(countryId: string, year: number): boolean {
  return techAdoption(countryId, 'onlineBanking', year) >= .02 && techAdoption(countryId, 'internet', year) >= .02
}

/** True once a technology has reached ~2% of people here (the same test the anachronism lint uses). */
export function techHere(countryId: string, tech: Parameters<typeof techAdoption>[1], year: number): boolean {
  return techAdoption(countryId, tech, year) >= .02
}

/** Cards need a card network; cars need car owners. */
function lineAdoption(countryId: string, line: LendLine, year: number): number {
  if (line === 'cards') return clampN(techAdoption(countryId, 'creditCards', year) / .7, 0, 1.1)
  if (line === 'auto') return clampN((year - 1912) / 45, .15, 1)
  return 1
}

export interface ProductGate { ok: boolean; why: string }
/** Era and size gates for a product (menus AND the resolver use this). */
export function productGate(b: BizState, book: BankBook, id: ProductId, year: number): ProductGate {
  const d = PRODUCTS[id]
  if (year < d.from) return { ok: false, why: `Not invented yet: from ${d.from}` }
  if (id === 'cards' && techAdoption(b.countryId, 'creditCards', year) < .02) return { ok: false, why: 'No card networks here yet' }
  if (id === 'app' && techAdoption(b.countryId, 'smartphone', year) < .02) return { ok: false, why: 'Hardly anyone here has a smartphone yet' }
  if (id === 'crypto' && techAdoption(b.countryId, 'crypto', year) < .02) return { ok: false, why: 'No crypto market here yet' }
  if (id === 'ib' && book.deposits < ibGate(b.countryId)) return { ok: false, why: `Needs deposits of ${Math.round(ibGate(b.countryId) / 1e9 * 10) / 10}B+ (in today’s dollars)` }
  return { ok: true, why: '' }
}
/** Deposits a bank needs before big companies trust it with deals. */
export function ibGate(countryId: string): number {
  return 2e9 * clampN(Math.sqrt(Math.max(.01, marketOf(countryId).gdpPerCapita / 85_000)), .15, 1.2)
}
export function costScale(countryId: string): number {
  return clampN(localPay(countryId, 100_000) / 100_000, .15, 1.6)
}
export function setupCost(b: Pick<BizState, 'countryId'>, book: Pick<BankBook, 'deposits'>, id: ProductId): number {
  const size = 1 + Math.sqrt(Math.max(0, book.deposits) / 500_000_000)
  return Math.round(PRODUCTS[id].setup * costScale(b.countryId) * size / 1000) * 1000
}
export function campaignCost(b: BizState, book: Pick<BankBook, 'deposits'>): number {
  const base = 120_000 * costScale(b.countryId)
  return Math.round((base * Math.sqrt(Math.max(1, totalOutlets(b))) + book.deposits * .0015) / 1000) * 1000
}


export interface BankPolicy { savingsGap: number; loanGap: number; appetite: Appetite }
export type Roll = (() => number) | null

/**
 * Everything about the bank's year that doesn't depend on its policy or books: the market, rules,
 * people, costs and adoption curves. Built once, then projectFrom() is pure arithmetic, so the
 * hints and the hired CEO can try dozens of policies cheaply.
 */
export interface BankYearCtx {
  year: number
  countryId: string
  online: boolean
  open: number
  m: BankMarket
  minRatio: number
  reserveReq: number
  skill: number
  quality: number
  finance: number
  sales: number
  per: number
  offices: number
  digital: number
  smart: number
  cards: number
  auto: number
  pool: number
  wage: number
  rent: number
  scale: number
  equipment: number
  keyStaff: number
  debtInterest: number
  cash: number
  debt: number
  productivity: number
  ibGate: number
}

export function bankYearCtx(g: GameState, b: BizState, year: number): BankYearCtx {
  const online = b.industry === 'onlineBank'
  const available = !online || onlineBankingOpen(b.countryId, year)
  const e = localEcon(b.industry, b.countryId, b.city), econ = economyOf(g, b.countryId, year)
  const offices = Math.max(1, totalOutlets(b))
  return {
    year, countryId: b.countryId, online, open: available ? clampN(b.openFraction * (1 - b.capacityLoss), 0, 1) : 0,
    m: bankMarket(g, b.countryId, year), minRatio: minCapitalRatio(b.countryId, year), reserveReq: reserveRequirement(b.countryId, year),
    skill: bankTeamSkill(g, b), quality: leadershipPower(b, 'quality'), finance: leadershipPower(b, 'finance'), sales: leadershipPower(b, 'sales'),
    per: perBranch(b.countryId, year), offices, digital: clampN(techAdoption(b.countryId, 'onlineBanking', year) / .85, .05, 1.1),
    smart: techAdoption(b.countryId, 'smartphone', year), cards: lineAdoption(b.countryId, 'cards', year), auto: lineAdoption(b.countryId, 'auto', year),
    pool: Math.max(1, nationalDeposits(b.countryId, year)), wage: localPay(b.countryId, e.def.wage) * b.wageLevel * econ.wages,
    rent: offices * e.rent * econ.rent, scale: costScale(b.countryId), equipment: equipmentValue(b),
    keyStaff: b.staff.reduce((s, x) => s + x.salary, 0) + (b.ceo === 'manager' ? b.manager?.salary ?? 0 : 0),
    debtInterest: Math.max(0, b.debt) * b.debtRate, cash: b.cash, debt: b.debt,
    productivity: clampN(Math.sqrt(Math.max(.0005, marketOf(b.countryId).gdpPerCapita / 85_000)), .15, 1.3), ibGate: ibGate(b.countryId),
  }
}

/** Deposits the branches (or an online bank's reach) can gather this year. */
export function capacityOf(ctx: Pick<BankYearCtx, 'online' | 'per' | 'offices' | 'digital'>, book: Pick<BankBook, 'reach' | 'products'>): number {
  if (!ctx.online) return ctx.per * ctx.offices
  return ctx.per * Math.max(1, book.reach + .3 * (ctx.offices - 1) + (hasProduct(book, 'app') ? 3 : 0)) * ctx.digital
}
export function depositCapacity(g: GameState, b: BizState, book: Pick<BankBook, 'reach' | 'products'>, year: number): number {
  return capacityOf(bankYearCtx(g, b, year), book)
}

/** Everything one fiscal year produces (before owner pay, one-off bookings, tax and the regulator). */
export interface BankProjection {
  book: BankBook
  market: BankMarket
  minRatio: number
  open: number
  interest: number
  bondIncome: number
  fees: number
  ibRevenue: number
  trading: number
  depositCost: number
  creditLosses: number
  liquidityLosses: number
  wages: number
  keyStaff: number
  rent: number
  marketing: number
  upkeep: number
  interestOnDebt: number
  revenue: number
  cogs: number
  /** Profit before owner pay, one-off bookings and tax. */
  operating: number
  staff: number
  grossBad: number
  withdrawals: number
  runWave: number
  pendingRun: { wave: number; severity: number } | null
  advanceReturned: number
  openingLoans: number
  openingDeposits: number
}

function noise(roll: Roll, sd: number): number {
  if (!roll) return 1
  const z = (roll() + roll() + roll() - 1.5) * 2
  return Math.exp(z * sd - sd * sd / 2)
}

/** The rate a line earns on new loans (market base + line premium + appetite + the bank's gap). */
export function lineRate(m: Pick<BankMarket, 'mortgage'>, book: Pick<BankBook, 'loanGap' | 'appetite'>, line: LendLine): number {
  return Math.max(.005, m.mortgage + (PRODUCTS[line].premium ?? 0) + APPETITES[book.appetite].yield + book.loanGap)
}
/** What the existing book of a line earns this year: floating lines reprice, fixed ones keep their contract rate. */
export function bookRate(m: Pick<BankMarket, 'mortgage'>, book: Pick<BankBook, 'loanGap' | 'appetite' | 'fixed'>, line: LendLine): number {
  return line === 'mortgage' || line === 'auto' ? book.fixed[line] : lineRate(m, book, line)
}

/** Average cost of deposits: 70% savings accounts at the bank's rate, 30% current accounts at a token rate. */
export function depositRate(m: Pick<BankMarket, 'savings'>, book: Pick<BankBook, 'savingsGap'>): number {
  return .7 * Math.max(0, m.savings + book.savingsGap) + .03 * m.savings
}

/** Yearly default rate of a line before noise (the hint, the CEO and the settlement share it). */
export function linePd(ctx: Pick<BankYearCtx, 'm' | 'skill' | 'quality' | 'finance'>, book: Pick<BankBook, 'appetite' | 'loanGap' | 'growth'>, line: LendLine): number {
  const ap = book.appetite, crisis = ctx.m.crisis * (ap === 'highYield' ? 1.6 : ap === 'prime' ? .6 : 1)
  const econ = (1 + 3 * crisis) * clampN(ctx.m.defaultsMult / (1 + 3 * ctx.m.crisis), .7, 3)
  const team = (1.3 - ctx.skill / 170) * (1 - .08 * ctx.quality - .05 * ctx.finance)
  const adverse = 1 + Math.max(0, book.loanGap) * 25, strain = 1 + Math.max(0, book.growth - .25)
  return clampN((PRODUCTS[line].pd ?? .02) * APPETITES[ap].pd * econ * team * adverse * strain, .0005, .6)
}
/** Share of a defaulted loan that is lost (collateral is worth less in a crash). */
export function lineLgd(m: Pick<BankMarket, 'crisis'>, line: LendLine): number {
  return clampN((PRODUCTS[line].lgd ?? .5) * (1 + .6 * m.crisis), 0, .95)
}
/** Kept for menus: the expected yearly loss rate of a line. */
export function expectedPd(g: GameState, b: BizState, book: BankBook, _m: BankMarket, line: LendLine, _skill: number): number {
  return linePd(bankYearCtx(g, b, g.year), book, line)
}

/** The odds depositors panic this year (nobody is shown this; depositors decide). */
export function runChance(ctx: Pick<BankYearCtx, 'm' | 'minRatio' | 'online' | 'cash' | 'debt'>, book: BankBook): number {
  const liquid = (book.reserves + book.bonds) / Math.max(1, book.deposits)
  const ratio = capitalRatio(ctx, book)
  const p = .004 + Math.max(0, 45 - book.trust) / 120 + Math.max(0, ctx.minRatio - ratio) * 3 + ctx.m.crisis * .12
    + (ctx.online ? .01 : 0) + Math.max(0, .06 - liquid) * 2
  return clampN(p * (1 - ctx.m.insured * .65), 0, .6)
}

/**
 * Pay `need` of withdrawals out of the client book: cash reserves first, then bonds (at a loss if
 * rates rose since they were bought), then loans at a fire-sale discount. Depositors are paid at
 * face value; the discounts are the shareholders' loss (returned, and booked by the caller).
 */
export function payWithdrawals(book: BankBook, need: number, m: BankMarket, panic: boolean): number {
  let left = need, loss = 0
  const cash = Math.min(book.reserves, left)
  book.reserves -= cash; left -= cash
  if (left > 0 && book.bonds > 0) {
    const sell = Math.min(book.bonds, left)
    loss += sell * bondHaircut(book, m); book.bonds -= sell; left -= sell
  }
  const total = loanTotal(book)
  if (left > 0 && total > 0) {
    const sell = Math.min(total, left), k = sell / total
    for (const line of LEND_LINES) book.loans[line] *= 1 - k
    loss += sell * (panic ? .15 : .05); left -= sell
  }
  if (left > 0 && book.badNet > 0) {
    const sell = Math.min(book.badNet, left)
    book.badNet -= sell; loss += sell * .5; left -= sell
  }
  return loss
}
export function bondHaircut(book: Pick<BankBook, 'bondYield'>, m: Pick<BankMarket, 'bond'>): number {
  return clampN((m.bond - book.bondYield) * 3, 0, .2)
}

/** Depositors' pull: trust, rates, products, marketing, the app, the economy and crowding. */
function attraction(ctx: BankYearCtx, book: BankBook): number {
  const lines = LEND_LINES.filter(l => hasProduct(book, l)).length
  return (.5 + book.trust / 100) * Math.exp(book.savingsGap * 40) * clampN(1 + ctx.m.growth * 2, .6, 1.3)
    * (1 + .05 * Math.max(0, lines - 1) + (hasProduct(book, 'wealth') ? .05 : 0)) * (1 + book.campaignBoost)
    * (hasProduct(book, 'app') ? 1 + .15 * ctx.smart : 1) * (ctx.online ? 1.25 : 1) * (.85 + ctx.skill / 350) * (1 + .06 * ctx.sales)
    * book.shock * clampN(1 - book.deposits / ctx.pool / .3, .05, 1)
}

/**
 * One fiscal year of the bank from its current books. `roll` is the seeded stream of the real
 * settlement; null gives the expected year (average defaults, no run) for hints and the CEO.
 * Pure: returns new books and every line of the year.
 */
export function projectFrom(ctx: BankYearCtx, bookIn: BankBook, roll: Roll, policy?: Partial<BankPolicy>): BankProjection {
  // A shallow copy is enough: the year rewrites balances, never the history or the report.
  const book: BankBook = { ...bookIn, loans: { ...bookIn.loans }, fixed: { ...bookIn.fixed }, run: bookIn.run ? { ...bookIn.run } : null }
  if (policy?.savingsGap !== undefined) book.savingsGap = clampN(policy.savingsGap, -.03, .03)
  if (policy?.loanGap !== undefined) book.loanGap = clampN(policy.loanGap, -.03, .05)
  if (policy?.appetite) book.appetite = policy.appetite
  const { m, open, minRatio, reserveReq } = ctx
  const ap = APPETITES[book.appetite]
  const D0 = book.deposits, L0 = loanTotal(book)
  const capital0 = ctx.cash - ctx.debt + book.advance
  let liquidityLosses = 0, withdrawals = 0, runWave = 0
  let pendingRun: BankProjection['pendingRun'] = null

  // Savers still queuing from last year's unresolved run leave first.
  if (book.run) {
    const wave = Math.min(book.deposits, book.run.wave)
    liquidityLosses += payWithdrawals(book, wave, m, true)
    book.deposits -= wave; withdrawals += wave; book.run = null
  }
  // Last year's defaulted loans are worked out (collateral sold) and bonds mature.
  book.reserves += book.badNet; book.badNet = 0
  const matured = book.bonds * .3
  book.bonds -= matured; book.reserves += matured

  // Credit: some borrowers can't pay. Shareholders absorb the loss; depositors are made whole.
  let creditLosses = 0, grossBad = 0
  for (const line of LEND_LINES) {
    const amount = book.loans[line]
    if (amount <= 0) continue
    const bad = amount * clampN(linePd(ctx, book, line) * noise(roll, .3), 0, .6), lost = bad * lineLgd(m, line)
    book.loans[line] -= bad; book.badNet += bad - lost; book.reserves += lost
    creditLosses += lost; grossBad += bad
  }

  // Interest and fees on the year's balances.
  let interest = 0
  for (const line of LEND_LINES) interest += book.loans[line] * bookRate(m, book, line)
  interest *= open
  const bondIncome = book.bonds * book.bondYield * open
  const depositCost = D0 * depositRate(m, book) * open
  const wealthFees = hasProduct(book, 'wealth') ? D0 * .35 * clampN(book.trust / 70, .3, 1.3) * .008 * open : 0
  const fees = D0 * .0035 * open + wealthFees
  let ibRevenue = 0, trading = 0
  if (hasProduct(book, 'ib') && D0 >= ctx.ibGate * .5) {
    const boom = clampN(.4 + .6 * m.cycle, .3, 1.3) * (1 - .5 * m.crisis)
    ibRevenue = D0 * .004 * boom * (.8 + ctx.skill / 250) * noise(roll, .6) * open
    if (roll && m.crisis > .4 && roll() < .35) trading -= D0 * .003 * (.5 + roll())
  }
  if (hasProduct(book, 'crypto')) trading += cryptoExposure(capital0) * (roll ? -.6 + 1.5 * roll() - .25 * m.crisis : .15 - .25 * m.crisis) * open

  // Depositors: a run, everyday churn, and new savers drawn in up to the branches' capacity.
  if (roll) {
    const panic = roll() < runChance(ctx, book)
    const sevRoll = roll(), waveRoll = roll()
    if (panic && open > 0) {
      const severity = (.1 + .2 * sevRoll) * (1 - m.insured * .5) * (ctx.online ? 1.4 : 1)
      runWave = Math.min(book.deposits * .6, book.deposits * severity)
      pendingRun = { wave: Math.round(book.deposits * severity * (.5 + .7 * waveRoll)), severity }
    }
  }
  const cap = Math.max(1, capacityOf(ctx, book))
  const pull = attraction(ctx, book)
  const slack = 1 - book.deposits / cap
  const churn = (.025 + (ctx.online ? .02 : 0) + Math.max(0, -book.savingsGap) * 15) * clampN(1.2 - book.trust / 200, .6, 1.2) + m.crisis * .05 * (1 - m.insured) * (book.trust < 50 ? 1.5 : .5)
  // Supervisors cap how fast a thinly capitalized bank may take in deposits (a leverage limit).
  const leverage = book.deposits / Math.max(1, capital0)
  const room = clampN(1 - (leverage - 15) / 10, 0, 1)
  let depositFlow = open > 0
    ? (book.deposits * (.14 * pull * Math.max(0, slack) * room - churn - .15 * Math.max(0, -slack)) + cap * .01 * pull * Math.max(0, slack) * room) * open
    : -book.deposits * .1
  depositFlow -= runWave
  if (depositFlow < 0) {
    const out = Math.min(book.deposits, -depositFlow)
    liquidityLosses += payWithdrawals(book, out, m, runWave > 0)
    book.deposits -= out; withdrawals += out
  } else {
    book.deposits += depositFlow; book.reserves += depositFlow
  }

  // Loans repay, then the bank lends again up to demand, liquidity and capital.
  // Overcharged floating-rate borrowers refinance elsewhere.
  const refinance = Math.max(0, book.loanGap) * 20
  for (const line of LEND_LINES) {
    const repaid = book.loans[line] * clampN((PRODUCTS[line].maturity ?? .3) + (line === 'business' || line === 'cards' ? refinance : 0), 0, 1)
    book.loans[line] -= repaid; book.reserves += repaid
  }
  const D1 = book.deposits
  const cycleDemand = clampN(.55 + .45 * m.cycle, .75, 1.15)
  const rateDemand = clampN(Math.exp(-book.loanGap * (book.loanGap > 0 ? 45 : 30)), .15, 2.5)
  const desired: Record<LendLine, number> = { business: 0, mortgage: 0, auto: 0, cards: 0 }
  for (const line of LEND_LINES) {
    if (!hasProduct(book, line) || open <= 0) continue
    const adoption = line === 'cards' ? ctx.cards : line === 'auto' ? ctx.auto : 1
    desired[line] = D1 * (PRODUCTS[line].share ?? 0) * rateDemand * m.credit * ap.volume * cycleDemand * adoption * (1 + .05 * ctx.sales)
  }
  const capitalForLending = Math.max(0, capital0 - creditLosses - liquidityLosses)
  const rwaCap = capitalForLending / (minRatio + ap.cushion)
  const liqCap = Math.max(0, D1 * (1 - reserveReq - ap.liquidity) + book.advance)
  const rwOf = (line: LendLine) => (PRODUCTS[line].rw ?? 1) * ap.rw
  let baseRwa = book.badNet + (hasProduct(book, 'crypto') ? cryptoExposure(capitalForLending) * 2.5 : 0), addLoans = 0, addRwa = 0
  for (const line of LEND_LINES) {
    baseRwa += book.loans[line] * rwOf(line)
    const more = Math.max(0, desired[line] - book.loans[line])
    addLoans += more; addRwa += more * rwOf(line)
  }
  const base = loanTotal(book), fundable = Math.max(0, book.reserves - D1 * reserveReq) + book.bonds
  let k = 1
  if (addRwa > 0) k = Math.min(k, Math.max(0, rwaCap - baseRwa) / addRwa)
  if (addLoans > 0) k = Math.min(k, Math.max(0, liqCap - base) / addLoans, fundable / addLoans)
  k = clampN(k, 0, 1)
  let lent = 0
  for (const line of LEND_LINES) {
    const more = Math.max(0, desired[line] - book.loans[line]) * k
    if (more <= 0) continue
    if (line === 'mortgage' || line === 'auto') book.fixed[line] = (book.loans[line] * book.fixed[line] + more * lineRate(m, book, line)) / (book.loans[line] + more)
    book.loans[line] += more; lent += more
  }
  book.reserves -= lent
  const reserveTarget = D1 * (reserveReq + .02)
  // Pay back the run-time advance once the book is liquid again (out of spare cash only).
  let advanceReturned = 0
  if (book.advance > 0 && book.reserves + book.bonds >= D1 * (reserveReq + .1)) {
    advanceReturned = clampN(Math.min(book.advance, book.reserves - reserveTarget), 0, book.advance)
    book.reserves -= advanceReturned; book.advance -= advanceReturned
  }
  // Keep the required reserves (+2%); park the rest in government bonds at today's yield.
  if (book.reserves > reserveTarget) {
    const buy = book.reserves - reserveTarget
    book.bondYield = (book.bonds * book.bondYield + buy * m.bond) / (book.bonds + buy)
    book.bonds += buy; book.reserves -= buy
  } else if (book.reserves < reserveTarget && book.bonds > 0) {
    // Shareholders cover the haircut, so the book receives face value.
    const sell = Math.min(book.bonds, reserveTarget - book.reserves)
    liquidityLosses += sell * bondHaircut(book, m)
    book.bonds -= sell; book.reserves += sell
  }

  // Running costs: branches and their staff, people per dollar of book, IT, compliance, products.
  const L1 = loanTotal(book)
  const perStaff = 8_000_000 * ctx.productivity * (ctx.online ? 2 : 1) * (hasProduct(book, 'app') ? 1.15 : 1)
  const staff = Math.round((ctx.online ? 5 + ctx.offices : 4 * ctx.offices) + D1 / perStaff)
  const busy = Math.max(open, .25)
  const wages = staff * ctx.wage * busy * (1 - .04 * ctx.finance) + ibRevenue * .45
  const rent = ctx.rent * busy
  const marketing = D1 * .0004
  const upkeep = D1 * (ctx.online ? .003 : .001) * ctx.scale + D1 * .0003 * ctx.scale + ctx.equipment * .01
    + book.loans.cards * .02 + (hasProduct(book, 'app') ? 400_000 * ctx.scale : 0) + (hasProduct(book, 'crypto') ? 250_000 * ctx.scale : 0)
    + wealthFees * .4 + (hasProduct(book, 'ib') ? 2_000_000 * ctx.scale : 0)
  const revenue = interest + bondIncome + fees + ibRevenue + Math.max(0, trading)
  const cogs = depositCost + creditLosses + liquidityLosses + Math.max(0, -trading)
  const operating = revenue - cogs - wages - ctx.keyStaff - rent - marketing - upkeep - ctx.debtInterest
  book.growth = L0 > 0 ? L1 / L0 - 1 : 0
  return {
    book, market: m, minRatio, open, interest, bondIncome, fees, ibRevenue, trading, depositCost, creditLosses, liquidityLosses,
    wages, keyStaff: ctx.keyStaff, rent, marketing, upkeep, interestOnDebt: ctx.debtInterest, revenue, cogs, operating, staff, grossBad, withdrawals, runWave,
    pendingRun, advanceReturned, openingLoans: L0, openingDeposits: D0,
  }
}

/** One fiscal year of the bank (see projectFrom); builds the context from the company. */
export function projectYear(g: GameState, b: BizState, year: number, roll: Roll, policy?: Partial<BankPolicy>, bookIn?: BankBook): BankProjection {
  return projectFrom(bankYearCtx(g, b, year), bookIn ?? readBank(b), roll, policy)
}

function afterTax(ctx: BankYearCtx, g: GameState, p: BankProjection): number {
  return p.operating - allocatedCorporateTax(ctx.countryId, p.operating, p.revenue, 0, 0, g, ctx.year)
}
/**
 * Expected after-tax profit over the next `years` under one policy, holding this year's market
 * (no foresight of future rates). With `terminal`, the last year's profit is also valued as a
 * going concern at the industry's profit multiple (8), so building up deposits and loans counts,
 * not just squeezing next year.
 */
export function expectedPath(g: GameState, ctx: BankYearCtx, book: BankBook, policy: Partial<BankPolicy>, years = 1, terminal = false): number {
  let total = 0, cur = book, last = 0
  for (let i = 0; i < years; i++) {
    // Rates are held at today's; a crisis or a boom is assumed to fade by half each year
    // (a generic expectation, not knowledge of the actual future).
    const p = projectFrom(i ? calmer(ctx, Math.pow(.5, i)) : ctx, cur, null, policy)
    last = afterTax(ctx, g, p)
    total += last * Math.pow(.92, i)
    cur = p.book
  }
  return total + (terminal ? last * 8 * Math.pow(.92, years) : 0)
}

/** The same year with a crisis (and the cycle) faded toward normal by `k` (1 = as is). */
function calmer(ctx: BankYearCtx, k: number): BankYearCtx {
  const m = ctx.m, base = m.defaultsMult / (1 + 3 * m.crisis), crisis = m.crisis * k
  return { ...ctx, m: { ...m, crisis, cycle: 1 + (m.cycle - 1) * k, growth: m.growth * k, defaultsMult: (1 + 3 * crisis) * (1 + (base - 1) * k) } }
}

/** Expected after-tax profit of a policy this year (the report, previews and the forecast). */
export function expectedProfit(g: GameState, b: BizState, policy: Partial<BankPolicy>, year = g.year): number {
  return expectedPath(g, bankYearCtx(g, b, year), readBank(b), policy, 1)
}
/** The same for a hypothetical set of books (a product switched on, say). */
export function expectedProfitOf(g: GameState, b: BizState, book: BankBook, year = g.year): number {
  return expectedPath(g, bankYearCtx(g, b, year), book, {}, 1)
}

/**
 * What a product would add to the bank's value under this year's model (the same horizon and
 * going-concern tail as the rate hints; pure). Compare it with the setup cost.
 */
export function productGain(g: GameState, b: BizState, book: BankBook, id: ProductId): number {
  const withIt = structuredClone(book), ctx = bankYearCtx(g, b, g.year)
  withIt.products[id] = g.year
  return Math.max(0, expectedPath(g, ctx, withIt, {}, 6, true) - expectedPath(g, ctx, book, {}, 6, true))
}

const SAVINGS_GRID = [-.015, -.01, -.005, 0, .005, .01, .015, .02]
const LOAN_GRID = [-.01, -.005, 0, .005, .01, .015, .02, .03]
const HORIZON = 6
/**
 * The best rate pair under this year's model at the current appetite: the most expected value
 * over four years plus a going-concern tail, with this year's market held fixed (pure; no RNG;
 * a coordinate search: loans, savings, loans again). `profit` is next year's expected profit.
 */
export function bestRates(g: GameState, b: BizState, year = g.year): { savingsGap: number; loanGap: number; profit: number } {
  const ctx = bankYearCtx(g, b, year), book = readBank(b)
  const value = (savingsGap: number, loanGap: number) => expectedPath(g, ctx, book, { savingsGap, loanGap }, HORIZON, true)
  let s = book.savingsGap, l = book.loanGap, best = value(s, l)
  const scan = (grid: number[], set: (x: number) => [number, number]) => {
    for (const x of grid) {
      const [ss, ll] = set(x), v = value(ss, ll)
      if (v > best + 1) { best = v; s = ss; l = ll }
    }
  }
  scan(LOAN_GRID, (x) => [s, x])
  scan(SAVINGS_GRID, (x) => [x, l])
  scan(LOAN_GRID, (x) => [s, x])
  return { savingsGap: s, loanGap: l, profit: expectedPath(g, ctx, book, { savingsGap: s, loanGap: l }, 1) }
}
/** The appetite worth the most over the same horizon at the current rates (pure). */
export function bestAppetite(g: GameState, b: BizState, year = g.year): { appetite: Appetite; profit: number } {
  const ctx = bankYearCtx(g, b, year), book = readBank(b)
  let best: { appetite: Appetite; value: number } | null = null
  for (const appetite of ['prime', 'balanced', 'highYield'] as const) {
    const value = expectedPath(g, ctx, book, { appetite }, HORIZON, true)
    if (!best || value > best.value + 1) best = { appetite, value }
  }
  return { appetite: best!.appetite, profit: expectedPath(g, ctx, book, { appetite: best!.appetite }, 1) }
}

/** 'about $1.2M profit' / 'a loss of about $300K' for hints. */
export function profitWords(x: number, fmt: (n: number) => string): string {
  return x >= 0 ? `about ${fmt(x)} profit` : `a loss of about ${fmt(-x)}`
}

/** 'stingy' / 'competitive' / 'generous' for savers; the same words from a borrower's side for loans. */
export function rateWord(gap: number, kind: 'savings' | 'loan'): string {
  if (kind === 'savings') return gap <= -.005 ? 'stingy' : gap >= .005 ? 'generous' : 'competitive'
  return gap <= -.005 ? 'generous' : gap >= .0075 ? 'stingy' : 'competitive'
}

/** ▰▰▰▰▱▱▱▱▱▱ against twice the minimum. */
export function ratioBar(ratio: number, min: number): string {
  const cells = 10, filled = Math.round(clampN(ratio / Math.max(.01, min * 2), 0, 1) * cells)
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}
