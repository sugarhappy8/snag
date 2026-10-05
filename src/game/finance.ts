// Yearly money flow (see docs/ARCHITECTURE.md "Money flow"): income tax by country, rent,
// adult living costs, every loan in character.loans, and what happens when you go broke
// (debt collectors, eviction, repossession, homelessness).
//
// Also home to the small money helpers the assets / gambling code shares: loan maths,
// a credit score, marginal tax on extra income and "where do I live now" logic.
import { addHidden, addMoney, addRelationship, addStat, count, formatMoney, log, notice, parents, pronouns, relationLabel, remember } from './core'
import { hasMarketData, marketOf } from './data/markets'
import { chance, pick, randInt, uid } from './rng'
import type { GameState, Json, Loan, LoanKind, Person } from './types'
import { getCountry } from './world'

// ---------------------------------------------------------------------------
// Income tax

interface Bracket {
  /** Upper bound of this band of taxable income (after the allowance), in dollars. */
  upTo: number
  rate: number
}

interface TaxTable {
  /** Tax-free personal allowance / standard deduction. */
  allowance: number
  brackets: Bracket[]
  /** Payroll / social contributions on gross income up to a cap. */
  social?: { rate: number; cap?: number }
  /** Flat local / resident tax on taxable income. */
  local?: number
}

const INF = Number.POSITIVE_INFINITY

const b = (...pairs: [number, number][]): Bracket[] => pairs.map(([upTo, rate]) => ({ upTo, rate }))

/** Roughly realistic progressive systems, thresholds converted to dollars. */
const TAX_TABLES: Record<string, TaxTable> = {
  us: { allowance: 14_600, brackets: b([11_600, 0.1], [47_150, 0.12], [100_525, 0.22], [191_950, 0.24], [243_725, 0.32], [609_350, 0.35], [INF, 0.37]), social: { rate: 0.0765, cap: 168_600 } },
  gb: { allowance: 16_000, brackets: b([47_900, 0.2], [143_000, 0.4], [INF, 0.45]), social: { rate: 0.08, cap: 63_800 } },
  ie: { allowance: 4_500, brackets: b([45_000, 0.2], [INF, 0.4]), social: { rate: 0.08 } },
  fr: { allowance: 12_100, brackets: b([18_700, 0.11], [76_000, 0.3], [177_000, 0.41], [INF, 0.45]), social: { rate: 0.1 } },
  de: { allowance: 12_700, brackets: b([5_500, 0.14], [56_000, 0.27], [290_000, 0.42], [INF, 0.45]), social: { rate: 0.2, cap: 98_000 } },
  it: { allowance: 9_000, brackets: b([30_800, 0.23], [54_000, 0.35], [INF, 0.43]), social: { rate: 0.09 } },
  es: { allowance: 6_000, brackets: b([13_400, 0.19], [21_600, 0.24], [38_900, 0.3], [65_000, 0.37], [324_000, 0.45], [INF, 0.47]), social: { rate: 0.065, cap: 60_000 } },
  pt: { allowance: 4_500, brackets: b([8_000, 0.13], [22_000, 0.23], [45_000, 0.35], [85_000, 0.43], [INF, 0.48]), social: { rate: 0.11 } },
  nl: { allowance: 3_500, brackets: b([82_000, 0.37], [INF, 0.495]) },
  be: { allowance: 11_000, brackets: b([16_000, 0.25], [28_000, 0.4], [50_000, 0.45], [INF, 0.5]), social: { rate: 0.13 } },
  ch: { allowance: 20_000, brackets: b([40_000, 0.08], [120_000, 0.18], [300_000, 0.28], [INF, 0.33]), social: { rate: 0.06 } },
  at: { allowance: 13_000, brackets: b([8_000, 0.2], [17_000, 0.3], [45_000, 0.4], [90_000, 0.48], [INF, 0.5]), social: { rate: 0.18, cap: 80_000 } },
  se: { allowance: 2_500, brackets: b([58_000, 0.32], [INF, 0.52]), social: { rate: 0.07, cap: 55_000 } },
  no: { allowance: 9_000, brackets: b([10_000, 0.22], [18_000, 0.237], [53_000, 0.26], [76_000, 0.357], [108_000, 0.387], [INF, 0.396]), social: { rate: 0.078 } },
  dk: { allowance: 7_000, brackets: b([80_000, 0.37], [INF, 0.52]), social: { rate: 0.08 } },
  fi: { allowance: 3_000, brackets: b([22_000, 0.2], [35_000, 0.3], [85_000, 0.38], [INF, 0.5]), social: { rate: 0.09 } },
  pl: { allowance: 7_500, brackets: b([22_000, 0.12], [INF, 0.32]), social: { rate: 0.13 } },
  gr: { allowance: 2_000, brackets: b([11_000, 0.09], [22_000, 0.22], [33_000, 0.28], [44_000, 0.36], [INF, 0.44]), social: { rate: 0.14 } },
  ru: { allowance: 0, brackets: b([27_000, 0.13], [55_000, 0.15], [222_000, 0.18], [555_000, 0.2], [INF, 0.22]) },
  ca: { allowance: 11_500, brackets: b([40_000, 0.23], [80_000, 0.285], [124_000, 0.34], [176_000, 0.37], [INF, 0.41]), social: { rate: 0.06, cap: 50_000 } },
  au: { allowance: 12_000, brackets: b([17_700, 0.16], [77_000, 0.3], [113_000, 0.37], [INF, 0.45]), social: { rate: 0.02 } },
  nz: { allowance: 0, brackets: b([9_500, 0.105], [32_000, 0.175], [42_000, 0.3], [109_000, 0.33], [INF, 0.39]) },
  jp: { allowance: 3_200, brackets: b([13_000, 0.05], [22_200, 0.1], [46_000, 0.2], [60_000, 0.23], [120_000, 0.33], [266_000, 0.4], [INF, 0.45]), social: { rate: 0.15, cap: 90_000 }, local: 0.1 },
  kr: { allowance: 1_000, brackets: b([10_500, 0.066], [38_000, 0.165], [66_000, 0.264], [112_000, 0.385], [225_000, 0.418], [375_000, 0.44], [750_000, 0.462], [INF, 0.495]), social: { rate: 0.09 } },
  cn: { allowance: 8_300, brackets: b([4_200, 0.03], [16_700, 0.1], [34_700, 0.2], [48_600, 0.25], [77_800, 0.3], [111_000, 0.35], [INF, 0.45]), social: { rate: 0.105, cap: 50_000 } },
  hk: { allowance: 17_000, brackets: b([6_400, 0.02], [12_800, 0.06], [19_200, 0.1], [25_600, 0.14], [INF, 0.17]), social: { rate: 0.05, cap: 3_600 } },
  sg: { allowance: 15_000, brackets: b([15_000, 0.02], [45_000, 0.07], [75_000, 0.115], [105_000, 0.15], [145_000, 0.18], [355_000, 0.22], [INF, 0.24]), social: { rate: 0.2, cap: 60_000 } },
  in: { allowance: 3_600, brackets: b([4_760, 0.05], [8_330, 0.1], [10_710, 0.15], [14_280, 0.2], [INF, 0.3]) },
  pk: { allowance: 2_200, brackets: b([1_800, 0.05], [6_000, 0.15], [12_000, 0.25], [INF, 0.35]) },
  bd: { allowance: 3_000, brackets: b([2_500, 0.05], [5_000, 0.1], [8_000, 0.15], [INF, 0.25]) },
  ph: { allowance: 4_300, brackets: b([7_000, 0.15], [23_000, 0.2], [57_000, 0.25], [140_000, 0.3], [INF, 0.35]) },
  id: { allowance: 3_500, brackets: b([3_800, 0.05], [15_000, 0.15], [32_000, 0.25], [INF, 0.3]) },
  th: { allowance: 4_300, brackets: b([4_300, 0.05], [12_800, 0.1], [21_000, 0.15], [28_000, 0.2], [56_000, 0.25], [140_000, 0.3], [INF, 0.35]) },
  vn: { allowance: 5_400, brackets: b([2_400, 0.05], [4_800, 0.1], [8_600, 0.15], [14_000, 0.2], [22_000, 0.25], [34_000, 0.3], [INF, 0.35]), social: { rate: 0.105 } },
  my: { allowance: 2_100, brackets: b([2_100, 0.01], [8_500, 0.03], [15_000, 0.08], [21_000, 0.13], [43_000, 0.21], [INF, 0.26]), social: { rate: 0.11 } },
  tr: { allowance: 0, brackets: b([3_400, 0.15], [7_400, 0.2], [26_000, 0.27], [88_000, 0.35], [INF, 0.4]), social: { rate: 0.15 } },
  il: { allowance: 2_500, brackets: b([22_000, 0.1], [31_000, 0.14], [50_000, 0.2], [70_000, 0.31], [145_000, 0.35], [190_000, 0.47], [INF, 0.5]), social: { rate: 0.07 } },
  eg: { allowance: 400, brackets: b([400, 0.1], [1_100, 0.15], [4_000, 0.2], [24_000, 0.25], [INF, 0.275]) },
  za: { allowance: 5_100, brackets: b([7_900, 0.18], [12_400, 0.26], [17_100, 0.31], [22_900, 0.36], [29_000, 0.39], [73_000, 0.41], [INF, 0.45]), social: { rate: 0.01 } },
  ng: { allowance: 1_000, brackets: b([300, 0.07], [600, 0.11], [1_000, 0.15], [2_000, 0.19], [4_000, 0.21], [INF, 0.24]) },
  ke: { allowance: 2_200, brackets: b([1_000, 0.1], [3_000, 0.25], [INF, 0.3]) },
  gh: { allowance: 400, brackets: b([1_000, 0.1], [3_000, 0.175], [20_000, 0.25], [INF, 0.35]) },
  mx: { allowance: 1_000, brackets: b([4_300, 0.064], [10_400, 0.16], [33_000, 0.2136], [84_000, 0.3], [252_000, 0.32], [INF, 0.35]), social: { rate: 0.03 } },
  br: { allowance: 4_900, brackets: b([2_000, 0.075], [4_000, 0.15], [6_000, 0.225], [INF, 0.275]), social: { rate: 0.11, cap: 15_000 } },
  ar: { allowance: 3_000, brackets: b([2_000, 0.05], [6_000, 0.15], [15_000, 0.27], [INF, 0.35]), social: { rate: 0.17 } },
  cl: { allowance: 11_000, brackets: b([13_000, 0.04], [30_000, 0.08], [50_000, 0.135], [70_000, 0.23], [90_000, 0.304], [INF, 0.4]), social: { rate: 0.17 } },
  co: { allowance: 12_000, brackets: b([8_000, 0.19], [40_000, 0.28], [90_000, 0.33], [INF, 0.39]) },
  pe: { allowance: 5_000, brackets: b([6_500, 0.08], [26_000, 0.14], [45_000, 0.17], [INF, 0.3]) },
  // No personal income tax (the classic tax havens).
  ae: { allowance: 0, brackets: b([INF, 0]) },
  sa: { allowance: 0, brackets: b([INF, 0]), social: { rate: 0.1 } },
  qa: { allowance: 0, brackets: b([INF, 0]) },
  kw: { allowance: 0, brackets: b([INF, 0]) },
  bh: { allowance: 0, brackets: b([INF, 0]) },
  om: { allowance: 0, brackets: b([INF, 0]) },
  bn: { allowance: 0, brackets: b([INF, 0]) },
  mc: { allowance: 0, brackets: b([INF, 0]) },
  bs: { allowance: 0, brackets: b([INF, 0]) },
  bm: { allowance: 0, brackets: b([INF, 0]) },
  ky: { allowance: 0, brackets: b([INF, 0]) },
}

/** A plausible progressive table for countries without a hand-written one (poorer = lower). */
function genericTable(wealth: number): TaxTable {
  const w = Math.max(0.05, wealth)
  const top = 0.15 + (0.25 * Math.min(1.2, w)) / 1.2
  return {
    allowance: Math.round(6_000 * w),
    brackets: b([10_000 * w, top * 0.3], [40_000 * w, top * 0.55], [120_000 * w, top * 0.8], [INF, top]),
    social: { rate: 0.02 + 0.05 * Math.min(1, w), cap: 120_000 * w },
  }
}

function taxTable(countryId: string): TaxTable {
  return TAX_TABLES[countryId] ?? genericTable(getCountry(countryId).wealth ?? 1)
}

/** Total income tax (incl. payroll contributions) owed on a year's taxable income. */
export function incomeTax(countryId: string, income: number): number {
  if (!(income > 0)) return 0
  const t = taxTable(countryId)
  const taxable = Math.max(0, income - t.allowance)
  let tax = 0
  let prev = 0
  for (const br of t.brackets) {
    if (taxable > prev) tax += (Math.min(taxable, br.upTo) - prev) * br.rate
    if (taxable <= br.upTo) break
    prev = br.upTo
  }
  if (t.social) tax += Math.min(income, t.social.cap ?? INF) * t.social.rate
  if (t.local) tax += taxable * t.local
  return Math.max(0, Math.round(tax))
}

/** Effective tax rate (0-1) on an income, for display. */
export function effectiveTaxRate(countryId: string, income: number): number {
  return income > 0 ? incomeTax(countryId, income) / income : 0
}

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * Tax extra income that arrived after yearlyFinance already ran this year (rental income,
 * royalties paid later in the yearly hooks). Uses the marginal rate on top of this year's
 * taxable income, which must already include `amount` (earnIncome adds it). Returns the tax.
 */
export function taxAdditionalIncome(g: GameState, amount: number): number {
  if (!(amount > 0)) return 0
  const total = num(g.flags.taxableIncome)
  const before = Math.max(0, total - amount)
  const extra = Math.max(0, incomeTax(g.character.countryId, before + amount) - incomeTax(g.character.countryId, before))
  if (extra > 0) {
    addMoney(g, -extra)
    g.flags.taxesPaid = num(g.flags.taxesPaid) + extra
    count(g, 'taxesPaid', extra)
  }
  return extra
}

// ---------------------------------------------------------------------------
// Loans & credit

/** Level yearly payment that repays `principal` at `rate` over `years`. */
export function annualPayment(principal: number, rate: number, years: number): number {
  if (principal <= 0) return 0
  const n = Math.max(1, Math.round(years))
  if (rate <= 0) return Math.ceil(principal / n)
  return Math.ceil((principal * rate) / (1 - Math.pow(1 + rate, -n)))
}

/** Yearly income a lender would count: salaries, pension and rent from tenants. */
export function yearlyIncome(g: GameState): number {
  const c = g.character
  let total = (c.job?.salary ?? 0) + (c.partTimeJob?.salary ?? 0) + (c.retired ? c.pension : 0)
  for (const a of g.assets) total += a.rentedOutFor ?? 0
  return Math.max(0, Math.round(total))
}

/** Total yearly debt service: loan payments + mortgages. */
export function yearlyDebtPayments(g: GameState): number {
  const loans = g.character.loans.reduce((s, l) => s + Math.min(l.yearlyPayment, l.balance), 0)
  const mortgages = g.assets.reduce((s, a) => s + (a.mortgage ? Math.min(a.mortgage.yearlyPayment, a.mortgage.balance * 1.1) : 0), 0)
  return Math.round(loans + mortgages)
}

/** A 300-850 credit score from payment history, debt load and savings. */
export function creditScore(g: GameState): number {
  const c = g.character
  if (c.age < 18) return 0
  let score = 690
  score -= 55 * num(g.flags.missedPayments)
  if (c.money < 0) score -= 90
  if (num(g.flags.brokeYears) >= 2) score -= 60
  const income = yearlyIncome(g)
  const debt = yearlyDebtPayments(g)
  if (income > 0) score += debt / income < 0.2 ? 30 : debt / income > 0.5 ? -50 : 0
  else score -= 40
  if (c.money > 50_000) score += 40
  if (c.money > 500_000) score += 30
  score += Math.min(40, Math.max(0, c.age - 18) * 2)
  if (c.criminalRecord.some((r) => r.convicted)) score -= 25
  return Math.max(300, Math.min(850, Math.round(score)))
}

export function creditLabel(score: number): string {
  if (score >= 780) return 'Excellent'
  if (score >= 700) return 'Good'
  if (score >= 640) return 'Fair'
  if (score >= 560) return 'Poor'
  return 'Very Poor'
}

/**
 * How lenders price each kind of loan off the central bank's policy rate p (data/markets.ts):
 *   rate = pass(p) × mult + spread, clamped to [min, max]
 * pass(p) is p up to 6% and only 60% of anything above it: in high-rate economies (Brazil,
 * Turkey, Argentina) subsidized, indexed and short-term lending keeps street rates below the
 * headline rate, and the clamp keeps hyperinflation economies playable (brutal, not absurd).
 * With p = 4.5% (US) this gives a 6.4% mortgage, 7.8% auto loan and 11% personal loan; Japan
 * (0.5%) about 2% / 3.2% / 6.1%; the eurozone (2%) about 3.6% / 4.9% / 8%; Brazil (15%) about
 * 14% / 15.5% / 19.5%. Good credit then shaves a little off, bad credit adds a lot.
 */
const LOAN_PRICING: Record<'mortgage' | LoanKind, { mult: number; spread: number; min: number; max: number }> = {
  mortgage: { mult: 1.12, spread: 0.014, min: 0.008, max: 0.24 },
  car: { mult: 1.15, spread: 0.026, min: 0.015, max: 0.28 },
  student: { mult: 1, spread: 0.01, min: 0.005, max: 0.2 },
  personal: { mult: 1.25, spread: 0.055, min: 0.03, max: 0.34 },
  business: { mult: 1.2, spread: 0.045, min: 0.025, max: 0.32 },
}

/** A lender's base rate for this kind of loan in a country, before the borrower's credit. */
export function baseLoanRate(countryId: string, kind: 'mortgage' | LoanKind): number {
  const p0 = marketOf(countryId).interestRate
  const p = Number.isFinite(p0) ? Math.max(0, p0) : 0.05
  const pass = p <= 0.06 ? p : 0.06 + 0.6 * (p - 0.06)
  const t = LOAN_PRICING[kind] ?? LOAN_PRICING.personal
  return Math.min(t.max, Math.max(t.min, pass * t.mult + t.spread))
}

/** Interest rate a lender offers for this kind of loan given the local market and the borrower's credit. */
export function offeredRate(g: GameState, kind: 'mortgage' | LoanKind): number {
  const score = creditScore(g)
  const base = baseLoanRate(g.character.countryId, kind)
  const credit = score >= 760 ? -0.012 : score >= 700 ? -0.004 : score >= 640 ? 0.008 : score >= 580 ? 0.02 : 0.035
  // Prime borrowers can't get much below the bank's own funding cost.
  const floor = Math.min(base, Math.max(0.004, base * 0.6))
  return Math.round(Math.max(floor, base + credit) * 10000) / 10000
}

export interface NewLoan {
  kind: LoanKind
  lender: string
  principal: number
  rate: number
  years: number
}

/** Add a loan to the character (balance + level yearly payment). */
export function addLoan(g: GameState, l: NewLoan): Loan {
  const loan: Loan = {
    id: uid(g, 'loan'),
    kind: l.kind,
    lender: l.lender,
    balance: Math.round(l.principal),
    yearlyPayment: annualPayment(l.principal, l.rate, l.years),
    rate: l.rate,
  }
  g.character.loans.push(loan)
  return loan
}

export function loanLabel(kind: LoanKind): string {
  return kind === 'student' ? 'Student Loan' : kind === 'car' ? 'Auto Loan' : kind === 'business' ? 'Business Loan' : 'Personal Loan'
}

export function totalDebt(g: GameState): number {
  return g.character.loans.reduce((s, l) => s + l.balance, 0) + g.assets.reduce((s, a) => s + (a.mortgage?.balance ?? 0), 0)
}

/** Pay a loan off in full from cash. Returns false if unaffordable. */
export function payOffLoan(g: GameState, loanId: string): boolean {
  const c = g.character
  const loan = c.loans.find((l) => l.id === loanId)
  if (!loan) return false
  if (c.money < loan.balance) return false
  addMoney(g, -loan.balance)
  c.loans = c.loans.filter((l) => l.id !== loanId)
  clearLoanMisses(g, loanId)
  return true
}

function loanMisses(g: GameState): Record<string, Json> {
  const m = g.flags.loanMisses
  if (m && typeof m === 'object' && !Array.isArray(m)) return m
  const fresh: Record<string, Json> = {}
  g.flags.loanMisses = fresh
  return fresh
}

function clearLoanMisses(g: GameState, loanId: string): void {
  const m = g.flags.loanMisses
  if (m && typeof m === 'object' && !Array.isArray(m)) delete m[loanId]
}

/** Record a missed payment for the credit history. */
export function recordMissedPayment(g: GameState): void {
  g.flags.missedPayments = Math.min(8, num(g.flags.missedPayments) + 1)
  g.flags.missedThisYear = true
}

// ---------------------------------------------------------------------------
// Where you live

/** Human description of the current residence for headers and the profile. */
export function residenceText(g: GameState): string {
  const c = g.character
  const r = c.residence
  switch (r.status) {
    case 'parents':
      return parents(g).length > 0 ? 'You live with your parents.' : 'You live in your family home.'
    case 'owned': {
      const home = g.assets.find((a) => a.id === r.assetId)
      return home ? `You live in your ${home.name.toLowerCase()}.` : 'You live in a home you own.'
    }
    case 'renting':
      return `You rent ${r.description ?? 'an apartment'} for ${formatMoney(Math.round((r.rent ?? 0) / 12))}/month.`
    case 'homeless':
      return 'You are homeless.'
    case 'dorm':
      return 'You live in a college dorm.'
    case 'prison':
      return 'You live in a prison cell.'
    case 'military':
      return 'You live on a military base.'
    case 'partner':
      return 'You live with your partner.'
  }
}

/** A parent who would take the player back in, if any. */
export function welcomingParent(g: GameState): Person | undefined {
  return parents(g)
    .filter((p) => p.relationship >= 35)
    .sort((a, b2) => b2.relationship - a.relationship)[0]
}

/**
 * The player lost their home (eviction, foreclosure, sale, repossession). Move into another
 * owned home if there is one, else back with a parent, else onto the street.
 * Returns a short second-person sentence describing where they ended up.
 */
export function relocateAfterLosingHome(g: GameState, excludeAssetId?: string): string {
  const c = g.character
  const other = g.assets.find((a) => a.kind === 'house' && a.id !== excludeAssetId && !a.rentedOutFor)
  if (other) {
    c.residence = { status: 'owned', assetId: other.id, description: other.name }
    return `You moved into your ${other.name.toLowerCase()}.`
  }
  const parent = welcomingParent(g)
  if (parent) {
    c.residence = { status: 'parents' }
    return `Your ${relationLabel(parent).toLowerCase()} ${parent.firstName} let you move back home. ${pick(g, ['Rent is free. The lectures are not.', 'Your childhood bedroom still has the posters up.', 'Curfew is at 10.'])}`
  }
  c.residence = { status: 'homeless' }
  g.flags.homelessSince = c.age
  return 'With nowhere else to go, you are now homeless.'
}

// ---------------------------------------------------------------------------
// The yearly hook

const TAX_LINES = [
  (m: string) => `I paid ${m} in taxes.`,
  (m: string) => `I paid ${m} in taxes.`,
  (m: string) => `The tax man took ${m} of my income.`,
  (m: string) => `I handed ${m} over to the government in taxes.`,
]

const LIVING_LINES = [
  (m: string) => `I spent ${m} on groceries, bills and everyday living.`,
  (m: string) => `Living expenses cost me ${m} this year.`,
  (m: string) => `Bills, food and gas ate ${m} of my money.`,
]

const RENT_LINES = [
  (m: string) => `I paid ${m} in rent.`,
  (m: string) => `My landlord collected ${m} in rent.`,
]

const COLLECTOR_TEXTS = [
  'Debt collectors keep calling about the {debt} you owe. They have the persistence of a toddler and the manners of a seagull.',
  'A debt collector named {name} left you seven voicemails about the {debt} you owe. The last one was just heavy breathing.',
  'Collection agencies are hounding you over your {debt} debt. You started answering the phone in a fake accent.',
  'Your mailbox is stuffed with FINAL NOTICE letters about the {debt} you owe.',
]

const COLLECTOR_NAMES = ['Gary', 'Doreen', 'Vince', 'Brenda', 'Marcus', 'Trish', 'Duane', 'Carla']

/**
 * Cost of everyday living relative to the US (1): 40% bills and services, which track wealth,
 * and 60% groceries, which follow the market's food prices (data/markets.ts priceMult.food).
 * Switzerland and Norway come out around 1.3-1.4, India and Egypt around 0.25-0.3.
 */
export function costOfLiving(countryId: string): number {
  const wealth = Math.max(0.2, getCountry(countryId).wealth ?? 1)
  const raw = marketOf(countryId).priceMult.food
  // Countries without hand-written market data: assume groceries track wealth.
  const food = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : hasMarketData(countryId) ? 1 : wealth
  return Math.min(2.2, Math.max(0.15, 0.4 * Math.min(1.4, wealth) + 0.6 * Math.min(2.5, Math.max(0.12, food))))
}

/** Yearly living costs for an independent adult (scaled by the local cost of living). */
export function livingCost(g: GameState): number {
  const c = g.character
  if (c.age < 18 || c.prison) return 0
  const status = c.residence.status
  const independent = status === 'owned' || status === 'renting' || (status === 'parents' && parents(g).length === 0)
  if (!independent) return 0
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild') && p.age < 18 && p.livesWithPlayer).length
  return Math.round((3_000 + 1_500 * kids) * costOfLiving(c.countryId))
}

/** True (and remembered) when a recurring bill is new or at least 25% off the last amount logged. */
function changedALot(g: GameState, key: string, amount: number): boolean {
  const last = num(g.flags[key])
  if (last > 0 && Math.abs(amount - last) < last * 0.25) return false
  g.flags[key] = amount
  return true
}

/** Taxes, rent, living costs, loans and the consequences of going broke. Runs after career & special. */
export function yearlyFinance(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  g.flags.missedThisYear = false

  // 1. Income tax on everything earned this year (salary, pension, royalties...).
  const income = num(g.flags.taxableIncome)
  const tax = incomeTax(c.countryId, income)
  g.flags.taxesPaid = tax
  if (tax > 0) {
    addMoney(g, -tax)
    count(g, 'taxesPaid', tax)
    // The journal is for the story, not a bank statement: mention taxes the first time and
    // when the bill changes a lot, not every single year.
    if (tax >= 50 && changedALot(g, 'lastTaxLogged', tax)) log(g, pick(g, TAX_LINES)(formatMoney(tax)))
  }

  // 2. Rent. Landlords don't hold apartments for inmates.
  if (c.residence.status === 'renting') {
    if (c.prison) {
      c.residence = { status: 'homeless' }
      log(g, 'My landlord ended my lease while I was locked up.', 'bad')
    } else {
      const rent = Math.max(0, Math.round(c.residence.rent ?? 0))
      if (rent > 0) {
        addMoney(g, -rent)
        if (changedALot(g, 'lastRentLogged', rent)) log(g, pick(g, RENT_LINES)(formatMoney(rent)))
      }
    }
  }

  // 3. Everyday living costs once you're on your own.
  const baseLiving = livingCost(g)
  if (baseLiving > 0) {
    const living = Math.round(baseLiving * (0.9 + randInt(g, 0, 20) / 100))
    addMoney(g, -living)
    if (living >= 500 && chance(g, 0.35)) log(g, pick(g, LIVING_LINES)(formatMoney(living)))
  }

  // 4. Loans: interest, payments, missed payments, payoff.
  yearlyLoans(g)

  // 5. Life on the street.
  if (c.residence.status === 'homeless' && !c.prison && c.age >= 18) {
    addStat(g, 'happiness', -randInt(g, 5, 10))
    addStat(g, 'health', -randInt(g, 2, 5))
    log(
      g,
      pick(g, ['I spent another year sleeping on park benches.', 'I lived on the streets this year.', 'I spent the year couch-surfing and sleeping in my car... without a car.', 'I was homeless all year.']),
      'bad',
    )
  }

  // 6. Debt: collectors, a bail-out from mom, eviction, repossession.
  handleDebt(g)

  if (!g.flags.missedThisYear && num(g.flags.missedPayments) > 0) g.flags.missedPayments = num(g.flags.missedPayments) - 1
}

function yearlyLoans(g: GameState): void {
  const c = g.character
  const misses = loanMisses(g)
  let paidTotal = 0
  for (const loan of [...c.loans]) {
    if (!c.loans.includes(loan)) continue
    const interest = Math.max(0, Math.round(loan.balance * loan.rate))
    loan.balance = Math.round(loan.balance + interest)
    // Student loans are deferred while you're still in school.
    if (loan.kind === 'student' && c.education.current) continue
    const due = Math.min(loan.yearlyPayment, loan.balance)
    if (due <= 0) {
      c.loans = c.loans.filter((l) => l !== loan)
      continue
    }
    const pay = Math.max(0, Math.min(due, c.money))
    if (pay > 0) {
      addMoney(g, -pay)
      loan.balance = Math.round(loan.balance - pay)
      paidTotal += pay
    }
    if (pay < due) {
      const fee = Math.round((due - pay) * 0.05)
      loan.balance += fee
      const missed = num(misses[loan.id]) + 1
      misses[loan.id] = missed
      recordMissedPayment(g)
      if (missed >= 2 && repossessFinancedAsset(g, loan)) continue
      notice(
        g,
        'Missed Payment',
        `You couldn't make the ${formatMoney(due)} payment on your ${loanLabel(loan.kind).toLowerCase()} from ${loan.lender}. A ${formatMoney(fee)} late fee was added and your credit score took a beating.`,
        { emoji: '📉', tone: 'bad' },
      )
      log(g, `I missed a payment on my ${loanLabel(loan.kind).toLowerCase()}.`, 'bad')
    } else {
      delete misses[loan.id]
    }
    if (loan.balance <= 0) {
      c.loans = c.loans.filter((l) => l !== loan)
      delete misses[loan.id]
      const what = loanLabel(loan.kind).toLowerCase()
      log(g, `I paid off my ${what}!`, 'good')
      notice(g, 'Debt Free!', pick(g, [`You made the final payment on your ${what}. ${loan.lender} will have to find someone else to bother.`, `Your ${what} is officially paid off! You celebrated by not opening a single envelope from ${loan.lender}.`]), { emoji: '🎉', tone: 'good' })
      addStat(g, 'happiness', 6)
      remember(g, `Paid off my ${what}.`)
    }
  }
  if (paidTotal >= 100) log(g, `I paid ${formatMoney(paidTotal)} toward my loans.`)
}

/** Repossess whatever a defaulted loan financed (car, boat, plane). Returns true if something was taken. */
function repossessFinancedAsset(g: GameState, loan: Loan): boolean {
  const c = g.character
  const asset = g.assets.find((a) => a.details.loanId === loan.id)
  // Nothing left to take back (sold, stolen, wrecked): the debt stays with you.
  if (!asset) return false
  c.loans = c.loans.filter((l) => l.id !== loan.id)
  clearLoanMisses(g, loan.id)
  g.assets = g.assets.filter((a) => a.id !== asset.id)
  const how =
    asset.kind === 'boat'
      ? `a repo crew showed up at the marina and towed your ${asset.name.toLowerCase()} away. The seagulls seemed pleased.`
      : asset.kind === 'aircraft'
        ? `the lender's pilot flew your ${asset.name.toLowerCase()} out of the hangar while you watched. They didn't even wave.`
        : `a tow truck showed up at 3 AM and repossessed your ${asset.name}. Your neighbors watched from their windows.`
  notice(g, 'Repossessed!', `You stopped paying ${loan.lender}, so ${how}`, { emoji: asset.kind === 'car' ? '🚛' : asset.emoji, tone: 'bad' })
  const nm = asset.kind === 'car' ? asset.name : asset.name.toLowerCase()
  log(g, `My ${nm} was repossessed.`, 'bad')
  addStat(g, 'happiness', -10)
  remember(g, `Had my ${nm} repossessed.`)
  return true
}

function handleDebt(g: GameState): void {
  const c = g.character
  if (c.money >= 0) {
    g.flags.brokeYears = 0
    return
  }
  const brokeYears = num(g.flags.brokeYears) + 1
  g.flags.brokeYears = brokeYears
  const debt = formatMoney(-c.money)

  // A parent might bail you out (once in a while).
  const parent = parents(g).find((p) => p.relationship >= 60 && p.money > -c.money * 2)
  if (parent && chance(g, 0.3)) {
    const amount = -c.money
    parent.money = Math.round(parent.money - amount)
    addMoney(g, amount)
    addRelationship(parent, -8)
    const pr = pronouns(parent.gender)
    notice(g, 'Bailed Out', `Your ${relationLabel(parent).toLowerCase()} ${parent.firstName} paid off your ${debt} debt. ${pr.He} made you promise to "get your life together." ${pr.He} will be bringing this up at every holiday.`, { emoji: '🫶', tone: 'good' })
    log(g, `My ${relationLabel(parent).toLowerCase()} bailed me out of ${debt} of debt.`, 'good')
    g.flags.brokeYears = 0
    return
  }

  const text = pick(g, COLLECTOR_TEXTS).replace('{debt}', debt).replace('{name}', pick(g, COLLECTOR_NAMES))
  notice(g, 'Debt Collectors', text, { emoji: '📞', tone: 'bad' })
  log(g, pick(g, ['Debt collectors kept calling me.', `I'm ${debt} in debt.`, 'I dodged calls from debt collectors all year.']), 'bad')
  addStat(g, 'happiness', -5)
  addHidden(g, 'willpower', -1)

  // Two broke years in a row: the landlord has had enough.
  if (c.residence.status === 'renting' && brokeYears >= 2 && !c.prison) {
    const where = c.residence.description ?? 'your apartment'
    const next = relocateAfterLosingHome(g)
    notice(g, 'Evicted!', `Your landlord changed the locks on ${where} after you fell behind on rent. Your stuff is on the curb. ${next}`, { emoji: '🚪', tone: 'bad' })
    log(g, 'I was evicted from my apartment.', 'bad')
    addStat(g, 'happiness', -12)
    remember(g, 'Got evicted for not paying rent.')
  }

  // Three or more: creditors seize and auction your stuff.
  if (brokeYears >= 3) seizeAssetsForDebt(g)
}

/** Order in which creditors take things: toys first, the roof over your head last. */
const SEIZE_ORDER = ['other', 'collectible', 'jewelry', 'instrument', 'boat', 'aircraft', 'car', 'business', 'house']

function seizeAssetsForDebt(g: GameState): void {
  const c = g.character
  const seized: string[] = []
  const candidates = [...g.assets].sort((a, b2) => {
    const ra = SEIZE_ORDER.indexOf(a.kind) + (a.id === c.residence.assetId ? 100 : 0)
    const rb = SEIZE_ORDER.indexOf(b2.kind) + (b2.id === c.residence.assetId ? 100 : 0)
    return ra - rb
  })
  let lostHome = false
  for (const a of candidates) {
    if (c.money >= 0) break
    const loan = typeof a.details.loanId === 'string' ? c.loans.find((l) => l.id === a.details.loanId) : undefined
    const owed = (a.mortgage?.balance ?? 0) + (loan?.balance ?? 0)
    const proceeds = Math.round(a.value * 0.7) - owed
    g.assets = g.assets.filter((x) => x.id !== a.id)
    if (loan) c.loans = c.loans.filter((l) => l !== loan)
    addMoney(g, proceeds)
    seized.push(a.name)
    if (c.residence.status === 'owned' && c.residence.assetId === a.id) lostHome = true
  }
  if (seized.length === 0) return
  const list = seized.length === 1 ? `your ${seized[0]}` : `${seized.length} of your belongings, including your ${seized[0]}`
  let text = `Your creditors got a court order and auctioned off ${list} to cover your debts.`
  if (lostHome) text += ` ${relocateAfterLosingHome(g)}`
  notice(g, 'Assets Seized', text, { emoji: '⚖️', tone: 'bad' })
  log(g, seized.length === 1 ? `Creditors seized my ${seized[0]}.` : `Creditors seized ${seized.length} of my belongings.`, 'bad')
  addStat(g, 'happiness', -10)
  if (c.money >= 0) g.flags.brokeYears = 0
}
