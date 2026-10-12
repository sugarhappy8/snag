// Banks (industries 'bank' and 'onlineBank'): Banking 2.0. finance-firm.ts dispatches here.
//
// Customers' deposits and the loan book are client money (bank-state.ts); b.cash is the
// shareholders' capital. The year (bank-model.ts projectYear) is a deterministic seeded
// simulation; this file books it into the statement, applies the regulator and hands the
// living-world economy its observations. Popups (report, runs, regulator, events) live in
// bank-events.ts, menus in bank-menu.ts, player actions in bank-actions.ts.
import { seeded } from '../assets'
import { outcomeTag } from '../timeMachine'
import type { Asset, GameState, MenuNode } from '../types'
import { getCountry } from '../world'
import type { YearResult } from './economy'
import { APPETITES, LEND_LINES, PRODUCTS, hasProduct, isBankIndustry, loanTotal, minCapitalRatio, nationalDeposits, perBranch, readBank, saveBank, type Appetite, type BankBook, type ProductId } from './bank-state'
import { bankCapital, bankLeaderSkill, bankMarket, bankPayoutRoom, bankRank, bestRates, campaignCost, capitalRatio, costScale, depositCapacity, expectedProfit, onlineBankingOpen, productGain, productGate, profitWords, projectYear, riskWeighted, setupCost, type StartOutlook } from './bank-model'
import { bankAfterYear, queueBankYearReport } from './bank-events'
import { bankMenuNodes } from './bank-menu'
import { shareText } from './competition'
import { niceAmount, startupCost } from './economy'
import { totalOutlets, type BizState, type Statement } from './state'
import { allocatedCorporateTax } from './tax'
import { clampN, money, pct } from './util'

export function isBank(b: { industry: string }): boolean {
  return isBankIndustry(b.industry)
}

export function bankEraBlock(_g: GameState, industry: string, countryId: string, year: number): string | null {
  if (industry !== 'onlineBank') return null
  return onlineBankingOpen(countryId, year) ? null : 'Online banking needs local internet access and online-banking technology. Start a branch bank first, or wait for the digital era.'
}

/** Regulators' fine for a bank that stays below the minimum. */
function fineFor(b: BizState, rwa: number): number {
  return Math.round(Math.max(50_000 * costScale(b.countryId), rwa * .005))
}

/**
 * The fiscal year of a bank. Deterministic per life/bank/year (seeded), never touches g, and a
 * second call for a settled year changes nothing. Customer money never reaches b.cash: only the
 * booked statement (net) moves the shareholders' cash.
 */
export function simulateBankYear(g: GameState, b: BizState, year: number, ownerDraw: number, bookedHomeSales: number | Record<string, number> = 0): YearResult {
  const opening = readBank(b)
  if (opening.lastYear >= year && b.last) return { stmt: b.last, inventoryEnd: 0, wantedStaff: b.employees, unpaidSalary: 0, market: null }
  const rng = seeded(`${g.lifeId}|bank|${b.countryId}|${b.city}|${b.founded}|${b.founderName}|${year}${outcomeTag(g, year)}`)
  const p = projectYear(g, b, year, () => rng.next(), undefined, opening)
  const book = p.book, m = p.market, min = p.minRatio
  const booked = b.yearCosts - b.yearIncome
  // The run-time advance comes back out of the client book: it repays the emergency debt first.
  const debtRepaid = Math.min(p.advanceReturned, book.cbOwed, Math.max(0, b.debt))
  const cashBack = p.advanceReturned - debtRepaid

  let shrink = 0, shrinkLoss = 0, fine = 0, regulator = ''
  const settle = () => {
    const r = Math.round
    const stmt: Statement = {
      year, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0,
      revenue: r(p.revenue), salesTax: 0, netRevenue: r(p.revenue), cogs: r(p.cogs + shrinkLoss), wages: r(p.wages), keyStaff: r(p.keyStaff),
      rent: r(p.rent), marketing: r(p.marketing), interest: r(p.interestOnDebt), upkeep: r(p.upkeep), other: r(b.yearCosts + fine), otherIncome: r(b.yearIncome),
      ownerPay: 0, pbt: 0, corpTax: 0, net: 0, cashErosion: 0, cycle: Math.round(m.cycle * 100) / 100, openFraction: p.open, employees: p.staff,
      // Banks earn what the book earns: no "perfect foresight" trading income, even for a 100-rated CEO.
      strategicIncome: 0,
    }
    const preSalary = stmt.netRevenue - stmt.cogs - stmt.wages - stmt.keyStaff - stmt.rent - stmt.marketing - stmt.interest - stmt.upkeep - stmt.other + stmt.otherIncome
    stmt.ownerPay = Math.round(clampN(ownerDraw, 0, Math.max(0, b.cash + preSalary + booked)))
    stmt.pbt = preSalary - stmt.ownerPay
    stmt.corpTax = Math.round(allocatedCorporateTax(b.countryId, stmt.pbt, stmt.revenue, b.yearIncome, bookedHomeSales, g, year))
    stmt.net = stmt.pbt - stmt.corpTax
    return stmt
  }
  let stmt = settle()
  const capitalAfter = (s: Statement) => b.cash + s.net + booked + cashBack - (b.debt - debtRepaid) + book.advance
  let capital = capitalAfter(stmt), rwa = riskWeighted(book, capital)
  let ratio = rwa >= 1 ? capital / rwa : capital > 0 ? 9.99 : 0
  // The regulator: a warning, then a forced shrink with a fine, and a seizure threat far below.
  if (ratio < min && rwa >= 1) {
    book.strikes = Math.min(9, opening.strikes + 1)
    if (book.strikes >= 2 && loanTotal(book) > 0) {
      // Forced sales at a small discount, at most a third of the book a year; a fine on top
      // (capped so the penalty alone can't wipe the shareholders out).
      fine = Math.min(fineFor(b, rwa), Math.round(Math.max(0, capital) * .25))
      const cap = loanTotal(book) / 3
      for (let pass = 0; pass < 3 && shrink < cap; pass++) {
        stmt = settle()
        capital = capitalAfter(stmt)
        const target = Math.max(0, capital) / (min + .01)
        rwa = riskWeighted(book, capital)
        if (rwa <= target) break
        const total = loanTotal(book), avgRw = Math.max(.3, (rwa - book.badNet) / Math.max(1, total))
        const sell = Math.min(total, cap - shrink, (rwa - target) / avgRw)
        const k = sell / Math.max(1, total)
        for (const line of LEND_LINES) book.loans[line] *= 1 - k
        book.reserves += sell
        shrink += sell; shrinkLoss += sell * .02
      }
      stmt = settle()
      capital = capitalAfter(stmt); rwa = riskWeighted(book, capital)
      ratio = rwa >= 1 ? capital / rwa : capital > 0 ? 9.99 : 0
      const acts = [shrink >= 1 ? `forced ${money(shrink)} of loan sales` : '', fine > 0 ? `fined the bank ${money(fine)}` : ''].filter(Boolean)
      regulator = acts.length ? `Regulators ${acts.join(' and ')}.` : 'Regulators warned the bank again: capital is still below the minimum.'
    } else regulator = 'Regulators warned the bank: capital is below the minimum. Raise capital or lend less.'
    book.seize = ratio < min * .5 || capital <= 0
    if (book.seize) regulator += ' They threaten to seize it unless shareholders put in fresh capital.'
  } else {
    book.strikes = 0; book.seize = false
  }

  b.cash = Math.round(b.cash + stmt.net + booked + cashBack)
  b.debt = Math.max(0, b.debt - debtRepaid)
  book.cbOwed = Math.max(0, Math.min(book.cbOwed - debtRepaid, b.debt))
  b.employees = p.staff; b.production = 0; b.inventory = 0; b.price = 0

  // Trust follows results, safety, scandals and the economy.
  const bad = p.grossBad / Math.max(1, p.openingLoans)
  book.trust = nextTrust(g, b, book, { ratio, min, profit: stmt.net, bad, run: p.runWave > 0, crisis: m.crisis, insured: m.insured, campaign: opening.campaignBoost > 0, wobble: rng.next() - .5 }, year)
  if (b.industry === 'onlineBank') book.reach = Math.min(1e6, book.reach * (1 + .02 * book.trust / 60))
  book.run = p.pendingRun && p.pendingRun.wave > 0 ? { year, wave: Math.min(book.deposits, p.pendingRun.wave), severity: p.pendingRun.severity } : null
  book.campaignBoost = 0; book.shock = 1
  book.heat = Math.max(0, book.heat)
  const rank = bankRank(b.countryId, year, book.deposits)
  const costs = stmt.wages + stmt.keyStaff + stmt.rent + stmt.marketing + stmt.upkeep + stmt.interest
  book.last = {
    year, interest: Math.round(p.interest), bondIncome: Math.round(p.bondIncome), fees: Math.round(p.fees + p.ibRevenue), depositCost: Math.round(p.depositCost),
    creditLosses: Math.round(p.creditLosses), liquidityLosses: Math.round(p.liquidityLosses + shrinkLoss), trading: Math.round(p.trading), costs: Math.round(costs), fine,
    profit: stmt.net, deposits: Math.round(book.deposits), depositFlow: Math.round(book.deposits - p.openingDeposits), loans: Math.round(loanTotal(book)),
    loanFlow: Math.round(loanTotal(book) - p.openingLoans), badRate: bad, ratio: clampN(ratio, -9.99, 9.99), minRatio: min, trust: Math.round(book.trust),
    withdrawals: Math.round(p.withdrawals), runWithdrawals: Math.round(p.runWave), bankLoss: Math.round(p.creditLosses + p.liquidityLosses + shrinkLoss),
    shrink: Math.round(shrink), regulator, crisis: m.crisis, crisisName: m.crisisName, rank: rank.rank, rankOf: rank.of,
    savings: Math.max(0, m.savings + book.savingsGap), loanRate: m.mortgage + (PRODUCTS.business.premium ?? 0) + book.loanGap, marketSavings: m.savings, marketLoan: m.mortgage + (PRODUCTS.business.premium ?? 0),
  }
  book.hist = [...book.hist.filter(h => h.y !== year), { y: year, profit: stmt.net, deposits: Math.round(book.deposits), loans: Math.round(loanTotal(book)), ratio: Math.round(clampN(ratio, 0, 9.99) * 1000) / 1000, trust: Math.round(book.trust) }].slice(-12)
  book.lastYear = year
  saveBank(b, book)
  b.last = stmt
  return {
    stmt, inventoryEnd: 0, wantedStaff: p.staff, unpaidSalary: Math.max(0, Math.round(ownerDraw) - stmt.ownerPay), market: null,
    bank: { bankLoss: book.last.bankLoss, bankRun: book.last.runWithdrawals, bankLending: loanTotal(book) - p.openingLoans },
  }
}

/**
 * Trust drifts a quarter of the way toward what the bank deserves (capital, age, size, the team,
 * profit, safety nets) and takes this year's shocks on top.
 */
function nextTrust(g: GameState, b: BizState, book: BankBook, y: { ratio: number; min: number; profit: number; bad: number; run: boolean; crisis: number; insured: number; campaign: boolean; wobble: number }, year: number): number {
  const rank = bankRank(b.countryId, year, book.deposits).rank
  const target = 45 + clampN((y.ratio - y.min) * 100, -15, 10) + Math.min(10, (year - b.founded) / 3) + (rank <= 10 ? 10 : rank <= 50 ? 5 : 0)
    + clampN((bankLeaderSkill(g, b) - 50) / 5, -8, 8) + (y.profit > 0 ? 5 : -10) + (y.insured > 0 ? 5 : 0) - (b.industry === 'onlineBank' ? 5 : 0)
    - clampN(y.bad * 200, 0, 15) + (y.campaign ? 5 : 0)
  return clampN(book.trust + (target - book.trust) * .25 - (y.run ? 15 : 0) - y.crisis * 8 - (book.strikes > 0 ? 5 : 0) + y.wobble * 4, 0, 100)
}

function assetOf(g: GameState, b: BizState): Asset | undefined {
  return g.assets.find(a => a.kind === 'business' && (a.details as unknown) === b)
}

/** A deterministic −1…1 wobble for a CEO's judgment (no game RNG). */
function wobble(key: string): number {
  return seeded(key).next() * 2 - 1
}

/**
 * The hired CEO (or the stand-in while the owner can't run it) sets rates, appetite and, once a
 * year after the books close, products and a campaign. Skill shrinks mistakes; no foresight.
 * Mutates only `b` and never consumes g's RNG. After a settlement it also handles the year's
 * popups for a managed bank (bank-events.ts).
 */
export function bankManagerTurn(g: GameState, b: BizState): void {
  const settled = readBank(b).lastYear === g.year - 1
  if (settled) {
    const a = assetOf(g, b)
    if (a) bankAfterYear(g, a, b, true)
  }
  const book = readBank(b)
  const year = book.lastYear >= 0 ? book.lastYear + 1 : g.year
  const skill = b.ceo === 'manager' ? bankLeaderSkill(g, b) : 50
  const who = `${b.manager?.firstName ?? 'ceo'}${b.manager?.lastName ?? ''}|${b.founded}|${year}`
  const m = bankMarket(g, b.countryId, year), min = minCapitalRatio(b.countryId, year)
  const ratio = capitalRatio(b, book)
  // Rates and appetite are planned once per fiscal year (a later popup's choice isn't undone).
  if (book.planned !== year) {
    let appetite: Appetite = 'balanced'
    if (ratio < min + .02 || m.crisis >= .5) appetite = 'prime'
    else if (skill < 45 && wobble(`${who}|greed`) > .2) appetite = 'highYield'
    book.appetite = appetite
    const err = (100 - skill) / 100 * .01
    if (skill >= 55) {
      saveBank(b, book)
      const best = bestRates(g, b, year)
      book.savingsGap = clampN(best.savingsGap + err * wobble(`${who}|s`), -.03, .03)
      book.loanGap = clampN(best.loanGap + err * wobble(`${who}|l`), -.03, .05)
    } else {
      book.savingsGap = clampN(err * wobble(`${who}|s`), -.03, .03)
      book.loanGap = clampN(.005 + err * wobble(`${who}|l`), -.03, .05)
    }
    book.planned = year
  }
  if (settled) {
    const capital = bankCapital(b, book)
    const spare = Math.max(0, capital - riskWeighted(book, capital) * (min + .04))
    const order: ProductId[] = ['mortgage', 'auto', 'cards', 'wealth', 'app', 'ib']
    if (skill < 40 && wobble(`${who}|crypto`) > .4) order.push('crypto')
    for (const id of order) {
      if (hasProduct(book, id) || !productGate(b, book, id, g.year).ok || (id === 'ib' && skill < 70)) continue
      const cost = setupCost(b, book, id)
      if (skill < 50 || cost * 3 > spare || cost * 2 > b.cash) break
      // A capable CEO checks the product pays for itself under this year's model (no foresight).
      if (skill >= 70 && productGain(g, b, book, id) <= cost) continue
      b.cash -= cost; b.yearCosts += cost
      book.products[id] = g.year
      break
    }
    const capacity = depositCapacity(g, b, book, g.year), cost = campaignCost(b, book)
    if (book.campaignYear < g.year && skill >= 50 && (book.deposits < capacity * .5 || b.industry === 'onlineBank') && cost * 4 < b.cash && ratio > min + .02) {
      b.cash -= cost; b.yearCosts += cost
      book.campaignYear = g.year; book.campaignBoost = .2
      if (b.industry === 'onlineBank') book.reach += 1.5
    }
    // A capable CEO opens branches once the old ones are full and capital allows (branches are
    // equipment, paid from shareholders' cash, so they compete with lending for capital).
    if (b.industry !== 'onlineBank' && skill >= 55 && (book.deposits > capacity * .6 || ratio > min + .2) && (book.last?.profit ?? 0) > 0) {
      const site = startupCost(b.industry, b.countryId, b.city), each = site.capital + Math.round(site.fee * .2)
      const capital = bankCapital(b, book), room = capital - riskWeighted(book, capital) * (min + .06) - book.deposits * .05 * (min + .06)
      const n = Math.floor(clampN(Math.min(room / each, b.cash / each - 2, totalOutlets(b) * .25 + 1), 0, 50))
      if (n >= 1) {
        b.cash -= each * n
        const home = b.outlets.find(o => o.countryId === b.countryId && o.city === b.city)
        if (home) home.count += n
        else b.outlets.push({ countryId: b.countryId, city: b.city, count: n, opened: g.year })
      }
    }
  }
  saveBank(b, book)
}

/** The owner-CEO's yearly report popup, then the year's drama (runs, regulator, events). */
export function queueBankReport(g: GameState, a: Asset, b: BizState): void {
  queueBankYearReport(g, a, b)
  bankAfterYear(g, a, b, false)
}

export function bankNodes(g: GameState, a: Asset): MenuNode[] {
  return bankMenuNodes(g, a)
}

/** One short line for the company header (pure). */
export function bankInfo(g: GameState, b: BizState): string {
  const book = readBank(b), min = minCapitalRatio(b.countryId, g.year), ratio = capitalRatio(b, book)
  const bad = book.last?.badRate ?? 0
  return `Deposits ${money(book.deposits)} · loans ${money(loanTotal(book))} · capital ${ratioText(ratio)} (min ${pct(min, 1)}) · trust ${Math.round(book.trust)} · bad loans ${pct(bad, 1)}`
}

/** The company screen's market line: where the bank ranks among its country's banks (pure). */
export function bankMarketLine(g: GameState, b: BizState): string {
  const book = readBank(b), r = bankRank(b.countryId, g.year, book.deposits), pool = nationalDeposits(b.countryId, g.year)
  return `#${r.rank.toLocaleString()} of ~${r.of.toLocaleString()} banks in ${getCountry(b.countryId).name} · ${shareText(r.share)} of ~${money(pool)} of deposits`
}

export function ratioText(ratio: number): string {
  return ratio >= 9.99 ? 'no loans' : pct(ratio, 1)
}

/** Shareholder cash a conglomerate treasury should keep in this bank beyond its operating buffer. */
export function bankCapitalNeed(g: GameState, b: BizState, pool: number, effectiveness: number): number {
  const book = readBank(b), min = minCapitalRatio(b.countryId, g.year), cushion = APPETITES[book.appetite].cushion
  const rwa = riskWeighted(book, Math.max(0, b.cash - b.debt)) + book.deposits * .1 * .8
  return clampN(rwa * (min + cushion + .02) * clampN(effectiveness, 0, 1), 0, Math.max(0, pool))
}

/** Why the bank can't pay its owners right now when its regulator is the reason (pure), or null. */
export function bankPayoutBlock(b: BizState): string | null {
  if (!isBank(b) || bankPayoutRoom(b) > 0) return null
  const book = readBank(b)
  if (book.seize) return 'Regulators are threatening to seize the bank: no payouts until fresh capital arrives.'
  if (book.run) return 'Savers are queuing at the doors: no payouts during a run.'
  return `Regulators won't let the bank pay out the capital it needs (at least ${pct(minCapitalRatio(b.countryId, book.lastYear + 1), 1)} of its loans).`
}

/** One-line state readers other modules may show (kept small on purpose). */
export function bankBooks(b: BizState): { deposits: number; loans: number } {
  const book = readBank(b)
  return { deposits: book.deposits, loans: loanTotal(book) + book.badNet }
}

/** The last fiscal year already booked (-1 if none). */
export function bankSettledYear(b: BizState): number {
  return readBank(b).lastYear
}

/** A rough scale for a new bank's starting cash (beyond the first branch's fit-out): a branch's deposits × 4%. */
export function bankStartingCash(countryId: string, year: number): number {
  return Math.round(perBranch(countryId, year) * .04 / 100_000) * 100_000
}

/** Multiples of bankStartingCash the founding advice tries, smallest first. */
const ADVICE_GRID = [.3, .45, .6, .8, 1, 1.3, 1.7, 2.2, 3]
/** Headroom over the smallest expected-viable bank: real years bring crises, runs and bad luck. */
const ADVICE_MARGIN = 1.25
/**
 * The starting cash to advise a founder (pure): the smallest amount whose expected first years
 * (startOutlook) stay above the regulator's minimum and turn a profit by year three, plus headroom.
 * Null when no amount does: a bank here can't cover its costs yet. `outlookOf` builds the bank.
 */
export function bankAdvice(countryId: string, year: number, outlookOf: (cash: number) => StartOutlook): number | null {
  const base = bankStartingCash(countryId, year)
  for (const k of ADVICE_GRID) {
    const o = outlookOf(base * k)
    if (o.failsIn === null && (o.profits[2] ?? 0) > 0) return niceAmount(base * k * ADVICE_MARGIN)
  }
  return null
}

/** The founding screen's capital preview for banks (pure): what the model expects, said plainly. */
export function bankCapitalPreview(cash: number, outlook: StartOutlook, advised: number | null): string {
  const first = outlook.profits[0] ?? 0, third = outlook.profits[2] ?? first
  const turn = outlook.profits.findIndex(p => p > 0), year1 = `${profitWords(first, money)} in year one`
  const n = outlook.failsIn ?? 0
  const verdict = advised === null ? `${year1}. Even well funded, a bank here can’t cover its costs yet.`
    : outlook.failsIn !== null ? `${year1}; capital runs out ${n <= 1 ? 'within a year' : `in about ${n} years`} and regulators would seize it.`
    : third <= 0 || turn < 0 ? `${year1}, still losing in year three: likely to fail.`
    : cash < advised ? `${year1}. Thin: one bad year could sink it.`
    : first < 0 ? `${year1}, then profits from year ${turn + 1}.`
    : `${year1}, growing as savers arrive.`
  return `With ${money(cash)} of capital, expect ${verdict}${advised !== null && cash < advised ? ` Aim for ${money(advised)}+.` : ''}`
}

/** Expected after-tax profit of next year under the current settings (pure). */
export function bankOutlook(g: GameState, b: BizState): number {
  return expectedProfit(g, b, {})
}

export type { BankBook }
