// Bounded two-year what-ifs, not a new optimizer or a prediction of future events.
// The existing price/output plan and BookSupply accounting are used in both cases.
import { yearActionsUsed } from '../core'
import { ECONOMY_VERSION, economyOf, economyState, sectorOf, storeEconomy, type EconomyState } from '../economy/model'
import type { Asset, GameState } from '../types'
import { bestPlan, bookYear, planFor, type Book } from './economy'
import { isDeepTech } from './deeptech-state'
import { isFinanceFirm } from './finance-firm-state'
import { equipmentUpgradeCost, inputContractQuote, repeatProgramGain, staffTrainingCost } from './supply-policy'
import { effectiveAutomation, effectiveTraining, readSupplyPolicy, withSupplyPolicy } from './supply-policy-state'
import { readSupply, supplyProfile } from './supply'
import type { BizState } from './state'
import { priceCapOf } from './util'

export interface ResilienceMove {
  kind: 'target' | 'contract' | 'training' | 'automation'
  target?: number
  cost: number
  /** Extra reserve procurement committed now, but paid/capitalized only at settlement. */
  commitment: number
  procurementLimit?: number
  central: number
  downside: number
  value: number
}
function scenario(g: GameState, b: BizState, year: number, downside: boolean): GameState {
  const next = { ...g, year, flags: { ...g.flags } }, old = economyState(g)
  const state: EconomyState = old ? { ...old, year, countries: { ...old.countries }, previous: old.countries,
    rivals: old.rivals.map(a => ({ ...a, year })), previousRivals: old.rivals } : {
    v: ECONOMY_VERSION, year, countries: {}, previous: {}, history: {}, pending: [], policies: [], receipts: [], rivals: [], previousRivals: [],
  }
  for (const id of new Set([b.countryId, ...b.outlets.map(o => o.countryId)])) {
    const e = economyOf(g, id), sector = sectorOf(b.industry), s = e.sectors[sector]
    state.countries[id] = { ...e, year, sectors: { ...e.sectors, [sector]: downside ? { ...s,
      costs: Math.min(2.5, s.costs * 1.25), availability: Math.max(.15, s.availability - .18),
      workforce: Math.max(.35, s.workforce - .06), demand: Math.max(.25, s.demand * .92),
    } : { ...s } } }
  }
  storeEconomy(next, state)
  return next
}
function continuation(b: BizState, first: Book): BizState {
  return { ...b, cash: first.cash, inventory: first.inventoryEnd, employees: first.employees, last: first.stmt,
    supply: first.supply.next ? first.supply.next as unknown as BizState['supply'] : b.supply, yearCosts: 0, yearIncome: 0 }
}
function evaluate(g: GameState, b: BizState, normal: GameState, downside: GameState) {
  const first = bookYear(g, b, g.year, planFor(g, b, g.year, { noise: 1 }), b.production, 0)
  const next = continuation(b, first)
  const central = bookYear(normal, next, normal.year, planFor(normal, next, normal.year, { noise: 1 }), b.production, 0)
  const stress = bookYear(downside, next, downside.year, planFor(downside, next, downside.year, { noise: 1 }), b.production, 0)
  return { first, central: first.stmt.net + central.stmt.net, downside: first.stmt.net + stress.stmt.net }
}

/** At most six candidates × three ordinary books, one fast price/output search.
 * Returns null unless the weighted central/downside gain is positive and affordable. */
export function bestResilienceMove(g: GameState, a: Asset, b: BizState, available: number): ResilienceMove | null {
  if (!(available > 0) || isDeepTech(b) || isFinanceFirm(b) || b.industry === 'gameStudio') return null
  const plan = bestPlan(g, b, { fast: true, maxPrice: priceCapOf(g, a.id) ?? undefined }), base = { ...b, price: plan.price, production: plan.production }
  const normal = scenario(g, b, g.year + 1, false), downside = scenario(g, b, g.year + 1, true)
  const baseline = evaluate(g, base, normal, downside), p = readSupplyPolicy(base)
  const options: { move: ResilienceMove; b: BizState }[] = []
  const move = (kind: ResilienceMove['kind'], cost: number, bb: BizState, target?: number) => {
    if (cost > available || cost > b.cash) return
    options.push({ move: { kind, cost, commitment: 0, ...(target !== undefined ? { target } : {}), central: 0, downside: 0, value: 0 }, b: { ...bb, cash: bb.cash - cost, yearCosts: bb.yearCosts + cost } })
  }
  if (supplyProfile(b.industry)) {
    for (const target of [0, .25, .5]) if (Math.abs(target - p.target) > .01) {
      move('target', 0, withSupplyPolicy(base, { ...p, target, procurement: { year: g.year, limit: available } }), target)
    }
    const quote = inputContractQuote(g, b)
    if (quote) move('contract', quote.fee, withSupplyPolicy(base, { ...p, contract: quote.contract }))
  }
  const trains = yearActionsUsed(g, `biz.training.${a.id}`), upgrades = yearActionsUsed(g, `biz.upgrade.${a.id}`)
  const trainingGain = repeatProgramGain(trains), automationGain = repeatProgramGain(upgrades)
  if (effectiveTraining(p, g.year) < .79) move('training', staffTrainingCost(b, trains), withSupplyPolicy({ ...base, quality: Math.min(100, base.quality + 4.5 * trainingGain), morale: Math.min(100, base.morale + 3.5 * trainingGain) },
    { ...p, training: Math.min(.8, effectiveTraining(p, g.year) + .2 * trainingGain), trainingYear: g.year }))
  if (effectiveAutomation(p, g.year) < .34) move('automation', equipmentUpgradeCost(b, upgrades), withSupplyPolicy({ ...base, quality: Math.min(100, base.quality + 8.5 * automationGain) },
    { ...p, automation: Math.min(.35, effectiveAutomation(p, g.year) + .08 * automationGain), automationYear: g.year }))
  let best: ResilienceMove | null = null
  for (const candidate of options) {
    const result = evaluate(g, candidate.b, normal, downside), m = candidate.move
    m.central = result.central - baseline.central; m.downside = result.downside - baseline.downside
    m.value = m.central * .7 + m.downside * .3
    if (m.kind === 'target') {
      m.commitment = Math.max(0, result.first.supply.purchaseCost - baseline.first.supply.purchaseCost)
      // The committed ceiling applies to all extra stock, never production inputs.
      const required = Math.max(0, result.first.supply.produced - readSupply(b).stock)
      const extra = Math.max(0, result.first.supply.purchased - required)
      m.procurementLimit = Math.min(available, extra * Math.max(result.first.supply.spotPrice ?? 0, result.first.supply.inputPrice ?? 0))
    }
    if (m.cost + m.commitment > available || result.first.cash < Math.min(0, baseline.first.cash) || m.value <= Math.max(100, Math.abs(baseline.central) * .001)) continue
    if (!best || m.value > best.value) best = m
  }
  return best
}
