// The yearly business loop: simulate every company in its own market, pay the owner, update the
// valuation, then hand the CEO the Annual Report (price + production for next year).
import { addMoney, addStat, count, earnIncome, formatCents, formatMoney, log, minigame, notice, scriptChoice } from '../core'
import { marketOf } from '../data/markets'
import { baseLoanRate } from '../finance'
import { chance, rand } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { AnnualReportData, Asset, ChoiceOption, GameState, NoticeModal } from '../types'
import { getCountry } from '../world'
import { boardYear } from './board'
import { ceoLetter, smartCeo, smartManagerTurn } from './board-ceo'
import { styleOf, syncCeo } from './career'
import { executiveOperations, executiveRetentionYear, groupRetentionYear } from './executive'
import { inventionYear } from './expansion'
import { recordCompanyShock, recoverConfidence } from './dynamics'
import { groupRescue, inGroup, yearlyConglomerates } from './conglomerate'
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
import { declareBankruptcy, ipoThreshold } from './exit'
import { marketOwner, marketViewOf, refreshMarket, shareText } from './competition'
import { maybeAntitrust } from './competition-events'
import { maybeBusinessEvent } from './events'
import { afterDeepTechYear, deepTechManagerTurn, deepTechReport, isDeepTech, maybeDeepTechEvent, simulateDeepTechYear } from './deeptech'
import { afterStudioYear, isStudio, maybeStudioEvent, queueStudioReport, simulateStudioYear, studioManagerTurn } from './gamestudio'
import { industryDef } from './industries'
import { staffTurnover } from './staff'
import { bizCountryName, bizOf, businessAssets, ceoJob, diluteManagerEquity, findBusiness, runsIt, stakeValue, totalOutlets, type BizState, type CeoStyle, type Statement } from './state'
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
    ceoLetter(g, a, b, [`Kept things ticking over: ${unitMoney(plan.price)} per ${def.unitOne} and ${units(plan.production)} ${plan.production === 1 ? def.unitOne : def.unit} planned for next year.`], false)
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
  if (s.other > 0) lines.push(line('One-off costs', signed(-s.other)))
  if (s.otherIncome > 0) lines.push(line('Other income', money(s.otherIncome), 'good'))
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
  return lines
}

function marketNote(g: GameState, b: BizState, lastCycle: number): string {
  const m = marketOf(b.countryId)
  const def = industryDef(b.industry)
  const e = localEcon(b.industry, b.countryId, b.city)
  const country = getCountry(b.countryId).name
  const parts = [`${country}'s economy is ${cycleLabel(lastCycle)}.`]
  if (e.demandMult >= 1.3) parts.push(`${def.label}s are in hot demand here.`)
  else if (e.demandMult > 0 && e.demandMult <= 0.7) parts.push(`Demand for ${def.label.toLowerCase()}s is thin here.`)
  parts.push(`Locals typically pay about ${e.goingPrice >= 100 ? money(e.goingPrice) : formatCents(e.goingPrice)} per ${def.unitOne}.`)
  if (m.inflation >= 0.15) parts.push(`Inflation runs ${Math.round(m.inflation * 100)}% a year: reprice every year or your prices go stale.`)
  const v = marketViewOf(g, b)
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
    marketNote: marketNote(g, b, lastCycle) + (bounds.cap !== null ? ` You promised to keep prices at or below ${unitMoney(bounds.max)} this year.` : ''),
    lines,
    ...(hasTalent(g, 'Business') ? { talentHint: planHint(g, a, b) } : {}),
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
export function companyCreditLimit(b: BizState): number {
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.max(0, Math.round(equipmentValue(b) * 0.6 + revenue * 0.35 + Math.max(0, b.valuation) * 0.2 - b.debt))
}

export function companyLoanRate(b: BizState): number {
  const risk = b.last && b.last.net < 0 ? 0.03 : 0.01
  return Math.round((baseLoanRate(b.countryId, 'business') + risk) * 10000) / 10000
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
  if (choice === 'loan' && companyCreditLimit(b) >= need) {
    const amount = Math.round(need * 1.1)
    b.debt += amount
    b.debtRate = companyLoanRate(b)
    b.cash += amount
    log(g, `${a.name} took an emergency loan.`, 'neutral')
    notice(g, 'Emergency Loan', `The bank lent ${a.name} ${formatMoney(amount)} at ${pct(b.debtRate, 1)}. The company's debt is now ${formatMoney(b.debt)}.`, { emoji: '\u{1F3E6}' })
    return
  }
  if (choice === 'investor' && b.valuation > need && b.share > 0.2) {
    const inject = Math.round(need * 1.25)
    const stake = clampN(inject / (b.valuation + inject), 0.05, 0.6)
    b.share = clampN(b.share * (1 - stake), 0.01, 1)
    diluteManagerEquity(b.manager, 1 - stake)
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
export function crunchValues(b: BizState): Record<string, number> {
  const need = Math.max(0, -b.cash)
  const filled = valuationOf({ ...b, cash: 0 })
  const loan = Math.round(need * 1.1)
  const inject = Math.round(need * 1.25)
  const stake = clampN(inject / (Math.max(0, b.valuation) + inject), 0.05, 0.6)
  return {
    cover: b.share * filled - need,
    loan: b.share * (filled - need) - b.share * loan * companyLoanRate(b) * 2,
    investor: b.share * (1 - stake) * Math.max(0, filled + inject - need),
    bankrupt: 0,
  }
}

function queueCrunch(g: GameState, a: Asset, b: BizState): void {
  const need = Math.max(0, -b.cash)
  const choices: ChoiceOption[] = []
  if (g.character.money >= need) choices.push({ id: 'cover', label: `Cover it from my savings (${money(need)})`, emoji: '\u{1F6DF}' })
  if (companyCreditLimit(b) >= need) choices.push({ id: 'loan', label: `Emergency company loan (${pct(companyLoanRate(b), 1)})`, emoji: '\u{1F3E6}' })
  if (b.valuation > need && b.share > 0.2) choices.push({ id: 'investor', label: 'Sell part of the company to an investor', emoji: '\u{1F4BC}' })
  choices.push({ id: 'bankrupt', label: 'Declare bankruptcy', emoji: '\u{1F4C9}' })
  const values = hasTalent(g, 'Business') ? crunchValues(b) : {}
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

/** One fiscal year for every business the player owns. */
export function yearlyBusinessImpl(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  syncCeo(g)
  // Last year's price promises end with the year that was just booked.
  prunePricePromises(g)
  const list = businessAssets(g)
  if (list.length === 0) return
  const fiscal = g.year - 1
  const queued = g.queue.length
  recoverConfidence(g)
  let eventQueued = false
  for (const a of list) {
    if (!findBusiness(g, a.id)) continue
    const b = bizOf(g, a)
    if (b.founded > fiscal) continue
    const runs = runsIt(g, a)
    const prevNet = b.history.length ? b.history[b.history.length - 1].profit : null
    const studio = isStudio(b)
    const tech = isDeepTech(b)
    executiveOperations(g, b, fiscal, a.id)
    const previousRevenue = b.last?.revenue ?? 0
    const res = studio ? simulateStudioYear(g, a, b, fiscal, runs ? b.ownerSalary : 0) : tech ? simulateDeepTechYear(g, a, b, fiscal, runs ? b.ownerSalary : 0) : simulateYear(g, b, fiscal, runs ? b.ownerSalary : 0)
    const s = res.stmt
    if (s.ownerPay > 0) earnIncome(g, s.ownerPay)
    const lastCycle = s.cycle
    // Who sold what in its market this year (share, rivals, newcomers): before evolve() resets the year.
    refreshMarket(g, a, b, fiscal, s, res.market ?? null)
    recordCompanyShock(g, b, previousRevenue, s.revenue, a.id)
    evolve(g, b, s, fiscal)
    if (studio) afterStudioYear(a, b)
    if (tech) afterDeepTechYear(g, a, b)
    const rec0 = recordYear(b, s)
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
    inventionYear(g, a, b)
    executiveRetentionYear(g, a, b)

    // A group's division lists with the whole group (the group step has its own hint).
    if (!b.public && !inGroup(g, b) && s.net >= ipoThreshold(b) && g.flags[`biz.ipoHint.${a.id}`] !== true) {
      g.flags[`biz.ipoHint.${a.id}`] = true
      notice(g, 'Ready for Wall Street?', `${a.name} made ${money(s.net)} last year. That's big enough to list on a stock exchange: bankers keep calling about an IPO. You can go public from the company's screen.`, { emoji: '\u{1F514}', tone: 'good' })
    }

    // A group's treasury covers a division's cash hole from its sisters' spare cash first.
    if (b.cash < 0) groupRescue(g, a, b)
    if (b.cash < 0) {
      queueCrunch(g, a, b)
      continue
    }
    const managed = !runsIt(g, a)
    const plans = !managed && !c.prison
    // The CEO plans the year first; this year's event strikes the plan they just made. (Shown the
    // other way round, the report's numbers and the Business talent's plan would be stale, a
    // price cut from a price war would be undone by the report, and a company sold in a buyout
    // would still get a report.)
    if (plans) queueReport(g, a, b)
    if (!eventQueued && ((studio && maybeStudioEvent(g, a, b, fiscal, managed)) || (tech && maybeDeepTechEvent(g, a, b, fiscal, managed)) || maybeBusinessEvent(g, a, b, fiscal, managed))) eventQueued = true
    // Regulators come for dominant companies on their own schedule (not the random-event roll).
    maybeAntitrust(g, a, b, fiscal, managed)
    if (!plans) {
      if (studio) studioManagerTurn(g, a, b)
      // A deep-tech manager plans price and output with the tech model; the generic autoPlan can't see it.
      else if (tech) deepTechManagerTurn(g, a, b)
      else managerTurn(g, a, b, lastCycle)
    }
  }
  // Groups of companies (business/conglomerate.ts): synergies, pooled cash, the group board.
  yearlyConglomerates(g)
  groupRetentionYear(g)
  bundleCeoLetters(g, queued)
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
  const bundle: NoticeModal = { ...letters[0], title: 'Letters from Your CEOs', text: `Dear ${g.character.firstName}, here's what your CEOs did this year.\n\n${sections.join('\n\n')}`, emoji: '\u{1F4EC}' }
  g.queue = g.queue.filter((m) => !drop.has(m.id))
  g.queue.splice(Math.min(at, g.queue.length), 0, bundle)
}
