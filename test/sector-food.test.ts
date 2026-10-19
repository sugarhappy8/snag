// Food and Drink Service. 'food math': the kitchen and the floor (hygiene grade, review rating, the peak
// squeeze, the menu, delivery, extended hours); foodFx is called directly with a hand-made context, so
// no family model is involved. 'food desk': the levers, the eight events and the copy of the registered
// family (sector-food-play.ts), through applyLever, the event script and the voice rules.
import { describe, expect, it } from 'vitest'
import { staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { localEcon, type Worth } from '../src/game/business/economy'
import { nationalMarket } from '../src/game/business/dynamics'
import { eraFits } from '../src/game/business/era'
import { prepareSectorYear, SECTOR_BOUNDS, sectorValue, seedSector } from '../src/game/business/sector-core'
import { FOOD } from '../src/game/business/sector-data'
import { eventProblems, SECTOR_EVENT_SCRIPT } from '../src/game/business/sector-events'
import { auditCost, foodFx, foodHeader, foodRow, foodSeed, gradeOf, kitchenFine, squeeze } from '../src/game/business/sector-food'
import { FOOD_COPY, FOOD_EVENTS, FOOD_LEVERS, FOOD_MODEL } from '../src/game/business/sector-food-play'
import { copyLines, modelOf, sectorCtx, sectorText, seasonIndex, sectorHistoryLine, type LeverDef, type SectorCtx, type SectorEvent, type SectorFx } from '../src/game/business/sector-kit'
import { applyLever, deskLines } from '../src/game/business/sector-menu'
import { blankRecord, readSector, saveSector, sectorOwnsEvent, type FoodState } from '../src/game/business/sector-state'
import { bizOf, type BizState, type KeyStaff } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState } from '../src/game/types'
import { deskGame, frozen, playYear } from './sector-kit'

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

// ---------------------------------------------------------------------------
// The desk: levers, events and copy of the family (sector-food-play.ts)

const EVENT_IDS = ['chefOffer', 'festival', 'inspection', 'noise', 'platformHike', 'recall', 'review', 'rush']

function leverOf(id: string): LeverDef {
  const l = modelOf('food')?.levers.find((x) => x.id === id)
  if (!l) throw new Error(`no ${id} lever`)
  return l
}

function eventOf(id: string): SectorEvent {
  const e = modelOf('food')?.events.find((x) => x.id === id)
  if (!e) throw new Error(`no ${id} event`)
  return e
}

/** The odds of the fail branch (the second) of a choice of the inspection. */
function failP(s: ReturnType<typeof setup>, st: FoodState, choice: string): number {
  const c = eventOf('inspection').choices(s.g, s.b, st).find((x) => x.id === choice)
  if (!c) throw new Error(`no ${choice} choice`)
  const branches = c.branches(s.g, s.b, st)
  expect(branches).toHaveLength(2)
  return branches[1].p
}

/** The two long dashes the voice guide bans, built from their code points so that this file holds neither a dash nor an escape for one. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

/** A copy template turned back into what the voice report measures: every named hole becomes "${...}". */
const template = (text: string): string => text.replace(/\$\{\w+\}/g, '${...}')

describe('food desk', () => {
  it('registers the food model', () => {
    const model = modelOf('food')
    expect(model).not.toBeNull()
    expect(model).toBe(FOOD_MODEL)
    expect(model?.levers.map((l) => l.id)).toEqual(['menu', 'delivery', 'hours', 'audit'])
    expect(model?.levers).toBe(FOOD_LEVERS)
    expect(model?.events).toBe(FOOD_EVENTS)
    expect(model?.events.map((e) => e.id).sort()).toEqual(EVENT_IDS)
    expect(model?.copy).toBe(FOOD_COPY)
    expect(model?.levers.map((l) => l.paid)).toEqual([false, false, false, true])
    const { b } = deskGame('restaurant')
    saveSector(b, { ...blankRecord('food', 2020), lastYear: 2022 })
    expect(sectorOwnsEvent(b, 'critic')).toBe(true)
    expect(sectorOwnsEvent(b, 'inspection')).toBe(true)
  })

  it('offers delivery by trade and era', () => {
    const offered = (trade: Industry, year: number): number[] => {
      const s = setup(trade, year)
      return leverOf('delivery').options(s.g, s.b, s.seed).map((o) => o.value)
    }
    expect(offered('restaurant', 2026)).toEqual([0, 1, 2])
    expect(offered('foodTruck', 2026)).toEqual([0, 1])
    expect(offered('cafe', 2026)).toEqual([0, 1, 2])
    expect(offered('bakery', 2026)).toEqual([0, 1, 2])
    expect(offered('restaurant', 1985)).toEqual([0, 2])
    expect(offered('foodTruck', 1985)).toEqual([0])
  })

  it('shows the desk through deskLines', () => {
    const s = setup('restaurant')
    expect(deskLines(s.g, s.a).join(' ')).toContain('The desk opens at the next year end.')
    expect(applyLever(s.g, s.a, 'menu', 2, 'owner')).toEqual({ ok: true, paid: 0 })
    const lines = deskLines(s.g, s.a)
    expect(lines.join(' ')).toContain('Grade B, hygiene 71. Rating 3.4.')
    expect(lines.join(' ')).toContain('Menu Signature.')
    expect(lines.at(-1)).toBe(`${s.g.year}: Menu style now Signature.`)
  })

  it('moves the levers through applyLever', () => {
    const a1 = setup('restaurant')
    const a2 = setup('restaurant')
    const bA = (): BizState => bizOf(a1.g, a1.a)
    const bB = (): BizState => bizOf(a2.g, a2.a)

    // A free lever: no money, and once a year.
    expect(applyLever(a1.g, a1.a, 'menu', 0, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(readSector(bA())).toMatchObject({ menu: 0, since: a1.g.year - 1, lastYear: a1.g.year - 1 })
    expect(applyLever(a1.g, a1.a, 'menu', 2, 'owner').ok).toBe(false)
    expect(applyLever(a1.g, a1.a, 'delivery', 3, 'owner').ok).toBe(false)
    expect(applyLever(a1.g, a1.a, 'delivery', 2, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(applyLever(a1.g, a1.a, 'hours', 1, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(readSector(bA())).toMatchObject({ menu: 0, channel: 2, hours: 1 })

    // The audit: priced once, refused a second time, and it lifts the hygiene target for the year.
    const cx = sectorCtx(a1.g, bA(), a1.g.year)
    const price = auditCost(bA(), cx)
    expect(price).toBeGreaterThan(0)
    const cash = bA().cash
    const costs = bA().yearCosts
    expect(applyLever(a1.g, a1.a, 'audit', 1, 'owner')).toEqual({ ok: true, paid: price })
    expect(bA().cash).toBe(cash - price)
    expect(bA().yearCosts).toBe(costs + price)
    expect(readSector(bA())).toMatchObject({ audit: a1.g.year })
    expect(applyLever(a1.g, a1.a, 'audit', 1, 'owner').ok).toBe(false)
    expect(bA().cash).toBe(cash - price)

    // The control run has the same record and no audit; both books close for the year just lived.
    expect(seedSector(a2.g, a2.a, bB(), a2.g.year - 1)).not.toBeNull()
    saveSector(bA(), { ...(readSector(bA()) as FoodState), menu: 1, channel: 0, hours: 0 })
    prepareSectorYear(a1.g, a1.a, bA(), a1.g.year)
    prepareSectorYear(a2.g, a2.a, bB(), a2.g.year)
    const withAudit = readSector(bA())
    const without = readSector(bB())
    expect(withAudit?.family === 'food' && without?.family === 'food').toBe(true)
    if (withAudit?.family !== 'food' || without?.family !== 'food') return
    expect(Math.abs(withAudit.hygiene - without.hygiene - .35 * 12)).toBeLessThan(.05)
  })

  it('has valid events', () => {
    const probes = (s: ReturnType<typeof setup>): FoodState[] => [s.seed, { ...s.seed, channel: 1, hours: 1 }, { ...s.seed, hygiene: 40 }]
    let seen = 0
    for (const trade of TRADES) {
      const s = setup(trade)
      for (const st of probes(s)) {
        for (const ev of FOOD_EVENTS) {
          expect(eventProblems(ev, s.g, s.a, s.b, st), `${trade} ${ev.id} ${st.hygiene}`).toEqual([])
          const shown = [ev.title, ev.scene(s.g, s.a, s.b, st)]
          for (const c of ev.choices(s.g, s.b, st)) {
            shown.push(c.label)
            for (const br of c.branches(s.g, s.b, st)) shown.push(sectorText(FOOD_COPY, br.text, br.vals))
          }
          for (const line of shown) {
            expect(line.length, `${ev.id} has an empty line`).toBeGreaterThan(0)
            expect(line, `${trade} ${ev.id}`).not.toMatch(/\$\{|NaN|undefined|Infinity/)
          }
          seen++
        }
      }
    }
    expect(seen).toBe(TRADES.length * 3 * 8)
    // The grade lines of the yearly rule render too.
    for (const key of ['food.grade.up.log', 'food.grade.top.log', 'food.grade.down.log']) {
      const line = sectorText(FOOD_COPY, key, { name: 'Test restaurant', grade: 'B' })
      expect(line).toContain('Test restaurant')
      expect(line).not.toMatch(/\$\{|undefined/)
    }
  })

  it('has the inspection odds', () => {
    const s = setup('restaurant')
    const at = (hygiene: number, extra: Partial<FoodState> = {}): FoodState => ({ ...s.seed, hygiene, ...extra })
    expect(Math.abs(failP(s, at(71), 'open') - .155)).toBeLessThan(.001)
    expect(failP(s, at(100), 'open')).toBeCloseTo(.03, 9)
    expect(failP(s, at(0), 'open')).toBeCloseTo(.5, 9)
    for (const h of [0, 40, 71, 90, 100]) {
      expect(failP(s, at(h), 'audit')).toBeCloseTo(.35 * failP(s, at(h), 'open'), 9)
      // An audit paid in the year just booked counts for the plain choice too (the event fires at the start of g.year).
      expect(failP(s, at(h, { audit: s.g.year - 1 }), 'open')).toBeCloseTo(.35 * failP(s, at(h), 'open'), 9)
      expect(failP(s, at(h, { audit: s.g.year - 2 }), 'open')).toBeCloseTo(failP(s, at(h), 'open'), 9)
    }
    // The audit choice pays for the audit once and sets the year of the audit; an audit already paid this year costs 0.
    const audit = eventOf('inspection').choices(s.g, s.b, s.seed).find((c) => c.id === 'audit')
    const branches = audit?.branches(s.g, s.b, s.seed) ?? []
    const price = auditCost(s.b, sectorCtx(s.g, s.b, s.g.year))
    expect(branches[0].fx.cash).toBe(-price)
    expect(branches[0].sec?.set).toEqual({ audit: s.g.year })
    expect(branches[1].fx.cash).toBeLessThan(-price)
    const paid = eventOf('inspection').choices(s.g, s.b, at(71, { audit: s.g.year })).find((c) => c.id === 'audit')?.branches(s.g, s.b, at(71, { audit: s.g.year })) ?? []
    expect(paid[0].fx.cash ?? 0).toBe(0)
    // A failed inspection costs the kitchen fine, hygiene and brand.
    const open = eventOf('inspection').choices(s.g, s.b, s.seed).find((c) => c.id === 'open')?.branches(s.g, s.b, s.seed) ?? []
    expect(open[1].fx).toMatchObject({ cash: -kitchenFine(s.b, sectorCtx(s.g, s.b, s.g.year)), brand: -7 })
    expect(open[1].sec?.add).toEqual({ hygiene: -8 })
  })

  it('reads the era', () => {
    const modern = setup('restaurant', 2026)
    expect(eventOf('rush').weight(modern.g, modern.b, modern.seed)).toBeGreaterThan(0)
    const old = setup('restaurant', 1970)
    expect(eventOf('rush').weight(old.g, old.b, old.seed)).toBe(0)

    const review = eventOf('review')
    const early = setup('restaurant', 1960)
    const sceneThen = review.scene(early.g, early.a, early.b, early.seed)
    expect(sceneThen).toContain('critic')
    expect(sceneThen).not.toContain('blogger')
    expect(eraFits(early.g, early.b.countryId, sceneThen)).toBe(true)
    const late = setup('restaurant', 2020)
    const sceneNow = review.scene(late.g, late.a, late.b, late.seed)
    expect(sceneNow).toContain('blogger')
    expect(eraFits(late.g, late.b.countryId, sceneNow)).toBe(true)

    // Every scene fits the year it can roll in: the platform one needs the phone, so it never rolls in 1985.
    const now = setup('restaurant', 2026)
    for (const ev of FOOD_EVENTS) expect(eraFits(now.g, now.b.countryId, ev.scene(now.g, now.a, now.b, { ...now.seed, channel: 1, hours: 1 })), ev.id).toBe(true)
    for (const ev of FOOD_EVENTS.filter((e) => e.id !== 'platformHike' && e.id !== 'rush')) expect(eraFits(old.g, old.b.countryId, ev.scene(old.g, old.a, old.b, old.seed)), ev.id).toBe(true)
  })

  it('is gated by state', () => {
    const s = setup('restaurant')
    const weight = (id: string, st: FoodState): number => eventOf(id).weight(s.g, s.b, st)
    expect(weight('platformHike', s.seed)).toBe(0)
    expect(weight('platformHike', { ...s.seed, channel: 1 })).toBeGreaterThan(0)
    expect(weight('platformHike', { ...s.seed, channel: 2 })).toBe(0)
    expect(weight('noise', s.seed)).toBe(0)
    expect(weight('noise', { ...s.seed, hours: 1 })).toBeGreaterThan(0)
    for (const id of ['inspection', 'review', 'recall', 'festival', 'chefOffer']) expect(weight(id, s.seed), id).toBeGreaterThan(0)
    // The weights of spec 4.2.
    expect(weight('inspection', s.seed)).toBe(1)
    expect(weight('platformHike', { ...s.seed, channel: 1 })).toBe(.8)
    expect(weight('noise', { ...s.seed, hours: 1 })).toBe(.6)
  })

  it('lets the platform choice depend on the trade', () => {
    const truck = setup('foodTruck')
    const st = { ...truck.seed, channel: 1 as const }
    expect(eventOf('platformHike').choices(truck.g, truck.b, st).map((c) => c.id)).toEqual(['pay', 'drop'])
    const room = setup('restaurant')
    expect(eventOf('platformHike').choices(room.g, room.b, { ...room.seed, channel: 1 }).map((c) => c.id)).toEqual(['pay', 'fleet', 'drop'])
    // Choice ids are pinned by the tests and the hired CEO's letters.
    const ids = (id: string): string[] => eventOf(id).choices(room.g, room.b, { ...room.seed, channel: 1, hours: 1 }).map((c) => c.id)
    expect(ids('inspection')).toEqual(['open', 'audit', 'stall'])
    expect(ids('review')).toEqual(['comp', 'invite', 'ignore'])
    expect(ids('recall')).toEqual(['pull', 'ride'])
    expect(ids('festival')).toEqual(['book', 'skip'])
    expect(ids('chefOffer')).toEqual(['match', 'release'])
    expect(ids('noise')).toEqual(['cut', 'proof', 'ignore'])
    expect(ids('rush')).toEqual(['staff', 'turn', 'ride'])
  })

  it('has no generic duplicates over 12 years', () => {
    let rolled = 0
    let years = 0
    for (const trade of ['restaurant', 'bakery'] as const) {
      for (const seed of [1, 2, 3]) {
        const { g } = deskGame(trade, { seed, talent: false })
        for (let i = 0; i < 12; i++) {
          const popups = playYear(g)
          const events = popups.filter((m) => m.scriptId === SECTOR_EVENT_SCRIPT || m.scriptId?.startsWith('business.ev.'))
          expect(events.length, `${trade} ${seed} year ${i}`).toBeLessThanOrEqual(1)
          // The observation year (the first) books as v3.0.0 did, so the generic inspection and critic still roll then.
          if (i > 0) expect(popups.filter((m) => m.scriptId === 'business.ev.inspection' || m.scriptId === 'business.ev.critic'), `${trade} ${seed} year ${i}`).toHaveLength(0)
          rolled += popups.filter((m) => m.scriptId === SECTOR_EVENT_SCRIPT).length
          years++
        }
      }
    }
    expect(years).toBe(72)
    expect(rolled).toBeGreaterThan(0)
    expect(rolled / years).toBeLessThanOrEqual(.30)
  }, 300_000)

  it('marks one best choice for the Business talent and plays every answer', () => {
    let seen = 0
    const answered = new Set<string>()
    for (const trade of ['restaurant', 'cafe'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const { g, a } = deskGame(trade, { seed })
        for (let i = 0; i < 12; i++) {
          for (const m of playYear(g).filter((x) => x.scriptId === SECTOR_EVENT_SCRIPT)) {
            seen++
            expect(m.choices.filter((c) => c.hint), `${trade} ${seed} ${m.title}`).toHaveLength(1)
            answered.add(m.title)
          }
        }
        // The desk of a company with years behind it still reads and renders.
        expect(deskLines(g, a).join(' ')).toContain('hygiene')
        const st = readSector(bizOf(g, a))
        expect(st?.family).toBe('food')
        expect(st?.pending).toBeNull()
        expect(st?.diary.length).toBeLessThanOrEqual(6)
      }
    }
    expect(seen).toBeGreaterThan(0)
    expect(answered.size).toBeGreaterThan(0)
  }, 300_000)

  it('plays every choice of every event through the script', () => {
    // Fire each event by hand: a pending token, then the script, once per choice and branch roll.
    for (const ev of FOOD_EVENTS) {
      const room = setup('restaurant')
      const probe = { ...room.seed, channel: 1 as const, hours: 1 as const }
      for (const c of ev.choices(room.g, room.b, probe)) {
        for (const seed of [3, 7, 11]) {
          const s = setup('restaurant')
          const st: FoodState = { ...s.seed, channel: 1, hours: 1, since: s.g.year - 3, lastYear: s.g.year - 1, pending: { token: 'tok', id: ev.id, year: s.g.year } }
          saveSector(s.b, st)
          s.g.rng = seed
          const cash = s.b.cash
          runScript(s.g, SECTOR_EVENT_SCRIPT, c.id, { assetId: s.a.id, token: 'tok' } as never, { kind: 'notice', id: 'x', title: '', text: '' })
          const after = readSector(bizOf(s.g, s.a))
          expect(after?.pending, `${ev.id}.${c.id}`).toBeNull()
          expect(after?.diary.at(-1), `${ev.id}.${c.id}`).toBe(`${s.g.year} ${ev.title}. ${c.label}.`.slice(0, 90))
          expect(Number.isFinite(bizOf(s.g, s.a).cash), `${ev.id}.${c.id}`).toBe(true)
          // The cash move is bounded by the event cap.
          const cx = sectorCtx(s.g, s.b, s.g.year)
          expect(Math.abs(bizOf(s.g, s.a).cash - cash), `${ev.id}.${c.id}`).toBeLessThanOrEqual(Math.max(.12 * cx.base, 3000 * cx.level) + 1)
          const notice = s.g.queue.find((m) => m.kind === 'notice')
          expect(notice && notice.kind === 'notice' ? notice.text : '', `${ev.id}.${c.id}`).not.toMatch(/\$\{|NaN|undefined/)
          expect(notice && notice.kind === 'notice' ? notice.title : '').toBe(ev.title)
        }
      }
    }
  })

  it('keeps every event inside its bounds for small and strong companies', () => {
    const small = setup('foodTruck')
    small.b.last = { netRevenue: 12_000, wages: 3_000 } as unknown as BizState['last']
    const strong = setup('restaurant')
    strong.b.quality = 100
    strong.b.last = { netRevenue: 9_000_000, wages: 2_500_000 } as unknown as BizState['last']
    for (const s of [small, strong]) {
      const probes: FoodState[] = [s.seed, { ...s.seed, channel: 1, hours: 1 }, { ...s.seed, hygiene: 100, rating: 5 }, { ...s.seed, hygiene: 0, rating: 1 }]
      for (const st of probes) for (const ev of FOOD_EVENTS) expect(eventProblems(ev, s.g, s.a, s.b, st), `${s.b.industry} ${ev.id}`).toEqual([])
    }
  })

  it('has every copy key', () => {
    const lines = copyLines(FOOD_COPY)
    expect(lines.length).toBeGreaterThanOrEqual(40)
    for (const l of lines) expect(l.key.startsWith('food.'), l.key).toBe(true)
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(FOOD_COPY, key)

    // Every option of every lever, offered or not, has a label and a tip.
    const s = setup('restaurant')
    for (const lever of FOOD_LEVERS) {
      expect(has(`food.lever.${lever.id}.label`), lever.id).toBe(true)
      expect(lever.label).toBe(sectorText(FOOD_COPY, `food.lever.${lever.id}.label`))
      const options = lever.options(s.g, s.b, s.seed)
      expect(options.length).toBeGreaterThan(0)
      for (const o of options) {
        expect(has(`food.lever.${lever.id}.${o.value}.label`), `${lever.id} ${o.value}`).toBe(true)
        expect(has(`food.lever.${lever.id}.${o.value}.tip`), `${lever.id} ${o.value}`).toBe(true)
        expect(o.label).toBe(sectorText(FOOD_COPY, `food.lever.${lever.id}.${o.value}.label`))
        expect(o.tip).toBe(sectorText(FOOD_COPY, `food.lever.${lever.id}.${o.value}.tip`))
      }
    }
    // Every event has a head and a scene (or its era variants), and every choice a label.
    const st = { ...s.seed, channel: 1 as const, hours: 1 as const }
    for (const ev of FOOD_EVENTS) {
      expect(has(`food.ev.${ev.id}.head`), ev.id).toBe(true)
      expect(ev.title).toBe(sectorText(FOOD_COPY, `food.ev.${ev.id}.head`))
      const scenes = lines.filter((l) => new RegExp(`^food\\.ev\\.${ev.id}\\.(\\w+\\.)?scene$`).test(l.key))
      expect(scenes.length, ev.id).toBeGreaterThan(0)
      for (const c of ev.choices(s.g, s.b, st)) {
        expect(has(`food.ev.${ev.id}.${c.id}.label`), `${ev.id}.${c.id}`).toBe(true)
        c.branches(s.g, s.b, st).forEach((br, k) => {
          expect(br.text, `${ev.id}.${c.id}`).toBe(`food.ev.${ev.id}.${c.id}.${k}.out`)
          expect(has(br.text), br.text).toBe(true)
        })
      }
    }
    expect(has('food.ev.review.critic.scene') && has('food.ev.review.blogger.scene')).toBe(true)
  })

  it('keeps the copy inside the voice guide', () => {
    const roles = new Set<string>()
    for (const { key, role, text } of copyLines(FOOD_COPY)) {
      roles.add(role)
      const t = template(text)
      expect(unitFlags(t, role), `${key}: ${text}`).toEqual([])
      expect(text, key).not.toMatch(DASHES)
      expect(text.trim(), key).toBe(text)
      if (role === 'scene') {
        expect(text.endsWith('What will you do?'), key).toBe(true)
        expect(staticLength(t), key).toBeLessThanOrEqual(140)
      }
      if (role === 'outcome') expect(staticLength(t), key).toBeLessThanOrEqual(120)
      if (role === 'log') expect(staticLength(t), key).toBeLessThanOrEqual(90)
      if (role === 'tooltip') expect(staticLength(t), key).toBeLessThanOrEqual(120)
      if (role === 'label') expect(t.trim().split(/\s+/).length, key).toBeLessThanOrEqual(5)
      if (role === 'title') expect(text.length, key).toBeLessThanOrEqual(40)
    }
    expect([...roles].sort()).toEqual(['label', 'log', 'outcome', 'scene', 'title', 'tooltip'])
  })
})
