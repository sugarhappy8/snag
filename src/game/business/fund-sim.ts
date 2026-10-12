// Investment firms 2.0: one fiscal year. Only b (the company) changes; g is read-only here and no
// RNG of g is used, so forecast clones (conglomerate ventures) are safe. Client money moves in the
// client books (AUM, LP funds); the firm earns fees, carry, commissions and its own capital's gains.
// The statement is booked once: one-off costs already paid from cash (yearCosts/yearIncome) are
// in the P&L but not moved again.
import { marketOf } from '../data/markets'
import { economyOf } from '../economy'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { cycleOf, localEcon, localPay, type YearResult } from './economy'
import {
  accountSize, alphaMean, assetFlow, brokerEra, capacityFactor, cashSpread, commissionEffect, confidenceOf, financingCost, fundRng, fundSkill,
  hedgeFlow, hedgeGross, hedgePeers, marketMove, marketYearOf, nextRep, normal, orderFlowPay, peerReturns, poolSize, rankAmong, STYLES, styleReturn, tradeSize,
} from './fund-model'
import { readFund, saveFund, type FundState, type FundType } from './fund-state'
import { advanceVc, fundTvpi } from './fund-vc'
import { industryDef } from './industries'
import { LEADERSHIP, leadershipPower } from './leadership'
import { totalOutlets, type BizState, type Statement } from './state'
import { allocatedCorporateTax } from './tax'
import { clampN } from './util'

/** Pay relative to the industry's base wage (hedge funds pay their people more). */
const PAY: Record<FundType, number> = { asset: 1, hedge: 1.5, vc: 1.2, broker: .9 }

/** One type's year: fee revenue, direct costs, head count, data costs and a pay premium for big books. */
interface TypeYear { revenue: number; cogs: number; staff: number; data: number; pay?: number }

/** Big money managers pay star salaries: pay per head rises with the book. */
function payScale(aum: number): number {
  return 1 + .6 * Math.log10(1 + Math.max(0, aum) / 5e8)
}

function wealthOf(countryId: string): number {
  return clampN(getCountry(countryId).wealth ?? 1, .3, 1.5)
}

/** Operating losses: a fat-finger trade, a botched transfer. Rarer with compliance and ops staff. */
function opLoss(f: FundState, ops: number, base: number, r: ReturnType<typeof fundRng>): number {
  const odds = clampN(.03 * (1.4 - f.compliance / 100) * (1 - .2 * ops), .004, .06)
  return r.next() < odds ? base * (.0005 + r.next() * .0025) : 0
}

function assetYear(g: GameState, b: BizState, f: FundState, year: number, open: number): TypeYear {
  const M = marketYearOf(year), r = fundRng(g, b, year, 'asset')
  const style = STYLES[f.style], skill = fundSkill(g, b)
  const market = marketMove(g, b.countryId, M)
  const sRet = styleReturn(g, f.style, b.countryId, M)
  const alpha = alphaMean(skill) * style.alpha * capacityFactor(f.aum, skill, b) + style.active * normal(r) + f.bonus
  const gross = clampN(sRet + alpha, -.95, 4)
  const start = f.aum
  const shown = f.ponzi ? Math.max(gross, .1 + r.next() * .04) : gross
  const afterRet = start * (1 + shown * open)
  const fees = f.fee * afterRet * open
  const afterFees = Math.max(0, afterRet - fees)
  if (f.ponzi) { f.ponzi.hole += Math.max(0, shown - gross) * start * open; f.ponzi.fees += fees }
  const net = start > 0 ? afterFees / start - 1 : shown - f.fee
  const rank = rankAmong(peerReturns(g, f.style, b.countryId, M, sRet, style.active, style.normFee), net)
  f.rep = nextRep(f.rep, rank)
  const flow = assetFlow({ rep: f.rep, rank, fee: f.fee, normFee: style.normFee, sales: leadershipPower(b, 'sales'), boost: f.boost, age: year - b.founded,
    aum: afterFees, pool: poolSize(b.countryId, year), crash: market < -.2, confidence: confidenceOf(g, b.countryId, year) })
  f.aum = Math.max(0, afterFees * (1 + flow * open))
  const loss = opLoss(f, leadershipPower(b, 'ops'), start, r)
  f.last = { ...f.last, fees, ret: net, market, rank, flow: f.aum - afterFees, opLoss: loss, own: 0, trades: 0, carry: 0 }
  const perHead = 60e6 * wealthOf(b.countryId)
  // Custody and trading, plus platform fees that grow once the fund is sold widely.
  const costRate = f.style === 'index' ? .0002 : .0008 + .0007 * Math.min(1, afterRet / 1e9)
  return { revenue: fees, cogs: afterRet * costRate * open * (1 - LEADERSHIP.unitCost * leadershipPower(b, 'ops')) + loss,
    staff: Math.max(2 * totalOutlets(b), Math.ceil(f.aum / perHead)), data: 0, pay: payScale(f.aum) }
}

function hedgeYear(g: GameState, b: BizState, f: FundState, year: number, open: number, fixed: number): TypeYear {
  const M = marketYearOf(year), r = fundRng(g, b, year, 'hedge')
  const skill = fundSkill(g, b)
  const market = marketMove(g, b.countryId, M)
  const cap = capacityFactor(f.aum, skill, b)
  // The algorithm finishes after two fiscal years and then fades as rivals copy it.
  if (f.algoStart > 0 && f.algoDone < f.algoStart && year >= f.algoStart + 1) {
    const works = r.next() < .7
    f.algoEdge = works ? (.02 + r.next() * .04) * (.7 + skill / 330) : .004
    f.algoDone = year
    f.last.news = [works ? 'algo:ok' : 'algo:dud']
  } else if (f.algoDone > 0 && f.algoDone < year) f.algoEdge *= .72
  const quantEdge = (f.strategy === 'quant' ? f.algoEdge + (skill - 50) * .0003 : f.algoEdge * .4) * cap
  const alpha = alphaMean(skill) * (f.strategy === 'macro' ? 1 : cap) + f.bonus
  const gross = hedgeGross(f.strategy, market, alpha, quantEdge, f, financingCost(b.countryId, M), r)
  const start = f.aum
  const shown = f.ponzi ? Math.max(gross, .1 + r.next() * .04) : gross
  const afterRet = start * (1 + shown * open)
  const mgmt = f.mgmt * afterRet * open
  const afterMgmt = afterRet - mgmt
  const perf = f.perf * Math.max(0, afterMgmt - f.hwm) * open
  const afterFees = Math.max(0, afterMgmt - perf)
  if (f.ponzi) { f.ponzi.hole += Math.max(0, shown - gross) * start * open; f.ponzi.fees += mgmt + perf }
  f.hwm = Math.max(f.hwm, afterFees)
  const net = start > 0 ? afterFees / start - 1 : shown
  const rank = rankAmong(hedgePeers(g, b.countryId, M, market), net)
  f.rep = nextRep(f.rep, rank)
  const flow = hedgeFlow({ rep: f.rep, rank, net, mgmt: f.mgmt, perf: f.perf, underWater: afterFees < f.hwm * .9, sales: leadershipPower(b, 'sales'),
    boost: f.boost, age: year - b.founded, aum: afterFees, pool: poolSize(b.countryId, year) })
  if (flow >= 0) { f.aum = afterFees * (1 + flow * open); f.hwm += afterFees * flow * open }
  else { const keep = 1 + flow * open; f.aum = afterFees * keep; f.hwm *= keep }
  // The firm's own capital rides alongside clients (no fees on it), funded only from spare cash.
  const own = Math.min(f.coinvest, Math.max(0, b.cash - fixed))
  const ownPnl = own * gross * open
  const loss = opLoss(f, leadershipPower(b, 'ops'), start, r)
  f.last = { ...f.last, fees: mgmt + perf, ret: net, market, rank, flow: f.aum - afterFees, opLoss: loss, own: ownPnl, trades: 0, carry: 0 }
  const perHead = 80e6 * wealthOf(b.countryId)
  return { revenue: mgmt + perf + Math.max(0, ownPnl), cogs: Math.max(0, -ownPnl) + afterRet * .0015 * open * (1 - LEADERSHIP.unitCost * leadershipPower(b, 'ops')) + loss,
    staff: Math.max(2 * totalOutlets(b), Math.ceil(f.aum / perHead)), data: 50_000 * wealthOf(b.countryId) * open * (1 + Math.log10(1 + f.aum / 1e8)), pay: payScale(f.aum) }
}

function brokerYear(g: GameState, b: BizState, f: FundState, year: number, open: number): TypeYear {
  const M = marketYearOf(year), r = fundRng(g, b, year, 'broker')
  const market = marketMove(g, b.countryId, M)
  const era = brokerEra(b.countryId, year)
  const effect = commissionEffect(f.commission, era.normCommission)
  const w = wealthOf(b.countryId), ops = leadershipPower(b, 'ops')
  const panic = market < -.2 ? 1.3 : market > .2 ? 1.15 : 1
  const trades = Math.round(f.accounts * era.trades * effect.activity * panic * open)
  const commissions = trades * tradeSize(b.countryId, year) * f.commission
  const orderFlow = f.commission < .0003 ? trades * orderFlowPay(b.countryId, year) : 0
  const interest = f.aum * .15 * cashSpread(b.countryId, year) * open
  const loss = opLoss(f, ops, f.aum * .2, r)
  const service = clampN(.5 + (f.compliance - 50) / 200 + .12 * ops + effect.growth - (loss > 0 ? .1 : 0), 0, 1)
  f.rep = clampN(f.rep * .7 + service * .3, 0, 1)
  // Adults who might hold a trading account, and the share one broker can realistically win.
  const cap = Math.max(.05, marketOf(b.countryId).populationM) * 1e6 * (era.electronic ? .2 : .06) * .25
  let growth = era.growth - .06 + effect.growth + .4 * (f.rep - .5) + .05 * leadershipPower(b, 'sales') + f.boost - (market < -.2 ? .03 : 0)
  if (growth > 0) growth *= clampN(1 - f.accounts / Math.max(1, cap), 0, 1)
  growth = clampN(growth, -.3, .6)
  const before = Math.max(1, f.accounts)
  f.accounts = Math.max(0, Math.round(f.accounts * (1 + growth * open)))
  const perAccount = f.aum / before
  f.aum = Math.max(0, f.aum * (1 + .7 * market * open) + (f.accounts - before) * Math.max(perAccount, accountSize(b.countryId, year) * .5))
  f.last = { ...f.last, fees: commissions + orderFlow + interest, ret: 0, market, rank: -1, flow: f.accounts - before, opLoss: loss, own: 0, trades, carry: 0 }
  return { revenue: commissions + orderFlow + interest,
    cogs: (f.accounts * era.servicing * w + trades * era.execution * w) * (1 - LEADERSHIP.unitCost * ops) + loss,
    staff: industryDef(b.industry).staff * totalOutlets(b) + Math.round(f.accounts / (era.electronic ? 25_000 : 2_500)), data: 0 }
}

function vcYear(g: GameState, b: BizState, f: FundState, year: number, open: number): TypeYear {
  const M = marketYearOf(year)
  const market = marketMove(g, b.countryId, M)
  const v = advanceVc(g, b, f, year, market < -.15, true, open)
  const live = f.funds.filter(x => !x.done)
  const seasoned = f.funds.filter(x => year - x.vintage >= 3)
  const tvpi = seasoned.length ? seasoned.reduce((t, x) => t + fundTvpi(f, x) * x.size, 0) / Math.max(1, seasoned.reduce((t, x) => t + x.size, 0)) : -1
  // Peer funds' multiples are roughly log-normal around 1.3×.
  const rank = tvpi < 0 ? -1 : clampN(.5 + .5 * Math.tanh((Math.log(Math.max(.05, tvpi)) - Math.log(1.3)) / .6 * 1.2), 0, 1)
  if (rank >= 0) f.rep = nextRep(f.rep, rank)
  f.last = { ...f.last, fees: v.fees + v.carry, ret: tvpi < 0 ? 0 : tvpi, market, rank, flow: 0, opLoss: 0, own: 0, trades: 0, carry: v.carry,
    news: [...v.unicorns.map(id => `u:${id}`), ...v.exits.filter(id => !v.unicorns.includes(id)).map(id => `x:${id}`), ...v.deaths.map(id => `d:${id}`)].slice(0, 8) }
  return { revenue: v.fees + v.carry, cogs: 30_000 * wealthOf(b.countryId) * open,
    staff: 2 * totalOutlets(b) + Math.floor(live.reduce((t, x) => t + x.size, 0) / 100e6), data: 0, pay: payScale(live.reduce((t, x) => t + x.size, 0) * 3) }
}

/** The fiscal year of an investment firm (simulateFinanceYear dispatches here). */
export function simulateFund(g: GameState, b: BizState, year: number, ownerDraw: number, bookedHomeSales: number | Record<string, number> = 0): YearResult {
  const f = readFund(b)
  if (f.lastYear >= year && b.last) return { stmt: b.last, inventoryEnd: 0, wantedStaff: b.employees, unpaidSalary: 0, market: null }
  const def = industryDef(b.industry), e = localEcon(b.industry, b.countryId, b.city)
  const economy = economyOf(g, b.countryId, year)
  const sites = totalOutlets(b), open = clampN(b.openFraction * (1 - b.capacityLoss), 0, 1)
  const wage = localPay(b.countryId, def.wage * PAY[f.type])
  const keyStaff = b.staff.reduce((t, x) => t + x.salary, 0) + (b.ceo === 'manager' ? b.manager?.salary ?? 0 : 0)
  const rent = e.rent * sites * economy.rent
  const compliance = localPay(b.countryId, 30_000) * sites * (.6 + f.compliance / 125)
  // The cash the firm needs for a year of fixed costs is never put at risk alongside clients.
  const fixed = Math.max(0, def.staff * sites * wage + keyStaff + rent + compliance)
  f.last = { ...f.last, news: [] }
  const t = f.type === 'asset' ? assetYear(g, b, f, year, open) : f.type === 'hedge' ? hedgeYear(g, b, f, year, open, fixed)
    : f.type === 'broker' ? brokerYear(g, b, f, year, open) : vcYear(g, b, f, year, open)
  const staffCount = Math.max(1, Math.round(t.staff))
  const wages = staffCount * wage * (t.pay ?? 1) * b.wageLevel * open * economy.wages * (1 - LEADERSHIP.overhead * leadershipPower(b, 'finance'))
  const revenue = t.revenue
  const cogs = t.cogs
  // Client marketing scales with recurring fees (not with lumpy carry or the firm's own gains).
  const marketing = Math.max(0, f.last.fees - f.last.carry) * .03 * b.marketingLevel
  const interest = b.debt * b.debtRate
  const upkeep = compliance + sites * e.capital * .005 + t.data
  const preSalary = revenue - cogs - wages - keyStaff - rent - marketing - interest - upkeep - b.yearCosts + b.yearIncome
  const booked = b.yearCosts - b.yearIncome
  const ownerPay = Math.round(clampN(ownerDraw, 0, Math.max(0, b.cash + preSalary + booked)))
  const pbt = preSalary - ownerPay
  const tax = allocatedCorporateTax(b.countryId, pbt, revenue, b.yearIncome, bookedHomeSales, g, year)
  const net = Math.round(pbt - tax)
  b.cash = Math.round(b.cash + net + booked)
  b.employees = staffCount; b.production = 0; b.inventory = 0
  f.boost = 0; f.bonus = 0; f.lastYear = year
  f.marks = [...f.marks, { y: year, r: f.last.ret, m: f.last.market, k: f.last.rank }].slice(-12)
  saveFund(b, f)
  const stmt: Statement = { year, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0,
    revenue: Math.round(revenue), salesTax: 0, netRevenue: Math.round(revenue), cogs: Math.round(cogs), wages: Math.round(wages), keyStaff: Math.round(keyStaff), rent: Math.round(rent),
    marketing: Math.round(marketing), interest: Math.round(interest), upkeep: Math.round(upkeep), other: b.yearCosts, otherIncome: b.yearIncome,
    // Funds never get the perfect-foresight top-up (executive-foresight.ts skips a set value).
    strategicIncome: 0,
    ownerPay, pbt: Math.round(pbt), corpTax: Math.round(tax), net, cashErosion: 0, cycle: cycleOf(g, b.countryId, year), openFraction: open, employees: staffCount }
  b.last = stmt
  return { stmt, inventoryEnd: 0, wantedStaff: staffCount, unpaidSalary: Math.max(0, Math.round(ownerDraw) - ownerPay), market: null }
}
