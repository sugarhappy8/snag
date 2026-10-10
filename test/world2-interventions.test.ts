import { describe, expect, it, vi } from 'vitest'
import { yearActionsUsed } from '../src/game/core'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { boardOf } from '../src/game/business/board-state'
import { capexBudget, reserveDollars } from '../src/game/business/board-vote'
import { techOf, techPlan } from '../src/game/business/deeptech-core'
import { initTech } from '../src/game/business/deeptech-found'
import { simulateDeepTechYearImpl } from '../src/game/business/deeptech-sim'
import { bookYear, costFactor, planFor, simulateYear } from '../src/game/business/economy'
import * as companyEconomy from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { normalizeBiz, type BizState } from '../src/game/business/state'
import { bookSupply, readSupply, supplyConditions } from '../src/game/business/supply'
import { equipmentUpgradeCost, inputContractQuote, purchaseEquipmentUpgrade, purchaseInputContract, purchaseTraining, setSupplyTarget, signInputContract, staffTrainingCost, supplyPolicyNodes } from '../src/game/business/supply-policy'
import { effectiveAutomation, effectiveTraining, grantSupplyAutomation, grantSupplyTraining, readSupplyPolicy, saveSupplyPolicy, withSupplyPolicy } from '../src/game/business/supply-policy-state'
import { bestResilienceMove } from '../src/game/business/supply-resilience'
import { promisePrice } from '../src/game/business/util'
import type { Industry } from '../src/game/data/markets'
import { ensureEconomy } from '../src/game/economy'
import { economyOf, economyState, sectorOf, storeEconomy } from '../src/game/economy/model'
import type { Asset, GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function fixture(industry: Industry = 'manufacturing') {
  const g = makeTestGame(72, { age: 35, money: 1e9 })
  ensureEconomy(g)
  const a = createBusinessAsset(g, 'Resilient Works', newBiz(g, industry, 'us', 'Chicago', { cash: 100_000_000, founded: 2020, production: 1_000_000 }), 1_000_000)
  g.assets.push(a)
  return { g, b: a.details as unknown as BizState, a }
}
function conditions(g: GameState, industry: string, availability: number, workforce = 1, skills = .3) {
  const next = structuredClone(economyState(g)!)
  next.year = g.year; next.countries.us.year = g.year; next.countries.us.skills = skills
  next.countries.us.sectors[sectorOf(industry)].availability = availability
  next.countries.us.sectors[sectorOf(industry)].workforce = workforce
  storeEconomy(g, next)
}
function target(b: BizState, v: number) { saveSupplyPolicy(b, { ...readSupplyPolicy(b), target: v }) }
function walk(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap(n => n.type === 'menu' && depth < 4 ? [n, ...walk(g, n.children(g), depth + 1)] : [n])
}
function action(g: GameState, a: Asset, id: string): MenuAction {
  const n = walk(g, businessView(g, a)).find(x => x.id === `${id}.${a.id}`)
  if (n?.type !== 'action') throw new Error(`Missing ${id}`)
  return n
}

describe('World 2: funded resilience interventions', () => {
  it('loads old saves without free training or inventories and normalizes bounded policies', () => {
    const { g, b } = fixture(), before = JSON.stringify(g)
    expect(readSupplyPolicy(b)).toEqual({ target: .12, training: 0, trainingYear: 0, automation: 0, automationYear: 0 })
    expect(readSupply(b).stock).toBe(0)
    const damaged = { ...b, supply: { v: 1, policy: { target: 200, training: 9, trainingYear: 999999, automation: -9, contract: { from: 99999, until: 999999, price: 1e30, quantity: 1e30 }, procurement: { year: 2026, limit: -8 } } } }
    expect(readSupplyPolicy(damaged)).toMatchObject({ target: .5, training: .8, trainingYear: 100000, automation: 0,
      contract: { from: 99999, until: 100000, price: 1e12, quantity: 1e12, supplier: 'standard' }, procurement: { limit: 0 } })
    expect(readSupplyPolicy({ ...damaged, supply: { ...damaged.supply, v: 99 } })).toEqual(readSupplyPolicy(b))
    expect(JSON.stringify(g)).toBe(before)
  })

  it('sets a strategic target without awarding stock or spending cash and rejects invalid or unauthorized input', () => {
    const { g, b, a } = fixture(), cash = b.cash
    expect(setSupplyTarget(g, a.id, .5)).toBe(true)
    expect(readSupplyPolicy(b).target).toBe(.5)
    expect(readSupply(b).stock).toBe(0); expect(b.cash).toBe(cash)
    const unchanged = JSON.stringify(g)
    for (const v of [NaN, Infinity, -.01, .51]) expect(setSupplyTarget(g, a.id, v)).toBe(false)
    expect(setSupplyTarget(g, 'missing', .1)).toBe(false)
    expect(JSON.stringify(g)).toBe(unchanged)
    g.character.age = 12
    expect(setSupplyTarget(g, a.id, .25)).toBe(false)
    expect(signInputContract(g, a.id)).toBe(false)
    const service = fixture('software')
    expect(setSupplyTarget(service.g, service.a.id, .5)).toBe(false)
    expect(signInputContract(service.g, service.a.id)).toBe(false)
  })

  it('funds reserve stock only from spare cash and real deliveries, with no cash-out for reducing the target', () => {
    const { g, b } = fixture(); target(b, .5)
    const rich = bookSupply(g, b, g.year, 1000, 500, 100)
    expect(rich.purchased).toBe(750)
    const poor = bookSupply(g, { ...b, cash: 500 * 70 + 3500 }, g.year, 1000, 500, 100)
    expect(poor.purchased).toBe(510) // 20% of $3500 spare cash / $70 input basket
    const empty = bookSupply(g, { ...b, cash: 0 }, g.year, 1000, 500, 100)
    expect(empty.purchased).toBe(500)
    conditions(g, b.industry, .15)
    const short = bookSupply(g, b, g.year, 1000, 500, 100)
    expect(short.purchased).toBe(150); expect(short.next!.stock).toBe(0)
    b.supply = rich.next as never; target(b, 0)
    const cash = b.cash, stock = readSupply(b).stock
    expect(b.cash).toBe(cash); expect(readSupply(b).stock).toBe(stock)
    const next = bookSupply(g, b, g.year + 1, 1000, 0, 100)
    expect(next.purchaseCost).toBe(0); expect(next.storageCost).toBeGreaterThan(0)
    expect(next.next!.bookValue + next.materialsCost).toBeCloseTo(rich.next!.bookValue, 7)
  })

  it('charges a fixed contract once, caps its annual volume, preserves grades, expires, and can overpay falling prices', () => {
    const { g, b, a } = fixture(); target(b, 0)
    const quote = inputContractQuote(g, b)!, cash = b.cash, costs = b.yearCosts
    expect(signInputContract(g, a.id)).toBe(true)
    expect(b.cash).toBe(cash - quote.fee); expect(b.yearCosts).toBe(costs + quote.fee)
    expect(signInputContract(g, a.id)).toBe(false)
    expect(b.cash).toBe(cash - quote.fee)
    const p = readSupplyPolicy(b)
    p.contract = { from: g.year, until: g.year + 2, price: 70, quantity: 400, supplier: 'standard' }; saveSupplyPolicy(b, p)
    const expensive = bookSupply(g, b, g.year, 1000, 800, 200)
    expect(expensive.purchaseCost).toBe(400 * 70 + 400 * 140)
    expect(expensive.contractSaving).toBe(400 * 70)
    const cheap = bookSupply(g, b, g.year + 2, 1000, 800, 50)
    expect(cheap.purchaseCost).toBe(400 * 70 + 400 * 35)
    expect(cheap.contractSaving).toBe(-400 * 35)
    const expired = bookSupply(g, b, g.year + 3, 1000, 800, 50)
    expect(expired.purchaseCost).toBe(800 * 35)
    expect(expired.contractSaving).toBe(0)
    expect(bookSupply(g, { ...b, supplier: 'premium' }, g.year, 1000, 400, 200 * 1.18).purchaseCost).toBe(Math.round(400 * 70 * 1.18))
    expect(bookSupply(g, { ...b, supplier: 'budget' }, g.year, 1000, 400, 200 * .86).purchaseCost).toBe(Math.round(400 * 70 * .86))
    const expanded = bookSupply(g, b, g.year, 2000, 1600, 200)
    expect(expanded.contractSaving).toBe(expensive.contractSaving)
    conditions(g, b.industry, .15)
    expect(bookSupply(g, b, g.year, 1000, 800, 200).produced).toBe(150)
    const lastYear = { ...g, year: 100000 }, newCompany = { ...b, supply: undefined }
    expect(inputContractQuote(lastYear, newCompany)?.contract.until).toBe(100000)
  })

  it('keeps contract stock accounting, projections and saved policies exactly aligned with real settlement', () => {
    const { g, b } = fixture()
    const quote = inputContractQuote(g, b)!
    expect(purchaseInputContract(b, quote)).toBe(true)
    target(b, .5)
    const snapshot = JSON.stringify(g), opening = b.cash
    const p = planFor(g, b, g.year, { noise: 1 })
    const book = bookYear(g, b, g.year, p, b.production, 0)
    expect(book.supply.next!.bookValue + book.supply.materialsCost).toBeCloseTo(book.supply.purchaseCost, 6)
    supplyPolicyNodes(g, g.assets[0]); inputContractQuote(g, b)
    expect(JSON.stringify(g)).toBe(snapshot)
    const settled = simulateYear(g, b, g.year, 0, 1)
    expect(settled.stmt).toEqual(book.stmt); expect(b.cash).toBe(book.cash)
    const expected = opening + book.stmt.net + quote.fee + book.supply.cashAdjustment - book.stmt.cashErosion
    expect(Math.abs(b.cash - expected)).toBeLessThanOrEqual(1.01)
    expect(readSupply(normalizeBiz(JSON.parse(JSON.stringify(b)), g.year))).toEqual(book.supply.next)
  })

  it('reuses the existing paid quality programs, qualifies services without stocking them, and ages the benefit', () => {
    const { g, b, a } = fixture('software')
    conditions(g, b.industry, .15, .45, .2)
    const baseline = bookSupply(g, b, g.year, 1000, 1000, 100), cash = b.cash
    const training = staffTrainingCost(b, 0), upgrade = equipmentUpgradeCost(b, 0)
    action(g, a, 'biz.training').run(g)
    expect(yearActionsUsed(g, `biz.training.${a.id}`)).toBe(1)
    expect(b.cash).toBe(cash - training); expect(b.yearCosts).toBe(training)
    const trained = bookSupply(g, b, g.year, 1000, 1000, 100)
    expect(trained.produced).toBeGreaterThan(baseline.produced)
    action(g, a, 'biz.upgrade').run(g)
    expect(yearActionsUsed(g, `biz.upgrade.${a.id}`)).toBe(1)
    expect(b.cash).toBe(cash - training - upgrade); expect(b.yearCosts).toBe(training + upgrade)
    expect(bookSupply(g, b, g.year, 1000, 1000, 100).produced).toBeGreaterThan(trained.produced)
    expect(readSupply(b).stock).toBe(0); expect(readSupply(b).bookValue).toBe(0)
    expect(bookSupply(g, b, g.year, 1000, 1000, 100).next).toBeNull()
    const policy = readSupplyPolicy(b)
    expect(effectiveTraining(policy, g.year + 5)).toBeCloseTo(.2 * .9 ** 5)
    expect(effectiveAutomation(policy, g.year + 5)).toBeCloseTo(.08 * .97 ** 5)
    expect(effectiveTraining(policy, g.year - 1)).toBe(0)
  })

  it('does not train nonexistent workers or automate missing materials; repeat programs cost more for less gain', () => {
    const { g, b, a } = fixture()
    conditions(g, b.industry, 1, .45, .9)
    grantSupplyTraining(b, g.year, .8)
    expect(supplyConditions(g, b, g.year).trainingRecovery).toBe(0)
    expect(bookSupply(g, b, g.year, 1000, 1000, 100).produced).toBe(450)
    grantSupplyAutomation(b, g.year, .35)
    expect(bookSupply(g, b, g.year, 1000, 1000, 100).produced).toBe(642)
    conditions(g, b.industry, .15, .45, .2)
    expect(bookSupply(g, b, g.year, 1000, 1000, 100).produced).toBe(150)
    b.supply = undefined
    const c0 = purchaseTraining(g, a, b), p0 = readSupplyPolicy(b).training
    const c1 = purchaseTraining(g, a, b), p1 = readSupplyPolicy(b).training
    expect(c1).toBeGreaterThan(c0); expect(p1 - p0).toBeLessThan(p0)
    b.cash = 0; const unchanged = JSON.stringify(g)
    expect(purchaseTraining(g, a, b)).toBe(0); expect(purchaseEquipmentUpgrade(g, a, b)).toBe(0)
    expect(JSON.stringify(g)).toBe(unchanged)
  })

  it('uses the same capped contract and durable training in deep-tech actual books', () => {
    const { g, b, a } = fixture('semiconductor'); initTech(g, b)
    const t = techOf(b); t.stage = 3; t.level = 75; t.plant = 2; t.venture = 0
    b.manager = null; b.production = 1e9
    conditions(g, b.industry, .5, .5, .2)
    const quote = inputContractQuote(g, b)!
    expect(purchaseInputContract(b, quote)).toBe(true)
    expect(purchaseTraining(g, a, b)).toBeGreaterThan(0)
    const plan = techPlan(g, b, t, g.year, { noise: 1 })
    expect(plan.capacity).toBeLessThanOrEqual(plan.equipmentCapacity * .51)
    expect(readSupplyPolicy(b).contract?.quantity).toBe(quote.contract.quantity)
    const snap = JSON.stringify(g)
    techPlan(g, b, t, g.year, { noise: 1 }); supplyPolicyNodes(g, a)
    expect(JSON.stringify(g)).toBe(snap)
    const actual = simulateDeepTechYearImpl(g, a, b, g.year, 0)
    expect(actual.stmt.produced).toBeLessThanOrEqual(plan.capacity)
    expect(readSupply(b).last?.trainingRecovery).toBeGreaterThan(0)
    expect(readSupplyPolicy(b).contract).toEqual(quote.contract)
  })

  it('evaluates bounded central/downside choices without RNG, future-state writes or unaffordable investment', () => {
    const { g, b, a } = fixture(); conditions(g, b.industry, .8, .65, .2)
    const before = JSON.stringify(g), cash = 5_000_000
    const move = bestResilienceMove(g, a, b, cash)
    expect(move).not.toBeNull()
    expect(move!.cost + move!.commitment).toBeLessThanOrEqual(cash)
    expect(move!.value).toBeGreaterThan(0)
    expect(move!.value).toBeCloseTo(move!.central * .7 + move!.downside * .3)
    expect(bestResilienceMove(g, a, b, cash)).toEqual(move)
    expect(bestResilienceMove(g, a, b, 0)).toBeNull()
    expect(JSON.stringify(g)).toBe(before)
    const full = withSupplyPolicy({ ...b, quality: 100, morale: 100 }, { ...readSupplyPolicy(b), target: 0, training: .8, trainingYear: g.year, automation: .35, automationYear: g.year })
    expect(bestResilienceMove(g, a, full, .01)).toBeNull()
  })

  it('keeps elite CEO interventions inside the existing board reserve and spending budget', () => {
    const { g, b, a } = fixture(); conditions(g, b.industry, .8, .65, .2)
    b.ceo = 'manager'; b.manager = { firstName: 'Alex', lastName: 'Able', gender: 'female', skill: 95, salary: 100_000, since: g.year, style: 'steady', integrity: 100 }
    const st = boardOf(b); st.limits = { capex: .02, reserve: 12, pay: 1.5 }
    const beforeBudget = capexBudget(b, st), reserve = reserveDollars(b, st)
    smartManagerTurn(g, a, b)
    expect(b.cash).toBeGreaterThanOrEqual(reserve - 1)
    expect(st.spent).toBeLessThanOrEqual(beforeBudget + 1)
    expect(st.memo.some(line => /Resilience review/.test(line))).toBe(true)
    expect(st.memo.some(line => /scenarios, not guaranteed/.test(line))).toBe(true)
    const zero = fixture(); zero.b.ceo = 'manager'; zero.b.manager = { ...b.manager }
    boardOf(zero.b).limits = { capex: 0, reserve: 12, pay: 1.5 }
    smartManagerTurn(zero.g, zero.a, zero.b)
    expect(readSupplyPolicy(zero.b).training).toBe(0)
    expect(readSupplyPolicy(zero.b).automation).toBe(0)
    expect(readSupplyPolicy(zero.b).contract).toBeUndefined()
    expect(readSupplyPolicy(zero.b).target).toBe(.12)
  })

  it('quotes grade-adjusted inputs consistently with the existing cost factor', () => {
    const { g, b } = fixture()
    for (const supplier of ['standard', 'premium', 'budget'] as const) {
      const bb = { ...b, supplier }, q = inputContractQuote(g, bb)!, plan = planFor(g, bb, g.year, { noise: 1 })
      expect(q.spotPrice).toBeCloseTo(plan.unitCost * costFactor(bb) * .7)
    }
    const poor = { ...b, cash: 0 }, quote = inputContractQuote(g, poor)!
    expect(purchaseInputContract(poor, quote)).toBe(false)
    expect(poor.supply).toBeUndefined()
  })

  it('honors this year\'s promised price when valuing resilience investment', () => {
    const { g, b, a } = fixture(), price = b.price * .5
    promisePrice(g, a.id, price)
    const spy = vi.spyOn(companyEconomy, 'bestPlan')
    try {
      bestResilienceMove(g, a, b, 1_000_000)
      expect(spy).toHaveBeenCalledWith(g, b, { fast: true, maxPrice: Math.round(price * 100) / 100 })
    } finally { spy.mockRestore() }
  })

  it('keeps headquarters conditions in scenarios after the last domestic operating site closes', () => {
    const { g, b, a } = fixture()
    b.outlets = [{ countryId: 'gb', city: 'London', count: 1, opened: 2020 }]
    const world = structuredClone(economyState(g)!)
    world.countries.us.inflation = .31
    storeEconomy(g, world)
    const before = JSON.stringify(g), spy = vi.spyOn(companyEconomy, 'planFor')
    try {
      bestResilienceMove(g, a, b, 1_000_000)
      const future = spy.mock.calls.map(call => call[0]).filter(gg => gg.year === g.year + 1)
      expect(future.length).toBeGreaterThan(0)
      for (const gg of future) expect(economyOf(gg, 'us').inflation).toBe(.31)
      expect(JSON.stringify(g)).toBe(before)
    } finally { spy.mockRestore() }
  })

  it('honors an elite CEO\'s cash-backed target procurement ceiling in actual settlement', () => {
    const choices = (['manufacturing', 'bakery', 'furniture', 'packaging', 'restaurant'] as Industry[]).map(industry => {
      const x = fixture(industry), { g, b, a } = x
      conditions(g, b.industry, 1, .95, .9)
      b.quality = 100; b.morale = 100; b.brand = 100; b.demandShock = 2
      saveSupplyPolicy(b, { target: 0, training: .8, trainingYear: g.year, automation: .35, automationYear: g.year,
        contract: { ...inputContractQuote(g, b)!.contract } })
      return { ...x, move: bestResilienceMove(g, a, b, 1_000_000) }
    })
    const chosen = choices.find(x => x.move?.kind === 'target' && x.move.commitment > 0)
    expect(chosen).toBeDefined()
    const { g, b, a } = chosen!
    b.ceo = 'manager'; b.manager = { firstName: 'Alex', lastName: 'Able', gender: 'female', skill: 95, salary: 100_000, since: g.year, style: 'steady', integrity: 100 }
    const st = boardOf(b); st.limits = { capex: .01, reserve: 12, pay: 1.5 }
    smartManagerTurn(g, a, b)
    const policy = readSupplyPolicy(b)
    expect(st.memo.some(line => /set the input-reserve target/.test(line))).toBe(true)
    expect(policy.procurement?.year).toBe(g.year)
    expect(policy.procurement!.limit).toBeGreaterThan(0)
    const projection = bookYear(g, b, g.year, planFor(g, b, g.year, { noise: 1 }), b.production, 0)
    const extra = Math.max(0, projection.supply.purchased - projection.supply.produced)
    expect(extra * Math.max(projection.supply.spotPrice!, projection.supply.inputPrice!)).toBeLessThanOrEqual(policy.procurement!.limit + 1)
    simulateYear(g, b, g.year, 0, 1)
    expect(readSupplyPolicy(b).procurement).toEqual(policy.procurement)
    expect(readSupply(b).last?.purchased).toBe(projection.supply.purchased)
  })
})
