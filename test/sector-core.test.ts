// The sector layer's hook and money: the observation year books as v3.0.0 did, every dollar is booked
// once, effects stay inside their bounds, and nothing outside the generic channels is written. Every
// test runs on a stub family (test/sector-kit.ts), so the real family math is not involved.
import { beforeEach, describe, expect, it } from 'vitest'
import { bizWorth, localEcon, planFor, simulateYear } from '../src/game/business/economy'
import { bookCost, bookIncome, prepareSectorYear, SECTOR_BOUNDS, sectorEffects, sectorValue, seedSector } from '../src/game/business/sector-core'
import {
  baseRevenue, copyLines, historyFactor, modelOf, readYear, registeredModels, registerFamily, roleSkill, seasonIndex, sectorHistoryLine, sectorText,
} from '../src/game/business/sector-kit'
import { blankRecord, readSector, saveSector, type FoodState, type SectorState } from '../src/game/business/sector-state'
import type { BizState, KeyStaff } from '../src/game/business/state'
import type { GameState } from '../src/game/types'
import { deskGame, frozen, inert, jail, playYear, stubModel } from './sector-kit'

beforeEach(() => stubModel())

/** A live record: made in the year before g.year, so the hook for g.year processes it. */
function live(g: GameState, b: BizState): FoodState {
  saveSector(b, blankRecord('food', g.year - 1))
  return readSector(b) as FoodState
}

const entries = (g: GameState, text: string) => g.log.flatMap((y) => y.entries).filter((e) => e.text === text)

describe('prepareSectorYear', () => {
  it('books every dollar once', () => {
    const fx = { income: 1000, costs: 2000, randIncome: 300, randCosts: 500 }
    const run = (stub: Parameters<typeof stubModel>[0]) => {
      stubModel(stub)
      const { g, a, b } = deskGame('restaurant')
      live(g, b)
      const fiscal = g.year
      prepareSectorYear(g, a, b, fiscal)
      const hook = { cash: b.cash, income: b.yearIncome, costs: b.yearCosts, row: readSector(b)?.ledger.at(-1) }
      const res = simulateYear(g, b, fiscal, 0, 1)
      return { hook, stmt: res.stmt, cash: b.cash }
    }
    const A = run({ fx })
    const B = run({})
    expect(A.hook.cash).toBe(B.hook.cash - 1200)
    expect(A.hook.income).toBe(B.hook.income + 1300)
    expect(A.hook.costs).toBe(B.hook.costs + 2500)
    expect(A.hook.row).toMatchObject({ income: 1300, costs: 2500 })
    expect(A.stmt.other).toBe(B.stmt.other + 2500)
    expect(A.stmt.otherIncome).toBe(B.stmt.otherIncome + 1300)
    // The tax relief returns part of the 1,200 net cost: a double booking would show more, a missing one 0.
    expect(B.cash - A.cash).toBeGreaterThan(480)
    expect(B.cash - A.cash).toBeLessThanOrEqual(1200)
  })

  it('is idempotent', () => {
    const { g, a, b } = deskGame('restaurant')
    live(g, b)
    const fiscal = g.year
    prepareSectorYear(g, a, b, fiscal)
    const once = JSON.stringify(g)
    prepareSectorYear(g, a, b, fiscal)
    expect(JSON.stringify(g)).toBe(once)
    const st = readSector(b) as FoodState
    expect(st.lastYear).toBe(fiscal)
    expect(st.hygiene).toBe(72)
  })

  it('the observation year books exactly as v3.0.0', () => {
    const one = deskGame('restaurant')
    const two = deskGame('restaurant')
    inert(two.b)
    playYear(one.g)
    playYear(two.g)
    const fiscal = one.g.year - 1
    const st = readSector(one.b) as FoodState
    expect(st.since).toBe(fiscal)
    expect(st.lastYear).toBe(fiscal)
    expect(st.ledger).toEqual([])
    expect(two.b.sector).toEqual({ v: 2 })
    delete one.a.details.sector
    delete two.a.details.sector
    expect(JSON.stringify(one.g)).toBe(JSON.stringify(two.g))
    // A second year is live.
    const again = deskGame('restaurant')
    playYear(again.g)
    playYear(again.g)
    expect((readSector(again.b) as FoodState).ledger).toHaveLength(1)
  })

  it('a record made mid-year is live', () => {
    const { g, b } = deskGame('restaurant')
    live(g, b)
    playYear(g)
    const st = readSector(b) as FoodState
    expect(st.ledger).toHaveLength(1)
    expect(st.hygiene).toBe(72)
    expect(st.lastYear).toBe(g.year - 1)
  })

  it('logs a note once and stays bounded', () => {
    stubModel({ fx: { note: { text: 'Test grade moved.', tone: 'good' } } })
    const { g, a, b } = deskGame('restaurant')
    live(g, b)
    prepareSectorYear(g, a, b, g.year)
    expect(entries(g, 'Test grade moved.')).toHaveLength(1)
    expect(entries(g, 'Test grade moved.')[0].tone).toBe('good')

    stubModel({ fx: { note: { text: 'x'.repeat(200), tone: 'bad' } } })
    const long = deskGame('restaurant')
    live(long.g, long.b)
    prepareSectorYear(long.g, long.a, long.b, long.g.year)
    const lines = long.g.log.flatMap((y) => y.entries).filter((e) => e.text.startsWith('xxx'))
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toHaveLength(90)

    stubModel()
    const quiet = deskGame('restaurant')
    live(quiet.g, quiet.b)
    const before = quiet.g.log.flatMap((y) => y.entries).length
    prepareSectorYear(quiet.g, quiet.a, quiet.b, quiet.g.year)
    expect(quiet.g.log.flatMap((y) => y.entries).length).toBe(before)

    const many = deskGame('restaurant')
    live(many.g, many.b)
    for (let i = 0; i < 7; i++) prepareSectorYear(many.g, many.a, many.b, many.g.year + i)
    const st = readSector(many.b) as FoodState
    expect(st.ledger.map((r) => r.year)).toEqual([2027, 2028, 2029, 2030])
    expect(st.diary.length).toBeLessThanOrEqual(6)
  })

  it('clamps a wild model to the bounds', () => {
    stubModel({ fx: { demand: 5, cost: .1, capLoss: .9, open: .1, randIncome: 1e9, randCosts: 1e9 } })
    const { g, a, b } = deskGame('restaurant')
    const st = live(g, b)
    const fx = sectorEffects(g, a, b, st, g.year, 'book')
    expect(fx).toMatchObject({ demand: 1.35, cost: .9, capLoss: .35, open: .8 })
    const cap = .12 * baseRevenue(g, b)
    expect(fx.randIncome).toBeLessThanOrEqual(cap)
    expect(fx.randCosts).toBeLessThanOrEqual(cap)
    expect(fx.randIncome).toBeGreaterThan(0)
    prepareSectorYear(g, a, b, g.year)
    expect(b.demandShock).toBeGreaterThanOrEqual(.3)
    expect(b.demandShock).toBeLessThanOrEqual(2)
    expect(b.capacityLoss).toBeLessThanOrEqual(.35)
    expect(b.openFraction).toBeGreaterThanOrEqual(.8)
    expect(SECTOR_BOUNDS).toEqual({ demand: [.8, 1.35], cost: [.9, 1.12], capLoss: .35, open: .8, random: .12 })
  })

  it('clamps negative and non-finite effects', () => {
    stubModel({ fx: { demand: NaN, cost: Infinity, capLoss: -1, open: 9, income: -5, costs: NaN, randIncome: -3 } })
    const { g, a, b } = deskGame('restaurant')
    const fx = sectorEffects(g, a, b, live(g, b), g.year, 'book')
    expect(fx).toMatchObject({ demand: 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0 })
  })

  it('passes the next record through its table ranges', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = live(g, b)
    stubModel({ fx: { next: { ...st, hygiene: 500, rating: -3, menu: 9 } as unknown as SectorState } })
    const fx = sectorEffects(g, a, b, st, g.year, 'book')
    expect(fx.next).toMatchObject({ hygiene: 100, rating: 1, menu: 2 })
  })

  it('writes nothing for the wrong company', () => {
    const snapshot = (b: BizState) => JSON.stringify(b)
    const hookOf = (x: ReturnType<typeof deskGame>) => {
      const before = snapshot(x.b)
      prepareSectorYear(x.g, x.a, x.b, x.g.year)
      expect(snapshot(x.b)).toBe(before)
    }
    const software = deskGame('software')
    hookOf(software)
    expect(readSector(software.b)).toBeNull()

    const dead = deskGame('restaurant')
    live(dead.g, dead.b)
    dead.g.character.alive = false
    hookOf(dead)

    const foreign = deskGame('restaurant')
    inert(foreign.b)
    hookOf(foreign)
    expect(foreign.b.sector).toEqual({ v: 2 })

    const cuba = deskGame('clinic', { countryId: 'cu' })
    expect(cuba.b.countryId).toBe('cu')
    hookOf(cuba)
    expect(readSector(cuba.b)).toBeNull()

    const bare = deskGame('restaurant')
    expect(readSector(bare.b)).toBeNull()
  })

  it('never touches g.rng and never writes outside its channels', () => {
    stubModel({ fx: { demand: 1.1, cost: 1.05, capLoss: .1, open: .9, income: 500, costs: 700 } })
    const { g, a, b } = deskGame('restaurant')
    live(g, b)
    const rngBefore = g.rng
    // The books are a channel of g too since R2-L12: the year's income and costs are booked through the ledger (g.world). Nothing else of g may change.
    const outside = (x: GameState): Record<string, unknown> => JSON.parse(JSON.stringify({ ...x, assets: [], world: undefined })) as Record<string, unknown>
    const gBefore = outside(g)
    const bBefore = JSON.parse(JSON.stringify(b)) as Record<string, unknown>
    prepareSectorYear(g, a, b, g.year)
    expect(g.rng).toBe(rngBefore)
    expect(outside(g)).toEqual(gBefore)
    expect(g.world?.ledger, 'the year of income and costs was booked').toBeTruthy()
    const bAfter = JSON.parse(JSON.stringify(b)) as Record<string, unknown>
    const channels = ['demandShock', 'costShock', 'capacityLoss', 'openFraction', 'cash', 'yearIncome', 'yearCosts', 'sector']
    const changed = Object.keys(bAfter).filter((k) => JSON.stringify(bAfter[k]) !== JSON.stringify(bBefore[k]))
    expect(changed.sort()).toEqual([...channels].sort())
  })

  it('is pure on frozen inputs', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = live(g, b)
    const fx = sectorEffects(frozen(g), frozen(a), frozen(b), frozen(st), g.year, 'book')
    expect(fx.next).not.toBe(st)
    expect(fx.next).toMatchObject({ hygiene: 72 })
  })
})

describe('seedSector', () => {
  it('saves a record with since equal to lastYear, and refuses a foreign slot or a trade without a family', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = seedSector(g, a, b, 2023)
    expect(st).toMatchObject({ family: 'food', since: 2023, lastYear: 2023 })
    expect(readSector(b)).toEqual(st)

    const other = deskGame('restaurant')
    inert(other.b)
    expect(seedSector(other.g, other.a, other.b, 2023)).toBeNull()
    expect(other.b.sector).toEqual({ v: 2 })

    const software = deskGame('software')
    expect(seedSector(software.g, software.a, software.b, 2023)).toBeNull()
    expect(software.b.sector).toBeUndefined()
  })
})

describe('money', () => {
  it('rounds to whole dollars and moves cash with the matching channel', () => {
    const { g, b } = deskGame('restaurant')
    const cash = b.cash, inc = b.yearIncome, cost = b.yearCosts
    expect(bookIncome(g, b, 100.6)).toBe(101)
    expect(bookCost(g, b, 40.4)).toBe(40)
    expect(b.cash).toBe(cash + 101 - 40)
    expect(b.yearIncome).toBe(inc + 101)
    expect(b.yearCosts).toBe(cost + 40)
    expect(bookIncome(g, b, -5)).toBe(0)
    expect(bookCost(g, b, NaN)).toBe(0)
    expect(b.cash).toBe(cash + 61)
  })
})

describe('sectorValue', () => {
  it('is zero for a neutral year and counts money, cost and lost capacity', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = live(g, b)
    const w = bizWorth(g, b)
    stubModel()
    const neutral = sectorEffects(g, a, b, st, g.year, 'expected')
    expect(sectorValue(g, b, w, neutral)).toBeCloseTo(0, 6)
    expect(sectorValue(g, b, w, { ...neutral, income: 1000, costs: 400 })).toBeCloseTo(600, 6)
    expect(sectorValue(g, b, w, { ...neutral, randIncome: 300, randCosts: 100 })).toBeCloseTo(200, 6)
    expect(sectorValue(g, b, w, { ...neutral, cost: 1.05 })).toBeLessThan(0)
    expect(sectorValue(g, b, w, { ...neutral, capLoss: .3 })).toBeLessThanOrEqual(0)
    // Demand only counts up to what capacity can serve.
    const capped = sectorValue(g, b, w, { ...neutral, demand: 1.35 })
    expect(capped).toBeLessThanOrEqual(w.contrib * (1 / w.util - 1) + 1e-6)
    expect(sectorValue(g, b, w, { ...neutral, demand: .9 })).toBeLessThan(0)
  })
})

describe('helpers', () => {
  it('expected mode never reads past g.year', () => {
    expect(readYear({ year: 2019 }, 2020, 'expected')).toBe(2019)
    expect(readYear({ year: 2019 }, 2020, 'book')).toBe(2020)
    expect(readYear({ year: 2026 }, 2020, 'expected')).toBe(2020)
  })

  it('history rows', () => {
    const f = (trade: Parameters<typeof deskGame>[0], year: number) => {
      const { g, b } = deskGame(trade, { year })
      return historyFactor(g, b, year)
    }
    expect(f('clinic', 2020)).toBeCloseTo(.92, 10)
    expect(f('education', 2020)).toBeCloseTo(.96, 10)
    expect(f('petCare', 2020)).toBeCloseTo(1.05, 10)
    expect(f('homeCare', 2020)).toBeCloseTo(1.06, 10)
    expect(f('bakery', 2020)).toBeCloseTo(1.03, 10)
    expect(f('homeCare', 2021)).toBeCloseTo(1.021, 10)
    expect(f('autoShop', 2009)).toBe(1)
    expect(f('restaurant', 2020)).toBe(1)
    for (const t of ['clinic', 'education', 'petCare', 'homeCare', 'bakery', 'gym', 'energy'] as const) expect(f(t, 2019)).toBe(1)

    const lineOf = (trade: Parameters<typeof deskGame>[0], year: number) => {
      const { g, b } = deskGame(trade, { year })
      return sectorHistoryLine(g, b)
    }
    expect(lineOf('restaurant', 2020)).toBeNull()
    expect(lineOf('clinic', 2019)).toBeNull()
    expect(lineOf('clinic', 2020)).toBe("The 2020 crash moved your demand by about -8%. That's a rough estimate.")
    expect(lineOf('homeCare', 2020)).toBe("The 2020 crash moved your demand by about +6%. That's a rough estimate.")
  })

  it('seasonIndex is a stable draw in -1 to 1 with mean 0', () => {
    const { g, a } = deskGame('restaurant')
    const rng = g.rng
    expect(seasonIndex(g, a, 2024, 'wx')).toBe(seasonIndex(g, a, 2024, 'wx'))
    expect(seasonIndex(g, a, 2024, 'wx')).not.toBe(seasonIndex(g, a, 2024, 'out'))
    let sum = 0
    for (let y = 2000; y < 2400; y++) {
      const x = seasonIndex(g, a, y, 'wx')
      expect(x).toBeGreaterThanOrEqual(-1)
      expect(x).toBeLessThanOrEqual(1)
      sum += x
    }
    expect(Math.abs(sum / 400)).toBeLessThan(.08)
    expect(g.rng).toBe(rng)
  })

  it('baseRevenue is last year\'s net sales, or the calm plan for a new company', () => {
    const { g, b } = deskGame('restaurant')
    expect(b.last).toBeNull()
    const e = localEcon(b.industry, b.countryId, b.city)
    const plan = planFor(g, b, g.year, { calm: true })
    const want = (Math.min(plan.demand, plan.capacity) * plan.suggested) / (1 + e.taxRate)
    expect(want).toBeGreaterThan(0)
    expect(baseRevenue(g, b)).toBeCloseTo(want, 6)
    b.price = plan.suggested
    b.production = Math.floor(Math.min(plan.demand, plan.capacity))
    simulateYear(g, b, g.year, 0, 1)
    expect(b.last?.netRevenue).toBeGreaterThan(0)
    expect(baseRevenue(g, b)).toBe(b.last?.netRevenue)
  })

  it('key roles: roleSkill is 0 without the hire and skill over 100 with one', () => {
    const { b } = deskGame('restaurant')
    expect(roleSkill(b, 'Food Safety Lead')).toBe(0)
    const hire: KeyStaff = { id: 'k1', firstName: 'Ann', lastName: 'Lee', gender: 'female', age: 40, role: 'Food Safety Lead', focus: 'quality', skill: 80, salary: 50_000, trait: 'steady', morale: 60, years: 0 }
    b.staff.push(hire)
    expect(roleSkill(b, 'Food Safety Lead')).toBeCloseTo(.8, 10)
  })

  it('sectorText fills holes and copyLines names the voice role', () => {
    const table = { 'food.a.scene': 'Hello ${name}. What will you do?', 'food.a.out': 'Done.', 'food.a.log': 'Logged.', 'food.a.tip': 'Tip.', 'food.a.label': 'Pay up', 'food.a.head': 'A title' }
    expect(sectorText(table, 'food.a.scene', { name: 'Ann' })).toBe('Hello Ann. What will you do?')
    expect(sectorText(table, 'food.a.scene')).toBe('Hello . What will you do?')
    expect(sectorText(table, 'food.missing')).toBe('')
    expect(sectorText(table, 'constructor')).toBe('')
    expect(copyLines(table).map((x) => x.role)).toEqual(['scene', 'outcome', 'log', 'tooltip', 'label', 'title'])
    expect(() => copyLines({ 'food.a.what': 'x' })).toThrow()
    expect(() => copyLines({ scene: 'x' })).toThrow()
  })

  it('the registry replaces a model of the same family', () => {
    stubModel()
    const first = modelOf('food')
    expect(first).not.toBeNull()
    const count = registeredModels().length
    registerFamily({ ...(first as NonNullable<typeof first>), header: () => ['second'] })
    expect(modelOf('food')?.header({} as GameState, {} as BizState, null)).toEqual(['second'])
    expect(registeredModels()).toHaveLength(count)
  })
})

describe('jail', () => {
  it('does not stop the yearly hook (the layer is the company\'s, not the owner\'s hands)', () => {
    const { g, a, b } = deskGame('restaurant')
    live(g, b)
    jail(g)
    prepareSectorYear(g, a, b, g.year)
    expect(readSector(b)?.ledger).toHaveLength(1)
  })
})
