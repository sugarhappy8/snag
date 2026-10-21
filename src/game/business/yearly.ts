// The yearly business loop: simulate every company in its own market, pay the owner, update the
// valuation, then hand the CEO the Annual Report (price + production for next year).
import { addMoney, addStat, count, earnIncome, formatCents, formatMoney, log, minigame, notice, scriptChoice } from '../core'
import { marketOf } from '../data/markets'
import { baseLoanRate } from '../finance'
import { economyOf, lendingConditions, recordEconomicActivity } from '../economy'
import { settleLateFamilyOwners } from './dynasty-ownership'
import { reportCharts } from '../charts/report'
import { flagOn } from '../flags'
import { chance, rand } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { AnnualReportData, Asset, ChoiceOption, GameState, NoticeModal } from '../types'
import { getCountry } from '../world'
import { boardYear } from './board'
import { ceoLetter, smartCeo, smartManagerTurn } from './board-ceo'
import { styleOf, syncCeo } from './career'
import { executiveOperations, executiveRetentionYear, groupRetentionYear } from './executive'
import { returnFormerExecutiveShares } from './executive-shares'
import { prepareInternalServices, settleInternalServices } from './group-services'
import { recordCompanyShock, recoverConfidence } from './dynamics'
import { groupRescue, inGroup, prepareGroupManagement, yearlyConglomerates } from './conglomerate'
import { autoDividendYear, dividendLog, queueDividends, type DividendResult } from './dividend-year'
import {
  bestPlan,
  costFactor,
  cycleLabel,
  cycleOf,
  equipmentValue,
  evolve,
  localEcon,
  maxProduction,
  planFor,
  priceBounds,
  recordYear,
  refreshValue,
  simulateYear,
  updateSharePrice,
  valuationOf,
} from './economy'
import { declareBankruptcy, familyNote, ipoThreshold, leaveListedCompany } from './exit'
import { leaveListedGroup } from './conglomerate-actions'
import { eventStrength, MARKET_EVENTS, marketEventImpacts } from '../history/market-events'
import { marketDef } from './competition-data'
import { groupsOf, liveGroup, sharePriceOf } from './conglomerate-state'
import { marketOwner, marketViewOf, refreshMarket, shareText } from './competition'
import { maybeAntitrust } from './competition-events'
import { advanceTechWaves, stampWave, waveLines } from './tech-waves'
import { maybeBusinessEvent } from './events'
import { afterDeepTechYear, deepTechManagerTurn, deepTechReport, isDeepTech, maybeDeepTechEvent, simulateDeepTechYear } from './deeptech'
import { afterStudioYear, isStudio, maybeStudioEvent, queueStudioReport, simulateStudioYear, studioManagerTurn } from './gamestudio'
import { financeManagerTurn, financeSettledYear, isFinanceFirm, queueFinanceReport } from './finance-firm'
import { industryDef } from './industries'
import { economicReportSummary, recordEconomicReport } from './economic-report'
import { readSupply } from './supply'
import { bookFranchiseYear, franchiseIncomeFor } from './franchise'
import { bookHedgeYear } from './hedge-company'
import { bookLabYear } from './lab-year'
import { labPayrollIn, labSplit } from './lab-state'
import { LAB_STATEMENT } from './lab-text'
import { milestoneYear } from './milestones'
import { prepareVenueYear, maybeVenueOwnerEvent } from './venues'
import { prepareSectorYear } from './sector-core'
import { maybeSectorEvent } from './sector-events'
import { staffTurnover } from './staff'
import { bizCountryName, bizOf, businessAssets, ceoJob, diluteBusinessEquity, findBusiness, readBiz, runsIt, stakeValue, totalOutlets, type BizState, type CeoStyle, type Statement } from './state'
import { clampN, markBest, money, num, pct, plural, priceCapOf, prunePricePromises, rec, round2, str, toJson, unitMoney, units } from './util'

// ---------------------------------------------------------------------------
// Plans

export interface PlanChoice {
  price: number
  production: number
}

/** The report's price range, under any price the company promised to hold this year. */
export function planBounds(g: GameState, assetId: string, b: BizState): { min: number; max: number; going: number; cap: number | null } {
  const bounds = priceBounds(b)
  const cap = priceCapOf(g, assetId)
  return { ...bounds, max: cap === null ? bounds.max : round2(Math.max(bounds.min, Math.min(bounds.max, cap))), cap }
}

/**
 * Parse and clamp an Annual Report result (never trust it). 'skip' keeps last year's plan.
 * `assetId` applies any price the company promised to hold this year.
 */
export function parsePlan(g: GameState, b: BizState, raw: string, assetId = ''): PlanChoice {
  const bounds = assetId ? planBounds(g, assetId, b) : priceBounds(b)
  const maxProd = maxProduction(g, b)
  let price = b.price
  let production = b.production
  if (raw && raw !== 'skip') {
    try {
      const v: unknown = JSON.parse(raw)
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>
        if (typeof o.price === 'number' && Number.isFinite(o.price)) price = o.price
        if (typeof o.production === 'number' && Number.isFinite(o.production)) production = o.production
      }
    } catch {
      // Not JSON: keep last year's plan.
    }
  }
  return {
    price: round2(clampN(price, bounds.min, bounds.max)),
    production: Math.round(clampN(production, 0, maxProd)),
  }
}

/** How a hired manager's style tilts their production run (growers build stock, cost-cutters run lean). */
const STYLE_OUTPUT: Record<CeoStyle, number> = { grower: 1.04, costCutter: 0.97, steady: 1, visionary: 1.02 }

/**
 * What a general manager of skill 75 or below decides for next year (and what the owner's plan
 * defaults to): the going price and production to demand, sloppier the less skilled they are.
 * Smarter managers plan with the optimizer instead (business/board-ceo.ts smartManagerTurn).
 */
export function autoPlan(g: GameState, b: BizState, lastCycle: number): PlanChoice {
  const bounds = priceBounds(b)
  const skill = b.manager?.skill ?? 50
  const sloppiness = (1 - skill / 100) * 0.12
  const tilt = b.ceo === 'manager' && b.manager ? STYLE_OUTPUT[styleOf(b.manager)] : 1
  const suggested = planFor(g, b, g.year, { calm: true }).suggested
  const price = round2(clampN(suggested * (1 + (rand(g) - 0.5) * 2 * sloppiness), bounds.min, bounds.max))
  const plan = planFor(g, b, g.year, { price, calm: true, cycle: () => lastCycle })
  const production = Math.round(clampN(plan.demand * (1.02 + (rand(g) - 0.5) * sloppiness) * tilt - b.inventory, 0, maxProduction(g, b)))
  return { price, production }
}

/**
 * The hired CEO's turn for a price-and-production company: above SMART_SKILL they run it like a
 * real executive (board-ceo.ts); at 75 and below they set the sloppy autoPlan and say so.
 */
export function managerTurn(g: GameState, a: Asset, b: BizState, lastCycle: number): void {
  if (smartCeo(b)) {
    smartManagerTurn(g, a, b)
    return
  }
  const plan = autoPlan(g, b, lastCycle)
  applyPlan(b, plan)
  if (b.ceo === 'manager' && b.manager) {
    const def = industryDef(b.industry)
    ceoLetter(g, a, b, ['Kept things ticking over.', `Next year, ${units(plan.production)} ${plan.production === 1 ? def.unitOne : def.unit} at ${unitMoney(plan.price)} each.`], false)
  }
}

export function applyPlan(b: BizState, p: PlanChoice): void {
  b.price = p.price
  b.production = p.production
}

// ---------------------------------------------------------------------------
// The Annual Report

function line(label: string, value: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): { label: string; value: string; tone: 'good' | 'bad' | 'neutral' } {
  return { label, value, tone }
}

function signed(n: number): string {
  return n < 0 ? `-${money(-n)}` : money(n)
}

export function statementLines(b: BizState, s: Statement): AnnualReportData['lines'] {
  const def = industryDef(b.industry)
  const m = marketOf(b.countryId)
  const lines: AnnualReportData['lines'] = []
  lines.push(line('Units sold', `${units(s.sold)} of ${units(s.demand)} wanted`, s.sold >= s.demand * 0.97 ? 'good' : 'neutral'))
  if (s.spoiled > 0 && def.perishable < 1) lines.push(line('Spoiled / written off', units(s.spoiled), 'bad'))
  lines.push(line(def.taxShare > 0 ? `Sales (incl. ${m.salesTaxName})` : 'Sales', money(s.revenue)))
  if (s.salesTax > 0) lines.push(line(`${m.salesTaxName} collected & remitted`, signed(-s.salesTax)))
  lines.push(line('Cost of goods', signed(-s.cogs)))
  lines.push(line(`Wages (${plural(s.employees, 'employee')})`, signed(-s.wages)))
  if (s.keyStaff > 0) lines.push(line(b.ceo === 'manager' ? 'Key staff & manager' : 'Key staff', signed(-s.keyStaff)))
  lines.push(line(`Rent (${plural(totalOutlets(b), def.site, def.sitePlural)})`, signed(-s.rent)))
  if (s.marketing > 0) lines.push(line('Marketing', signed(-s.marketing)))
  if (s.interest > 0) lines.push(line('Interest', signed(-s.interest)))
  lines.push(line('Upkeep & depreciation', signed(-s.upkeep)))
  // The research team's pay has its own line, out of the one-off costs (business/lab-state.ts).
  const crew = Math.min(labPayrollIn(b, s.year), Math.max(0, s.other))
  if (s.other - crew > 0) lines.push(line('One-off costs', signed(-(s.other - crew))))
  if (crew > 0) lines.push(line(LAB_STATEMENT.payroll, signed(-crew)))
  const franchised = Math.min(franchiseIncomeFor(b, s.year), Math.max(0, s.otherIncome - (s.strategicIncome ?? 0)))
  // The lab's credit, grant and royalties leave "Other income" the way franchise money does.
  const lab = labSplit(b, s, (s.strategicIncome ?? 0) + franchised)
  if (s.otherIncome - (s.strategicIncome ?? 0) - franchised - lab.grants - lab.royalty > 0) lines.push(line('Other income', money(s.otherIncome - (s.strategicIncome ?? 0) - franchised - lab.grants - lab.royalty), 'good'))
  if (franchised > 0) lines.push(line('Franchise fees & royalties', money(franchised), 'good'))
  if (lab.grants > 0) lines.push(line(LAB_STATEMENT.credit, money(lab.grants), 'good'))
  if (lab.royalty > 0) lines.push(line(LAB_STATEMENT.royalty, money(lab.royalty), 'good'))
  if (s.strategicIncome) lines.push(line('Perfect foresight · strategic trading income', money(s.strategicIncome), 'good'))
  if (s.ownerPay > 0) lines.push(line('Your salary', signed(-s.ownerPay)))
  lines.push(line('Profit before tax', signed(s.pbt), s.pbt >= 0 ? 'good' : 'bad'))
  if (s.corpTax > 0) lines.push(line(`Corporate tax (${Math.round(m.corporateTax * 100)}%)`, signed(-s.corpTax)))
  lines.push(line('Net profit', signed(s.net), s.net >= 0 ? 'good' : 'bad'))
  if (s.cashErosion > 0) lines.push(line(`Inflation ate company cash`, signed(-s.cashErosion), 'bad'))
  lines.push(line('Company cash', signed(b.cash), b.cash >= 0 ? 'neutral' : 'bad'))
  if (b.debt > 0) lines.push(line('Company debt', money(b.debt), 'bad'))
  lines.push(line(b.public ? `Market cap (${b.exchange})` : 'Valuation', money(b.valuation)))
  if (b.share < 1) lines.push(line(`Your ${pct(b.share)} stake`, money(stakeValue(b))))
  lines.push(line('Morale · Quality · Brand', `${b.morale}% · ${b.quality}% · ${b.brand}%`))
  const supply = readSupply(b)
  if (supply.last?.year === s.year) {
    lines.push(line('Critical inputs held (book cost)', money(supply.bookValue)))
    lines.push(line('Input purchases (cash, not a second expense)', money(supply.last.purchaseCost)))
    if (supply.last.inputShortfall > 0) lines.push(line('Production lost to missing inputs', units(supply.last.inputShortfall), 'bad'))
    if (supply.last.workforceShortfall > 0) lines.push(line('Production lost to workforce limits', units(supply.last.workforceShortfall), 'bad'))
  }
  return lines
}

function marketNote(g: GameState, b: BizState, lastCycle: number): string {
  const m = marketOf(b.countryId)
  const def = industryDef(b.industry)
  const e = localEcon(b.industry, b.countryId, b.city)
  const country = getCountry(b.countryId).name
  const parts = [`${country}'s economy is ${cycleLabel(lastCycle)}.`]
  const v = marketViewOf(g, b)
  // The market's own noun, never the label + "s" ("Marketing Agencys", "Bakerys").
  if (e.demandMult >= 1.3) parts.push(`Demand in the ${v.noun} market here is hot.`)
  else if (e.demandMult > 0 && e.demandMult <= 0.7) parts.push(`Demand in the ${v.noun} market here is thin.`)
  parts.push(`Locals typically pay about ${e.goingPrice >= 100 ? money(e.goingPrice) : formatCents(e.goingPrice)} per ${def.unitOne}.`)
  if (m.inflation >= 0.15) parts.push(`Inflation runs ${Math.round(m.inflation * 100)}% a year: reprice every year or your prices go stale.`)
  for (const x of marketEventImpacts(b.industry, b.countryId, b.last?.year ?? g.year - 1, v.scope === 'world').slice(0, 2)) parts.push(`${x.event.name}: ${x.text.charAt(0).toLowerCase() + x.text.slice(1)}`)
  // One tech-wave line, after the events and on the same year basis (the note is cut at 520 characters on screen).
  parts.push(...waveLines(g, b, b.last?.year ?? g.year - 1).slice(0, 1))
  if (v.booked && v.share > 0 && (v.scope === 'world' || v.share >= 0.005)) {
    parts.push(`You hold ${shareText(v.share)} of ${marketOwner(v.place)} ${v.noun} market (#${v.rank})${v.unmet >= 0.05 ? ` and turned away ${pct(v.unmet)} of your customers last year` : ''}.`)
  }
  return parts.join(' ')
}

/** Everything the Annual Report minigame needs (satisfies AnnualReportData exactly). */
export function reportData(g: GameState, a: Asset, b: BizState): AnnualReportData {
  const def = industryDef(b.industry)
  const bounds = planBounds(g, a.id, b)
  const lastCycle = b.last?.cycle ?? cycleOf(g, b.countryId, g.year - 1)
  const plan = planFor(g, b, g.year, { calm: true, cycle: () => lastCycle })
  const suggested = round2(clampN(plan.suggested, bounds.min, bounds.max))
  const expected = planFor(g, b, g.year, { price: suggested, calm: true, cycle: () => lastCycle }).demand
  const maxProd = maxProduction(g, b)
  const lines = b.last ? statementLines(b, b.last) : [line('First year', 'Your doors open soon. Set your launch price and production.')]
  // Annual Report 2.0 (R1-C10): readBiz hands the builders a normalized copy, so a damaged saved history never reaches them.
  const chart = flagOn('annualReport2') ? reportCharts(g, a, readBiz(g, a), marketViewOf(g, b)) : null
  return {
    assetId: a.id,
    businessName: a.name,
    emoji: a.emoji,
    industryLabel: def.label,
    location: `${b.city}, ${bizCountryName(b.countryId)}`,
    year: b.last?.year ?? g.year,
    unitLabel: def.unit,
    unitCost: round2(plan.unitCost * costFactor(b, true)),
    price: round2(clampN(b.price, bounds.min, bounds.max)),
    minPrice: bounds.min,
    maxPrice: bounds.max,
    suggestedPrice: suggested,
    production: Math.round(clampN(b.production, 0, maxProd)),
    maxProduction: maxProd,
    inventory: Math.max(0, Math.round(b.inventory)),
    expectedDemand: Math.max(0, Math.round(expected)),
    marketNote: [marketNote(g, b, lastCycle), economicReportSummary(b)].filter(Boolean).join(' ') + (bounds.cap !== null ? ` You promised to keep prices at or below ${unitMoney(bounds.max)} this year.` : ''),
    lines,
    ...(hasTalent(g, 'Business') ? { talentHint: planHint(g, a, b) } : {}),
    ...(chart ? { chart: toJson(chart) } : {}),
  }
}

/**
 * The Business talent's plan for next year: the price and production with the best expected
 * profit, scored on the same demand and cost model the year itself runs on (economy.bestPlan).
 */
export function planHint(g: GameState, a: Asset, b: BizState): NonNullable<AnnualReportData['talentHint']> {
  const def = industryDef(b.industry)
  const p = bestPlan(g, b, { ownerDraw: runsIt(g, a) ? b.ownerSalary : 0, maxPrice: priceCapOf(g, a.id) ?? undefined })
  const what = `Charge ${unitMoney(p.price)} and make ${units(p.production)} ${p.production === 1 ? def.unitOne : def.unit}`
  const outcome = p.profit >= 0 ? `${money(p.profit)} profit` : `${money(-p.profit)} loss`
  const text =
    p.production <= 0
      ? b.inventory >= 1
        ? `Charge ${unitMoney(p.price)} and make nothing new: sell the ${units(b.inventory)} ${b.inventory < 1.5 ? def.unitOne : def.unit} in stock (about ${outcome})`
        : `Make nothing next year: every ${def.unitOne} would cost more than it brings in (about ${outcome})`
      : p.profit >= 0
        ? `${what}: the sweet spot for next year (about ${money(p.profit)} profit)`
        : `${what}: the least-bad plan for next year (still about a ${money(-p.profit)} loss)`
  return { price: p.price, production: p.production, text: talentHint(g, 'Business', text) }
}

export const REPORT = defineScript('business.annualReport', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a) return
  const b = bizOf(g, a)
  const plan = parsePlan(g, b, choice, a.id)
  applyPlan(b, plan)
  if (choice !== 'skip') log(g, `I set ${a.name}'s price at ${plan.price >= 100 ? money(plan.price) : formatCents(plan.price)} and planned ${units(plan.production)} ${industryDef(b.industry).unit} for the year.`)
})

export function queueReport(g: GameState, a: Asset, b: BizState): void {
  if (isFinanceFirm(b)) return queueFinanceReport(g, a, b)
  // Game studios plan games, not prices and production: they get a studio report instead.
  if (isStudio(b)) {
    queueStudioReport(g, a, b)
    return
  }
  if (isDeepTech(b) && deepTechReport(g, a, b)) return
  minigame(g, 'annualReport', `${a.name}: Annual Report`, REPORT, toJson(reportData(g, a, b)))
}

// ---------------------------------------------------------------------------
// Cash crunch

/** How much the company can still borrow (secured on equipment and revenue). */
export function companyCreditLimit(b: BizState, g?: GameState): number {
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  const credit = g ? economyOf(g, b.countryId).credit : 1
  return Math.max(0, Math.round((equipmentValue(b) * 0.6 + revenue * 0.35 + Math.max(0, b.valuation) * 0.2) * credit - b.debt))
}

export function companyLoanRate(b: BizState, g?: GameState): number {
  const risk = b.last && b.last.net < 0 ? 0.03 : 0.01
  return Math.round(Math.max(.005, baseLoanRate(b.countryId, 'business', g?.year) + risk + (g ? lendingConditions(g, b.countryId).spread : 0)) * 10000) / 10000
}

const CRUNCH = defineScript('business.crunch', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a) return
  const b = bizOf(g, a)
  resolveCrunch(g, a, b, choice)
  // Still in business: on to the plan for the year.
  if (findBusiness(g, a.id) && runsIt(g, a) && !g.character.prison) queueReport(g, a, b)
})

function resolveCrunch(g: GameState, a: Asset, b: BizState, choice: string): void {
  const need = Math.max(0, -b.cash)
  if (need <= 0) return
  const c = g.character
  if (choice === 'cover' && c.money >= need) {
    addMoney(g, -need)
    b.cash = 0
    b.invested += need
    log(g, `I put ${money(need)} of my own money into ${a.name} to keep it afloat.`)
    notice(g, 'Bailed Out', `You moved ${formatMoney(need)} from your savings into ${a.name}. Payroll clears; your bank balance winces.`, { emoji: '\u{1F6DF}' })
    return
  }
  if (choice === 'loan' && companyCreditLimit(b, g) >= Math.round(need * 1.1)) {
    const amount = Math.round(need * 1.1)
    b.debt += amount
    b.debtRate = companyLoanRate(b, g)
    b.cash += amount
    log(g, `${a.name} took an emergency loan.`, 'neutral')
    notice(g, 'Emergency Loan', `The bank lent ${a.name} ${formatMoney(amount)} at ${pct(b.debtRate, 1)}. The company's debt is now ${formatMoney(b.debt)}.`, { emoji: '\u{1F3E6}' })
    return
  }
  if (choice === 'investor' && b.valuation > need && b.share > 0.2) {
    const inject = Math.round(need * 1.25)
    const stake = clampN(inject / (b.valuation + inject), 0.05, 0.6)
    b.share = clampN(b.share * (1 - stake), 0.01, 1)
    diluteBusinessEquity(b, 1 - stake)
    b.cash += inject
    log(g, `I sold part of ${a.name} to an investor to cover a cash shortfall.`, 'neutral')
    notice(g, 'New Investor', `An investor put ${formatMoney(inject)} into ${a.name} for ${pct(stake)} of the company. You now own ${pct(b.share)}.`, { emoji: '\u{1F4BC}' })
    return
  }
  declareBankruptcy(g, a, b, `With ${formatMoney(need)} of bills it couldn't pay,`)
}

/**
 * What each way out of a cash crunch is worth to the owner (the owner's stake afterwards, minus
 * their own money put in), from the numbers resolveCrunch uses. Bankruptcy keeps nothing.
 */
export function crunchValues(b: BizState, g?: GameState): Record<string, number> {
  const need = Math.max(0, -b.cash)
  const filled = valuationOf({ ...b, cash: 0 })
  const loan = Math.round(need * 1.1)
  const inject = Math.round(need * 1.25)
  const stake = clampN(inject / (Math.max(0, b.valuation) + inject), 0.05, 0.6)
  return {
    cover: b.share * filled - need,
    loan: b.share * (filled - need) - b.share * loan * companyLoanRate(b, g) * 2,
    investor: b.share * (1 - stake) * Math.max(0, filled + inject - need),
    bankrupt: 0,
  }
}

function queueCrunch(g: GameState, a: Asset, b: BizState): void {
  const need = Math.max(0, -b.cash)
  const choices: ChoiceOption[] = []
  if (g.character.money >= need) choices.push({ id: 'cover', label: `Cover it from my savings (${money(need)})`, emoji: '\u{1F6DF}' })
  if (companyCreditLimit(b, g) >= Math.round(need * 1.1)) choices.push({ id: 'loan', label: `Emergency company loan (${pct(companyLoanRate(b, g), 1)})`, emoji: '\u{1F3E6}' })
  if (b.valuation > need && b.share > 0.2) choices.push({ id: 'investor', label: 'Sell part of the company to an investor', emoji: '\u{1F4BC}' })
  choices.push({ id: 'bankrupt', label: 'Declare bankruptcy', emoji: '\u{1F4C9}' })
  const values = hasTalent(g, 'Business') ? crunchValues(b, g) : {}
  // Ties go to the earlier option (your own money before the bank's, the bank's before a stranger's).
  // A company that keeps losing money is worth saving to sell, not to keep feeding.
  const losses = b.history.slice(-2)
  const bleeding = losses.length === 2 && losses.every((r) => r.profit < 0) ? ` (but it lost ${money(-losses[1].profit)} last year: think about selling while a buyer would still pay about ${money(b.valuation)})` : ''
  markBest(g, choices, (id) => (id in values ? values[id] - choices.findIndex((c) => c.id === id) : null), (id) =>
    id === 'bankrupt' ? `Best move: ${a.name} is worth less than the hole it is in` : id === 'investor' ? `Best move: a fair price for a slice beats debt or your savings${bleeding}` : id === 'loan' ? `Best move: borrow your way through it${bleeding}` : `Best move: your stake is worth more than the bailout${bleeding}`,
  )
  scriptChoice(
    g,
    CRUNCH,
    'Cash Crunch',
    `${a.name} is ${formatMoney(need)} in the red. Suppliers want paying and payroll is due Friday. What do you do?`,
    choices,
    { emoji: '\u{1F6A8}', data: { assetId: a.id } },
  )
}

// ---------------------------------------------------------------------------
// The year

function yearLog(g: GameState, a: Asset, s: Statement): void {
  if (s.net >= 0) log(g, `${a.name} made ${money(s.net)} in profit on ${money(s.revenue)} of sales.`, 'good')
  else log(g, `${a.name} lost ${money(-s.net)} on ${money(s.revenue)} of sales.`, 'bad')
}

function updateJob(g: GameState, a: Asset, b: BizState, s: Statement): void {
  const job = ceoJob(g, a.id)
  if (!job) return
  const c = g.character
  const start = num(job.data.startAge, c.age - job.yearsAtCompany)
  const role = num(job.data.roleStartAge, start)
  job.yearsAtCompany = Math.max(0, c.age - start)
  job.yearsInRole = Math.max(0, c.age - role)
  job.company = a.name
  job.salary = b.ownerSalary
  const prev = b.history.length >= 2 ? b.history[b.history.length - 2] : null
  const margin = s.revenue > 0 ? s.net / s.revenue : -0.2
  const growth = prev && prev.revenue > 0 ? s.revenue / prev.revenue - 1 : 0
  job.performance = Math.round(clampN(50 + margin * 150 + growth * 40, 5, 100))
}

/** The hired (or interim) CEO's plan for the coming year, by kind of company. */
function hiredCeoTurn(g: GameState, a: Asset, b: BizState, lastCycle: number): void {
  if (isStudio(b)) studioManagerTurn(g, a, b)
  // A deep-tech manager plans price and output with the tech model; the generic autoPlan can't see it.
  else if (isDeepTech(b)) deepTechManagerTurn(g, a, b)
  else if (isFinanceFirm(b)) financeManagerTurn(g, b)
  else managerTurn(g, a, b, lastCycle)
}

/** One fiscal year for every business the player owns. */
/**
 * Once per event: when a real boom or bust (history/market-events.ts) first hits hard where you
 * have companies, say what it is and how each of them is exposed. The id is deterministic, so
 * the announcement never shifts later ids.
 */
function announceMarketEvents(g: GameState, list: Asset[]): void {
  const raw = g.flags['market.events']
  const seen = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  let changed = false
  for (const e of MARKET_EVENTS) {
    if (seen.has(e.id)) continue
    const hit = list.map((a) => ({ a, b: readBiz(g, a) })).filter(({ b }) => eventStrength(e, b.countryId, g.year) >= 0.5 && eventStrength(e, b.countryId, g.year - 1) < 0.5)
    if (!hit.length) continue
    seen.add(e.id)
    changed = true
    const impacts = hit.slice(0, 6).map(({ a, b }) => ({ a, impact: marketEventImpacts(b.industry, b.countryId, g.year, marketDef(b.industry).scope === 'world').find((x) => x.event.id === e.id) }))
    const lines = impacts.map(({ a, impact }) => `${a.name}: ${impact ? impact.text.charAt(0).toLowerCase() + impact.text.slice(1) : 'barely touched.'}`)
    const good = impacts.filter(({ impact }) => impact && impact.value >= 1 && impact.demand >= 1).length > impacts.length / 2
    g.queue.push({ kind: 'notice', id: `mkt-${e.id}-${g.generation}-${g.year}`, title: e.name, emoji: e.emoji, text: `${e.text} Your companies: ${lines.join(' ')}${hit.length > 6 ? ` (and ${hit.length - 6} more)` : ''} Market & Competition shows the details.`, tone: good ? 'good' : 'bad' })
  }
  if (changed) g.flags['market.events'] = [...seen]
}

/**
 * Listed companies and groups you hold none of any more (a sell-out from before v2.4.0 left them
 * at 0% when relatives held family shares) leave your companies; the relatives keep their shares
 * as their own wealth. Private family holdings an excluded heir can see stay (docs/DYNASTY.md).
 */
function leaveUnownedListed(g: GameState): void {
  for (const row of groupsOf(g)) {
    if (!row.core.listing || row.core.share > 1e-6) continue
    const grp = liveGroup(g, row.core.id)
    if (!grp?.core.listing) continue
    const relatives = leaveListedGroup(g, grp, sharePriceOf(grp) * grp.core.listing.sharesOut)
    notice(g, 'No Longer Yours', `You own none of ${grp.core.name} any more, so it has left your companies.${familyNote(relatives)}`, { emoji: '\u{1F4B8}' })
  }
  for (const a of businessAssets(g)) {
    const b = bizOf(g, a)
    if (!b.public || inGroup(g, b) || b.share > 1e-6) continue
    const relatives = leaveListedCompany(g, a, b)
    notice(g, 'No Longer Yours', `You own none of ${a.name} any more, so it has left your companies.${familyNote(relatives)}`, { emoji: '\u{1F4B8}' })
  }
}

export function yearlyBusinessImpl(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  // Late relatives' stakes pass to their heirs before anything pays or values them.
  settleLateFamilyOwners(g)
  leaveUnownedListed(g)
  syncCeo(g)
  prepareGroupManagement(g)
  // Last year's price promises end with the year that was just booked.
  prunePricePromises(g)
  const list = businessAssets(g)
  // Stored tech waves step even with no company (the unit is the game year, once, behind each wave's marker).
  if (list.length === 0) { advanceTechWaves(g); return }
  announceMarketEvents(g, list)
  const fiscal = g.year - 1
  prepareInternalServices(g, fiscal)
  const queued = g.queue.length
  recoverConfidence(g)
  let eventQueued = false
  const statementBridges = new Map<string, { previous: Statement | null; bookedNet: number }>()
  const dividends: DividendResult[] = []
  for (const a of list) {
    if (!findBusiness(g, a.id)) continue
    const b = bizOf(g, a)
    if (b.founded > fiscal || (b.last && b.last.year >= fiscal)) continue
    if (isFinanceFirm(b) && financeSettledYear(b) >= fiscal) continue
    const previousStatement = b.last ? { ...b.last } : null
    const runs = runsIt(g, a)
    const prevNet = b.history.length ? b.history[b.history.length - 1].profit : null
    const studio = isStudio(b)
    const tech = isDeepTech(b)
    // Franchisees' royalties for the year, booked once through yearIncome (business/franchise.ts).
    bookFranchiseYear(g, a, b, fiscal)
    // Cash a company puts to work in a hedge fund, booked once through yearIncome or yearCosts (business/hedge-company.ts).
    bookHedgeYear(g, a, b, fiscal)
    // The research lab's tax credit, grant, royalties and team pay for the year, booked once the same way (business/lab-year.ts).
    bookLabYear(g, a, b, fiscal)
    prepareVenueYear(g, a, b, fiscal)
    // The Operations Desk of food, care and utility trades writes the generic channels (business/sector-core.ts).
    prepareSectorYear(g, a, b, fiscal)
    executiveOperations(g, b, fiscal, a.id)
    if (b.ceo === 'manager' && isFinanceFirm(b)) financeManagerTurn(g, b)
    const previousRevenue = b.last?.revenue ?? 0
    const previousEmployment = b.last?.employees ?? b.employees
    // Workshop inventions made here were booked by the 'workshop' hook (b.cash + b.yearIncome):
    // the statement counts them once as other income, taxed at headquarters.
    const res = studio ? simulateStudioYear(g, a, b, fiscal, runs ? b.ownerSalary : 0) : tech ? simulateDeepTechYear(g, a, b, fiscal, runs ? b.ownerSalary : 0) : simulateYear(g, b, fiscal, runs ? b.ownerSalary : 0)
    const s = res.stmt
    if (s.ownerPay > 0) earnIncome(g, s.ownerPay)
    recordEconomicReport(b, previousStatement, s)
    statementBridges.set(a.id, { previous: previousStatement, bookedNet: s.net })
    const lastCycle = s.cycle
    // Who sold what in its market this year (share, rivals, newcomers): before evolve() resets the year.
    refreshMarket(g, a, b, fiscal, s, res.market ?? null)
    recordCompanyShock(g, b, previousRevenue, s.revenue, a.id)
    recordEconomicActivity(g, `company:${a.id}:${fiscal}`, b.countryId, b.industry, {
      jobs: s.employees - previousEmployment, investment: Math.max(0, b.yearCosts),
      // Banks report actual client-book losses separately. Revenue fluctuations
      // are not a second default; only other unfunded costs add generic distress.
      failure: res.bank ? Math.max(0, -b.cash - res.bank.bankLoss) : Math.max(0, previousRevenue - s.revenue) + Math.max(0, -b.cash),
      ...res.bank,
    })
    // evolve() clears the year's owner bonuses (they are already inside s.other); the books keep them as a memo.
    const draws = Math.max(0, b.ownerDraws ?? 0)
    evolve(g, b, s, fiscal)
    if (studio) afterStudioYear(a, b)
    if (tech) afterDeepTechYear(g, a, b)
    // The tech-wave mood of the booked year, before anything values the company (business/tech-waves.ts).
    stampWave(g, b, fiscal)
    const rec0 = recordYear(b, s, { draws })
    b.valuation = b.public ? updateSharePrice(g, b, fiscal) : valuationOf(b)
    rec0.valuation = b.valuation
    refreshValue(a, b)
    b.slump = prevNet !== null && s.net < prevNet ? b.slump + 1 : 0
    if (b.cooked > 0) b.cooked += 1
    staffTurnover(g, a, b)
    updateJob(g, a, b, s)
    yearLog(g, a, s)
    if (res.unpaidSalary > 0 && runs) log(g, `${a.name} couldn't afford to pay me ${money(res.unpaidSalary)} of my salary.`, 'bad')
    if (runs) {
      addStat(g, 'happiness', s.net > 0 ? (prevNet !== null && s.net > prevNet ? 3 : 1) : -3)
      if (totalOutlets(b) >= 10 && chance(g, 0.3)) addStat(g, 'health', -1)
    }
    if (s.net > 0) count(g, 'businessProfit', s.net)
    // The board reviews the year (business/board.ts): the CEO's pay and bonus, warnings, firing a
    // CEO who keeps missing (the owner too, when they don't control the board), rogue CEOs.
    boardYear(g, a, b, s)
    executiveRetentionYear(g, a, b)
    // Shares of a CEO who left by any path go back to the founder (groups settle when saved).
    returnFormerExecutiveShares(g, b)

    // A group's division lists with the whole group (the group step has its own hint).
    if (!b.public && !inGroup(g, b) && s.net >= ipoThreshold(b) && g.flags[`biz.ipoHint.${a.id}`] !== true) {
      g.flags[`biz.ipoHint.${a.id}`] = true
      notice(g, 'Ready for Wall Street?', `${a.name} made ${money(s.net)} last year. That's big enough to list on a stock exchange: bankers keep calling about an IPO. You can go public from the company's screen.`, { emoji: '\u{1F514}', tone: 'good' })
    }
    // Milestones reached this year (one popup a year for all companies; business/milestones.ts).
    milestoneYear(g, a, b)
    // The company's standing yearly dividend rule, if it has one (business/dividend-year.ts).
    const paidOut = autoDividendYear(g, a, b, s)
    if (paidOut) { dividends.push(paidOut); dividendLog(g, paidOut) }

    // A group's treasury covers a division's cash hole from its sisters' spare cash first.
    if (b.cash < 0) groupRescue(g, a, b)
    if (b.cash < 0) {
      queueCrunch(g, a, b)
      // A hired (or interim) CEO still plans the coming year; the popup only decides how the hole
      // is filled. Without this a managed company in a crunch kept last year's stale plan forever.
      if (!runsIt(g, a) || c.prison) hiredCeoTurn(g, a, b, lastCycle)
      continue
    }
    const managed = !runsIt(g, a)
    const plans = !managed && !c.prison
    // The CEO plans the year first; this year's event strikes the plan they just made. (Shown the
    // other way round, the report's numbers and the Business talent's plan would be stale, a
    // price cut from a price war would be undone by the report, and a company sold in a buyout
    // would still get a report.)
    if (plans) queueReport(g, a, b)
    // A family event of the Operations Desk comes first; a generic event is skipped that year (business/sector-events.ts).
    if (!eventQueued && maybeSectorEvent(g, a, b, fiscal, managed)) eventQueued = true
    if (!eventQueued && (maybeVenueOwnerEvent(g, a, b, fiscal, managed) || (studio && maybeStudioEvent(g, a, b, fiscal, managed)) || (tech && maybeDeepTechEvent(g, a, b, fiscal, managed)) || maybeBusinessEvent(g, a, b, fiscal, managed))) eventQueued = true
    // Regulators come for dominant companies on their own schedule (not the random-event roll).
    maybeAntitrust(g, a, b, fiscal, managed)
    if (!plans) hiredCeoTurn(g, a, b, lastCycle)
  }
  queueDividends(g, dividends)
  // Groups of companies (business/conglomerate.ts): synergies, pooled cash, the group board.
  settleInternalServices(g, fiscal)
  // Internal invoices can amend both divisions' final tax/net statements. Rebuild
  // attribution from the same opening statement, without recording another payment.
  for (const [id, bridge] of statementBridges) {
    const a = findBusiness(g, id)
    if (!a) continue
    const b = bizOf(g, a)
    if (!b.last || b.last.year !== fiscal) continue
    recordEconomicReport(b, bridge.previous, b.last)
    if (b.last.net !== bridge.bookedNet) for (const modal of g.queue.slice(queued)) {
      if ((modal.kind === 'notice' || modal.kind === 'choice') && (modal.title === `${a.name}: Studio Report` || modal.title === `${a.name}: Financial Institution Report`)) {
        modal.text += `\nFinal accounts after group contracts: sales ${money(b.last.revenue)}, net profit ${money(b.last.net)}. ${economicReportSummary(b)}`
      }
    }
  }
  // Internal procurement closes after all divisions have booked. Refresh already queued
  // statements so the owner sees the final ledger, not the pre-contract numbers.
  for (const modal of Array.isArray(g.flags.groupServiceResults) && g.flags.groupServiceResults.length ? g.queue.slice(queued) : []) {
    if (modal.kind !== 'minigame' || modal.game !== 'annualReport') continue
    const a = findBusiness(g, str(rec(modal.data)?.assetId))
    if (a) modal.data = toJson(reportData(g, a, bizOf(g, a)))
  }
  yearlyConglomerates(g)
  groupRetentionYear(g)
  bundleCeoLetters(g, queued)
  // Last, because a wave's delivery follows what its company booked this pass (business/tech-waves.ts).
  advanceTechWaves(g)
}

const LETTER_SUFFIX = ': Letter from the CEO'
/** More CEO letters than this in one year are read as one bundle (an empire shouldn't mean ten popups). */
const LETTERS_APART = 2
/** Lines kept per company in the bundle (the company screen shows its last letter too). */
const BUNDLE_LINES = 3

/** Fold this year's CEO letters (career.ceoLetter) into one popup when there are many. */
export function bundleCeoLetters(g: GameState, from: number): void {
  const letters = g.queue.slice(from).filter((m): m is NoticeModal => m.kind === 'notice' && m.title.endsWith(LETTER_SUFFIX))
  if (letters.length <= LETTERS_APART) return
  const sections = letters.map((m) => {
    const name = m.title.slice(0, -LETTER_SUFFIX.length)
    const bullets = m.text.split('\n').filter((x) => x.startsWith('\u{2022}'))
    const more = bullets.length - BUNDLE_LINES
    const sign = m.text.split('\n').find((x) => x.startsWith('\u{2014}'))
    return `${name}${sign ? ` \u{00B7} ${sign.replace(/^\u{2014}\s*/u, '')}` : ''}:\n${bullets.slice(0, BUNDLE_LINES).join('\n')}${more > 0 ? `\n\u{2022} \u{2026}and ${plural(more, 'more change')}` : ''}`
  })
  const at = g.queue.indexOf(letters[0])
  const drop = new Set<string>(letters.map((m) => m.id))
  const bundle: NoticeModal = { ...letters[0], title: 'Letters from Your CEOs', text: `Letters from your CEOs, ${g.year}.\n\n${sections.join('\n\n')}`, emoji: '\u{1F4EC}' }
  g.queue = g.queue.filter((m) => !drop.has(m.id))
  g.queue.splice(Math.min(at, g.queue.length), 0, bundle)
}
