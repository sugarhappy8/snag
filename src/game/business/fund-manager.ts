// Investment firms 2.0: the hired CEO's autopilot. Decisions use only what anyone could know
// (skill, track record, fees, the honest outlooks in fund-outlook.ts): no market foresight, no
// peeking at hidden startup quality beyond a skill-scaled read. Only b changes, except a small
// booked cost for due diligence and the yearly campaign.
import type { GameState } from '../types'
import { brokerEra, firmKey, leaderSkill, quantBlock, styleBlock, STYLES } from './fund-model'
import { bestFee, feeOutlook, hedgeFeeOutlook, strategyOutlook, styleOutlook } from './fund-outlook'
import { campaignCost } from './fund-actions'
import { readFund, saveFund, type FundState, type FundStyle, type HedgeStrategy, type MacroCall } from './fund-state'
import { ddCost, investingFund, managerRead, newStartup, newVcFund, openPitches, proRata, raiseQuote, vcDeployed } from './fund-vc'
import type { BizState } from './state'
import { clampN } from './util'
import { mandateDef, readBoard, type Mandate } from './board-state'

/** Cash the firm keeps for a year of payroll and rent before any optional spending. */
function reserveOf(b: BizState): number {
  const pay = b.staff.reduce((t, s) => t + s.salary, 0) + (b.manager?.salary ?? 0)
  return pay + b.employees * 60_000 + 100_000
}

function managerRisk(b: BizState, mandate: Mandate): number {
  const base = mandate === 'growth' ? 2 : mandate === 'cash' ? 0 : 1
  const tilt = b.manager?.finance?.risk === 'bold' ? 1 : b.manager?.finance?.risk === 'cautious' ? -1 : 0
  return clampN(base + tilt, 0, 2)
}

function styleBias(b: BizState, style: FundStyle): number {
  const approach = b.manager?.finance?.approach
  if (approach === 'systematic') return style === 'index' ? .1 : 0
  if (approach === 'fundamental') return style === 'value' ? .08 : 0
  if (approach === 'growth') return style === 'growth' ? .1 : 0
  if (approach === 'macro') return style === 'global' ? .08 : style === 'bonds' ? .03 : 0
  if (approach === 'risk') return style === 'bonds' ? .1 : style === 'index' ? .06 : 0
  if (approach === 'client') return style === 'index' || style === 'global' ? .04 : 0
  return 0
}

function chooseAssetStyle(g: GameState, b: BizState, f: FundState, skill: number, mandate: Mandate): FundStyle {
  const allowed = (Object.keys(STYLES) as FundStyle[]).filter(s => !styleBlock(s, b.countryId, g.year))
  if (skill < 40) return allowed.includes('index') ? 'index' : allowed.includes('bonds') ? 'bonds' : 'value'
  const risk = managerRisk(b, mandate)
  const penalty = (mandate === 'cash' ? 1.4 : mandate === 'balanced' ? .75 : mandate === 'profit' ? .45 : .15) + (1 - risk) * .2
  const score = (style: FundStyle): number => {
    const o = styleOutlook(g, b, f, style, Math.min(f.fee, STYLES[style].normFee * 1.2))
    const trial = { ...f, style }
    const fee = bestFee(g, b, trial)
    const yieldRate = feeOutlook(g, b, trial, fee).revenue / Math.max(1, f.aum)
    const core = mandate === 'growth' ? o.flow * 1.6 + o.rank * .15
      : mandate === 'profit' ? yieldRate * 24 + o.flow * .35 + o.rank * .1
      : mandate === 'cash' ? yieldRate * 20 + o.flow * .2 + o.rank * .15
      : o.flow * .75 + o.rank * .35
    const safe = mandate === 'cash' && (style === 'bonds' || style === 'index') ? .06 : 0
    return core - o.swing * penalty + styleBias(b, style) + safe
  }
  return [...allowed].sort((x, y) => score(y) - score(x))[0] ?? f.style
}

function strategyBias(b: BizState, strategy: HedgeStrategy): number {
  const approach = b.manager?.finance?.approach
  if (approach === 'systematic') return strategy === 'quant' ? .14 : 0
  if (approach === 'fundamental') return strategy === 'longShort' ? .1 : 0
  if (approach === 'macro') return strategy === 'macro' ? .18 : 0
  if (approach === 'event') return strategy === 'event' ? .14 : 0
  if (approach === 'risk') return strategy === 'longShort' ? .08 : strategy === 'event' ? .04 : 0
  return 0
}

function chooseHedgeStrategy(g: GameState, b: BizState, f: FundState, skill: number, mandate: Mandate): HedgeStrategy {
  if (skill < 50) return 'longShort'
  const risk = managerRisk(b, mandate)
  const drawdown = f.hwm > 0 ? clampN(1 - f.aum / f.hwm, 0, 1) : 0
  const penalty = (mandate === 'cash' ? 1.1 : mandate === 'balanced' ? .55 : mandate === 'profit' ? .35 : .08)
    + (2 - risk) * .15 + drawdown * (mandate === 'growth' ? .3 : 1.4) + (f.compliance < 40 ? .35 : 0)
  const choices: HedgeStrategy[] = ['longShort', 'event']
  if (!quantBlock(b.countryId, g.year)) choices.push('quant')
  // Macro is a visible, risk-taking mandate choice. A default balanced CEO never quietly turns the
  // whole fund into a leveraged directional bet.
  if (mandate === 'growth' && skill >= 70) choices.push('macro')
  const score = (strategy: HedgeStrategy): number => {
    const o = strategyOutlook(g, b, f, strategy)
    return o.expected - o.swing * penalty + strategyBias(b, strategy)
  }
  return choices.sort((x, y) => score(y) - score(x))[0] ?? 'longShort'
}

/** A macro CEO reads only already-booked markets: trend-following is a view, never foresight. */
function macroCall(f: FundState, risk: number): MacroCall {
  const recent = f.marks.slice(-3).map(m => m.m)
  const trend = recent.length ? recent.reduce((t, x, i) => t + x * (i + 1), 0) / recent.reduce((t, _x, i) => t + i + 1, 0) : 0
  if (Math.abs(trend) < (risk >= 2 ? .025 : .06)) return risk >= 2 ? 'bull' : 'flat'
  return trend > 0 ? 'bull' : 'bear'
}

function hedgeTerms(g: GameState, b: BizState, f: FundState, mandate: Mandate): { mgmt: number; perf: number } {
  let best = { mgmt: .02, perf: .2 }, value = -Infinity
  for (let m = 0; m <= 12; m++) for (let p = 0; p <= 12; p++) {
    const mgmt = m * .0025, perf = p * .025
    const o = hedgeFeeOutlook(g, b, f, mgmt, perf)
    const yieldRate = o.revenue / Math.max(1, f.aum)
    const score = mandate === 'growth' ? o.flow * 4 + yieldRate * 20
      : mandate === 'profit' ? yieldRate * 100 + o.flow * .5
      : mandate === 'cash' ? yieldRate * 110 + o.flow * .25
      : yieldRate * 65 + o.flow * 1.5
    if (score > value) { value = score; best = { mgmt, perf } }
  }
  return best
}

/**
 * Run the hired fund CEO. The returned lines are an honest owner letter after settled books; tests
 * and detached group forecasts may ignore them. Decisions use only public history and expectations.
 */
export function fundAutopilot(g: GameState, b: BizState): string[] {
  const f = readFund(b)
  const skill = leaderSkill(g, b)
  const mandate = readBoard(b.board).mandate
  const lines: string[] = []
  // Spending decisions are made once a year, right after the books close.
  const afterBooks = f.lastYear >= g.year - 1
  if (f.type === 'asset') {
    const poor = f.marks.slice(-2).every(m => m.k >= 0 && m.k < .3) && f.marks.length >= 2
    const chosen = chooseAssetStyle(g, b, f, skill, mandate)
    if (poor || skill >= 60 || styleBlock(f.style, b.countryId, g.year)) f.style = chosen
    const optimum = skill >= 60 ? bestFee(g, b, f) : STYLES[f.style].normFee
    const target = mandate === 'growth' ? optimum * .9 : mandate === 'profit' || mandate === 'cash' ? optimum * 1.08 : optimum
    f.fee = clampN(target, .0005, .02)
    lines.push(`Set a ${STYLES[f.style].label.toLowerCase()} strategy and a ${(f.fee * 100).toFixed(2)}% management fee.`)
  } else if (f.type === 'hedge') {
    f.strategy = chooseHedgeStrategy(g, b, f, skill, mandate)
    if (f.strategy === 'quant' && quantBlock(b.countryId, g.year)) f.strategy = 'longShort'
    const risk = managerRisk(b, mandate)
    if (f.strategy === 'macro') {
      f.call = macroCall(f, risk)
      f.lev = f.compliance < 40 ? 1 : clampN(1 + risk * .5 + (risk >= 2 && skill >= 90 ? .5 : 0), 1, 2.5)
    } else { f.lev = 1; f.call = 'flat' }
    const terms = skill >= 55 ? hedgeTerms(g, b, f, mandate) : { mgmt: .02, perf: .2 }
    f.mgmt = terms.mgmt; f.perf = terms.perf
    const share = mandate === 'cash' ? 0 : mandate === 'growth' ? .25 : mandate === 'profit' ? .15 : .1
    const riskShare = b.manager?.finance?.risk === 'cautious' ? .5 : b.manager?.finance?.risk === 'bold' ? 1.25 : 1
    f.coinvest = skill >= 70 ? Math.max(0, Math.round((b.cash - reserveOf(b) * 2) * share * riskShare)) : 0
    lines.push(`Set ${f.strategy === 'longShort' ? 'long/short' : f.strategy === 'event' ? 'event-driven' : f.strategy} strategy${f.strategy === 'macro' ? `, ${f.call} at ${f.lev.toFixed(1)}\u{00D7}` : ''}; fees ${(f.mgmt * 100).toFixed(2)}% plus ${Math.round(f.perf * 100)}% above the high-water mark.`)
    lines.push(f.coinvest > 0 ? `Kept ${Math.round(f.coinvest).toLocaleString('en-US')} of company cash invested alongside clients.` : 'Kept company cash outside the client portfolio.')
  } else if (f.type === 'broker') {
    const era = brokerEra(b.countryId, g.year)
    const tilt = mandate === 'growth' ? .9 : mandate === 'profit' || mandate === 'cash' ? 1.05 : skill >= 70 ? .95 : 1.05
    f.commission = clampN(era.normCommission * tilt, 0, .02)
    lines.push(`Set commissions at ${(f.commission * 100).toFixed(2)}% in the ${era.label.toLowerCase()}.`)
  } else if (afterBooks) vcAutopilot(g, b, f, skill)
  if (afterBooks && f.type !== 'vc' && f.campaign < g.year && skill >= (mandate === 'growth' ? 45 : 55) && mandate !== 'cash') {
    const cost = campaignCost(b, f)
    if (b.cash - cost > reserveOf(b) * (mandate === 'growth' ? 1.5 : 2)) {
      b.cash -= cost; b.yearCosts += cost
      f.campaign = g.year; f.boost = Math.min(.3, f.boost + (f.type === 'broker' ? .06 : .05))
      lines.push(`Approved a client campaign costing ${Math.round(cost).toLocaleString('en-US')}.`)
    }
  }
  if (afterBooks) lines.unshift(`Worked to the ${mandateDef(mandate).label.toLowerCase()} mandate; effective finance leadership ${Math.round(skill)}/100.`)
  saveFund(b, f)
  return afterBooks ? lines : []
}

function vcAutopilot(g: GameState, b: BizState, f: FundState, skill: number): void {
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
  const bar = behind ? 28 : 38, most = behind ? 4 : 3
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
