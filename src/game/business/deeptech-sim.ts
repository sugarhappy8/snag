// The deep-tech year: sales that depend on the stage, tech level, models, approvals and launches;
// R&D programs that progress and cost money; grants, R&D tax credits and side revenue; then the
// company's cash, with the R&D account (investor money) covering any shortfall. Replaces
// economy.simulateYear for deep-tech companies (it never runs both). Plus the yearly reports.
import { addStat, count, formatCents, log, minigame, notice, remember, scriptChoice } from '../core'
import { corporateTax, marketOf } from '../data/markets'
import { bell, chance, rand } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { AnnualReportData, Asset, ChoiceOption, GameState } from '../types'
import { stepDown, managerCandidate } from './career'
import { ceoSkill, cycleOf, insurancePremiumFor, localEcon, staffPower, valuationOf, type YearResult } from './economy'
import { DEEP_TECH, NODES, RD_CREDIT, bestModel, frontierScore, maxStage, programDef, stageName } from './deeptech-data'
import {
  PACES,
  bestTechPlan,
  burnRate,
  computeRent,
  dtInd,
  headCount,
  industryCycle,
  paceOf,
  rdScale,
  refreshTechValue,
  runwayYears,
  sellable,
  sideRevenue,
  techFunds,
  techOf,
  techPlan,
  techPriceBounds,
} from './deeptech-core'
import { advancePrograms, bestProgram, bestTrial, maxPrograms, programCost, startProgram, startTrial, trialBlock, trialCost, trialName } from './deeptech-rd'
import { milestoneListingBlock, SERIES, type Pace, type TechState } from './deeptech-state'
import { industryDef } from './industries'
import { marketViewOf, shareText } from './competition'
import { bizCountryName, bizOf, findBusiness, runsIt, stakeValue, totalOutlets, type BizState, type Statement } from './state'
import { clampN, dollars, money, pct, plural, priceCapOf, rec, round2, str, toJson, units } from './util'

// ---------------------------------------------------------------------------
// The year

/** Replaces simulateYear for deep-tech companies. */
export function simulateDeepTechYearImpl(g: GameState, a: Asset, b: BizState, year: number, ownerDraw: number): YearResult {
  const t = techOf(b)
  const ind = dtInd(b)
  const def = industryDef(ind)
  const runs = runsIt(g, a) && g.character.alive && !g.character.prison
  const noise = clampN(1 + bell(g, -80, 80) / 1000, 0.9, 1.1)
  const stageBefore = t.stage

  // A general manager plans with deep-tech numbers (the generic planner can't see the tech).
  if (!runs) {
    const best = bestTechPlan(g, b, t, cycleOf(g, b.countryId, year - 1))
    const slop = (1 - (b.manager?.skill ?? 50) / 100) * 0.12
    if (best.production > 0) {
      b.price = round2(Math.max(0.01, best.price * (1 + (rand(g) - 0.5) * 2 * slop)))
      b.production = Math.max(0, Math.round(best.production * (1 + (rand(g) - 0.5) * slop)))
    } else b.production = 0
  }

  const plan = techPlan(g, b, t, year, { noise })
  const produced = Math.floor(clampN(Math.min(b.production, plan.capacity), 0, 1e12))
  const available = produced + b.inventory
  let sold = Math.floor(Math.min(plan.demand, available))
  const flown = sold
  const notes: string[] = []

  // Rockets don't always make it: a failed commercial launch earns nothing and hurts.
  if (ind === 'spaceTech' && sold > 0) {
    const reliability = clampN(0.9 + 0.01 * Math.min(9, t.wins) + t.level / 1000, 0.85, 0.99)
    let lost = 0
    for (let i = 0; i < Math.min(sold, 60); i++) if (!chance(g, reliability)) lost++
    // Every successful flight adds to the track record customers trust.
    t.wins += sold - lost
    if (lost > 0) {
      sold -= lost
      b.brand = clampN(b.brand - 3 * lost, 0, 100)
      t.hype = clampN(t.hype - 5 * lost, 0, 100)
      notes.push(`\u{1F4A5} ${plural(lost, 'commercial launch', 'commercial launches')} failed. Customers’ insurers paid; your reputation didn’t.`)
    }
  }

  const revenue = sold * b.price
  const salesTax = (revenue * plan.taxRate) / (1 + plan.taxRate)
  const side = sideRevenue(b, t, year)
  const netRevenue = revenue - salesTax + side.total

  // Costs.
  // A rocket that blows up still had to be built.
  const productCogs = def.perishable >= 1 ? plan.unitCost * (flown * 0.7 + produced * 0.3) : plan.unitCost * produced
  // Contracts, satellites, foundry customers and licences cost money to deliver too.
  const cogs = productCogs + side.cost
  const employees = headCount(b, t, produced)
  let wageSum = 0
  let rent = 0
  let upkeep = 0
  for (const o of b.outlets) {
    const e = localEcon(ind, o.countryId, o.city)
    wageSum += o.count * e.wage
    rent += o.count * e.rent
    upkeep += o.count * e.capital * def.maint
  }
  const avgWage = wageSum / Math.max(1, totalOutlets(b))
  const wages = employees * avgWage * b.wageLevel * b.openFraction
  upkeep += t.plantBook * 0.04
  const keyStaff = b.staff.reduce((s, x) => s + x.salary, 0) + (b.ceo === 'manager' && b.manager ? b.manager.salary : 0)
  const marketing = revenue * def.marketingShare * b.marketingLevel
  const interest = b.debt * b.debtRate
  const insurance = b.insured ? insurancePremiumFor(b) : 0
  const finance = 1 - 0.025 * staffPower(b, 'finance')
  const ceoEff = 1.05 - ceoSkill(g, b) / 1000
  const overhead = (wages + rent + upkeep) * finance * ceoEff

  // R&D: progress, spending, breakthroughs.
  const rd0 = advancePrograms(g, a, b, t, year)
  const rd = rd0.spend
  const compute = computeRent(b, t)
  const creditRate = clampN(RD_CREDIT[b.countryId] ?? 0, 0, 0.5)
  const credit = Math.round(Math.min(50_000_000, rd * creditRate))
  // Grants count as income only as the R&D they pay for is done (the rest stays in the R&D
  // account for next year's work): a grant can cover R&D, never turn it into a profit.
  const grants = Math.round(Math.min(t.yearGrant, Math.max(0, rd + compute - credit)))
  const spent = t.yearSpent

  const costs = cogs + overhead + keyStaff + marketing + interest + insurance + rd + compute
  const delta = netRevenue + credit - costs
  const pbt0 = delta - b.yearCosts - spent + b.yearIncome + grants
  // Investors pay a founder a normal engineer's salary at most; anything above that has to come
  // out of the company's own cash.
  const fromInvestors = Math.min(t.venture, localEcon(ind, b.countryId, b.city).wage)
  const ownerPay = Math.round(clampN(ownerDraw, 0, Math.max(0, Math.max(0, b.cash + delta) + fromInvestors)))
  const pbt = pbt0 - ownerPay
  const corpTax = pbt > 0 ? corporateTax(b.countryId, pbt) : 0
  const net = pbt - corpTax
  b.cash = dollars(b.cash + delta - ownerPay - corpTax)
  // The R&D account covers what company cash can't.
  let fromVenture = 0
  if (b.cash < 0 && t.venture > 0) {
    fromVenture = Math.min(t.venture, -b.cash)
    b.cash += fromVenture
    t.venture -= fromVenture
  }
  const m = marketOf(b.countryId)
  let cashErosion = 0
  if (b.cash > 0) {
    const real = clampN((m.inflation - m.interestRate) * 0.35, 0, 0.4)
    cashErosion = Math.round(b.cash * real)
    b.cash -= cashErosion
  }

  const leftover = Math.max(0, available - sold)
  const inventoryEnd = Math.floor(leftover * (1 - def.perishable))
  b.inventory = inventoryEnd
  b.employees = employees

  // Contracts run down.
  if (t.contract) t.contract = t.contract.years > 1 ? { ...t.contract, years: t.contract.years - 1 } : null
  if (t.deal) t.deal = t.deal.years > 1 ? { ...t.deal, years: t.deal.years - 1 } : null

  notes.push(...rd0.notes)
  if (side.parts.length) notes.push(`\u{1F4B5} Other revenue: ${side.parts.join(', ')} (${money(side.total)}).`)
  // Investors count breakthroughs as progress; work still underway buys patience, nothing doesn't.
  t.stuck = rd0.wins > 0 || rd0.stageUp ? 0 : t.programs.length > 0 ? t.stuck : t.stuck + 1
  const oneOff = Math.round(t.oneOff)
  t.last = { year, rd, compute, side: side.total, grants, credit, fromVenture, oneOff, notes: notes.slice(0, 12) }
  // Windfalls and grants are left out of the earnings investors pay a multiple for.
  t.oneOffs = [...t.oneOffs.filter((x) => x.year !== year && x.year > year - 3), { year, amount: oneOff + grants }].slice(-3)
  t.yearGrant = 0
  t.yearSpent = 0
  t.oneOff = 0

  const stmt: Statement = {
    year,
    demand: Math.round(plan.demand),
    sold,
    produced,
    spoiled: leftover - inventoryEnd,
    price: round2(b.price),
    revenue: dollars(revenue + side.total),
    salesTax: dollars(salesTax),
    netRevenue: dollars(netRevenue),
    cogs: dollars(cogs),
    wages: dollars(wages * finance * ceoEff),
    keyStaff: dollars(keyStaff),
    rent: dollars(rent * finance * ceoEff),
    marketing: dollars(marketing),
    interest: dollars(interest),
    upkeep: dollars(upkeep * finance * ceoEff + insurance),
    other: dollars(b.yearCosts + spent + rd + compute),
    otherIncome: dollars(b.yearIncome + grants + credit),
    ownerPay,
    pbt: dollars(pbt),
    corpTax: dollars(corpTax),
    net: dollars(net),
    cashErosion,
    cycle: round2(cycleOf(g, b.countryId, year)),
    openFraction: b.openFraction,
    employees,
  }
  b.last = stmt

  // Tell the CEO what the lab did; managed companies just get a line in the log.
  afterResearch(g, a, b, t, rd0.headlines, rd0.newModel, stageBefore, runs)
  return { stmt, inventoryEnd, wantedStaff: employees, unpaidSalary: Math.max(0, Math.round(ownerDraw) - ownerPay), market: plan.market ? { ...plan.market, capacity: plan.capacity } : null }
}

function afterResearch(g: GameState, a: Asset, b: BizState, t: TechState, headlines: string[], newModel: number, stageBefore: number, runs: boolean): void {
  const ind = dtInd(b)
  if (t.stage > stageBefore) {
    const name = stageName(ind, t.stage)
    log(g, `${a.name} reached a new stage: ${name}.`, 'good')
    remember(g, `${a.name} reached "${name}".`)
    count(g, 'deepTechMilestones')
    // The first sellable year: price and plan production so the year isn't wasted.
    if (sellable(g, b, t) && b.production <= 0) {
      const best = bestTechPlan(g, b, t)
      b.price = best.price
      b.production = best.production
    }
  }
  if (headlines.length === 0 && newModel === 0) return
  if (!runs) {
    for (const h of headlines.slice(0, 3)) log(g, `${a.name}: ${h}`, 'neutral')
    return
  }
  if (headlines.length) {
    const text = headlines.slice(0, 5).map((h) => `• ${h}`).join('\n')
    notice(g, `${a.name}: Lab Results`, `${text}${t.stage > stageBefore ? `\n\n${a.name} is now at "${stageName(ind, t.stage)}". ${DEEP_TECH[ind].stages[t.stage].blurb}` : ''}`, {
      emoji: DEEP_TECH[ind].screen.emoji,
      tone: t.stage > stageBefore ? 'good' : 'neutral',
    })
  }
  if (newModel > 0) queueRelease(g, a, t, newModel)
}

// ---------------------------------------------------------------------------
// AI model releases

function queueRelease(g: GameState, a: Asset, t: TechState, gen: number): void {
  const m = t.models.find((x) => x.gen === gen)
  if (!m) return
  const frontier = frontierScore(g.year)
  // Open weights only cost sales when they are the lab's best model and it has paying API
  // customers (their demand drops by a quarter); otherwise they are free hype and talent.
  const best = bestModel(t)
  const costsSales = t.stage >= 2 && (!best || best.gen === m.gen || best.score <= m.score)
  const closedHint = costsSales ? talentHint(g, 'Business', 'Keep it closed: it is your best model, and open weights would cut your API sales by about a quarter.') : ''
  const openHint = !costsSales ? talentHint(g, 'Business', t.stage < 2 ? 'Open it: you have no paying API customers to lose yet, and the hype and talent help your next round.' : 'Open it: your customers use a better model, so giving this one away costs no sales and wins hype and talent.') : ''
  const choices: ChoiceOption[] = [
    { id: 'closed', label: 'Closed release: sell it through the API', emoji: '\u{1F512}', ...(closedHint ? { hint: closedHint } : {}) },
    { id: 'open', label: 'Open weights: give it to the world', emoji: '\u{1F513}', ...(openHint ? { hint: openHint } : {}) },
    { id: 'hold', label: 'Hold it back for more safety testing', emoji: '\u{1F6E1}\u{FE0F}' },
  ]
  scriptChoice(
    g,
    RELEASE,
    `Release ${m.name}?`,
    `${m.name} scored ${m.score} on the benchmarks (the best anyone has is about ${frontier}). How do you release it? Closed models earn API money; open weights win fans, talent and hype but undercut your own API. Holding it back costs buzz but makes incidents less likely.`,
    choices,
    { emoji: '\u{1F9E0}', data: { assetId: a.id, gen } },
  )
}

const RELEASE = defineScript('deeptech.release', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return
  const b = bizOf(g, a)
  const t = techOf(b)
  const m = t.models.find((x) => x.gen === Number(d.gen))
  if (!m) return
  if (choice === 'open') {
    m.open = true
    t.hype = clampN(t.hype + 15, 0, 100)
    b.brand = clampN(b.brand + 6, 0, 100)
    log(g, `${a.name} released ${m.name} as open weights.`, 'good')
    notice(g, 'Open Weights!', `You put ${m.name} on the internet for anyone to download. Developers are thrilled, researchers want to work for you, and your API customers are quietly self-hosting it.`, { emoji: '\u{1F513}', tone: 'good' })
  } else if (choice === 'hold') {
    t.safety = clampN(t.safety + 15, 0, 100)
    t.hype = clampN(t.hype - 5, 0, 100)
    log(g, `${a.name} held ${m.name} back for more safety testing.`)
    notice(g, 'Held Back', `${m.name} goes through another round of red-teaming before customers get it. The safety team is grateful; the sales team is sulking.`, { emoji: '\u{1F6E1}\u{FE0F}' })
  } else {
    log(g, `${a.name} launched ${m.name} through its API.`, 'good')
    notice(g, 'Model Launched', `${m.name} is live for paying customers. ${m.score >= frontierScore(g.year) ? 'Tech journalists are calling it the best model in the world.' : 'Reviews are solid.'}`, { emoji: '\u{1F9E0}', tone: 'good' })
  }
  revalueQuiet(g, a, b, t)
})

function revalueQuiet(g: GameState, a: Asset, b: BizState, t: TechState): void {
  refreshTechValue(g, b, t)
  if (!b.public) b.valuation = valuationOf(b)
  a.value = stakeValue(b)
}

// ---------------------------------------------------------------------------
// After evolve(): tech level drift, hype, depreciation, the board, IPO readiness

export function afterDeepTechYearImpl(g: GameState, a: Asset, b: BizState): void {
  const t = techOf(b)
  const ind = dtInd(b)
  // Product quality follows the tech; the brand follows the buzz.
  b.quality = Math.round(clampN(b.quality * 0.6 + (35 + t.level * 0.6) * 0.4, 0, 100))
  b.brand = Math.round(clampN(b.brand + (t.hype - 40) / 20, 0, 100))
  // Everyone else keeps improving: stand still and you fall behind.
  const rdSpend = t.last?.rd ?? 0
  const gain = Math.min(4, Math.log10(1 + rdSpend / (1_000_000 * rdScale(b.countryId))) * 1.2)
  t.level = Math.round(clampN(t.level + gain - 1.5, 0, 100) * 10) / 10
  t.hype = Math.round(clampN(t.hype * 0.85 + industryCycle(g, ind, g.year).z * 2, 0, 100))
  t.ipBook = Math.round(t.ipBook * 0.9)
  t.plantBook = Math.round(t.plantBook * 0.93)
  t.safety = Math.round(clampN(t.safety - 1, 0, 100))
  // Satellites wear out and burn up after about six years in orbit.
  if (t.sats > 0) {
    let retired = 0
    for (let i = 0; i < t.sats; i++) if (chance(g, 1 / 6)) retired++
    if (retired > 0) {
      t.sats -= retired
      log(g, `${a.name} retired ${plural(retired, 'old satellite batch', 'old satellite batches')}; ${t.sats > 0 ? `${plural(t.sats, 'batch', 'batches')} still in orbit` : 'none are left in orbit'}.`)
    }
  }
  // Investors on the board get impatient when milestones slip and the money runs low.
  if (!b.public && t.series >= 1) {
    const runway = runwayYears(g, a, b, t)
    t.pressure = Math.round(clampN(t.pressure + (t.stuck >= 2 ? 12 : -6) + (runway < 1 ? 10 : 0), 0, 100))
  } else t.pressure = Math.round(clampN(t.pressure - 10, 0, 100))
  // A listing converts the preferred stock: investor money becomes ordinary company cash.
  if (b.public && t.venture > 0) {
    b.cash += t.venture
    t.venture = 0
    t.raised = 0
  }
  refreshTechValue(g, b, t)
  boardCheck(g, a, b, t)
  ipoCheck(g, a, b, t)
}

/** With investors in control of the board, a stuck CEO can be replaced. */
function boardCheck(g: GameState, a: Asset, b: BizState, t: TechState): void {
  if (b.public || b.share >= 0.5 || !runsIt(g, a) || t.pressure < 80) return
  if (!chance(g, 0.35)) return
  const mgr = managerCandidate(g, b)
  stepDown(g, a, b, mgr)
  const c = g.character
  const job = c.careerHistory[c.careerHistory.length - 1]
  if (job) job.reason = 'fired'
  count(g, 'fired')
  addStat(g, 'happiness', -12)
  t.pressure = 30
  log(g, `${a.name}'s investors voted me out as CEO.`, 'bad')
  remember(g, `Was pushed out as CEO of ${a.name} by its investors.`)
  notice(g, 'Pushed Out', `Your investors control the board, and after ${t.stuck} years without a milestone they ran out of patience. ${mgr.firstName} ${mgr.lastName} is the new CEO of ${a.name}. You still own ${pct(b.share)} of the company, which stings a little less.`, { emoji: '\u{1FA91}', tone: 'bad' })
}

function ipoCheck(g: GameState, a: Asset, b: BizState, t: TechState): void {
  const key = `biz.ipoHint.${a.id}`
  if (b.public || g.flags[key] === true || !b.last) return
  const view = {
    industry: b.industry,
    tech: b.tech,
    valuation: valuationOf(b),
    founded: b.founded,
    public: b.public,
    history: [...b.history, { year: b.last.year, profit: b.last.net, revenue: b.last.revenue }],
  }
  if (milestoneListingBlock(view) !== '') return
  g.flags[key] = true
  if (!runsIt(g, a)) return
  notice(g, 'Bankers Smell an IPO', `${a.name} is a ${stageName(dtInd(b), t.stage).toLowerCase()} story worth about ${money(view.valuation)}. Deep-tech listings don't wait for profits: bankers say the market would take you public now. You can go public from the company's screen.`, { emoji: '\u{1F514}', tone: 'good' })
}

// ---------------------------------------------------------------------------
// The yearly report: an Annual Report once there is something to sell, a Lab Report before

function line(label: string, value: string, tone: 'good' | 'bad' | 'neutral' = 'neutral') {
  return { label, value, tone }
}

function signed(n: number): string {
  return n < 0 ? `-${money(-n)}` : money(n)
}

export function techStatementLines(b: BizState, t: TechState, s: Statement): AnnualReportData['lines'] {
  const def = industryDef(b.industry)
  const m = marketOf(b.countryId)
  const x = t.last && t.last.year === s.year ? t.last : null
  const lines: AnnualReportData['lines'] = []
  if (s.demand > 0 || s.sold > 0) lines.push(line(`${def.unit[0].toUpperCase()}${def.unit.slice(1)} sold`, `${units(s.sold)} of ${units(s.demand)} wanted`, s.sold >= s.demand * 0.97 ? 'good' : 'neutral'))
  lines.push(line(def.taxShare > 0 ? `Sales (incl. ${m.salesTaxName})` : 'Sales', money(s.revenue)))
  if (x && x.side > 0) lines.push(line('…of which contracts & other revenue', money(x.side)))
  if (s.salesTax > 0) lines.push(line(`${m.salesTaxName} remitted`, signed(-s.salesTax)))
  if (s.cogs > 0) lines.push(line('Cost of goods', signed(-s.cogs)))
  lines.push(line(`Wages (${plural(s.employees, 'employee')})`, signed(-s.wages)))
  if (s.keyStaff > 0) lines.push(line(b.ceo === 'manager' ? 'Key staff & manager' : 'Key staff', signed(-s.keyStaff)))
  lines.push(line(`Rent (${plural(totalOutlets(b), def.site, def.sitePlural)})`, signed(-s.rent)))
  if (x && x.rd > 0) lines.push(line('R&D programs', signed(-x.rd)))
  if (x && x.compute > 0) lines.push(line('Rented GPU compute', signed(-x.compute)))
  if (s.marketing > 0) lines.push(line('Marketing', signed(-s.marketing)))
  if (s.interest > 0) lines.push(line('Interest', signed(-s.interest)))
  lines.push(line('Upkeep & depreciation', signed(-s.upkeep)))
  const oneOff = s.other - (x ? x.rd + x.compute : 0)
  if (oneOff > 0) lines.push(line('One-off costs', signed(-oneOff)))
  if (x && x.grants > 0) lines.push(line('Government grants', money(x.grants), 'good'))
  if (x && x.credit > 0) lines.push(line('R&D tax credit', money(x.credit), 'good'))
  const otherIn = s.otherIncome - (x ? x.grants + x.credit : 0)
  if (otherIn > 0) lines.push(line('Other income', money(otherIn), 'good'))
  if (s.ownerPay > 0) lines.push(line('Your salary', signed(-s.ownerPay)))
  lines.push(line('Profit before tax', signed(s.pbt), s.pbt >= 0 ? 'good' : 'bad'))
  if (s.corpTax > 0) lines.push(line(`Corporate tax (${Math.round(m.corporateTax * 100)}%)`, signed(-s.corpTax)))
  lines.push(line('Net profit', signed(s.net), s.net >= 0 ? 'good' : 'bad'))
  if (x && x.fromVenture > 0) lines.push(line('Covered from the R&D account', money(x.fromVenture)))
  lines.push(line('Company cash', signed(b.cash), b.cash >= 0 ? 'neutral' : 'bad'))
  if (t.venture > 0) lines.push(line('R&D account (investor & grant money)', money(t.venture)))
  if (b.debt > 0) lines.push(line('Company debt', money(b.debt), 'bad'))
  if (!b.public && t.raised > 0) lines.push(line('Investors’ money (paid back first in a sale)', money(t.raised)))
  lines.push(line(b.public ? `Market cap (${b.exchange})` : t.raised > 0 ? 'Valuation (after investors’ preference)' : 'Valuation', money(b.valuation)))
  if (b.share < 1) lines.push(line(`Your ${pct(b.share)} stake`, money(stakeValue(b))))
  lines.push(line('Tech level · Stage', `${Math.round(t.level)}/100 · ${stageName(dtInd(b), t.stage)}`))
  return lines
}

function techMarketNote(g: GameState, b: BizState, t: TechState): string {
  const ind = dtInd(b)
  const cyc = industryCycle(g, ind, g.year - 1)
  const def = industryDef(ind)
  const parts: string[] = []
  parts.push(cyc.label === 'steady' ? `The ${DEEP_TECH[ind].cycle.name} is steady.` : `The ${DEEP_TECH[ind].cycle.name}: ${cyc.label}.`)
  if (ind === 'semiconductor') parts.push(`You're on the ${NODES[t.node]} node with ${Math.round(t.yieldRate * 100)}% yields.`)
  if (ind === 'aiLab') {
    const best = bestModel(t)
    if (best) parts.push(`${best.name} scores ${best.score}; the frontier is about ${frontierScore(g.year)} and rising.`)
  }
  if (ind === 'spaceTech' && t.stage >= 3) parts.push(`${plural(t.wins, 'successful flight')} so far; customers trust a track record.`)
  const e = localEcon(ind, b.countryId, b.city)
  parts.push(`A typical ${def.unitOne} sells for about ${money(e.goingPrice)} here; your tech earns ${money(techPriceBounds(g, b, t).going)}.`)
  const v = marketViewOf(g, b)
  if (v.booked && v.share > 0) parts.push(`You hold ${shareText(v.share)} of the world ${v.noun} market (#${v.rank})${v.unmet >= 0.05 ? ` and turned away ${pct(v.unmet)} of your customers last year: more ${def.sitePlural} or compute would keep them` : ''}.`)
  return parts.join(' ')
}

/**
 * Price bounds for the yearly report, capped by any price promise made this year (a price war or a
 * 'hold prices' choice in a business event), so the report can't quietly undo it.
 */
function reportBounds(g: GameState, a: Asset, b: BizState, t: TechState): { min: number; max: number } {
  const bounds = techPriceBounds(g, b, t)
  const cap = priceCapOf(g, a.id)
  if (cap === null) return bounds
  const max = Math.max(0.01, Math.min(bounds.max, cap))
  return { ...bounds, min: Math.min(bounds.min, max), max }
}

/** Everything the Annual Report minigame needs, with deep-tech demand and capacity. */
export function techReportData(g: GameState, a: Asset, b: BizState): AnnualReportData {
  const t = techOf(b)
  const def = industryDef(b.industry)
  const bounds = reportBounds(g, a, b, t)
  const lastCycle = b.last?.cycle ?? cycleOf(g, b.countryId, g.year - 1)
  const base = techPlan(g, b, t, g.year, { calm: true, cycle: lastCycle })
  const suggested = round2(clampN(base.suggested, bounds.min, bounds.max))
  const expected = techPlan(g, b, t, g.year, { price: suggested, calm: true, cycle: lastCycle })
  const maxProd = Math.max(1, Math.floor(expected.capacity))
  const data: AnnualReportData = {
    assetId: a.id,
    businessName: a.name,
    emoji: a.emoji,
    industryLabel: def.label,
    location: `${b.city}, ${bizCountryName(b.countryId)}`,
    year: b.last?.year ?? g.year,
    unitLabel: def.unit,
    unitCost: round2(expected.unitCost),
    price: round2(clampN(b.price, bounds.min, bounds.max)),
    minPrice: bounds.min,
    maxPrice: bounds.max,
    suggestedPrice: suggested,
    production: Math.round(clampN(b.production, 0, maxProd)),
    maxProduction: maxProd,
    inventory: Math.max(0, Math.round(b.inventory)),
    expectedDemand: Math.max(0, Math.round(expected.demand)),
    marketNote: techMarketNote(g, b, t),
    lines: b.last ? techStatementLines(b, t, b.last) : [line('First year', 'Set your launch price and production.')],
  }
  if (hasTalent(g, 'Business')) {
    const best = bestTechPlan(g, b, t, lastCycle)
    if (best.production > 0) {
      const price = round2(clampN(best.price, bounds.min, bounds.max))
      data.talentHint = {
        price,
        production: Math.round(clampN(best.production, 0, maxProd)),
        text: talentHint(g, 'Business', `Your gut says ${price >= 100 ? money(price) : formatCents(price)} per ${def.unitOne} and ${units(best.production)} ${def.unit} earns the most next year.`),
      }
    }
  }
  return data
}

export const TECH_REPORT = defineScript('deeptech.report', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a) return
  const b = bizOf(g, a)
  const t = techOf(b)
  const bounds = reportBounds(g, a, b, t)
  const maxProd = Math.max(1, Math.floor(techPlan(g, b, t, g.year, { calm: true }).capacity))
  let price = b.price
  let production = b.production
  if (choice && choice !== 'skip') {
    try {
      const v: unknown = JSON.parse(choice)
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>
        if (typeof o.price === 'number' && Number.isFinite(o.price)) price = o.price
        if (typeof o.production === 'number' && Number.isFinite(o.production)) production = o.production
      }
    } catch {
      // Not JSON: keep last year's plan.
    }
  }
  b.price = round2(clampN(price, bounds.min, bounds.max))
  b.production = Math.round(clampN(production, 0, maxProd))
  if (choice !== 'skip') log(g, `I set ${a.name}'s price at ${b.price >= 100 ? money(b.price) : formatCents(b.price)} and planned ${units(b.production)} ${industryDef(b.industry).unit} for the year.`)
})

function paceChoices(g: GameState, a: Asset, b: BizState, t: TechState, hinted = true): ChoiceOption[] {
  const runway = runwayYears(g, a, b, t)
  const best: Pace = runway < 1.2 ? 'lean' : runway > 3.5 && t.programs.length > 0 ? 'blitz' : 'steady'
  return PACES.map((p) => {
    const hint = hinted && p.id === best ? talentHint(g, 'Business', p.id === 'lean' ? 'Cut the burn: at this rate the money runs out within a year.' : p.id === 'blitz' ? 'Floor it: you have the runway, and speed wins in deep tech.' : 'Hold the course: the runway fits the plan.') : ''
    const opt: ChoiceOption = { id: p.id, label: `${p.label} pace${t.pace === p.id ? ' (current)' : ''}: ${p.note.charAt(0).toLowerCase()}${p.note.slice(1)}`, emoji: p.id === 'lean' ? '\u{1F422}' : p.id === 'blitz' ? '\u{1F407}' : '\u{1F6B6}' }
    if (hint) opt.hint = hint
    return opt
  })
}

/** Queue the yearly report for a deep-tech company (always: the price report needs tech numbers). */
export function deepTechReportImpl(g: GameState, a: Asset, b: BizState): boolean {
  const t = techOf(b)
  if (sellable(g, b, t)) {
    minigame(g, 'annualReport', `${a.name}: Annual Report`, TECH_REPORT, toJson(techReportData(g, a, b)))
    return true
  }
  const ind = dtInd(b)
  const s = b.last
  const burn = burnRate(g, a, b, t)
  const runway = runwayYears(g, a, b, t)
  const parts: string[] = []
  parts.push(`Stage: ${stageName(ind, t.stage)} (${t.stage + 1} of ${maxStage(ind) + 1}). Tech level ${Math.round(t.level)}/100.`)
  if (t.programs.length) parts.push(`Running: ${t.programs.map((p) => `${p.name} (${Math.round((p.progress / p.years) * 100)}%)`).join(', ')}.`)
  else parts.push('No R&D programs are running. Start one from the R&D Lab, or nothing moves.')
  if (t.last?.notes.length) parts.push(t.last.notes.slice(0, 4).join(' '))
  if (s) parts.push(`Last year: ${s.net >= 0 ? `${money(s.net)} profit` : `${money(-s.net)} loss`} on ${money(s.revenue)} of revenue.`)
  parts.push(`Burn about ${money(burn)} a year; R&D account ${money(t.venture)}, company cash ${money(b.cash)}: ${runway >= 99 ? 'self-funding' : `${runway} years of runway`}.`)
  const next = nextStep(g, a, b, t)
  parts.push(`${SERIES[t.series]}, you own ${pct(b.share)}. ${next ? 'Start the next program, or set' : 'How hard do you push'} the lab's pace for next year?`)
  // One purple hint per popup: on the program to start when there is one, else on the pace.
  const choices = paceChoices(g, a, b, t, !next)
  if (next) {
    const hint = talentHint(g, 'Business', 'Start this: the best value for your R&D money right now.')
    choices.unshift({ id: `start:${next.key}`, label: `Start ${next.name} (${money(next.cost)}/yr)`, emoji: next.emoji, ...(hint ? { hint } : {}) })
  }
  scriptChoice(g, LAB_REPORT, `${a.name}: Lab Report`, parts.join('\n'), choices, { emoji: DEEP_TECH[ind].screen.emoji, data: { assetId: a.id } })
  return true
}

/** The program (or clinical trial) a free lab slot should take next, if any. */
function nextStep(g: GameState, a: Asset, b: BizState, t: TechState): { key: string; name: string; cost: number; emoji: string } | null {
  if (t.programs.length >= maxPrograms(b, t)) return null
  if (dtInd(b) === 'biotech') {
    const d = bestTrial(b, t, Math.max(1, techFunds(b, t)))
    if (d && !trialBlock(b, t, d)) return { key: `trial:${d.id}`, name: trialName(d, b.countryId), cost: trialCost(b, d), emoji: '\u{1F9EA}' }
  }
  const def = bestProgram(g, a, b, t)
  return def ? { key: `program:${def.id}`, name: def.label(t), cost: programCost(b, t, def), emoji: def.emoji } : null
}

const LAB_REPORT = defineScript('deeptech.labReport', (g, choice, data) => {
  const a = findBusiness(g, str(rec(data)?.assetId))
  if (!a) return
  const b = bizOf(g, a)
  const t = techOf(b)
  if (choice.startsWith('start:')) {
    const [, kind, id] = choice.split(':')
    if (kind === 'trial') {
      const d = t.drugs.find((x) => x.id === id)
      const p = d ? startTrial(g, b, t, d) : null
      if (p) log(g, `${a.name} started ${p.name}.`)
    } else {
      const def = programDef(dtInd(b), id ?? '')
      const p = def ? startProgram(g, b, t, def) : null
      if (p) log(g, `${a.name} started an R&D program: ${p.name}.`)
    }
    return
  }
  const pace = PACES.find((p) => p.id === choice)
  if (!pace || t.pace === pace.id) return
  t.pace = pace.id
  log(g, `I set ${a.name}'s R&D to a ${pace.label.toLowerCase()} pace.`)
})

export function paceLabel(t: TechState): string {
  return paceOf(t.pace).label
}

export function formatRunway(years: number): string {
  return years >= 99 ? 'self-funding' : `${years} yr${years === 1 ? '' : 's'} of runway`
}

/** Exported for tests: the yearly report and release scripts. */
export const simInternals = { RELEASE, LAB_REPORT, TECH_REPORT, queueRelease }
