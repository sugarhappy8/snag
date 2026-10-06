// The yearly business loop: simulate every company in its own market, pay the owner, update the
// valuation, then hand the CEO the Annual Report (price + production for next year).
import { addMoney, addStat, count, earnIncome, formatMoney, log, minigame, notice, scriptChoice } from '../core'
import { marketOf } from '../data/markets'
import { baseLoanRate } from '../finance'
import { chance, rand } from '../rng'
import { defineScript } from '../scripts'
import type { AnnualReportData, Asset, GameState } from '../types'
import { getCountry } from '../world'
import { syncCeo, stepDown, managerCandidate } from './career'
import {
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
import { maybeBusinessEvent } from './events'
import { afterDeepTechYear, deepTechManagerTurn, deepTechReport, isDeepTech, maybeDeepTechEvent, simulateDeepTechYear } from './deeptech'
import { afterStudioYear, isStudio, maybeStudioEvent, queueStudioReport, simulateStudioYear, studioManagerTurn } from './gamestudio'
import { industryDef } from './industries'
import { staffTurnover } from './staff'
import { bizCountryName, bizOf, businessAssets, ceoJob, findBusiness, runsIt, stakeValue, totalOutlets, type BizState, type Statement } from './state'
import { clampN, money, num, pct, plural, rec, round2, str, toJson, units } from './util'

// ---------------------------------------------------------------------------
// Plans

export interface PlanChoice {
  price: number
  production: number
}

/** Parse and clamp an Annual Report result (never trust it). 'skip' keeps last year's plan. */
export function parsePlan(g: GameState, b: BizState, raw: string): PlanChoice {
  const bounds = priceBounds(b)
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

/** What a general manager decides for next year. */
export function autoPlan(g: GameState, b: BizState, lastCycle: number): PlanChoice {
  const bounds = priceBounds(b)
  const skill = b.manager?.skill ?? 50
  const sloppiness = (1 - skill / 100) * 0.12
  const suggested = planFor(g, b, g.year, { calm: true }).suggested
  const price = round2(clampN(suggested * (1 + (rand(g) - 0.5) * 2 * sloppiness), bounds.min, bounds.max))
  const plan = planFor(g, b, g.year, { price, calm: true, cycle: () => lastCycle })
  const production = Math.round(clampN(plan.demand * (1.02 + (rand(g) - 0.5) * sloppiness) - b.inventory, 0, maxProduction(g, b)))
  return { price, production }
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

function marketNote(b: BizState, lastCycle: number): string {
  const m = marketOf(b.countryId)
  const def = industryDef(b.industry)
  const e = localEcon(b.industry, b.countryId, b.city)
  const country = getCountry(b.countryId).name
  const parts = [`${country}'s economy is ${cycleLabel(lastCycle)}.`]
  if (e.demandMult >= 1.3) parts.push(`${def.label}s are in hot demand here.`)
  else if (e.demandMult > 0 && e.demandMult <= 0.7) parts.push(`Demand for ${def.label.toLowerCase()}s is thin here.`)
  parts.push(`Locals typically pay about ${e.goingPrice >= 100 ? money(e.goingPrice) : `$${e.goingPrice.toFixed(2)}`} per ${def.unitOne}.`)
  if (m.inflation >= 0.15) parts.push(`Inflation runs ${Math.round(m.inflation * 100)}% a year: reprice every year or your prices go stale.`)
  return parts.join(' ')
}

/** Everything the Annual Report minigame needs (satisfies AnnualReportData exactly). */
export function reportData(g: GameState, a: Asset, b: BizState): AnnualReportData {
  const def = industryDef(b.industry)
  const bounds = priceBounds(b)
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
    marketNote: marketNote(b, lastCycle),
    lines,
  }
}

export const REPORT = defineScript('business.annualReport', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a) return
  const b = bizOf(g, a)
  const plan = parsePlan(g, b, choice)
  applyPlan(b, plan)
  if (choice !== 'skip') log(g, `I set ${a.name}'s price at ${plan.price >= 100 ? money(plan.price) : `$${plan.price.toFixed(2)}`} and planned ${units(plan.production)} ${industryDef(b.industry).unit} for the year.`)
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
    b.cash += inject
    log(g, `I sold part of ${a.name} to an investor to cover a cash shortfall.`, 'neutral')
    notice(g, 'New Investor', `An investor put ${formatMoney(inject)} into ${a.name} for ${pct(stake)} of the company. You now own ${pct(b.share)}.`, { emoji: '\u{1F4BC}' })
    return
  }
  declareBankruptcy(g, a, b, `With ${formatMoney(need)} of bills it couldn't pay,`)
}

function queueCrunch(g: GameState, a: Asset, b: BizState): void {
  const need = Math.max(0, -b.cash)
  const choices = [] as { id: string; label: string; emoji: string }[]
  if (g.character.money >= need) choices.push({ id: 'cover', label: `Cover it from my savings (${money(need)})`, emoji: '\u{1F6DF}' })
  if (companyCreditLimit(b) >= need) choices.push({ id: 'loan', label: `Emergency company loan (${pct(companyLoanRate(b), 1)})`, emoji: '\u{1F3E6}' })
  if (b.valuation > need && b.share > 0.2) choices.push({ id: 'investor', label: 'Sell part of the company to an investor', emoji: '\u{1F4BC}' })
  choices.push({ id: 'bankrupt', label: 'Declare bankruptcy', emoji: '\u{1F4C9}' })
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
  const list = businessAssets(g)
  if (list.length === 0) return
  const fiscal = g.year - 1
  let eventQueued = false
  for (const a of list) {
    if (!findBusiness(g, a.id)) continue
    const b = bizOf(g, a)
    if (b.founded > fiscal) continue
    const runs = runsIt(g, a)
    const prevNet = b.history.length ? b.history[b.history.length - 1].profit : null
    const studio = isStudio(b)
    const tech = isDeepTech(b)
    const res = studio ? simulateStudioYear(g, a, b, fiscal, runs ? b.ownerSalary : 0) : tech ? simulateDeepTechYear(g, a, b, fiscal, runs ? b.ownerSalary : 0) : simulateYear(g, b, fiscal, runs ? b.ownerSalary : 0)
    const s = res.stmt
    if (s.ownerPay > 0) earnIncome(g, s.ownerPay)
    const lastCycle = s.cycle
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

    // A public company's board loses patience with a CEO who keeps missing.
    if (runs && b.public && b.share < 0.5 && b.slump >= 2 && chance(g, 0.35)) {
      const mgr = managerCandidate(g, b)
      stepDown(g, a, b, mgr)
      const job = c.careerHistory[c.careerHistory.length - 1]
      if (job) job.reason = 'fired'
      count(g, 'fired')
      addStat(g, 'happiness', -10)
      log(g, `The board of ${a.name} fired me as CEO.`, 'bad')
      notice(g, 'Ousted!', `After ${b.slump} straight years of falling profits, ${a.name}'s board voted to replace you as CEO with ${mgr.firstName} ${mgr.lastName}. You still own ${pct(b.share)} of the company, which is some comfort, and a lot of money.`, { emoji: '\u{1FA91}', tone: 'bad' })
    }

    if (!b.public && s.net >= ipoThreshold(b) && g.flags[`biz.ipoHint.${a.id}`] !== true) {
      g.flags[`biz.ipoHint.${a.id}`] = true
      notice(g, 'Ready for Wall Street?', `${a.name} made ${money(s.net)} last year. That's big enough to list on a stock exchange: bankers keep calling about an IPO. You can go public from the company's screen.`, { emoji: '\u{1F514}', tone: 'good' })
    }

    if (b.cash < 0) {
      queueCrunch(g, a, b)
      continue
    }
    const managed = !runsIt(g, a)
    if (!eventQueued && ((studio && maybeStudioEvent(g, a, b, fiscal, managed)) || (tech && maybeDeepTechEvent(g, a, b, fiscal, managed)) || maybeBusinessEvent(g, a, b, fiscal, managed))) eventQueued = true
    if (!managed && !c.prison) {
      queueReport(g, a, b)
    } else if (studio) {
      studioManagerTurn(g, a, b)
    } else {
      if (tech) deepTechManagerTurn(g, a, b)
      applyPlan(b, autoPlan(g, b, lastCycle))
    }
  }
}
