// Food and Drink Service: the math of the kitchen and the floor (hygiene grade, review rating, the peak
// squeeze, the menu, delivery, extended hours). foodFx is called directly with a hand-made context, so
// no family model is involved; the desk, the levers and the events are tested below in 'food desk'.
import { describe, expect, it } from 'vitest'
import { localEcon, type Worth } from '../src/game/business/economy'
import { nationalMarket } from '../src/game/business/dynamics'
import { SECTOR_BOUNDS, sectorValue } from '../src/game/business/sector-core'
import { FOOD } from '../src/game/business/sector-data'
import { auditCost, foodFx, foodHeader, foodRow, foodSeed, gradeOf, kitchenFine, squeeze } from '../src/game/business/sector-food'
import { seasonIndex, sectorHistoryLine, type SectorCtx, type SectorFx } from '../src/game/business/sector-kit'
import type { FoodState } from '../src/game/business/sector-state'
import type { BizState, KeyStaff } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState } from '../src/game/types'
import { deskGame, frozen } from './sector-kit'

const TRADES = ['restaurant', 'foodTruck', 'cafe', 'bakery'] as const
const BASE = 1_000_000

/** A company at the neutral point: quality 50, morale 60, charging the going price. */
function setup(trade: Industry, year = 2024): { g: GameState; a: Asset; b: BizState; going: number; seed: FoodState; ctx: (use: number) => SectorCtx } {
  const { g, a, b } = deskGame(trade, { year })
  b.quality = 50
  b.morale = 60
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  b.price = going
  return { g, a, b, going, seed: foodSeed(g, a, b, g.year - 1), ctx: (use) => ({ use, base: BASE, level: 1, going }) }
}

/** The synthetic worth of the plan: a 68% contribution margin on a million of sales. */
function worthOf(util: number): Worth {
  return { contrib: .68 * BASE, revenue: BASE, cogs: .32 * BASE, overhead: 0, wages: 0, util, brand: 0, quality: 0, morale: 0, moraleTarget: 0, karma: 0, arrest: 0 }
}

function lead(skill: number): KeyStaff {
  return { id: 'fs1', firstName: 'Ann', lastName: 'Lee', gender: 'female', age: 40, role: 'Food Safety Lead', focus: 'quality', skill, salary: 50_000, trait: 'steady', morale: 60, years: 0 }
}

/** The effect of a state over one fiscal year at the year being lived. */
function run(s: ReturnType<typeof setup>, st: FoodState, use: number, mode: 'book' | 'expected' = 'expected', fiscal = s.g.year): SectorFx {
  return foodFx(s.g, s.a, s.b, st, fiscal, mode, s.ctx(use))
}

function food(st: SectorFx['next']): FoodState {
  if (st.family !== 'food') throw new Error('expected a food record')
  return st
}

describe('food math', () => {
  it('seeds', () => {
    const s = setup('restaurant')
    expect(s.seed.hygiene).toBe(71)
    expect(s.seed.rating).toBeCloseTo(3.4, 10)
    expect(gradeOf(s.seed.hygiene)).toBe('B')
    expect(s.seed).toMatchObject({ menu: 1, channel: 0, hours: 0, audit: 0, since: s.g.year - 1, lastYear: s.g.year - 1 })
    s.b.quality = 100
    expect(foodSeed(s.g, s.a, s.b, 2020).hygiene).toBe(86)
    expect(foodSeed(s.g, s.a, s.b, 2020).rating).toBe(4.4)
    expect(gradeOf(64.9)).toBe('C')
    expect(gradeOf(65)).toBe('B')
    expect(gradeOf(84.9)).toBe('B')
    expect(gradeOf(85)).toBe('A')
  })

  it('squeeze thresholds', () => {
    const first = { restaurant: .75, foodTruck: .889, cafe: .70, bakery: .786 }
    for (const trade of TRADES) {
      const row = foodRow(trade)
      expect(row).not.toBeNull()
      if (!row) continue
      expect(squeeze(row, first[trade] - .001)).toBe(0)
      expect(squeeze(row, first[trade] + .01)).toBeGreaterThan(0)
      expect(squeeze(row, 1.3)).toBe(.12)
      expect(squeeze(row, 0)).toBe(0)
    }
    const restaurant = foodRow('restaurant')
    const truck = foodRow('foodTruck')
    expect(restaurant && Math.abs(squeeze(restaurant, .85) - .040)).toBeLessThan(.0005)
    expect(truck && squeeze(truck, .85)).toBe(0)
    expect(foodRow('bar')).toBeNull()
  })

  it('has the spec table', () => {
    for (const trade of TRADES) {
      const row = FOOD[trade]
      expect(row.dayparts.reduce((t, d) => t + d.share, 0)).toBeCloseTo(1, 10)
      expect(row.dayparts.reduce((t, d) => t + d.seat, 0)).toBeCloseTo(1, 10)
    }
    expect(FOOD.restaurant).toMatchObject({ amp: .04, waste: .08, platform: .25, fleet: .15 })
    expect(FOOD.foodTruck).toMatchObject({ amp: .10, waste: .07, platform: .15, fleet: 0 })
    expect(FOOD.cafe).toMatchObject({ amp: .03, waste: .06, platform: .20, fleet: .10 })
    expect(FOOD.bakery).toMatchObject({ amp: .02, waste: .12, platform: .15, fleet: .15 })
  })

  it('neutral identity', () => {
    for (const trade of TRADES) {
      const s = setup(trade)
      const fx = run(s, s.seed, .5)
      expect(fx.demand).toBeCloseTo(1, 9)
      expect(fx.income).toBe(0)
      expect(fx.costs).toBe(0)
      expect(fx.randIncome).toBe(0)
      expect(fx.randCosts).toBe(0)
      expect(fx.cost).toBeGreaterThanOrEqual(1)
      expect(fx.cost).toBeLessThanOrEqual(1.02)
      expect(fx.capLoss).toBe(0)
      expect(fx.open).toBe(1)
      expect(fx.note).toBeNull()
    }
    const restaurant = setup('restaurant')
    expect(run(restaurant, restaurant.seed, .5).cost).toBeCloseTo(1.0104, 6)
    const bakery = setup('bakery')
    expect(run(bakery, bakery.seed, .5).cost).toBeCloseTo(1.0156, 6)
  })

  it('hygiene', () => {
    const s = setup('restaurant')
    s.b.staff.push(lead(100))
    const chain = (audits: boolean): number[] => {
      let st = s.seed
      const out: number[] = []
      for (let k = 0; k < 3; k++) {
        const fiscal = s.g.year + k
        st = food(run(s, audits ? { ...st, audit: fiscal } : st, .5, 'expected', fiscal).next)
        out.push(st.hygiene)
      }
      return out
    }
    const plain = chain(false)
    expect(plain[0]).toBeCloseTo(78.7, 1)
    expect(plain[1]).toBeCloseTo(83.7, 1)
    expect(plain[2]).toBeCloseTo(87.0, 1)
    expect(gradeOf(plain[1])).toBe('B')
    expect(gradeOf(plain[2])).toBe('A')
    const audited = chain(true)
    expect(audited[0]).toBeCloseTo(82.9, 1)
    expect(audited[1]).toBeCloseTo(90.6, 1)

    // One audit, no Food Safety Lead.
    const bare = setup('restaurant')
    expect(food(run(bare, { ...bare.seed, audit: bare.g.year }, .5).next).hygiene).toBeCloseTo(75.2, 6)
    // An audit of another year does nothing.
    expect(food(run(bare, { ...bare.seed, audit: bare.g.year - 1 }, .5).next).hygiene).toBeCloseTo(71, 6)

    // Grade C costs 8% of demand, read from the stock at the start of the year.
    const low = setup('restaurant')
    expect(run(low, { ...low.seed, hygiene: 60 }, .5).demand).toBeCloseTo(.92, 9)
    expect(run(low, { ...low.seed, hygiene: 64.9 }, .5).demand).toBeCloseTo(.92, 9)
    expect(run(low, { ...low.seed, hygiene: 65 }, .5).demand).toBeCloseTo(1, 9)

    // Franchised outlets and a tired crew lower the target.
    const chainCo = setup('restaurant')
    chainCo.b.franchise = { units: 16 }
    expect(food(run(chainCo, chainCo.seed, .5).next).hygiene).toBeCloseTo(71 + .35 * -12, 6)
    const tired = setup('restaurant')
    tired.b.morale = 30
    expect(food(run(tired, tired.seed, .5).next).hygiene).toBeCloseTo(71 + .35 * -8, 6)
  })

  it('rating', () => {
    const s = setup('restaurant')
    let st = s.seed
    const seen: number[] = []
    for (let k = 0; k < 4; k++) {
      st = food(run(s, st, .85).next)
      seen.push(st.rating)
    }
    const want = [3.376, 3.362, 3.353, 3.348]
    seen.forEach((r, i) => expect(Math.abs(r - want[i])).toBeLessThan(.001))

    // The demand factor reads the stock at the start of the year.
    expect(run(s, { ...s.seed, rating: 4.4 }, .5).demand).toBeCloseTo(1.06, 9)
    expect(run(s, { ...s.seed, rating: 2.4 }, .5).demand).toBeCloseTo(.94, 9)
    // The target: grade, menu and price move it.
    expect(food(run(s, { ...s.seed, hygiene: 90 }, .5).next).rating).toBeCloseTo(3.4 + .4 * .3, 6)
    expect(food(run(s, { ...s.seed, hygiene: 60 }, .5).next).rating).toBeCloseTo(3.4 - .4 * .3, 6)
    expect(food(run(s, { ...s.seed, menu: 2 }, .5).next).rating).toBeCloseTo(3.4 + .4 * .2, 6)
    expect(food(run(s, { ...s.seed, menu: 0 }, .5).next).rating).toBeCloseTo(3.4 - .4 * .2, 6)
    const dear = setup('restaurant')
    dear.b.price = dear.going * 1.3
    expect(food(run(dear, dear.seed, .5).next).rating).toBeCloseTo(3.4 - .4 * 1.5 * .2, 6)
    // The rating stays between 1 and 5.
    expect(food(run(s, { ...s.seed, rating: 1 }, 1.3).next).rating).toBeGreaterThanOrEqual(1)
    s.b.quality = 100
    expect(food(run(s, { ...s.seed, rating: 5, hygiene: 95, menu: 2 }, .5).next).rating).toBeLessThanOrEqual(5)
  })

  it('menu', () => {
    const s = setup('restaurant')
    const lean = run(s, { ...s.seed, menu: 0 }, .5)
    const mid = run(s, { ...s.seed, menu: 1 }, .5)
    const rich = run(s, { ...s.seed, menu: 2 }, .5)
    expect(lean.demand).toBeCloseTo(.97, 9)
    expect(mid.demand).toBeCloseTo(1, 9)
    expect(rich.demand).toBeCloseTo(1.05, 9)
    expect(lean.cost).toBeCloseTo(.93 * 1.0104, 6)
    expect(mid.cost).toBeCloseTo(1.0104, 6)
    expect(rich.cost).toBeCloseTo(1.07 * 1.0104, 6)
    // Ops staff cut the waste term.
    const crew = setup('restaurant')
    crew.b.staff.push({ ...lead(100), id: 'o1', role: 'Head Chef', focus: 'ops' })
    expect(run(crew, crew.seed, .5).cost).toBeLessThan(1.0104)

    const best = (util: number): number => {
      const values = [lean, mid, rich].map((fx) => sectorValue(s.g, s.b, worthOf(util), fx))
      return values.indexOf(Math.max(...values))
    }
    expect(best(.5)).toBe(2)
    expect(best(1)).toBe(0)
  })

  it('delivery', () => {
    const s = setup('restaurant')
    const share = FOOD.restaurant.platform
    const off = run(s, s.seed, .5)
    const platform = run(s, { ...s.seed, channel: 1 }, .5)
    const fresh = share * (1 - .4)
    expect(platform.demand).toBeCloseTo(1 + fresh, 9)
    expect(platform.costs).toBeCloseTo(.30 * share * BASE * (1 + fresh), 4)
    const gain = (use: number, util: number): number => sectorValue(s.g, s.b, worthOf(util), run(s, { ...s.seed, channel: 1 }, use)) - sectorValue(s.g, s.b, worthOf(util), run(s, s.seed, use))
    expect(gain(.5, .5)).toBeGreaterThan(.01 * BASE)
    expect(gain(.5, .5)).toBeLessThan(.02 * BASE)
    expect(gain(1, 1)).toBeLessThan(0)
    expect(off.costs).toBe(0)

    const own = FOOD.restaurant.fleet
    const fleet = run(s, { ...s.seed, channel: 2 }, .5)
    const fresher = own * (1 - .5)
    expect(fleet.demand).toBeCloseTo(1 + fresher, 9)
    expect(fleet.costs).toBeCloseTo(.10 * own * BASE * (1 + fresher) + .015 * BASE, 4)

    // A truck has no fleet: the setting does nothing.
    const truck = setup('foodTruck')
    expect(FOOD.foodTruck.fleet).toBe(0)
    const none = run(truck, { ...truck.seed, channel: 2 }, .5)
    expect(none.demand).toBeCloseTo(1, 9)
    expect(none.costs).toBe(0)

    // No phones yet in 1985: a platform record changes nothing.
    const old = setup('restaurant', 1985)
    const early = run(old, { ...old.seed, channel: 1 }, .5)
    expect(early.demand).toBeCloseTo(1, 9)
    expect(early.costs).toBe(0)
  })

  it('pandemic shield', () => {
    const s = setup('restaurant', 2020)
    const share = FOOD.restaurant.platform
    const fresh = share * (1 - .4)
    const off = run(s, s.seed, .5, 'book')
    const on = run(s, { ...s.seed, channel: 1 }, .5, 'book')
    const shield = on.demand / off.demand - 1 - fresh
    const events = nationalMarket(s.g, 'restaurant', s.b.countryId, 2020).events
    expect(events.demand).toBeLessThan(1)
    expect(shield).toBeGreaterThan(0)
    expect(shield).toBeLessThanOrEqual(.8 * share * (1 - events.demand) + 1e-9)
    // Expected mode never reads past g.year: in 2019 the 2020 loss is unknown.
    const before = setup('restaurant', 2019)
    const hint = run(before, { ...before.seed, channel: 1 }, .5, 'expected', 2020)
    expect(hint.demand).toBeCloseTo(1 + fresh, 9)
    // A year with no pandemic pays nothing.
    const calm = setup('restaurant', 2015)
    expect(run(calm, { ...calm.seed, channel: 1 }, .5, 'expected').demand).toBeCloseTo(1 + fresh, 9)
  })

  it('extended hours', () => {
    const s = setup('restaurant')
    const row = foodRow('restaurant')
    expect(row).not.toBeNull()
    if (!row) return
    const std = run(s, s.seed, 1)
    const long = run(s, { ...s.seed, hours: 1 }, 1)
    expect(std.demand).toBeCloseTo(1 - squeeze(row, 1), 9)
    expect(long.demand).toBeCloseTo(1 - squeeze(row, 1 / 1.15), 9)
    expect(long.demand).toBeGreaterThan(std.demand)
    // Wages: last year's, else 30% of the base.
    s.b.last = null
    expect(run(s, { ...s.seed, hours: 1 }, .5).costs).toBeCloseTo(.05 * .3 * BASE, 6)
    s.b.last = { wages: 200_000 } as unknown as BizState['last']
    expect(run(s, { ...s.seed, hours: 1 }, .5).costs).toBeCloseTo(.05 * 200_000, 6)
    expect(run(s, s.seed, .5).costs).toBe(0)
  })

  it('writes one note when the grade moves', () => {
    const s = setup('restaurant')
    const up = run(s, { ...s.seed, hygiene: 64 }, .5)
    expect(up.note?.tone).toBe('good')
    expect(up.note?.text).toContain('B grade')
    expect(up.note?.text.length).toBeLessThanOrEqual(90)
    s.b.morale = 30
    const down = run(s, { ...s.seed, hygiene: 66 }, .5)
    expect(down.note?.tone).toBe('bad')
    expect(down.note?.text).toContain('C grade')
    expect(run(s, s.seed, .5).note).toBeNull()
  })

  it('mean-preserving', () => {
    for (const trade of TRADES) {
      const s = setup(trade)
      let demand = 0
      let cost = 0
      for (let k = 0; k < 400; k++) {
        const fx = run(s, s.seed, .5, 'book', 2000 + k)
        demand += fx.demand
        cost += fx.cost
      }
      expect(demand / 400).toBeGreaterThan(.97)
      expect(demand / 400).toBeLessThan(1.02)
      expect(cost / 400).toBeGreaterThan(.995)
      expect(cost / 400).toBeLessThan(1.02)
    }
  })

  it('draws the season from the hash, never g.rng', () => {
    const s = setup('foodTruck')
    const before = JSON.stringify(s.g.rng)
    const fx = run(s, s.seed, .5, 'book', 2011)
    expect(JSON.stringify(s.g.rng)).toBe(before)
    expect(fx.demand).toBeCloseTo(1 + FOOD.foodTruck.amp * seasonIndex(s.g, s.a, 2011, 'wx'), 9)
    expect(run(s, s.seed, .5, 'expected', 2011).demand).toBeCloseTo(1, 9)
  })

  it('cost floors', () => {
    const s = setup('restaurant')
    const small: SectorCtx = { use: .5, base: 10_000, level: 1, going: s.going }
    expect(auditCost(s.b, small)).toBe(1500)
    expect(kitchenFine(s.b, small)).toBe(2500)
    const big: SectorCtx = { use: .5, base: 1_000_000, level: 1, going: s.going }
    expect(auditCost(s.b, big)).toBe(4000)
    expect(kitchenFine(s.b, big)).toBe(8000)
    expect(auditCost(s.b, { ...small, level: 2 })).toBe(3000)
  })

  it('runs 12 years finite and inside the bounds', () => {
    for (const trade of TRADES) {
      for (const use of [.5, .85, 1.3]) {
        const s = setup(trade, 2012)
        let st = s.seed
        for (let k = 0; k < 12; k++) {
          const fx = run(s, st, use, 'book', 2012 + k)
          for (const v of [fx.demand, fx.cost, fx.capLoss, fx.open, fx.income, fx.costs, fx.randIncome, fx.randCosts]) expect(Number.isFinite(v)).toBe(true)
          expect(fx.demand).toBeGreaterThan(.4)
          expect(fx.capLoss).toBe(0)
          expect(fx.open).toBe(1)
          if (use < 1) {
            expect(fx.demand).toBeGreaterThanOrEqual(SECTOR_BOUNDS.demand[0])
            expect(fx.demand).toBeLessThanOrEqual(SECTOR_BOUNDS.demand[1])
          }
          expect(fx.cost).toBeGreaterThanOrEqual(SECTOR_BOUNDS.cost[0])
          expect(fx.cost).toBeLessThanOrEqual(SECTOR_BOUNDS.cost[1])
          st = food(fx.next)
          expect(st.hygiene).toBeGreaterThanOrEqual(0)
          expect(st.hygiene).toBeLessThanOrEqual(100)
          expect(st.rating).toBeGreaterThanOrEqual(1)
          expect(st.rating).toBeLessThanOrEqual(5)
        }
      }
    }
    // Identical calls give identical results and g.rng is untouched.
    const s = setup('cafe', 2018)
    const rng = JSON.stringify(s.g.rng)
    expect(run(s, s.seed, .9, 'book', 2018)).toEqual(run(s, s.seed, .9, 'book', 2018))
    expect(JSON.stringify(s.g.rng)).toBe(rng)
  })

  it('is pure on frozen inputs', () => {
    const s = setup('restaurant', 2020)
    const st = { ...s.seed, channel: 1 as const, hours: 1 as const }
    const ctx = s.ctx(.9)
    const fx = foodFx(frozen(s.g), frozen(s.a), frozen(s.b), frozen(st), 2020, 'book', frozen(ctx))
    expect(fx.next).not.toBe(st)
    expect(foodHeader(s.g, s.b, st).length).toBeGreaterThan(0)
  })

  it('header', () => {
    const s = setup('restaurant')
    const lines = foodHeader(s.g, s.b, s.seed)
    expect(lines.join(' ')).toBe('Grade B, hygiene 71. Rating 3.4. Dinner fills above 75% use. Menu Balanced. Delivery off. Standard hours.')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(140)
    expect(foodHeader(s.g, s.b, null)).toEqual([])
    expect(lines.join(' ')).not.toContain('rough estimate')

    // The first daypart to fill, by trade; extended hours move it.
    const first = { foodTruck: 'Lunch fills above 89% use.', cafe: 'Morning fills above 70% use.', bakery: 'Morning fills above 79% use.' }
    for (const trade of ['foodTruck', 'cafe', 'bakery'] as const) {
      const t = setup(trade)
      expect(foodHeader(t.g, t.b, t.seed).join(' ')).toContain(first[trade])
    }
    expect(foodHeader(s.g, s.b, { ...s.seed, hours: 1, channel: 2, menu: 2 }).join(' ')).toContain('Dinner fills above 86% use. Menu Signature. Delivery by own fleet. Extended hours.')
    expect(foodHeader(s.g, s.b, { ...s.seed, channel: 1, menu: 0 }).join(' ')).toContain('Menu Lean. Delivery on a platform.')

    // The 2020 crash row for the bakery: one rough-estimate line, and never for the restaurant.
    const bakery = setup('bakery', 2020)
    const line = sectorHistoryLine(bakery.g, bakery.b)
    expect(line).not.toBeNull()
    expect(foodHeader(bakery.g, bakery.b, bakery.seed).at(-1)).toBe(line)
    const restaurant = setup('restaurant', 2020)
    expect(foodHeader(restaurant.g, restaurant.b, restaurant.seed).join(' ')).not.toContain('rough estimate')
  })
})
