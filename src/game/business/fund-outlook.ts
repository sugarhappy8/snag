// Investment firms 2.0: honest expectations. The Business-talent hints and the hired CEO read
// these pure functions, built from the same formulas the fiscal year uses (fund-model.ts) but with
// expected values instead of the year's hidden draws. Nothing here can see next year's market.
import { exchangeInfo } from '../invest/engine'
import type { GameState } from '../types'
import { alphaMean, assetFlow, brokerEra, capacityFactor, commissionEffect, fundSkill, hedgeFlow, nextRep, orderFlowPay, poolSize, quantBlock, STYLES, tradeSize } from './fund-model'
import type { FundState, FundStyle, HedgeStrategy } from './fund-state'
import { leadershipPower } from './leadership'
import type { BizState } from './state'
import { clampN } from './util'

/** Standard normal CDF (Abramowitz–Stegun). */
export function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + .3275911 * x)
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x)
  return clampN(z >= 0 ? .5 * (1 + erf) : .5 * (1 - erf), 0, 1)
}

/** Long-run yearly drift of the firm's home market (what an honest planner assumes). */
export function marketDrift(countryId: string): number {
  return clampN(exchangeInfo(countryId).ex.drift, -.02, .12)
}

export interface StyleOutlook { style: FundStyle; edge: number; rank: number; flow: number; swing: number }

/** Expected peer rank and client flows for a style at a fee (no market timing involved). */
export function styleOutlook(g: GameState, b: BizState, f: FundState, style: FundStyle, fee = f.fee): StyleOutlook {
  const def = STYLES[style], skill = fundSkill(g, b)
  const drift = marketDrift(b.countryId) * def.beta
  const edge = alphaMean(skill) * def.alpha * capacityFactor(f.aum, skill, b) - (fee - def.normFee) * (1 + drift)
  const rank = phi(edge / Math.max(.002, def.active))
  const flow = assetFlow({ rep: nextRep(f.rep, rank), rank, fee, normFee: def.normFee, sales: leadershipPower(b, 'sales'), boost: 0, age: g.year - b.founded,
    aum: f.aum, pool: poolSize(b.countryId, g.year), crash: false, confidence: .5 })
  return { style, edge, rank, flow, swing: def.active }
}

/** The style with the best expected client growth for this team (Business hint, hired CEO). */
export function bestStyle(g: GameState, b: BizState, f: FundState, allowed: (s: FundStyle) => boolean): StyleOutlook | null {
  const options = (Object.keys(STYLES) as FundStyle[]).filter(allowed).map(s => styleOutlook(g, b, f, s, Math.min(f.fee, STYLES[s].normFee * 1.2)))
  return options.sort((x, y) => y.flow - x.flow)[0] ?? null
}

/** Fee revenue next year at a fee, with the expected client flow it causes. */
export function feeOutlook(g: GameState, b: BizState, f: FundState, fee: number): { revenue: number; flow: number; rank: number } {
  const o = styleOutlook(g, b, f, f.style, fee)
  return { revenue: f.aum * (1 + marketDrift(b.countryId) * STYLES[f.style].beta) * fee, flow: o.flow, rank: o.rank }
}

/** The fee that maximizes expected fee income six years out (growth versus margin). */
export function bestFee(g: GameState, b: BizState, f: FundState): number {
  let best = f.fee, value = -Infinity
  for (let k = 1; k <= 40; k++) {
    const fee = k * .0005
    const o = feeOutlook(g, b, f, fee)
    const v = o.revenue * Math.pow(1 + o.flow, 6)
    if (v > value) { value = v; best = fee }
  }
  return best
}

export interface StrategyOutlook { strategy: HedgeStrategy; expected: number; swing: number }

/** Expected yearly return before fees, at the market's long-run drift (macro depends on the call). */
export function strategyOutlook(g: GameState, b: BizState, f: FundState, strategy: HedgeStrategy): StrategyOutlook {
  const skill = fundSkill(g, b), cap = capacityFactor(f.aum, skill, b), drift = marketDrift(b.countryId)
  const alpha = alphaMean(skill) * (strategy === 'macro' ? 1 : cap)
  if (strategy === 'longShort') return { strategy, expected: .45 * drift + .025 + alpha * 1.2, swing: .1 }
  if (strategy === 'event') return { strategy, expected: .3 * drift + .055 - .015 + alpha * .8, swing: .07 }
  if (strategy === 'quant') return { strategy, expected: .1 * drift + .03 + (f.algoEdge + (skill - 50) * .0003) * cap + alpha * .6, swing: .05 }
  return { strategy, expected: alpha * .5, swing: .18 * f.lev }
}

export function bestStrategy(g: GameState, b: BizState, f: FundState): StrategyOutlook {
  const options = (['longShort', 'event', 'quant'] as HedgeStrategy[]).filter(s => s !== 'quant' || !quantBlock(b.countryId, g.year))
  return options.map(s => strategyOutlook(g, b, f, s)).sort((x, y) => (y.expected - y.swing * .2) - (x.expected - x.swing * .2))[0]
}

/** Expected client flow for a hedge fund's fees (for the fee sliders). */
export function hedgeFeeOutlook(g: GameState, b: BizState, f: FundState, mgmt: number, perf: number): { revenue: number; flow: number } {
  const o = strategyOutlook(g, b, f, f.strategy)
  const gross = Math.max(0, o.expected)
  const revenue = f.aum * (1 + gross) * mgmt + perf * f.aum * Math.max(0, gross - mgmt)
  const flow = hedgeFlow({ rep: f.rep, rank: .5, net: gross - mgmt - perf * Math.max(0, gross - mgmt), mgmt, perf, underWater: false, sales: leadershipPower(b, 'sales'),
    boost: 0, age: g.year - b.founded, aum: f.aum, pool: poolSize(b.countryId, g.year) })
  return { revenue, flow }
}

/** Brokerage pricing: activity and account growth from the commission against the era's rate. */
export function commissionOutlook(norm: number, commission: number): { activity: number; growth: number } {
  return commissionEffect(commission, norm)
}

/** Commission income next year at a price, with the client growth it causes (same math as the year). */
export function brokerOutlook(b: Pick<BizState, 'countryId'>, f: FundState, commission: number, year: number): { revenue: number; growth: number } {
  const era = brokerEra(b.countryId, year), e = commissionEffect(commission, era.normCommission)
  const perTrade = tradeSize(b.countryId, year) * commission + (commission < .0003 ? orderFlowPay(b.countryId, year) : 0)
  return { revenue: f.accounts * era.trades * e.activity * perTrade, growth: e.growth }
}

/** The commission that maximizes commission income six years out (price versus client growth). */
export function bestCommission(b: Pick<BizState, 'countryId'>, f: FundState, year: number): number {
  let best = f.commission, value = -Infinity
  for (let k = 0; k <= 200; k++) {
    const c = k * .0001
    const o = brokerOutlook(b, f, c, year)
    const v = o.revenue * Math.pow(1 + o.growth, 6)
    if (v > value + 1e-9) { value = v; best = c }
  }
  return best
}
