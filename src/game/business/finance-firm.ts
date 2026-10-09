// Segregated financial books. Clients' principal never enters b.cash or shareholder valuation.
import { seeded } from '../assets'
import { notice, useYearAction, yearActionsUsed } from '../core'
import { corporateTax, marketOf } from '../data/markets'
import { hasTech } from '../history/timeline'
import { hasTalent } from '../talents'
import type { Asset, GameState, MenuNode } from '../types'
import { getCountry } from '../world'
import { cycleOf, localEcon, localPay, type YearResult } from './economy'
import { manageBlock } from './gate'
import { industryDef } from './industries'
import { bizOf, findBusiness, readBiz, totalOutlets, type BizState, type Statement } from './state'
import { financeView, isFinanceFirm, saveFinance, type FinanceStrategy } from './finance-firm-state'
import { clampN, money, pct } from './util'

export { financeView, isFinanceFirm } from './finance-firm-state'

export function financeEraBlock(g: GameState, industry: string, countryId = g.character.countryId, year = g.year): string | null {
  if (industry !== 'onlineBank') return null
  const local = { ...g, character: { ...g.character, countryId } }
  return hasTech(local, 'onlineBanking', year) && hasTech(local, 'internet', year)
    ? null : 'Online banking needs local internet access and online-banking technology. Start a branch bank first, or wait for the digital era.'
}

/** Real named employees, morale and the CEO affect research, credit and retention. */
export function financeTeamSkill(g: GameState, b: BizState): number {
  const leader = b.ceo === 'manager' ? b.manager?.skill ?? 35 : g.character.stats.smarts * .55 + g.character.hidden.discipline * .25 + (hasTalent(g, 'Investing') ? 20 : 0)
  const staff = b.staff.length ? b.staff.reduce((s, x) => s + x.skill * (.55 + x.morale / 220), 0) / b.staff.length : 38
  return clampN(leader * .3 + staff * .7, 10, 99)
}

export function financeAlgoCost(b: BizState): number {
  return Math.round(250_000 * clampN(getCountry(b.countryId).wealth, .35, 1.6))
}

export function financeAlgoBlock(g: GameState, b: BizState): string | null {
  const f = financeView(b)
  if (!isFinanceFirm(b)) return 'This research needs a financial institution.'
  if (!hasTalent(g, 'Inventor')) return 'Only the Inventor talent can create an original market-modeling algorithm.'
  if (f.algoResearching) return 'Your algorithm is already being researched.'
  if (f.algoCompleted > 0 && g.year - f.algoCompleted < 6) return 'A new fundamental model needs six years of fresh market observations after the last breakthrough.'
  if (b.cash < financeAlgoCost(b)) return `The company needs ${money(financeAlgoCost(b))} of its own cash; client funds cannot pay for research.`
  return null
}

export function researchFinanceAlgorithm(g: GameState, assetId: string): void {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a)) return
  const b = bizOf(g, a), reason = financeAlgoBlock(g, b)
  if (reason) return notice(g, 'Original Market Algorithm', reason, { emoji: '🧠' })
  const cost = financeAlgoCost(b), f = financeView(b)
  b.cash -= cost; b.yearCosts += cost
  f.algoStarted = g.year; f.algoProgress = 0; f.algoResearching = true
  saveFinance(b, f)
  notice(g, 'A New Way to Read Markets', `${a.name} funded ${money(cost)} of original research. Two fiscal years of data and testing are required. A completed model creates a temporary edge—not guaranteed returns—and competitors eventually catch up. Before computers, this is a mathematical trading framework rather than an anachronistic electronic platform.`, { emoji: '🧠' })
}

export function setFinancePolicy(g: GameState, assetId: string, key: 'strategy' | 'reserves' | 'controls' | 'fees' | 'depositRate' | 'loanRate', value: string | number): void {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a)) return
  const b = bizOf(g, a)
  if (!isFinanceFirm(b)) return
  const f = financeView(b)
  if (key === 'strategy') {
    if (!['cautious', 'balanced', 'aggressive'].includes(String(value))) return
    f.strategy = value as FinanceStrategy
  } else {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return
    if (key === 'reserves' && b.industry !== 'investmentFirm') f.reserveRatio = clampN(n, .1, .7)
    else if (key === 'controls') f.controls = clampN(n, 0, 100)
    else if (key === 'fees' && b.industry === 'investmentFirm') f.feeRate = clampN(n, .005, .03)
    else if (key === 'depositRate' && b.industry !== 'investmentFirm') f.depositRate = clampN(n, 0, .15)
    else if (key === 'loanRate' && b.industry !== 'investmentFirm') f.loanRate = clampN(n, .025, .3)
    else return
  }
  saveFinance(b, f)
  notice(g, 'Financial Policy Updated', `${a.name}: policy saved for the next fiscal year. Changing a setting does not generate earnings or create customer money.`, { emoji: '🏦' })
}

export function attractFinanceClients(g: GameState, assetId: string): void {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a)) return
  const b = bizOf(g, a)
  if (!isFinanceFirm(b)) return
  const cost = Math.round(15_000 * clampN(getCountry(b.countryId).wealth, .35, 1.6) * Math.sqrt(totalOutlets(b)))
  if (b.cash < cost) return notice(g, 'Client Outreach', `The company needs ${money(cost)} of its own cash.`, { emoji: '📣' })
  if (!useYearAction(g, `finance.outreach.${assetId}`, 1)) return
  b.cash -= cost; b.yearCosts += cost
  const f = financeView(b); f.outreach = .15; saveFinance(b, f)
  notice(g, 'Client Outreach', `${money(cost)} funded meetings, referrals and disclosures. New customers decide when the year settles, based on results, staff and confidence; their money stays in segregated client accounts.`, { emoji: '📣' })
}

/** Dedicated simulator: no goods, manufacturing, inventory, or customer principal as revenue. */
export function simulateFinanceYear(g: GameState, b: BizState, year: number, ownerDraw: number): YearResult {
  const f = financeView(b)
  if (f.lastYear >= year && b.last) return { stmt: b.last, inventoryEnd: 0, wantedStaff: b.employees, unpaidSalary: 0, market: null }
  const rng = seeded(`${g.lifeId}|finance|${b.countryId}|${b.city}|${b.founded}|${b.founderName}|${year}`)
  const investment = b.industry === 'investmentFirm', online = b.industry === 'onlineBank'
  const e = localEcon(b.industry, b.countryId, b.city), m = marketOf(b.countryId), def = industryDef(b.industry)
  const skill = financeTeamSkill(g, b), cycle = cycleOf(g, b.countryId, year)
  const risk = f.strategy === 'aggressive' ? 1.7 : f.strategy === 'cautious' ? .5 : 1
  const sites = totalOutlets(b), open = clampN(b.openFraction, 0, 1)
  const available = !financeEraBlock(g, b.industry, b.countryId, year)
  const staffCount = Math.max(def.staff, Math.round(def.staff * sites))
  const wage = localPay(b.countryId, def.wage)
  const wages = staffCount * wage * b.wageLevel * open
  const keyStaff = b.staff.reduce((s, x) => s + x.salary, 0) + (b.ceo === 'manager' ? b.manager?.salary ?? 0 : 0)
  const rent = e.rent * sites
  const controlsCost = localPay(b.countryId, online ? 100_000 : 35_000) * (.4 + f.controls / 80) * sites
  let revenue = 0, cogs = 0
  f.lastDefaults = 0; f.lastWithdrawals = 0; f.lastRun = false
  const marketReturn = clampN((m.exchange?.drift ?? .055) + (cycle - 1) * .5 + rng.float(-.2, .2) * risk, -.85, .65)
  const edge = f.algoEdge * (.5 + skill / 200)
  if (investment) {
    const starting = f.aum
    const result = clampN(marketReturn + (skill - 50) * .0007 + edge + rng.float(-.025, .025), -.85, .8)
    f.lastReturn = result
    const beforeFees = Math.max(0, starting * (1 + result * open))
    const management = beforeFees * f.feeRate * open
    const performance = Math.max(0, beforeFees - f.highWater) * .1
    revenue = management + performance
    f.aum = Math.max(0, beforeFees - revenue)
    f.highWater = Math.max(f.highWater, beforeFees - performance)
    const retention = clampN((result - .04) * .5 + (skill - 50) / 500 + (f.confidence - 60) / 350 - Math.max(0, f.feeRate - .015) * 10 + f.outreach, -.45, .35)
    const capacity = (staffCount + b.staff.length * 2) * 25_000_000 * clampN(getCountry(b.countryId).wealth, .15, 2)
    const flow = retention >= 0 ? Math.min(capacity - f.aum, Math.max(0, starting * retention)) : f.aum * retention
    if (flow >= 0) { f.aum += flow; f.highWater += flow }
    else { const keep = (f.aum + flow) / Math.max(1, f.aum); f.aum += flow; f.highWater *= keep; f.lastWithdrawals = -flow }
    // Custody controls protect against operational errors, not broad market losses.
    // Skimping on compliance can cost the firm money even in a rising market.
    const operationalRisk = Math.max(.005, (100 - f.controls) / 700 * (1.25 - skill / 200))
    const operationalLoss = rng.chance(operationalRisk) ? starting * rng.float(.001, .006) * (1 - f.controls / 150) : 0
    cogs = starting * .0012 * open + operationalLoss
    if (operationalLoss > 0) f.confidence = Math.max(5, f.confidence - 8)
    f.confidence = clampN(f.confidence + (result - .03) * 35 + (skill - 50) / 30, 5, 98)
  } else {
    const oldDeposits = f.deposits
    const creditSkill = clampN(skill * .7 + f.controls * .3, 0, 100)
    const defaultsRate = clampN((.012 + (100 - creditSkill) * .00035) * risk + Math.max(0, 1 - cycle) * .2 + Math.max(0, f.loanRate - .1) * .2, .004, .3)
    const crisis = rng.chance((100 - creditSkill) / 1600 * risk)
    const losses = f.loanBook * (defaultsRate + (crisis ? rng.float(.03, .15) : 0)) * open
    f.loanBook = Math.max(0, f.loanBook - losses)
    // Shareholders cover credit losses. Segregated customer assets are replenished,
    // and exactly the same loss is charged to company earnings/cash below.
    f.reserves += losses
    revenue = (f.loanBook * f.loanRate + f.bonds * Math.max(.005, m.interestRate * .75) + oldDeposits * .003) * open
    cogs = oldDeposits * f.depositRate * open + losses
    f.lastDefaults = losses
    const capitalRatio = Math.max(0, b.cash) / Math.max(1, oldDeposits)
    const liquid = f.reserves / Math.max(1, oldDeposits)
    const runRisk = clampN((60 - f.confidence) / 300 + Math.max(0, .2 - liquid) * .8 + Math.max(0, .02 - capitalRatio) * 4 + (online ? .015 : 0), .005, .5)
    const run = rng.chance(runRisk)
    const withdrawalRate = run ? rng.float(.2, .65) : rng.float(.02, .1)
    const withdrawals = oldDeposits * withdrawalRate
    const matured = f.loanBook * .2
    f.loanBook -= matured; f.reserves += matured
    let shortage = Math.max(0, withdrawals - f.reserves)
    const sellBonds = Math.min(f.bonds, shortage)
    f.bonds -= sellBonds; f.reserves += sellBonds; shortage -= sellBonds
    if (shortage > 0) {
      const sale = Math.min(f.loanBook, shortage)
      const discount = sale * (run ? .18 : .05)
      f.loanBook -= sale; f.reserves += sale
      cogs += discount; f.lastDefaults += discount
    }
    f.reserves -= withdrawals; f.deposits -= withdrawals
    f.lastWithdrawals = withdrawals; f.lastRun = run
    const draw = clampN(.05 + (skill - 40) / 350 + (f.confidence - 60) / 250 + (f.depositRate - .02) * 2 + f.outreach - (run ? .3 : 0), 0, .35)
    const capacity = staffCount * (online ? 12_000_000 : 8_000_000) * clampN(getCountry(b.countryId).wealth, .15, 2)
    const inflow = available ? Math.max(0, Math.min(oldDeposits * draw, capacity - f.deposits)) : 0
    f.deposits += inflow; f.reserves += inflow
    const targetLoans = f.deposits * clampN((1 - f.reserveRatio - .1) * (f.strategy === 'cautious' ? .8 : 1), .1, .8)
    const targetBonds = f.deposits * .1
    const allocatable = Math.max(0, f.reserves - f.deposits * f.reserveRatio)
    const newLoans = Math.min(Math.max(0, targetLoans - f.loanBook), allocatable)
    f.loanBook += newLoans; f.reserves -= newLoans
    const newBonds = Math.min(Math.max(0, targetBonds - f.bonds), Math.max(0, f.reserves - f.deposits * f.reserveRatio))
    f.bonds += newBonds; f.reserves -= newBonds
    f.confidence = clampN(f.confidence + (skill - 50) / 20 + f.controls / 40 - 1 - (run ? 20 : 0) - (crisis ? 12 : 0), 5, 98)
    f.lastReturn = oldDeposits > 0 ? (revenue - cogs) / oldDeposits : 0
  }
  if (!available) revenue = 0
  const marketing = revenue * .04 * b.marketingLevel
  const interest = b.debt * b.debtRate
  const upkeep = controlsCost + sites * e.capital * .005
  const preSalary = revenue - cogs - wages - keyStaff - rent - marketing - interest - upkeep - b.yearCosts + b.yearIncome
  const booked = b.yearCosts - b.yearIncome
  const ownerPay = Math.round(clampN(ownerDraw, 0, Math.max(0, b.cash + preSalary + booked)))
  const pbt = preSalary - ownerPay, tax = corporateTax(b.countryId, pbt), net = Math.round(pbt - tax)
  b.cash = Math.round(b.cash + net + booked)
  b.employees = staffCount; b.production = 0; b.inventory = 0
  f.lastFees = revenue; f.lastYear = year; f.outreach = 0
  if (f.algoResearching && f.algoStarted <= year) {
    f.algoProgress += 1
    if (f.algoProgress >= 2) {
      f.algoResearching = false; f.algoCompleted = year; f.algoEdge = .025 + skill / 4000
    }
  } else f.algoEdge = Math.max(0, f.algoEdge - .012)
  saveFinance(b, f)
  const stmt: Statement = { year, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0,
    revenue: Math.round(revenue), salesTax: 0, netRevenue: Math.round(revenue), cogs: Math.round(cogs), wages: Math.round(wages), keyStaff: Math.round(keyStaff), rent: Math.round(rent), marketing: Math.round(marketing), interest: Math.round(interest), upkeep: Math.round(upkeep), other: b.yearCosts, otherIncome: b.yearIncome,
    ownerPay, pbt: Math.round(pbt), corpTax: Math.round(tax), net, cashErosion: 0, cycle, openFraction: open, employees: staffCount }
  b.last = stmt
  return { stmt, inventoryEnd: 0, wantedStaff: staffCount, unpaidSalary: Math.max(0, Math.round(ownerDraw) - ownerPay), market: null }
}

export function financeManagerTurn(_g: GameState, b: BizState): void {
  const f = financeView(b), skill = b.manager?.skill ?? 35
  f.strategy = skill >= 85 ? 'balanced' : skill < 45 ? 'aggressive' : 'cautious'
  f.controls = clampN(skill, 25, 95)
  if (b.industry !== 'investmentFirm') f.reserveRatio = skill >= 80 ? .3 : .2
  saveFinance(b, f)
}

export function financeInfo(g: GameState, b: BizState): string {
  const f = financeView(b)
  return b.industry === 'investmentFirm'
    ? `Segregated client AUM ${money(f.aum)} · fee ${pct(f.feeRate, 1)} + 10% above the client high-water mark · last return ${pct(f.lastReturn, 1)} · team skill ${Math.round(financeTeamSkill(g, b))}/100`
    : `Customer deposits ${money(f.deposits)} (liabilities, not company cash) · reserves ${money(f.reserves)} · loans ${money(f.loanBook)} · bonds ${money(f.bonds)} · confidence ${Math.round(f.confidence)}/100${f.lastRun ? ' · withdrawals became a bank run' : ''}`
}

export function queueFinanceReport(g: GameState, a: Asset, b: BizState): void {
  const f = financeView(b)
  notice(g, `${a.name}: Financial Institution Report`, `${financeInfo(g, b)}\n${b.last?.year ?? g.year}: fee/interest income ${money(b.last?.revenue ?? 0)}, net ${money(b.last?.net ?? 0)}. Own company cash ${money(b.cash)}.\n${f.lastDefaults > 0 ? `Credit and liquidity losses: ${money(f.lastDefaults)}. ` : ''}${f.lastWithdrawals > 0 ? `Client withdrawals ${money(f.lastWithdrawals)}. ` : ''}Set risk, reserves and rates from Financial Operations. This is not a price-and-production company.`, { emoji: a.emoji, tone: (b.last?.net ?? 0) >= 0 ? 'good' : 'bad' })
}

export function financeNodes(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a), f = financeView(b), investment = b.industry === 'investmentFirm'
  const action = (key: string, label: string, run: (gg: GameState) => void, subtitle?: string): MenuNode => ({ type: 'action', id: `finance.${a.id}.${key}`, label, emoji: '🏦', subtitle,
    disabledReason: (gg) => manageBlock(gg, a), run })
  const nodes: MenuNode[] = [{ type: 'info', id: `finance.${a.id}.books`, text: financeInfo(g, b), emoji: a.emoji },
    { type: 'info', id: `finance.${a.id}.risk`, text: `Risk: ${f.strategy} · controls ${Math.round(f.controls)}/100 · research edge ${pct(f.algoEdge, 1)}${f.algoResearching ? ` (testing year ${f.algoProgress}/2)` : ''}. Named employees' skills and morale drive outcomes. Customer principal cannot be paid as dividends, used for research, or counted as equity.`, emoji: '🛡️' }]
  for (const strategy of ['cautious', 'balanced', 'aggressive'] as const) nodes.push(action(`risk.${strategy}`, `${strategy[0].toUpperCase()}${strategy.slice(1)} ${investment ? 'Portfolio' : 'Credit'} Mandate`, (gg) => setFinancePolicy(gg, a.id, 'strategy', strategy), strategy === 'aggressive' ? 'Higher exposure and downside; no guaranteed outperformance' : strategy === 'cautious' ? 'Less upside; lower default and market risk' : 'Balance growth and capital protection'))
  nodes.push(action('controls', f.controls >= 80 ? 'Use Standard Risk Controls' : 'Invest in Strong Risk Controls', (gg) => setFinancePolicy(gg, a.id, 'controls', financeView(readBiz(gg, findBusiness(gg, a.id) ?? a)).controls >= 80 ? 50 : 90), 'More scrutiny and compliance cost; fewer credit and operating losses'))
  if (investment) {
    for (const rate of [.01, .015, .025]) nodes.push(action(`fee.${rate}`, `Management Fee ${pct(rate, 1)}`, (gg) => setFinancePolicy(gg, a.id, 'fees', rate), 'High fees increase receipts but reduce retention'))
  } else {
    for (const ratio of [.15, .3, .5]) nodes.push(action(`reserves.${ratio}`, `Reserve Target ${pct(ratio)}`, (gg) => setFinancePolicy(gg, a.id, 'reserves', ratio), 'Hold liquid client reserves instead of earning loan interest'))
    for (const rate of [.01, .025, .045]) nodes.push(action(`deposits.${rate}`, `Deposit Interest ${pct(rate, 1)}`, (gg) => setFinancePolicy(gg, a.id, 'depositRate', rate), 'Interest paid to customers is a real annual expense'))
    for (const rate of [.06, .09, .14]) nodes.push(action(`loans.${rate}`, `Loan Rate ${pct(rate)}`, (gg) => setFinancePolicy(gg, a.id, 'loanRate', rate), 'Expensive credit raises default risk'))
  }
  nodes.push({ type: 'action', id: `finance.${a.id}.outreach`, label: 'Attract New Clients', emoji: '📣', subtitle: 'Paid outreach; customer funds stay segregated', disabledReason: (gg) => manageBlock(gg, a) ?? (yearActionsUsed(gg, `finance.outreach.${a.id}`) ? 'Outreach already funded this year.' : null), run: (gg) => attractFinanceClients(gg, a.id) },
    { type: 'action', id: `finance.${a.id}.algo`, label: 'Invent an Original Market Algorithm', emoji: '🧠', subtitle: `${money(financeAlgoCost(b))} own company cash · 2 fiscal years · Inventor only · edge decays`, disabledReason: (gg) => manageBlock(gg, a) ?? financeAlgoBlock(gg, readBiz(gg, findBusiness(gg, a.id) ?? a)), run: (gg) => researchFinanceAlgorithm(gg, a.id) })
  return nodes
}
