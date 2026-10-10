import { describe, expect, it } from 'vitest'
import { bookYear, bestPlan, costFactor, planFor, simulateYear, yearFixed } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { normalizeBiz, type BizState } from '../src/game/business/state'
import { bookSupply, readSupply, supplyConditions, supplyProfile } from '../src/game/business/supply'
import { runSupply } from '../src/game/business/market-strategy'
import { techOf, techPlan } from '../src/game/business/deeptech-core'
import { initTech } from '../src/game/business/deeptech-found'
import { simulateDeepTechYearImpl } from '../src/game/business/deeptech-sim'
import { closeBusiness } from '../src/game/business/exit'
import { ensureEconomy } from '../src/game/economy'
import { economyState, sectorOf, storeEconomy } from '../src/game/economy/model'
import type { Industry } from '../src/game/data/markets'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

function fixture(industry: Industry = 'manufacturing') {
  const g = makeTestGame(72, { age: 35, money: 1e9 })
  ensureEconomy(g)
  const b = newBiz(g, industry, 'us', 'Chicago', { cash: 100_000_000, founded: 2020, production: 1_000_000 })
  const a = createBusinessAsset(g, 'Material Works', b, 1_000_000)
  g.assets.push(a)
  return { g, b: a.details as unknown as BizState, a }
}
function conditions(g: GameState, industry: string, availability: number, workforce = 1) {
  const next = structuredClone(economyState(g)!)
  next.year = g.year
  next.countries.us.year = g.year
  next.countries.us.sectors[sectorOf(industry)].availability = availability
  next.countries.us.sectors[sectorOf(industry)].workforce = workforce
  storeEconomy(g, next)
}

describe('World 2: real company critical inputs', () => {
  it('reduces real quantities, wages, sales and profits when manufacturing cannot obtain materials', () => {
    const normal = fixture(), short = fixture()
    normal.b.production = Math.floor(planFor(normal.g, normal.b, normal.g.year).demand)
    short.b.production = normal.b.production
    conditions(short.g, short.b.industry, .2)
    const a = simulateYear(normal.g, normal.b, normal.g.year, 0, 1)
    const z = simulateYear(short.g, short.b, short.g.year, 0, 1)
    expect(z.stmt.produced).toBeLessThan(a.stmt.produced)
    expect(z.stmt.sold).toBeLessThan(a.stmt.sold)
    expect(z.stmt.wages).toBeLessThan(a.stmt.wages)
    expect(z.stmt.net).toBeLessThan(a.stmt.net)
    expect(z.market?.capacity).toBeLessThan(a.market?.capacity ?? 0)
  })

  it('respects the qualified workforce even with plentiful inputs and idle equipment', () => {
    const { g, b } = fixture()
    conditions(g, b.industry, 1, .45)
    const r = bookSupply(g, b, g.year, 1000, 1000, 100)
    expect(r.produced).toBe(450)
    expect(r.capacity).toBe(450)
  })

  it('carries paid stock into a later disruption and expenses its actual historical cost only once', () => {
    const { g, b } = fixture()
    const first = bookSupply(g, b, g.year, 1000, 600, 100)
    expect(first.next!.stock).toBeGreaterThan(0)
    expect(first.purchaseCost - first.materialsCost).toBeCloseTo(first.next!.bookValue, 6)
    b.supply = first.next as never
    g.year++
    conditions(g, b.industry, .15)
    const reserve = bookSupply(g, b, g.year, 1000, 1000, 200)
    const bare = bookSupply(g, { ...b, supply: undefined }, g.year, 1000, 1000, 200)
    expect(reserve.produced).toBeGreaterThan(bare.produced)
    expect(first.next!.bookValue + reserve.purchaseCost - reserve.materialsCost).toBeCloseTo(reserve.next!.bookValue, 6)
    expect(reserve.storageCost).toBeGreaterThan(0)
  })

  it('charges for existing diversification without masking purely domestic shortages or changing supplier prices', () => {
    const { g, b, a } = fixture()
    conditions(g, b.industry, .3)
    const before = bookSupply(g, b, g.year, 1000, 1000, 100), cash = b.cash
    expect(runSupply(g, a, b)).toBe(true)
    expect(b.cash).toBeLessThan(cash)
    expect(b.yearCosts).toBe(cash - b.cash)
    const after = bookSupply(g, b, g.year, 1000, 1000, 100)
    expect(after.produced).toBe(before.produced)
    expect(after.produced).toBeLessThan(1000)
    expect(supplyConditions(g, b, g.year).diversified).toBe(true)
    expect(supplyConditions(g, { ...b, supplier: 'premium' }, g.year).availability).toBe(supplyConditions(g, { ...b, supplier: 'budget' }, g.year).availability)
    expect(costFactor({ ...b, supplier: 'premium' })).toBe(1.18)
    expect(costFactor({ ...b, supplier: 'budget' })).toBe(.86)
    expect(supplyConditions(g, b, g.year + 6).diversified).toBe(false)
  })

  it('keeps projections pure and exactly applies the same cash, stock and statement at settlement', () => {
    const { g, b } = fixture()
    conditions(g, b.industry, .65, .8)
    const before = JSON.stringify(g), original = JSON.stringify(b)
    const plan = planFor(g, b, g.year, { noise: 1 })
    const book = bookYear(g, b, g.year, plan, b.production, 0)
    for (let i = 0; i < 3; i++) {
      expect(bookYear(g, b, g.year, plan, b.production, 0)).toEqual(book)
      bestPlan(g, b, { fast: true })
    }
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.stringify(b)).toBe(original)
    const actual = simulateYear(g, b, g.year, 0, 1)
    expect(actual.stmt).toEqual(book.stmt)
    expect(b.cash).toBe(book.cash)
    expect(readSupply(b)).toEqual(book.supply.next)
  })

  it('bridges noncash material expense and purchases without double-counting existing one-off cash transactions', () => {
    const { g, b } = fixture()
    b.supply = { v: 1, stock: 20_000, bookValue: 800_000, lastYear: 2025 }
    b.production = 10_000
    b.yearCosts = 15_000; b.yearIncome = 7_000
    const book = bookYear(g, b, g.year, planFor(g, b, g.year), b.production, 0, yearFixed(g, b))
    expect(book.supply.cashAdjustment).toBeGreaterThan(0)
    const expected = b.cash + book.stmt.net + b.yearCosts - b.yearIncome + book.supply.cashAdjustment - book.stmt.cashErosion
    expect(Math.abs(book.cash - expected)).toBeLessThanOrEqual(1.01)
    expect(800_000 + book.supply.purchaseCost - book.supply.materialsCost).toBeCloseTo(book.supply.next!.bookValue, 5)
  })

  it('does not create inventories for nonphysical services or duplicate their variable costs', () => {
    for (const industry of ['software', 'marketing', 'gym', 'hotel', 'education', 'realEstate', 'logistics', 'bank', 'investmentFirm'] as Industry[]) {
      const { g, b } = fixture(industry)
      conditions(g, industry, .15, .35)
      expect(supplyProfile(industry)).toBeNull()
      expect(bookSupply(g, b, g.year, 1000, 1000, 100)).toMatchObject({ produced: 350, next: null, cashAdjustment: 0, materialsCost: 0 })
      expect(b.supply).toBeUndefined()
    }
  })

  it('normalizes old and damaged inventory without awarding money, replaying purchases or consuming RNG', () => {
    const { g, b } = fixture()
    const before = JSON.stringify(g)
    expect(readSupply(b)).toEqual({ v: 1, stock: 0, bookValue: 0, lastYear: -1 })
    const loaded = normalizeBiz(JSON.parse(JSON.stringify(b)), g.year)
    expect(readSupply(loaded)).toEqual(readSupply(b))
    expect(loaded.cash).toBe(b.cash)
    expect(readSupply({ ...b, supply: { v: 1, stock: -300, bookValue: 1e30, lastYear: 2020 } })).toEqual({ v: 1, stock: 0, bookValue: 0, lastYear: 2020 })
    expect(readSupply({ ...b, supply: { v: 999, stock: 300, bookValue: 10000, lastYear: 2020 } })).toEqual({ v: 1, stock: 0, bookValue: 0, lastYear: -1 })
    expect(JSON.stringify(g)).toBe(before)
  })

  it('bounds stock, writes off surplus after a closure and produces deterministic saved replays', () => {
    const { g, b } = fixture()
    b.supply = { v: 1, stock: 5_000_000, bookValue: 2_000_000, lastYear: 2025 }
    const trimmed = bookSupply(g, b, g.year, 1000, 0, 100)
    expect(trimmed.next!.stock).toBeLessThanOrEqual(500)
    expect(trimmed.spoilageCost).toBeGreaterThan(0)
    expect(trimmed.next!.bookValue + trimmed.materialsCost).toBeCloseTo(2_000_000, 6)
    const replay = JSON.parse(JSON.stringify(g)) as GameState
    const bb = replay.assets[0].details as unknown as BizState
    expect(simulateYear(g, b, g.year, 0, 1)).toEqual(simulateYear(replay, bb, replay.year, 0, 1))
    expect(JSON.stringify(g)).toEqual(JSON.stringify(replay))
  })

  it('applies the same physical constraint and procurement ledger to semiconductor firms', () => {
    const { g, b, a } = fixture('semiconductor')
    initTech(g, b)
    const t = techOf(b)
    t.stage = 3; t.level = 75; t.plant = 2; t.venture = 0
    b.manager = null; b.production = 1e9
    conditions(g, b.industry, .2)
    const before = JSON.stringify(g)
    const p = techPlan(g, b, t, g.year, { noise: 1 })
    expect(p.capacity).toBeLessThan(p.equipmentCapacity * .3)
    expect(JSON.stringify(g)).toBe(before)
    const opening = b.cash
    const result = simulateDeepTechYearImpl(g, a, b, g.year, 0)
    const stored = readSupply(b)
    expect(result.stmt.produced).toBeLessThanOrEqual(p.capacity)
    expect(stored.lastYear).toBe(g.year)
    expect(stored.last!.produced).toBe(result.stmt.produced)
    expect(t.venture).toBe(0)
    // No R&D or one-offs here: purchases minus expensed input value equal the
    // actual increase in raw inventory. It is not charged again as profit.
    const expected = opening + result.stmt.net - stored.bookValue - result.stmt.cashErosion
    expect(Math.abs(b.cash - expected)).toBeLessThanOrEqual(2)
  })

  it('recovers funded inputs exactly once when an operating company is closed', () => {
    const { g, b, a } = fixture()
    b.supply = { v: 1, stock: 100, bookValue: 10_000, lastYear: 2025 }
    b.cash = 20_000; b.debt = 1_000
    const cash = g.character.money
    closeBusiness(g, a, b, 30_000)
    expect(g.character.money - cash).toBe(54_000)
    expect(g.assets.some(x => x.id === a.id)).toBe(false)
    closeBusiness(g, a, b, 30_000)
    expect(g.character.money - cash).toBe(54_000)
  })

  it('round-trips very large valid raw inventories without truncating paid cost basis', () => {
    const { g, b } = fixture()
    b.cash = 1e24
    const large = bookSupply(g, b, g.year, 1e12, 5e11, 1e12)
    expect(large.next!.bookValue).toBeGreaterThan(1e15)
    const loaded = normalizeBiz(JSON.parse(JSON.stringify({ ...b, supply: large.next })), g.year)
    expect(readSupply(loaded)).toEqual(large.next)
    expect(Number.isFinite(large.cashAdjustment)).toBe(true)
    expect(bookSupply(g, b, g.year, 1000, 1000, NaN).next!.bookValue).toBe(0)
  })
})
