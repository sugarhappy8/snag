// Investment firms 2.0: the hired CEO's autopilot. Decisions use only what anyone could know
// (skill, track record, fees, the honest outlooks in fund-outlook.ts): no market foresight, no
// peeking at hidden startup quality beyond a skill-scaled read. Only b changes, except a small
// booked cost for due diligence and the yearly campaign.
import type { GameState } from '../types'
import { boardView, mandateDef, readBoard, type Mandate } from './board-state'
import { reserveDollars } from './board-vote'
import { financeProfileOf } from './finance-leadership'
import { brokerEra, firmKey, leaderSkill, quantBlock, styleBlock, STRATEGIES, STYLES } from './fund-model'
import { brokerOutlook, feeOutlook, hedgeFeeOutlook, strategyOutlook, styleOutlook } from './fund-outlook'
import { campaignCost } from './fund-actions'
import { readFund, saveFund, type FundState, type FundStyle, type HedgeStrategy } from './fund-state'
import { ddCost, investingFund, managerRead, newStartup, newVcFund, openPitches, proRata, raiseQuote, vcDeployed } from './fund-vc'
import type { BizState } from './state'
import { clampN, money, pct } from './util'

/** Cash the firm keeps for a year of payroll and rent before any optional spending. */
function reserveOf(b: BizState): number {
  const pay = b.staff.reduce((t, s) => t + s.salary, 0) + (b.manager?.salary ?? 0)
  return pay + b.employees * 60_000 + 100_000
}

interface Policy {
  horizon: number
  risk: number
  coinvest: number
  campaignSkill: number
  campaignReserve: number
}

const POLICIES: Record<Mandate, Policy> = {
  growth: { horizon: 8, risk: .05, coinvest: .25, campaignSkill: 45, campaignReserve: 1.25 },
  balanced: { horizon: 6, risk: .2, coinvest: .1, campaignSkill: 55, campaignReserve: 2 },
  profit: { horizon: 2, risk: .4, coinvest: .05, campaignSkill: 65, campaignReserve: 3 },
  cash: { horizon: 0, risk: .8, coinvest: 0, campaignSkill: 101, campaignReserve: Infinity },
}

export interface FundAutopilotResult { lines: string[]; big: boolean }

/** Values are selected on pricing grids; compare their grid units, not floating-point deltas. */
function gridChanged(before: number, after: number, step: number): boolean {
  return Math.round(before / step) !== Math.round(after / step)
}

function mandateOf(g: GameState, b: BizState): { mandate: Mandate; reserve: number } {
  const a = g.assets.find(x => x.kind === 'business' && (x.details as unknown) === b)
  const board = a ? boardView(g, a, b) : readBoard(b.board)
  return { mandate: board.mandate, reserve: reserveDollars(b, board) }
}

function approachBias(b: BizState, choice: FundStyle | HedgeStrategy): number {
  const approach = financeProfileOf(b.manager)?.approach
  if (approach === 'systematic' && (choice === 'index' || choice === 'quant')) return .02
  if (approach === 'fundamental' && (choice === 'value' || choice === 'longShort')) return .018
  if (approach === 'growth' && choice === 'growth') return .02
  if (approach === 'macro' && (choice === 'global' || choice === 'bonds')) return .014
  if (approach === 'event' && choice === 'event') return .02
  if (approach === 'risk' && (choice === 'bonds' || choice === 'index' || choice === 'longShort')) return .016
  if (approach === 'client' && (choice === 'index' || choice === 'global')) return .01
  return 0
}

function riskPenalty(b: BizState, base: number): number {
  const risk = financeProfileOf(b.manager)?.risk
  return base * (risk === 'bold' ? .7 : risk === 'cautious' ? 1.35 : 1)
}

function assetChoice(g: GameState, b: BizState, f: FundState, p: Policy, skill: number): { style: FundStyle; fee: number } {
  const allowed = (Object.keys(STYLES) as FundStyle[]).filter(s => !styleBlock(s, b.countryId, g.year))
  if (skill < 40) {
    const style = allowed.includes('index') ? 'index' : allowed.includes('bonds') ? 'bonds' : allowed[0] ?? f.style
    return { style, fee: STYLES[style].normFee }
  }
  const options = allowed.map(style => {
    const trial = { ...f, style }
    let fee = trial.fee, feeValue = -Infinity
    for (let k = 1; k <= 40; k++) {
      const candidate = k * .0005
      const o = feeOutlook(g, b, trial, candidate)
      const value = o.revenue * Math.pow(Math.max(.1, 1 + o.flow), p.horizon)
      if (value > feeValue) { feeValue = value; fee = candidate }
    }
    const o = styleOutlook(g, b, trial, style, fee)
    const score = feeValue / Math.max(1, f.aum) + o.rank * .01 - o.swing * riskPenalty(b, p.risk) + approachBias(b, style)
    return { style, fee, score }
  })
  return options.sort((x, y) => y.score - x.score)[0] ?? { style: f.style, fee: f.fee }
}

function hedgeChoice(g: GameState, b: BizState, f: FundState, p: Policy, skill: number): { strategy: HedgeStrategy; mgmt: number; perf: number } {
  const choices: HedgeStrategy[] = skill < 50 ? ['longShort'] : ['longShort', 'event', ...(!quantBlock(b.countryId, g.year) ? ['quant' as const] : [])]
  const strategy = choices.map(s => {
    const o = strategyOutlook(g, b, f, s)
    return { strategy: s, score: o.expected - o.swing * riskPenalty(b, p.risk) + approachBias(b, s) }
  }).sort((x, y) => y.score - x.score)[0]?.strategy ?? 'longShort'
  const trial = { ...f, strategy, lev: 1, call: 'flat' as const }
  let mgmt = f.mgmt, perf = f.perf, best = -Infinity
  for (let m = 0; m <= 12; m++) for (let k = 0; k <= 12; k++) {
    const a = m * .0025, bps = k * .025
    const o = hedgeFeeOutlook(g, b, trial, a, bps)
    const value = o.revenue * Math.pow(Math.max(.1, 1 + o.flow), p.horizon)
    if (value > best) { best = value; mgmt = a; perf = bps }
  }
  return { strategy, mgmt, perf }
}

function brokerCommission(b: BizState, f: FundState, year: number, horizon: number): number {
  let best = f.commission, value = -Infinity
  for (let k = 0; k <= 200; k++) {
    const commission = k * .0001
    const o = brokerOutlook(b, f, commission, year)
    const candidate = o.revenue * Math.pow(Math.max(.1, 1 + o.growth), horizon)
    if (candidate > value + 1e-9) { value = candidate; best = commission }
  }
  return best
}

export function fundAutopilot(g: GameState, b: BizState): FundAutopilotResult {
  const f = readFund(b)
  const afterBooks = f.lastYear >= g.year - 1
  if (afterBooks && f.decisionYear === g.year) return { lines: [], big: false }
  // The post-settlement decision is next year's plan. Preserve it through that year's pre-book pass.
  if (!afterBooks && f.decisionYear >= g.year - 1) return { lines: [], big: false }
  const skill = leaderSkill(g, b)
  const { mandate, reserve } = mandateOf(g, b)
  const policy = POLICIES[mandate]
  const before = { style: f.style, fee: f.fee, strategy: f.strategy, mgmt: f.mgmt, perf: f.perf, coinvest: f.coinvest, commission: f.commission, funds: f.funds.length, cos: f.cos.length }
  // Spending decisions are made once a year, right after the books close.
  if (f.type === 'asset') {
    const choice = assetChoice(g, b, f, policy, skill)
    f.style = choice.style
    f.fee = clampN(choice.fee, .0005, .02)
  } else if (f.type === 'hedge') {
    const choice = hedgeChoice(g, b, f, policy, skill)
    f.strategy = choice.strategy
    if (f.strategy === 'quant' && quantBlock(b.countryId, g.year)) f.strategy = 'longShort'
    f.lev = 1; f.call = 'flat'
    f.mgmt = choice.mgmt; f.perf = choice.perf
    const keep = Math.max(reserveOf(b), reserve)
    f.coinvest = skill >= 70 ? Math.max(0, Math.round((b.cash - keep) * policy.coinvest)) : 0
  } else if (f.type === 'broker') {
    f.commission = clampN(skill >= 50 ? brokerCommission(b, f, g.year, policy.horizon) : brokerEra(b.countryId, g.year).normCommission * 1.05, 0, .02)
  } else if (afterBooks) vcAutopilot(g, b, f, skill, mandate)
  let campaign = 0
  if (afterBooks && f.type !== 'vc' && f.campaign < g.year && skill >= policy.campaignSkill) {
    const cost = campaignCost(b, f)
    if (b.cash - cost > Math.max(reserveOf(b), reserve) * policy.campaignReserve) {
      b.cash -= cost; b.yearCosts += cost
      f.campaign = g.year; f.boost = Math.min(.3, f.boost + (f.type === 'broker' ? .06 : .05))
      campaign = cost
    }
  }
  if (afterBooks) f.decisionYear = g.year
  saveFund(b, f)
  if (!afterBooks) return { lines: [], big: false }
  const lines = [`Followed the ${mandateDef(mandate).label.toLowerCase()} mandate.`]
  if (f.type === 'asset') lines.push(`Set ${STYLES[f.style].label.toLowerCase()} style at ${pct(f.fee, 2)} annual fees.`)
  else if (f.type === 'hedge') {
    lines.push(`Set ${STRATEGIES[f.strategy].label.toLowerCase()} with ${pct(f.mgmt, 2)} management and ${pct(f.perf, 1)} performance fees.`)
    lines.push(f.coinvest > 0 ? `Set next year's co-investment target to ${money(f.coinvest)}.` : "Set next year's co-investment target to zero.")
  } else if (f.type === 'broker') lines.push(`Set commissions at ${pct(f.commission, 2)} per trade.`)
  else {
    const raised = f.funds.length - before.funds, made = f.cos.length - before.cos
    if (raised > 0) lines.push('Raised another venture fund from limited partners.')
    lines.push(made > 0 ? `Backed ${made} startup${made === 1 ? '' : 's'} from this year's pipeline.` : 'Made no new venture investments.')
  }
  if (campaign > 0) lines.push(`Spent ${money(campaign)} attracting new clients.`)
  const big = campaign > 0 || before.style !== f.style || before.strategy !== f.strategy
    || gridChanged(before.fee, f.fee, .0005) || gridChanged(before.mgmt, f.mgmt, .0025)
    || gridChanged(before.perf, f.perf, .025) || gridChanged(before.commission, f.commission, .0001)
    || Math.abs(before.coinvest - f.coinvest) >= Math.max(100_000, b.valuation * .01)
    || before.funds !== f.funds.length || before.cos !== f.cos.length
  return { lines, big }
}

function vcAutopilot(g: GameState, b: BizState, f: FundState, skill: number, mandate: Mandate): void {
  const key = firmKey(b)
  // Follow-ons: back the companies that look strong, if the fund can afford it.
  for (const c of f.cos) {
    if (c.status !== 'live' || !c.round || c.round.take !== -1) continue
    const fund = f.funds.find(x => x.n === c.fund)
    const read = managerRead(skill, `${key}|${c.id}|${c.round.year}`, c.q)
    c.round.take = read >= 45 && !!fund && fund.dry >= proRata(c, c.round) ? 1 : 0
  }
  // A fund that's done investing: raise the next one first, so this year's founders get a look.
  if (!investingFund(f, g.year)) {
    const q = raiseQuote(g, b, f, g.year)
    if (!q.block && q.size > 0) f.funds.push(newVcFund(q.n, q.size, g.year))
  }
  // New checks: diligence the interesting ones, back the best, three a year (four, and less picky,
  // when the fund is behind a five-year investing pace: LPs size the next fund on what went to
  // work). The pitches the CEO passes on stay open, so an owner who isn't running the firm can
  // still back one.
  if (f.actYear !== g.year) { f.actYear = g.year; f.acted = []; f.dd = [] }
  const current = investingFund(f, g.year)
  const behind = !!current && vcDeployed(current) < Math.min(1, (g.year - current.vintage + 1) * .2)
  const tilt = mandate === 'growth' ? -4 : mandate === 'profit' ? 3 : mandate === 'cash' ? 6 : 0
  const extra = mandate === 'growth' ? 1 : mandate === 'cash' ? -1 : 0
  const bar = (behind ? 28 : 38) + tilt, most = Math.max(1, (behind ? 4 : 3) + extra)
  let made = 0
  const reads = openPitches(g, b, f, g.year).map(p => {
    let read = managerRead(skill, `${key}|${p.id}`, p.q)
    const cost = ddCost(b, p.ask)
    if (f.dd.includes(p.id)) read = (p.lo + p.hi) / 2
    else if (read >= bar - 3 && b.cash - cost > reserveOf(b)) {
      b.cash -= cost; b.yearCosts += cost
      f.dd.push(p.id)
      read = (p.lo + p.hi) / 2
    }
    return { p, read }
  }).sort((x, y) => y.read - x.read)
  for (const { p, read } of reads) {
    const fund = investingFund(f, g.year)
    if (fund && fund.n === p.fund && made < most && read >= bar && fund.dry >= p.ask) {
      fund.dry -= p.ask; fund.invested += p.ask
      f.cos.push(newStartup(p, g.year))
      f.acted.push(p.id)
      made++
    }
  }
}
