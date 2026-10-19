// Utilities, Land and Fleets. 'util math': the plant condition, outages, weather, spot and contract mix,
// fuel hedge, overhaul and weather cover of the seven trades; utilFx is called directly with a
// hand-made context, so no family play file is involved. The overhaul's worth goes through the real
// leverValue with a small overhaul lever of the test's own and a temporary util model (restored after).
// 'util desk': the levers, the seven events and the copy of the registered family (sector-util-play.ts),
// through applyLever, the event script and the voice rules.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { localEcon, type Worth } from '../src/game/business/economy'
import { nationalMarket } from '../src/game/business/dynamics'
import { bizHas, eraFits } from '../src/game/business/era'
import { prepareSectorYear, SECTOR_BOUNDS, seedSector } from '../src/game/business/sector-core'
import { SECTOR_ROLES, UTIL } from '../src/game/business/sector-data'
import { choiceValue, eventProblems, SECTOR_EVENT_SCRIPT } from '../src/game/business/sector-events'
import { copyLines, modelOf, registerFamily, sectorCtx, sectorText, seasonIndex, type Branch, type FamilyModel, type LeverDef, type SectorCtx, type SectorEvent, type SectorFx } from '../src/game/business/sector-kit'
import { applyLever, deskLines, leverValue, sectorMenu } from '../src/game/business/sector-menu'
import { readSector, saveSector, type UtilState } from '../src/game/business/sector-state'
import { contractOptions, outageP, outageSize, overhaulCost, spotSettlement, utilFx, utilHeader, utilRow, utilSeed, UTIL_NOTE_COPY } from '../src/game/business/sector-util'
import { UTIL_COPY, UTIL_EVENTS, UTIL_LEVERS, UTIL_MODEL } from '../src/game/business/sector-util-play'
import { bizOf, type BizState, type KeyStaff } from '../src/game/business/state'
import { money, pct } from '../src/game/business/util'
import type { Industry } from '../src/game/data/markets'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { deskGame, frozen, playYear } from './sector-kit'

const TRADES = ['energy', 'solar', 'water', 'telecom', 'dataCenter', 'farm', 'logistics'] as const
const CAPACITY_TRADES = ['energy', 'solar', 'water', 'telecom', 'farm', 'logistics'] as const
const BASE = 8_600_000

interface Setup { g: GameState; a: Asset; b: BizState; going: number; seed: UtilState; ctx: SectorCtx }

/** A new company of the trade (founded this year, so its plant is at 80) with a hand-made context: a calm year of 8.6M at 80% use. */
function setup(trade: Industry, year = 2024): Setup {
  const { g, a, b } = deskGame(trade, { year })
  b.founded = g.year
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  return { g, a, b, going, seed: utilSeed(g, a, b, g.year), ctx: { use: .8, base: BASE, level: 1, going } }
}

/** The synthetic worth of the plan: contribution margin 80% of sales, 19% cost of goods. */
function worthOf(util: number): Worth {
  return { contrib: .8 * BASE, revenue: BASE, cogs: .19 * BASE, overhead: 0, wages: 0, util, brand: 0, quality: 0, morale: 0, moraleTarget: 0, karma: 0, arrest: 0 }
}

/** The trade's one extra key role, held by someone of this skill. */
function holder(trade: Industry, skill: number): KeyStaff {
  const role = SECTOR_ROLES[trade]
  return { id: 'k1', firstName: 'Ann', lastName: 'Lee', gender: 'female', age: 40, role: role.title, focus: role.focus, skill, salary: role.pay, trait: 'steady', morale: 60, years: 0 }
}

function run(s: Setup, st: UtilState, mode: 'book' | 'expected' = 'expected', fiscal = s.g.year, ctx = s.ctx): SectorFx {
  return utilFx(s.g, s.a, s.b, st, fiscal, mode, ctx)
}

function util(st: SectorFx['next']): UtilState {
  if (st.family !== 'util') throw new Error('expected a util record')
  return st
}

/** The first year from 1900 on whose hashed draws fit. */
function findYear(ok: (y: number) => boolean): number {
  for (let y = 1900; y < 2700; y++) if (ok(y)) return y
  throw new Error('no year fits')
}

/** The hashed draw of a year as a number from 0 to 1, as utilFx reads it. */
const draw = (s: Setup, year: number, salt: string): number => (seasonIndex(s.g, s.a, year, salt) + 1) / 2

/** A copy template turned back into what the voice report measures: every named hole becomes "${...}". */
const template = (text: string): string => text.replace(/\$\{\w+\}/g, '${...}')

describe('util math', () => {
  it('seeds', () => {
    const want = { energy: .5, solar: .6, water: 1, telecom: 1, dataCenter: .7, farm: .2, logistics: .5 }
    for (const trade of TRADES) {
      const s = setup(trade)
      expect(s.seed.family).toBe('util')
      expect(s.seed.contract).toBeCloseTo(want[trade], 12)
      expect(s.seed.contract).toBeCloseTo(Math.max(UTIL[trade].floor, 1 - UTIL[trade].spot), 12)
      expect(s.seed).toMatchObject({ hedge: 0, cover: 0, outages: 0, overhaul: 0, since: s.g.year, lastYear: s.g.year, lastEvent: 0, pending: null })
      expect(s.seed.ledger).toEqual([])
    }
    // The condition starts at 80 and loses 2 a year of age, at most 25.
    const s = setup('energy')
    const at = (age: number, since = 2020): number => {
      s.b.founded = since - age
      return utilSeed(s.g, s.a, s.b, since).condition
    }
    expect(at(0)).toBe(80)
    expect(at(1)).toBe(78)
    expect(at(12)).toBe(56)
    expect(at(13)).toBe(55)
    expect(at(40)).toBe(55)
    expect(at(-3)).toBe(86)
    expect(at(-20)).toBe(95)
    expect(utilSeed(s.g, s.a, s.b, 2031).since).toBe(2031)
    expect(utilSeed(s.g, s.a, s.b, 2031).lastYear).toBe(2031)
    // A company with no founding year reads as new.
    s.b.founded = Number.NaN
    expect(utilSeed(s.g, s.a, s.b, 2020).condition).toBe(80)
  })

  it('has the spec table', () => {
    expect(UTIL.energy).toEqual({ wear: 5, hits: 'capacity', amp: .03, floor: .50, spot: .50, vol: .18, disc: .04, fuel: .45, overhaul: .020, sla: false })
    expect(UTIL.solar).toEqual({ wear: 3, hits: 'capacity', amp: .07, floor: .30, spot: .40, vol: .12, disc: .05, fuel: 0, overhaul: .020, sla: false })
    expect(UTIL.water).toEqual({ wear: 4, hits: 'capacity', amp: .06, floor: .80, spot: 0, vol: 0, disc: 0, fuel: .10, overhaul: .025, sla: false })
    expect(UTIL.telecom).toEqual({ wear: 5, hits: 'capacity', amp: .02, floor: .30, spot: 0, vol: 0, disc: 0, fuel: 0, overhaul: .020, sla: true })
    expect(UTIL.dataCenter).toEqual({ wear: 4, hits: 'cost', amp: .04, floor: 0, spot: .30, vol: .15, disc: .05, fuel: .30, overhaul: .025, sla: true })
    expect(UTIL.farm).toEqual({ wear: 3, hits: 'capacity', amp: .22, floor: 0, spot: .80, vol: .20, disc: .05, fuel: .20, overhaul: .025, sla: false })
    expect(UTIL.logistics).toEqual({ wear: 6, hits: 'capacity', amp: .05, floor: 0, spot: .50, vol: .15, disc: .05, fuel: .40, overhaul: .020, sla: true })
    for (const trade of TRADES) expect(utilRow(trade)).toBe(UTIL[trade])
    expect(utilRow('restaurant')).toBeNull()
    expect(utilRow('constructor')).toBeNull()
    expect(utilRow('toString')).toBeNull()
    // Every trade has its extra ops role.
    for (const trade of TRADES) expect(SECTOR_ROLES[trade].focus).toBe('ops')
  })

  it('outage odds and size', () => {
    expect(outageP(80, 0, 0)).toBeCloseTo(.03, 12)
    expect(Math.abs(outageP(60, 0, 0) - .0578)).toBeLessThan(.0001)
    expect(outageP(60, 0, 0)).toBeCloseTo(.03 + 5 / 180, 12)
    expect(Math.abs(outageP(60, 1, 1) - .0539)).toBeLessThan(.0001)
    expect(Math.abs(outageP(0, 1, 0) - .441)).toBeLessThan(.001)
    // Odds start to rise below condition 65 and never leave .02 to .45 (a skilled role halves them).
    expect(outageP(65, 0, 0)).toBeCloseTo(.03, 12)
    expect(outageP(64, 0, 0)).toBeGreaterThan(outageP(65, 0, 0))
    for (let c = -20; c <= 120; c += 5) {
      for (const bad of [0, .5, 1]) {
        const p = outageP(c, bad, 0)
        expect(p).toBeGreaterThanOrEqual(.02)
        expect(p).toBeLessThanOrEqual(.45)
        expect(outageP(c, bad, 1)).toBeCloseTo(p * .5, 12)
        expect(outageP(c, bad, 1)).toBeGreaterThanOrEqual(.01)
      }
    }
    expect(outageP(Number.NaN, 0, 0)).toBeLessThanOrEqual(.45)
    expect(Math.abs(outageSize(60) - .29)).toBeLessThan(1e-9)
    expect(outageSize(0)).toBeCloseTo(.5, 12)
    expect(outageSize(100)).toBeCloseTo(.15, 12)
    expect(outageSize(130)).toBeCloseTo(.15, 12)
    expect(outageSize(-10)).toBeCloseTo(.5, 12)
    for (let c = 0; c <= 100; c += 5) {
      expect(outageSize(c)).toBeLessThanOrEqual(.5)
      expect(outageSize(c)).toBeGreaterThanOrEqual(.15)
    }
  })

  it('condition', () => {
    const s = setup('energy')
    const wear = UTIL.energy.wear
    // Unattended: it falls by the table's wear a year, to 0 at the worst.
    let st: UtilState = { ...s.seed, condition: 80 }
    for (let k = 1; k <= 6; k++) {
      st = util(run(s, st, 'expected', s.g.year + k - 1).next)
      expect(st.condition).toBeCloseTo(Math.max(0, 80 - k * wear), 9)
    }
    // A skill-1 role takes 4 points a year off the wear.
    const staffed = setup('energy')
    staffed.b.staff.push(holder('energy', 100))
    expect(util(run(staffed, staffed.seed).next).condition).toBeCloseTo(80 - wear + 4, 9)
    const half = setup('energy')
    half.b.staff.push(holder('energy', 50))
    expect(util(run(half, half.seed).next).condition).toBeCloseTo(80 - wear + 2, 9)
    // Another trade's role does nothing here.
    const other = setup('energy')
    other.b.staff.push(holder('solar', 100))
    expect(util(run(other, other.seed).next).condition).toBeCloseTo(80 - wear, 9)

    // An overhaul year uses condition + 12 for the odds and the size, then wears from that.
    const plain = run(s, { ...s.seed, condition: 60 })
    const done = run(s, { ...s.seed, condition: 60, overhaul: s.g.year })
    expect(plain.capLoss).toBeCloseTo(outageP(60, 0, 0) * outageSize(60), 12)
    expect(done.capLoss).toBeCloseTo(outageP(72, 0, 0) * outageSize(72), 12)
    expect(util(plain.next).condition).toBeCloseTo(60 - wear, 9)
    expect(util(done.next).condition).toBeCloseTo(72 - wear, 9)
    // An overhaul of another year lifts nothing.
    expect(util(run(s, { ...s.seed, condition: 60, overhaul: s.g.year - 1 }).next).condition).toBeCloseTo(60 - wear, 9)
    expect(util(run(s, { ...s.seed, condition: 60, overhaul: s.g.year + 1 }).next).condition).toBeCloseTo(60 - wear, 9)
    // Condition stays within 0 to 100.
    expect(util(run(staffed, { ...staffed.seed, condition: 100 }).next).condition).toBeCloseTo(100 - wear + 4, 9)
    expect(util(run(staffed, { ...staffed.seed, condition: 100, overhaul: staffed.g.year }).next).condition).toBe(100)
    expect(util(run(s, { ...s.seed, condition: 2 }).next).condition).toBe(0)
    // The odds fall with a skilled role.
    expect(run(staffed, { ...staffed.seed, condition: 40 }).capLoss).toBeLessThan(run(s, { ...s.seed, condition: 40 }).capLoss)
    // The other stocks stay as they are.
    const kept = util(run(s, { ...s.seed, hedge: .5, cover: 1, contract: .75, overhaul: 2001 }).next)
    expect(kept).toMatchObject({ hedge: .5, cover: 1, contract: .75, overhaul: 2001 })
  })

  it('outages come from a hashed draw, never g.rng', () => {
    const s = setup('telecom')
    const st: UtilState = { ...s.seed, condition: 30 }
    const bad = (y: number): number => Math.max(0, -seasonIndex(s.g, s.a, y, 'wx'))
    const hitYear = findYear((y) => draw(s, y, 'out') < outageP(30, bad(y), 0))
    const missYear = findYear((y) => draw(s, y, 'out') >= outageP(30, bad(y), 0) + .05)
    const rng = JSON.stringify(s.g.rng)
    const hit = run(s, { ...st, outages: 0b010 }, 'book', hitYear)
    const miss = run(s, { ...st, outages: 0b011 }, 'book', missYear)
    expect(JSON.stringify(s.g.rng)).toBe(rng)
    // A hit puts a 1 in bit 0 of the 3-bit history, a miss a 0.
    expect(util(hit.next).outages).toBe(0b101)
    expect(util(miss.next).outages).toBe(0b110)
    expect(util(run(s, { ...st, outages: 0b111 }, 'book', hitYear).next).outages).toBe(0b111)
    expect(util(run(s, { ...st, outages: 0b100 }, 'book', missYear).next).outages).toBe(0b000)
    // The same year gives the same answer.
    expect(run(s, st, 'book', hitYear)).toEqual(run(s, st, 'book', hitYear))
    // A hit costs capacity (size by condition, weather aside), a repair and the SLA penalty.
    const row = UTIL.telecom
    const w = row.amp * bad(hitYear)
    expect(hit.capLoss).toBeCloseTo(1 - (1 - w) * (1 - outageSize(30)), 12)
    expect(hit.randCosts).toBeCloseTo(.8 * overhaulCost(s.b, row, s.ctx) + .015 * BASE, 6)
    expect(hit.randIncome).toBe(0)
    expect(miss.randCosts).toBe(0)
    expect(miss.capLoss).toBeCloseTo(row.amp * bad(missYear), 12)
    // A trade with no SLA pays the repair only.
    const farm = setup('farm')
    const farmHit = findYear((y) => draw(farm, y, 'out') < outageP(30, Math.max(0, -seasonIndex(farm.g, farm.a, y, 'wx')), 0))
    const f = run(farm, { ...farm.seed, condition: 30, contract: 1 }, 'book', farmHit)
    expect(f.randCosts).toBeCloseTo(.8 * overhaulCost(farm.b, UTIL.farm, farm.ctx), 6)
  })

  it('expected mode takes the odds, not the draw', () => {
    // Every draw at its mean: the loss is P times its size, the repair and SLA costs are P times theirs, and nothing reads a hash.
    const s = setup('telecom')
    const row = UTIL.telecom
    const st: UtilState = { ...s.seed, condition: 50 }
    const p = outageP(50, 0, 0)
    const fx = run(s, st, 'expected')
    expect(fx.capLoss).toBeCloseTo(p * outageSize(50), 12)
    expect(fx.randCosts).toBeCloseTo(p * (.8 * overhaulCost(s.b, row, s.ctx) + .015 * BASE), 6)
    expect(fx.randIncome).toBe(0)
    expect(util(fx.next).outages).toBe(0)
    // The same in any year of the past or future, because no hash is read (the weather and spot draws are 0 too).
    for (const y of [1950, 2024, 2300]) expect(run(s, st, 'expected', y).capLoss).toBeCloseTo(fx.capLoss, 12)
  })

  it('overhaul', () => {
    const s = setup('energy')
    const row = UTIL.energy
    expect(overhaulCost(s.b, row, s.ctx)).toBe(172_000)
    expect(overhaulCost(s.b, row, { ...s.ctx, base: 10_000 })).toBe(2000)
    expect(overhaulCost(s.b, row, { ...s.ctx, base: 10_000, level: 2 })).toBe(4000)
    expect(overhaulCost(s.b, UTIL.water, { ...s.ctx, base: 1_000_000 })).toBe(25_000)
    expect(Number.isInteger(overhaulCost(s.b, row, { ...s.ctx, base: 1_234_567 }))).toBe(true)

    // From condition 60, the expected output lost over the next three years with and without it.
    let plain: UtilState = { ...s.seed, condition: 60 }
    let done: UtilState = { ...plain, overhaul: s.g.year }
    const cut: number[] = []
    const lossOf = (condition: number, lifted: boolean): { loss: number; next: number } => {
      const cond = lifted ? condition + 12 : condition
      return { loss: outageP(cond, 0, 0) * outageSize(cond), next: cond - row.wear }
    }
    let by = 60
    let withIt = 60
    for (let k = 0; k < 3; k++) {
      const without = run(s, plain, 'expected', s.g.year + k)
      const overhauled = run(s, done, 'expected', s.g.year + k)
      cut.push(without.capLoss - overhauled.capLoss)
      const pa = lossOf(by, false)
      const pb = lossOf(withIt, k === 0)
      expect(without.capLoss).toBeCloseTo(pa.loss, 12)
      expect(overhauled.capLoss).toBeCloseTo(pb.loss, 12)
      by = pa.next
      withIt = pb.next
      plain = util(without.next)
      done = util(overhauled.next)
    }
    expect(cut[0]).toBeGreaterThan(0)
    expect(cut[1]).toBeGreaterThan(cut[0])
    expect(cut[2]).toBeGreaterThan(cut[1])
    // The spec's rounded figures hold while the table's wear is 5; any other wear is derived above.
    if (row.wear === 5) {
      expect(Math.abs(cut[0] - .009)).toBeLessThan(.003)
      expect(Math.abs(cut[1] - .018)).toBeLessThan(.003)
      expect(Math.abs(cut[2] - .024)).toBeLessThan(.003)
    }
    // At condition 75 it cuts almost nothing.
    const high = run(s, { ...s.seed, condition: 75 }).capLoss - run(s, { ...s.seed, condition: 75, overhaul: s.g.year }).capLoss
    expect(high).toBeGreaterThan(0)
    expect(high).toBeLessThan(.003)
  })

  describe('what the overhaul is worth', () => {
    const OVERHAUL: LeverDef = {
      id: 'overhaul', label: 'Overhaul', paid: true,
      options: () => [{ value: 1, label: 'Overhaul', tip: '' }],
      current: (st, year) => (st.family === 'util' && st.overhaul === year ? 1 : 0),
      apply: (st, _value, year) => (st.family === 'util' ? { ...st, overhaul: year } : st),
      cost: (_g, b, _st, _value, cx) => {
        const row = utilRow(b.industry)
        return row ? overhaulCost(b, row, cx) : 0
      },
    }
    const model: FamilyModel = { family: 'util', copy: {}, seed: utilSeed, effects: utilFx, header: utilHeader, levers: [OVERHAUL], events: [] }
    let before: FamilyModel | null = null
    beforeAll(() => {
      before = modelOf('util')
      registerFamily(model)
    })
    afterAll(() => {
      if (before) registerFamily(before)
    })

    const value = (s: Setup, condition: number, util = 1): number => leverValue(s.g, s.a, s.b, { ...s.seed, condition }, OVERHAUL, 1, worthOf(util), s.ctx)

    it('is positive when the plant is run down and negative when it is not', () => {
      const s = setup('energy')
      expect(value(s, 55)).toBeGreaterThan(0)
      expect(value(s, 60)).toBeGreaterThan(0)
      expect(value(s, 75)).toBeLessThan(0)
      expect(value(s, 85)).toBeLessThan(0)
      // The sign flips between 60 and 75.
      expect(value(s, 62)).toBeGreaterThan(value(s, 70))
    })

    it('never rises with condition from 40 to 90', () => {
      for (const trade of ['energy', 'logistics', 'water'] as const) {
        const s = setup(trade)
        let last = Number.POSITIVE_INFINITY
        for (let c = 40; c <= 90; c += 5) {
          const v = value(s, c)
          expect(v).toBeLessThanOrEqual(last + 1e-6)
          last = v
        }
      }
    })

    it('is worth less with spare capacity', () => {
      const s = setup('energy')
      expect(value(s, 60, .7)).toBeLessThan(value(s, 60, 1))
      expect(value(s, 40, .7)).toBeLessThan(value(s, 40, 1))
    })

    it('reads no draw from g.rng and writes nothing', () => {
      const s = setup('energy')
      const before = JSON.stringify(s.g)
      value(s, 60)
      expect(JSON.stringify(s.g)).toBe(before)
    })
  })

  it('weather', () => {
    for (const trade of CAPACITY_TRADES) {
      const s = setup(trade)
      const row = UTIL[trade]
      const st: UtilState = { ...s.seed, condition: 100 }
      const wx = (y: number): number => seasonIndex(s.g, s.a, y, 'wx')
      const calm = (y: number): boolean => draw(s, y, 'out') >= .5
      // A bad year: capacity falls by amp * bad, halved by cover; unit cost does not change.
      const badYear = findYear((y) => wx(y) <= -.6 && calm(y))
      const bad = -wx(badYear)
      const open = run(s, st, 'book', badYear)
      expect(open.capLoss).toBeCloseTo(row.amp * bad, 12)
      expect(open.cost).toBe(1)
      expect(open.demand).toBe(1)
      expect(open.open).toBe(1)
      const covered = run(s, { ...st, cover: 1 }, 'book', badYear)
      expect(covered.capLoss).toBeCloseTo(row.amp * bad * .5, 12)
      expect(covered.costs).toBeCloseTo(.006 * BASE, 6)
      expect(open.costs).toBe(0)
      // A good year cuts unit cost by half the amplitude times the draw, with or without cover.
      const goodYear = findYear((y) => wx(y) >= .6 && calm(y))
      const good = wx(goodYear)
      for (const cover of [0, 1] as const) {
        const fx = run(s, { ...st, cover }, 'book', goodYear)
        expect(fx.cost).toBeCloseTo(1 - .5 * row.amp * good, 12)
        expect(fx.capLoss).toBe(0)
      }
      // Expected mode has no weather.
      expect(run(s, st, 'expected', badYear).capLoss).toBeCloseTo(outageP(100, 0, 0) * outageSize(100), 12)
      expect(run(s, st, 'expected', goodYear).cost).toBe(1)
    }

    // The data center takes the weather as a cooling bill, never as lost capacity.
    const dc = setup('dataCenter')
    const row = UTIL.dataCenter
    const st: UtilState = { ...dc.seed, condition: 100 }
    const wx = (y: number): number => seasonIndex(dc.g, dc.a, y, 'wx')
    const calm = (y: number): boolean => draw(dc, y, 'out') >= .5
    const hot = findYear((y) => wx(y) <= -.6 && calm(y))
    expect(run(dc, st, 'book', hot).cost).toBeCloseTo(1 + row.amp * -wx(hot), 12)
    expect(run(dc, { ...st, cover: 1 }, 'book', hot).cost).toBeCloseTo(1 + row.amp * -wx(hot) * .5, 12)
    expect(run(dc, st, 'book', hot).capLoss).toBe(0)
    const mild = findYear((y) => wx(y) >= .6 && calm(y))
    expect(run(dc, st, 'book', mild).cost).toBe(1)
    expect(run(dc, st, 'book', mild).capLoss).toBe(0)

    // The capacity lost to weather and to an outage combine as 1 - (1 - w) * (1 - o).
    const t = setup('telecom')
    const worn: UtilState = { ...t.seed, condition: 30 }
    const both = findYear((y) => seasonIndex(t.g, t.a, y, 'wx') <= -.3 && draw(t, y, 'out') < outageP(30, -seasonIndex(t.g, t.a, y, 'wx'), 0))
    const w = UTIL.telecom.amp * -seasonIndex(t.g, t.a, both, 'wx')
    expect(run(t, worn, 'book', both).capLoss).toBeCloseTo(1 - (1 - w) * (1 - outageSize(30)), 12)
    // A bad year also lifts the outage odds by .05 * bad.
    const near = findYear((y) => seasonIndex(t.g, t.a, y, 'wx') <= -.8 && draw(t, y, 'out') >= outageP(30, 0, 0) && draw(t, y, 'out') < outageP(30, -seasonIndex(t.g, t.a, y, 'wx'), 0))
    expect(util(run(t, worn, 'book', near).next).outages & 1).toBe(1)
  })

  it('spot and contract', () => {
    const e = setup('energy')
    const row = UTIL.energy
    expect(spotSettlement(row, e.seed, 1)).toBeCloseTo(.09, 12)
    expect(spotSettlement(row, e.seed, -1)).toBeCloseTo(-spotSettlement(row, e.seed, 1), 12)
    expect(spotSettlement(row, e.seed, 0)).toBe(0)
    expect(spotSettlement(row, { ...e.seed, contract: 1 }, 1)).toBe(0)
    expect(spotSettlement(row, { ...e.seed, contract: .75 }, 1)).toBeCloseTo(.045, 12)
    for (const trade of ['water', 'telecom'] as const) expect(spotSettlement(UTIL[trade], { ...e.seed, contract: 0 }, 1)).toBe(0)

    // In a calm year, spot up pays and spot down costs, by (1 - contract) * vol * draw of a normal year.
    const st: UtilState = { ...e.seed, condition: 100 }
    const spot = (y: number): number => seasonIndex(e.g, e.a, y, 'spot')
    const calm = (y: number): boolean => draw(e, y, 'out') >= .5
    const up = findYear((y) => spot(y) >= .5 && calm(y))
    const down = findYear((y) => spot(y) <= -.5 && calm(y))
    const gain = run(e, st, 'book', up)
    expect(gain.randIncome).toBeCloseTo(.09 * spot(up) * BASE, 6)
    expect(gain.randCosts).toBe(0)
    const loss = run(e, st, 'book', down)
    expect(loss.randCosts).toBeCloseTo(.09 * -spot(down) * BASE, 6)
    expect(loss.randIncome).toBe(0)
    // Fully contracted: no spot flows. Expected mode: none either.
    const locked = run(e, { ...st, contract: 1 }, 'book', up)
    expect(locked.randIncome).toBe(0)
    expect(locked.randCosts).toBe(0)
    expect(run(e, st, 'expected', up).randIncome).toBe(0)

    // Moving off the seed mix earns or pays (contract0 - contract) * disc * base every year.
    expect(run(e, st).income).toBe(0)
    expect(run(e, st).costs).toBe(0)
    const more = run(e, { ...st, contract: .75 })
    expect(more.costs).toBeCloseTo(.25 * .04 * BASE, 6)
    expect(more.income).toBe(0)
    expect(run(e, { ...st, contract: 1 }).costs).toBeCloseTo(.5 * .04 * BASE, 6)
    const s = setup('solar')
    const less = run(s, { ...s.seed, contract: .3 })
    expect(less.income).toBeCloseTo((.6 - .3) * .05 * BASE, 6)
    expect(less.costs).toBe(0)
    // Water and telecom are regulated: no spot flows and no premium whatever the record says.
    for (const trade of ['water', 'telecom'] as const) {
      const r = setup(trade)
      const fx = run(r, { ...r.seed, contract: 0, condition: 100 }, 'book', up)
      expect(fx.income).toBe(0)
      expect(fx.costs).toBe(0)
      expect(fx.randIncome).toBe(0)
    }

    expect(contractOptions(.5)).toEqual([.5, .75, 1])
    expect(contractOptions(.3)).toEqual([.3, .55, .8, 1])
    expect(contractOptions(0)).toEqual([0, .25, .5, .75, 1])
    expect(contractOptions(.8)).toEqual([.8, 1])
    expect(contractOptions(1)).toEqual([1])
    for (const trade of TRADES) for (const c of contractOptions(UTIL[trade].floor)) expect(c).toBe(Math.round(c * 100) / 100)
    // Water and telecom have no spot share to trade.
    expect(UTIL.water.vol).toBe(0)
    expect(UTIL.telecom.vol).toBe(0)
  })

  it('hedge', () => {
    const s = setup('logistics')
    const st: UtilState = { ...s.seed, hedge: .8 }
    const factor = (year: number): number => nationalMarket(s.g, 'logistics', 'us', year).events.costs
    // The engine's own oil costs for these years.
    expect(factor(1974)).toBeCloseTo(1.18, 2)
    expect(factor(2015)).toBeCloseTo(.92, 2)
    expect(factor(2030)).toBeCloseTo(1, 12)
    // cost = 1 - hedge * fuel * (f - 1): it offsets a spike and pays for being wrong in a glut.
    const at = (year: number, hedge: UtilState): SectorFx => run(s, hedge, 'expected', year)
    expect(at(1974, st).cost).toBeCloseTo(1 - .8 * .4 * (factor(1974) - 1), 12)
    expect(Math.abs(at(1974, st).cost - .9424)).toBeLessThan(.001)
    expect(at(1974, st).cost).toBeLessThan(1)
    expect(Math.abs(at(2015, st).cost - 1.0256)).toBeLessThan(.001)
    expect(at(2015, st).cost).toBeGreaterThan(1)
    expect(at(1974, { ...st, hedge: .5 }).cost).toBeCloseTo(1 - .5 * .4 * (factor(1974) - 1), 12)
    // No hedge, no effect.
    expect(at(1974, s.seed).cost).toBe(1)
    // A year with no oil move: no change on the cost, only the premium.
    s.g.year = 2030
    expect(at(2030, st).cost).toBeCloseTo(1, 12)
    expect(at(2030, st).costs).toBeCloseTo(.025 * .8 * .40 * BASE, 6)
    expect(at(2030, s.seed).costs).toBe(0)
    expect(at(2030, { ...st, hedge: .5 }).costs).toBeCloseTo(.025 * .5 * .40 * BASE, 6)
    // Solar and telecom have no fuel: a hedge in the record changes and costs nothing.
    for (const trade of ['solar', 'telecom'] as const) {
      const f = setup(trade)
      expect(UTIL[trade].fuel).toBe(0)
      const fx = run(f, { ...f.seed, hedge: .8 }, 'expected', 1974)
      expect(fx.cost).toBe(1)
      expect(fx.costs).toBe(0)
    }
    // It reads no further than the year being lived: in 1973 the 1974 spike is unknown.
    const t = setup('logistics')
    t.g.year = 1973
    const sameStock = { ...t.seed, hedge: .8 }
    expect(run(t, sameStock, 'expected', 1974).cost).toBeCloseTo(run(t, sameStock, 'expected', 1973).cost, 12)
    expect(run(t, sameStock, 'expected', 2030).cost).toBeCloseTo(run(t, sameStock, 'expected', 1973).cost, 12)
    expect(run(t, sameStock, 'expected', 1973).cost).toBeCloseTo(1 - .8 * .4 * (nationalMarket(t.g, 'logistics', 'us', 1973).events.costs - 1), 12)
    // In a booked year the hedge and the weather multiply.
    const dc = setup('dataCenter')
    const hedged: UtilState = { ...dc.seed, hedge: .5, condition: 100 }
    const wxDc = (y: number): number => seasonIndex(dc.g, dc.a, y, 'wx')
    const oilOf = (y: number): number => nationalMarket(dc.g, 'dataCenter', 'us', y).events.costs
    const hot = findYear((y) => wxDc(y) <= -.5 && Math.abs(oilOf(y) - 1) > .005)
    const oil = oilOf(hot)
    expect(run(dc, hedged, 'book', hot).cost).toBeCloseTo((1 + UTIL.dataCenter.amp * -wxDc(hot)) * (1 - .5 * .3 * (oil - 1)), 12)
  })

  it('mean', () => {
    for (const trade of TRADES) {
      const s = setup(trade)
      const row = UTIL[trade]
      let cost = 0
      let capLoss = 0
      for (let k = 0; k < 400; k++) {
        const fx = run(s, s.seed, 'book', 2000 + k)
        expect(fx.demand).toBe(1)
        cost += fx.cost
        capLoss += fx.capLoss
      }
      const analytic = row.hits === 'capacity' ? 1 - .5 * row.amp * .25 : 1 + row.amp * .25
      expect(Math.abs(cost / 400 - analytic)).toBeLessThan(.01)
      expect(capLoss / 400).toBeLessThanOrEqual(row.hits === 'capacity' ? row.amp * .25 + .06 : .06)
    }
    // The four weather trades with the big amplitudes sit outside the .995 to 1.02 band of food and care, by design.
    for (const trade of ['farm', 'solar', 'water', 'logistics'] as const) {
      const row = UTIL[trade]
      expect(1 - .5 * row.amp * .25).toBeLessThan(.995)
    }
  })

  it('writes one note for an outage or a condition band', () => {
    const t = setup('telecom')
    const worn: UtilState = { ...t.seed, condition: 30 }
    const bad = (y: number): number => Math.max(0, -seasonIndex(t.g, t.a, y, 'wx'))
    const hitYear = findYear((y) => draw(t, y, 'out') < outageP(30, bad(y), 0))
    const hit = run(t, worn, 'book', hitYear)
    expect(hit.note?.tone).toBe('bad')
    expect(hit.note?.text).toContain(t.a.name)
    expect(hit.note?.text).toContain('outage')
    expect(hit.note?.text).toContain(pct(outageSize(30)))
    expect(hit.note?.text.length).toBeLessThanOrEqual(90)
    const missYear = findYear((y) => draw(t, y, 'out') >= outageP(30, bad(y), 0) + .05)
    expect(run(t, worn, 'book', missYear).note).toBeNull()
    // The year's note is the outage, not the band, when both happen.
    const crossing: UtilState = { ...t.seed, condition: 66 }
    const hitCross = findYear((y) => draw(t, y, 'out') < outageP(66, bad(y), 0))
    expect(run(t, crossing, 'book', hitCross).note?.text).toContain('outage')

    // The condition band: below 65 the odds start to rise. A note when the plant crosses it, either way.
    const down = run(t, { ...t.seed, condition: 66 })
    expect(down.note?.tone).toBe('bad')
    expect(down.note?.text).toContain('wearing')
    const up = run(t, { ...t.seed, condition: 62, overhaul: t.g.year })
    expect(up.note?.tone).toBe('good')
    expect(up.note?.text).toContain('65')
    expect(run(t, t.seed).note).toBeNull()
    expect(run(t, { ...t.seed, condition: 50 }).note).toBeNull()
    expect(run(t, { ...t.seed, condition: 90 }).note).toBeNull()

    for (const key of Object.keys(UTIL_NOTE_COPY)) {
      expect(key.startsWith('util.')).toBe(true)
      expect(key.endsWith('.log')).toBe(true)
      expect(unitFlags(template(UTIL_NOTE_COPY[key]), 'log')).toEqual([])
    }
  })

  it('draws from the hash, never g.rng', () => {
    const s = setup('farm')
    const before = JSON.stringify(s.g.rng)
    const fx = run(s, { ...s.seed, condition: 40 }, 'book', 2011)
    expect(JSON.stringify(s.g.rng)).toBe(before)
    expect(fx.demand).toBe(1)
    expect(Number.isFinite(fx.cost)).toBe(true)
  })

  it('runs 12 years finite and inside the ranges', () => {
    for (const trade of TRADES) {
      const s = setup(trade, 2012)
      let st = s.seed
      const row = UTIL[trade]
      for (let k = 0; k < 12; k++) {
        const fx = run(s, st, 'book', 2012 + k)
        for (const v of [fx.demand, fx.cost, fx.capLoss, fx.open, fx.income, fx.costs, fx.randIncome, fx.randCosts]) expect(Number.isFinite(v)).toBe(true)
        expect(fx.demand).toBe(1)
        expect(fx.open).toBe(1)
        expect(fx.capLoss).toBeGreaterThanOrEqual(0)
        expect(fx.capLoss).toBeLessThan(1)
        // The core clamps the cost to .90 to 1.12 (a farm's best weather year takes it a little under); the raw figure stays sane.
        expect(fx.cost).toBeGreaterThan(.85)
        expect(fx.cost).toBeLessThan(1.15)
        for (const v of [fx.income, fx.costs, fx.randIncome, fx.randCosts]) expect(v).toBeGreaterThanOrEqual(0)
        st = util(fx.next)
        expect(st.condition).toBeGreaterThanOrEqual(0)
        expect(st.condition).toBeLessThanOrEqual(100)
        expect(st.contract).toBeGreaterThanOrEqual(0)
        expect(st.contract).toBeLessThanOrEqual(1)
        expect(st.outages).toBeGreaterThanOrEqual(0)
        expect(st.outages).toBeLessThanOrEqual(7)
        expect(st.hedge).toBeLessThanOrEqual(.8)
        // Unattended, the plant only wears down.
        expect(st.condition).toBeCloseTo(Math.max(0, 80 - (k + 1) * row.wear), 9)
      }
    }

    // An unattended energy plant never leaves the bounds: the record, the channels and every flow it books.
    const e = setup('energy', 2012)
    let st = e.seed
    for (let k = 0; k < 12; k++) {
      const fx = run(e, st, 'book', 2012 + k)
      expect(fx.cost).toBeGreaterThanOrEqual(.9)
      expect(fx.cost).toBeLessThanOrEqual(1.12)
      expect(fx.randIncome).toBeLessThanOrEqual(SECTOR_BOUNDS.random * BASE)
      expect(fx.randCosts).toBeLessThanOrEqual(SECTOR_BOUNDS.random * BASE)
      st = util(fx.next)
    }
    expect(st.condition).toBeCloseTo(Math.max(0, 80 - 12 * UTIL.energy.wear), 9)
    expect(readSector({ industry: 'energy', sector: JSON.parse(JSON.stringify(st)) })).toEqual(st)

    // Identical calls give identical results and g.rng is untouched.
    const f = setup('farm', 2018)
    const rng = JSON.stringify(f.g.rng)
    expect(run(f, f.seed, 'book', 2018)).toEqual(run(f, f.seed, 'book', 2018))
    expect(JSON.stringify(f.g.rng)).toBe(rng)
  })

  it('is pure on frozen inputs', () => {
    for (const trade of TRADES) {
      const s = setup(trade, 2020)
      const st: UtilState = { ...s.seed, hedge: .5, cover: 1, contract: UTIL[trade].floor }
      const fx = utilFx(frozen(s.g), frozen(s.a), frozen(s.b), frozen(st), 2020, 'book', frozen({ ...s.ctx }))
      expect(fx.next).not.toBe(st)
      expect(utilHeader(s.g, s.b, st).length).toBeGreaterThan(0)
    }
  })

  it('writes a neutral year for a trade with no row', () => {
    const { g, a, b } = deskGame('restaurant')
    const st = setup('energy').seed
    const fx = utilFx(g, a, b, st, g.year, 'expected', { use: .8, base: BASE, level: 1, going: 1 })
    expect(fx).toMatchObject({ demand: 1, cost: 1, capLoss: 0, open: 1, income: 0, costs: 0, randIncome: 0, randCosts: 0, note: null })
    expect(fx.next).toBe(st)
    expect(utilHeader(g, b, null)).toEqual([])
  })

  it('header', () => {
    const e = setup('energy')
    const lines = utilHeader(e.g, e.b, e.seed)
    const text = lines.join(' ')
    expect(text).toContain('Condition 80. 0 outages in 3 years.')
    expect(text).toContain('Contract 50%, regulated 50%. Hedge 0%. Weather cover off.')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(140)
    expect(utilHeader(e.g, e.b, null)).toEqual([])

    // Solar has no fuel, so no hedge line.
    const solar = setup('solar')
    expect(utilHeader(solar.g, solar.b, solar.seed)).toEqual(['Condition 80. 0 outages in 3 years.', 'Contract 60%, regulated 30%.', 'Weather cover off.'])
    // Water is regulated with no spot to trade, and has a little fuel to hedge.
    const water = setup('water')
    expect(utilHeader(water.g, water.b, water.seed)).toEqual(['Condition 80. 0 outages in 3 years.', 'Regulated 80%.', 'Hedge 0%.', 'Weather cover off.'])
    expect(utilHeader(water.g, water.b, water.seed).join(' ')).toContain('Regulated 80%.')
    // Telecom: regulated, no fuel.
    const telecom = setup('telecom')
    expect(utilHeader(telecom.g, telecom.b, telecom.seed)).toEqual(['Condition 80. 0 outages in 3 years.', 'Regulated 30%.', 'Weather cover off.'])

    // The outage count reads the 3-bit history; one is singular.
    expect(utilHeader(e.g, e.b, { ...e.seed, outages: 1 })[0]).toBe('Condition 80. 1 outage in 3 years.')
    expect(utilHeader(e.g, e.b, { ...e.seed, outages: 0b100 })[0]).toBe('Condition 80. 1 outage in 3 years.')
    expect(utilHeader(e.g, e.b, { ...e.seed, outages: 0b101 })[0]).toBe('Condition 80. 2 outages in 3 years.')
    expect(utilHeader(e.g, e.b, { ...e.seed, outages: 7 })[0]).toBe('Condition 80. 3 outages in 3 years.')
    // The stocks as they stand.
    const worn = utilHeader(e.g, e.b, { ...e.seed, condition: 61.6, contract: .75, hedge: .5, cover: 1 })
    expect(worn).toEqual(['Condition 62. 0 outages in 3 years.', 'Contract 75%, regulated 50%.', 'Hedge 50%.', 'Weather cover on.'])
    // No hedge line for a trade with no fuel, whatever the record holds.
    expect(utilHeader(solar.g, solar.b, { ...solar.seed, hedge: .8 }).join(' ')).not.toContain('Hedge')

    for (const trade of TRADES) {
      const t = setup(trade)
      for (const l of utilHeader(t.g, t.b, t.seed)) {
        expect(l.length).toBeLessThanOrEqual(140)
        expect(unitFlags(l, 'text')).toEqual([])
      }
      // No history row for the utility trades, so no rough-estimate line.
      expect(utilHeader(t.g, t.b, t.seed).join(' ')).not.toContain('rough estimate')
    }
  })
})

// ---------------------------------------------------------------------------
// The desk: levers, events and copy of the family (sector-util-play.ts)

const EVENT_IDS = ['bigCustomer', 'fuelSpike', 'rateCase', 'recall', 'shortage', 'storm', 'subsidy']

function leverOf(id: string): LeverDef {
  const l = modelOf('util')?.levers.find((x) => x.id === id)
  if (!l) throw new Error(`no ${id} lever`)
  return l
}

function eventOf(id: string): SectorEvent {
  const e = modelOf('util')?.events.find((x) => x.id === id)
  if (!e) throw new Error(`no ${id} event`)
  return e
}

/** A company at the neutral point whose last year sold BASE, so the events' own context matches the synthetic worth. */
function desk(trade: Industry, year = 2024): Setup {
  const s = setup(trade, year)
  s.b.last = { netRevenue: BASE, wages: .2 * BASE, sold: 100_000 } as unknown as BizState['last']
  return s
}

/** The branches of one choice of one event, in a state. */
function branchesOf(s: Setup, st: UtilState, event: string, choice: string): Branch[] {
  const c = eventOf(event).choices(s.g, s.b, st).find((x) => x.id === choice)
  if (!c) throw new Error(`no ${choice} choice`)
  return c.branches(s.g, s.b, st)
}

/** A state where the events are live: a worn plant with half its fuel hedged. */
function busy(s: Setup): UtilState {
  return { ...s.seed, condition: 40, hedge: .5 }
}

/** Every line an event can show in a state: its title, scene, labels and outcomes. */
function shownBy(s: Setup, ev: SectorEvent, st: UtilState): string[] {
  const shown = [ev.title, ev.scene(s.g, s.a, s.b, st)]
  for (const c of ev.choices(s.g, s.b, st)) {
    shown.push(c.label)
    for (const br of c.branches(s.g, s.b, st)) shown.push(sectorText(UTIL_COPY, br.text, br.vals))
  }
  return shown
}

/** The two long dashes the voice guide bans, built from their code points so that this file holds neither a dash nor an escape for one. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

describe('util desk', () => {
  it('registers the util model', () => {
    const model = modelOf('util')
    expect(model).not.toBeNull()
    expect(model).toBe(UTIL_MODEL)
    expect(model?.levers.map((l) => l.id)).toEqual(['overhaul', 'contract', 'hedge', 'cover'])
    expect(model?.levers).toBe(UTIL_LEVERS)
    expect(model?.events).toBe(UTIL_EVENTS)
    expect(model?.events.map((e) => e.id).sort()).toEqual(EVENT_IDS)
    expect(model?.events).toHaveLength(7)
    expect(model?.copy).toBe(UTIL_COPY)
    expect(model?.levers.map((l) => l.paid)).toEqual([true, false, false, false])
    expect(model?.seed).toBe(utilSeed)
    expect(model?.effects).toBe(utilFx)
    expect(model?.header).toBe(utilHeader)

    // Contract needs a spot share to trade, a hedge needs fuel: water and telecom have no contract lever, solar and telecom no hedge.
    for (const trade of TRADES) {
      const s = setup(trade)
      const row = UTIL[trade]
      expect(leverOf('overhaul').options(s.g, s.b, s.seed).map((o) => o.value), `${trade} overhaul`).toEqual([1])
      expect(leverOf('cover').options(s.g, s.b, s.seed).map((o) => o.value), `${trade} cover`).toEqual([0, 1])
      expect(leverOf('contract').options(s.g, s.b, s.seed).map((o) => o.value), `${trade} contract`).toEqual(row.vol > 0 ? contractOptions(row.floor) : [])
      expect(leverOf('hedge').options(s.g, s.b, s.seed).map((o) => o.value), `${trade} hedge`).toEqual(row.fuel > 0 ? [0, .5, .8] : [])
    }
    const offered = (trade: Industry, id: string): number => {
      const s = setup(trade)
      return leverOf(id).options(s.g, s.b, s.seed).length
    }
    for (const trade of ['water', 'telecom'] as const) expect(offered(trade, 'contract'), trade).toBe(0)
    for (const trade of ['solar', 'telecom'] as const) expect(offered(trade, 'hedge'), trade).toBe(0)
    for (const id of ['overhaul', 'contract', 'hedge', 'cover']) expect(offered('energy', id), `energy ${id}`).toBeGreaterThan(0)
    const e = setup('energy')
    expect(leverOf('contract').options(e.g, e.b, e.seed).map((o) => o.value)).toEqual([.5, .75, 1])
    const f = setup('farm')
    expect(leverOf('contract').options(f.g, f.b, f.seed).map((o) => o.value)).toEqual([0, .25, .5, .75, 1])

    // The current setting of each lever reads from the record.
    expect(leverOf('overhaul').current({ ...e.seed, overhaul: e.g.year }, e.g.year)).toBe(1)
    expect(leverOf('overhaul').current({ ...e.seed, overhaul: e.g.year - 1 }, e.g.year)).toBe(0)
    expect(leverOf('overhaul').current(e.seed, e.g.year)).toBe(0)
    expect(leverOf('contract').current({ ...e.seed, contract: .75 }, e.g.year)).toBe(.75)
    expect(leverOf('hedge').current({ ...e.seed, hedge: .8 }, e.g.year)).toBe(.8)
    expect(leverOf('cover').current({ ...e.seed, cover: 1 }, e.g.year)).toBe(1)
    // What an option writes.
    expect(leverOf('overhaul').apply(e.seed, 1, 2031)).toMatchObject({ overhaul: 2031 })
    expect(leverOf('contract').apply(e.seed, .75, 2031)).toMatchObject({ contract: .75 })
    expect(leverOf('hedge').apply(e.seed, .8, 2031)).toMatchObject({ hedge: .8 })
    expect(leverOf('cover').apply(e.seed, 1, 2031)).toMatchObject({ cover: 1 })
    expect(leverOf('cover').apply({ ...e.seed, cover: 1 }, 0, 2031)).toMatchObject({ cover: 0 })
    // Only the overhaul has a price.
    const cx = { ...e.ctx }
    expect(leverOf('overhaul').cost(e.g, e.b, e.seed, 1, cx)).toBe(overhaulCost(e.b, UTIL.energy, cx))
    for (const id of ['contract', 'hedge', 'cover']) expect(leverOf(id).cost(e.g, e.b, e.seed, 1, cx), id).toBe(0)
  })

  it('hides the lever rows a trade has no options for', () => {
    const ids = (trade: Industry): string[] => {
      const s = setup(trade)
      return sectorMenu(s.a).children(s.g)
        .filter((n: MenuNode) => n.type === 'menu' && (n.visible?.(s.g) ?? true))
        .map((n: MenuNode) => n.id.split('.')[2])
    }
    expect(ids('energy')).toEqual(['overhaul', 'contract', 'hedge', 'cover'])
    expect(ids('dataCenter')).toEqual(['overhaul', 'contract', 'hedge', 'cover'])
    expect(ids('farm')).toEqual(['overhaul', 'contract', 'hedge', 'cover'])
    expect(ids('logistics')).toEqual(['overhaul', 'contract', 'hedge', 'cover'])
    expect(ids('solar')).toEqual(['overhaul', 'contract', 'cover'])
    expect(ids('water')).toEqual(['overhaul', 'hedge', 'cover'])
    expect(ids('telecom')).toEqual(['overhaul', 'cover'])
  })

  it('shows the desk through deskLines', () => {
    const s = setup('energy')
    expect(deskLines(s.g, s.a).join(' ')).toContain('The desk opens at the next year end.')
    expect(applyLever(s.g, s.a, 'cover', 1, 'owner')).toEqual({ ok: true, paid: 0 })
    const lines = deskLines(s.g, s.a)
    expect(lines.join(' ')).toContain('outages in 3 years.')
    expect(lines.join(' ')).toContain('Weather cover on.')
    expect(lines.at(-1)).toBe(`${s.g.year}: Weather cover now On.`)
  })

  it('moves the levers through applyLever', () => {
    const s1 = setup('energy')
    const s2 = setup('energy')
    const bA = (k: Setup): BizState => bizOf(k.g, k.a)

    // The overhaul is priced once, refused a second time, and lifts the condition by 12 in the year it is done.
    const price = overhaulCost(bA(s1), UTIL.energy, sectorCtx(s1.g, bA(s1), s1.g.year))
    expect(price).toBeGreaterThan(0)
    const cash = bA(s1).cash
    const costs = bA(s1).yearCosts
    expect(applyLever(s1.g, s1.a, 'overhaul', 1, 'owner')).toEqual({ ok: true, paid: price })
    expect(bA(s1).cash).toBe(cash - price)
    expect(bA(s1).yearCosts).toBe(costs + price)
    expect(readSector(bA(s1))).toMatchObject({ overhaul: s1.g.year, since: s1.g.year - 1, lastYear: s1.g.year - 1 })
    expect(applyLever(s1.g, s1.a, 'overhaul', 1, 'owner').ok).toBe(false)
    expect(bA(s1).cash).toBe(cash - price)

    // The control run has the same record and no overhaul; both books close for the year just lived.
    expect(seedSector(s2.g, s2.a, bA(s2), s2.g.year - 1)).not.toBeNull()
    const start = readSector(bA(s2))
    expect(start?.family).toBe('util')
    if (start?.family !== 'util') return
    prepareSectorYear(s1.g, s1.a, bA(s1), s1.g.year)
    prepareSectorYear(s2.g, s2.a, bA(s2), s2.g.year)
    const done = readSector(bA(s1))
    const plain = readSector(bA(s2))
    expect(done?.family === 'util' && plain?.family === 'util').toBe(true)
    if (done?.family !== 'util' || plain?.family !== 'util') return
    expect(plain.condition).toBeCloseTo(start.condition - UTIL.energy.wear, 9)
    expect(done.condition).toBeCloseTo(start.condition + 12 - UTIL.energy.wear, 9)

    // Hedge and cover are free to change once a year; the hook charges their premiums and the books agree.
    const h = setup('energy')
    const hb = (): BizState => bizOf(h.g, h.a)
    const base = sectorCtx(h.g, hb(), h.g.year).base
    const before = hb().cash
    expect(applyLever(h.g, h.a, 'hedge', .5, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(applyLever(h.g, h.a, 'cover', 1, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(hb().cash).toBe(before)
    expect(readSector(hb())).toMatchObject({ hedge: .5, cover: 1 })
    expect(applyLever(h.g, h.a, 'hedge', .8, 'owner').ok).toBe(false)
    expect(applyLever(h.g, h.a, 'cover', 0, 'owner').ok).toBe(false)
    expect(applyLever(h.g, h.a, 'contract', .6, 'owner').ok).toBe(false)
    prepareSectorYear(h.g, h.a, hb(), h.g.year)
    const row = readSector(hb())?.ledger.at(-1)
    expect(row?.year).toBe(h.g.year)
    expect(row?.costs).toBeGreaterThanOrEqual(Math.floor(.006 * base + .025 * .5 * UTIL.energy.fuel * base))
    // Every dollar the hook booked is in the cash: nothing is booked from nowhere.
    expect(hb().cash).toBe(before + (row?.income ?? 0) - (row?.costs ?? 0))

    // The contract mix: moving off the seed mix pays a premium every year.
    const c = setup('energy')
    const cb = (): BizState => bizOf(c.g, c.a)
    const cbase = sectorCtx(c.g, cb(), c.g.year).base
    expect(applyLever(c.g, c.a, 'contract', .75, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(readSector(cb())).toMatchObject({ contract: .75 })
    prepareSectorYear(c.g, c.a, cb(), c.g.year)
    expect(readSector(cb())?.ledger.at(-1)?.costs).toBeGreaterThanOrEqual(Math.floor(.25 * UTIL.energy.disc * cbase))
    // A trade with no spot share can't take the lever.
    const w = setup('water')
    expect(applyLever(w.g, w.a, 'contract', .9, 'owner').ok).toBe(false)
    expect(applyLever(w.g, w.a, 'contract', 1, 'owner').ok).toBe(false)
    const t = setup('telecom')
    expect(applyLever(t.g, t.a, 'hedge', .5, 'owner').ok).toBe(false)
  })

  it('has valid events', () => {
    const probes = (s: Setup): UtilState[] => [s.seed, busy(s), { ...s.seed, contract: 1 }]
    let seen = 0
    for (const trade of TRADES) {
      const s = desk(trade)
      for (const st of probes(s)) {
        for (const ev of UTIL_EVENTS) {
          expect(eventProblems(ev, s.g, s.a, s.b, st), `${trade} ${ev.id} ${st.condition}`).toEqual([])
          for (const line of shownBy(s, ev, st)) {
            expect(line.length, `${ev.id} has an empty line`).toBeGreaterThan(0)
            expect(line, `${trade} ${ev.id}`).not.toMatch(/\$\{|NaN|undefined|Infinity/)
          }
          seen++
        }
      }
    }
    expect(seen).toBe(TRADES.length * 3 * 7)
    // The yearly condition lines of the math file render too.
    for (const key of Object.keys(UTIL_NOTE_COPY)) {
      const line = sectorText(UTIL_COPY, key, { name: 'Test plant', loss: '12%' })
      expect(line).toContain('Test plant')
      expect(line).not.toMatch(/\$\{|undefined/)
    }
  })

  it('has the storm outcomes', () => {
    const s = desk('energy')
    const st = busy(s)
    const weight = (condition: number): number => eventOf('storm').weight(s.g, s.b, { ...s.seed, condition })
    expect(weight(80)).toBe(1)
    expect(weight(65)).toBe(1)
    expect(weight(40)).toBeCloseTo(1.5, 12)
    expect(weight(0)).toBeCloseTo(2.3, 12)
    expect(weight(40)).toBeGreaterThan(weight(80))

    const crews = branchesOf(s, st, 'storm', 'crews')
    const degraded = branchesOf(s, st, 'storm', 'degraded')
    const power = branchesOf(s, st, 'storm', 'power')
    for (const bs of [crews, degraded, power]) expect(bs).toHaveLength(1)
    // Crews pay and avoid most of the capacity loss; running degraded keeps the money and loses capacity and condition; backup pays more and loses neither.
    expect(crews[0].fx.cash).toBeLessThan(0)
    expect(power[0].fx.cash).toBeLessThan(crews[0].fx.cash ?? 0)
    expect(degraded[0].fx.cash ?? 0).toBe(0)
    expect(crews[0].fx.capacityTo ?? 0).toBeGreaterThan(0)
    expect(crews[0].fx.capacityTo ?? 0).toBeLessThanOrEqual(.03)
    expect(degraded[0].fx.capacityTo ?? 0).toBeGreaterThanOrEqual(.07)
    expect(degraded[0].fx.capacityTo ?? 0).toBeGreaterThan(crews[0].fx.capacityTo ?? 0)
    expect(power[0].fx.capacityTo ?? 0).toBe(0)
    expect(crews[0].sec?.add).toEqual({ condition: -2 })
    expect(degraded[0].sec?.add).toEqual({ condition: -7 })
    expect(power[0].sec).toBeUndefined()
    // The bill shown on a label is the bill paid.
    const label = (id: string): string | undefined => eventOf('storm').choices(s.g, s.b, st).find((c) => c.id === id)?.label
    expect(label('crews')).toBe(sectorText(UTIL_COPY, 'util.ev.storm.crews.label', { cost: money(-(crews[0].fx.cash ?? 0)) }))
    expect(label('power')).toBe(sectorText(UTIL_COPY, 'util.ev.storm.power.label', { cost: money(-(power[0].fx.cash ?? 0)) }))
    // A run-down plant takes more damage when it runs degraded.
    const worse = branchesOf(s, { ...st, condition: 20 }, 'storm', 'degraded')[0].fx.capacityTo ?? 0
    const better = branchesOf(s, { ...st, condition: 90 }, 'storm', 'degraded')[0].fx.capacityTo ?? 0
    expect(worse).toBeGreaterThan(better)
    // With spare capacity, riding a storm out costs little; with none, the crews pay for themselves.
    const spare = worthOf(.7)
    const full = worthOf(1)
    const value = (w: Worth, id: string): number => choiceValue(s.g, s.a, s.b, st, eventOf('storm'), id, w)
    expect(value(full, 'crews')).toBeGreaterThan(value(full, 'degraded'))
    expect(value(spare, 'degraded')).toBeGreaterThan(value(spare, 'crews'))
  })

  it('has the fuel spike outcomes', () => {
    const s = desk('energy')
    const fuel = UTIL.energy.fuel
    const at = (hedge: number): { hedge: Branch; pass: Branch; absorb: Branch } => {
      const st: UtilState = { ...s.seed, hedge }
      return { hedge: branchesOf(s, st, 'fuelSpike', 'hedge')[0], pass: branchesOf(s, st, 'fuelSpike', 'pass')[0], absorb: branchesOf(s, st, 'fuelSpike', 'absorb')[0] }
    }
    const none = at(0)
    // Hedging now sets the hedge to half and then its cost shock is lower than absorbing it.
    expect(none.hedge.sec?.set).toEqual({ hedge: .5 })
    expect(none.hedge.fx.costTo ?? 1).toBeLessThan(none.absorb.fx.costTo ?? 1)
    expect(none.absorb.fx.costTo ?? 1).toBeGreaterThan(1)
    expect(none.absorb.fx.costTo ?? 1).toBeLessThanOrEqual(1.12)
    expect(none.absorb.sec).toBeUndefined()
    expect(none.hedge.fx.cash ?? 0).toBeLessThan(0)
    // At half a hedge or more it protects nothing extra: the same cost shock as absorbing, and it still pays the premium.
    for (const hedge of [.5, .8]) {
      const x = at(hedge)
      expect(x.hedge.sec, `hedge ${hedge}`).toBeUndefined()
      expect(x.hedge.fx.costTo, `hedge ${hedge}`).toBe(x.absorb.fx.costTo)
      expect(x.hedge.fx.cash ?? 0, `hedge ${hedge}`).toBeLessThan(x.absorb.fx.cash ?? 0)
    }
    // A hedge already in place softens the spike whatever you choose.
    expect(at(.8).absorb.fx.costTo ?? 1).toBeLessThan(none.absorb.fx.costTo ?? 1)
    expect(at(.8).absorb.fx.cash ?? 0).toBeGreaterThan(none.absorb.fx.cash ?? 0)
    // Passing it on trades demand for less of the cost shock.
    expect(none.pass.fx.demandTo ?? 1).toBeLessThan(1)
    expect(none.pass.fx.costTo ?? 1).toBeLessThan(none.absorb.fx.costTo ?? 1)
    expect(none.pass.fx.costTo ?? 1).toBeGreaterThan(1)
    // The spike follows the fuel share: none for a trade with no fuel, a smaller one for water than for energy.
    for (const trade of ['solar', 'telecom'] as const) {
      expect(UTIL[trade].fuel).toBe(0)
      const t = desk(trade)
      const x = branchesOf(t, t.seed, 'fuelSpike', 'absorb')[0]
      expect(x.fx.costTo).toBeUndefined()
      expect(x.fx.cash ?? 0).toBe(0)
    }
    const water = desk('water')
    expect(branchesOf(water, water.seed, 'fuelSpike', 'absorb')[0].fx.costTo ?? 1).toBeLessThan(none.absorb.fx.costTo ?? 1)
    expect(fuel).toBeGreaterThan(UTIL.water.fuel)

    // Worth it only while the hedge is low: the choice beats absorbing at no hedge and loses to it at half or more.
    for (const trade of ['energy', 'logistics'] as const) {
      const k = desk(trade)
      const ev = eventOf('fuelSpike')
      const value = (st: UtilState, id: string): number => choiceValue(k.g, k.a, k.b, st, ev, id, worthOf(1))
      expect(value(k.seed, 'hedge'), `${trade} at 0`).toBeGreaterThan(value(k.seed, 'absorb'))
      for (const hedge of [.5, .8]) expect(value({ ...k.seed, hedge }, 'hedge'), `${trade} at ${hedge}`).toBeLessThan(value({ ...k.seed, hedge }, 'absorb'))
    }
  })

  it('has the rate case, grant, customer, shortage and recall outcomes', () => {
    const s = desk('energy')
    const st = busy(s)
    const cashOf = (b: Branch): number => b.fx.cash ?? 0

    // A rate case: the odds of an increase follow the plant's condition; accepting and settling are certain.
    const win = (condition: number): number => branchesOf(s, { ...s.seed, condition }, 'rateCase', 'file')[0].p
    expect(win(0)).toBeCloseTo(.25, 9)
    expect(win(80)).toBeCloseTo(.65, 9)
    expect(win(100)).toBeCloseTo(.7, 9)
    expect(win(80)).toBeGreaterThan(win(40))
    const file = branchesOf(s, st, 'rateCase', 'file')
    expect(file).toHaveLength(2)
    expect(file[0].p + file[1].p).toBeCloseTo(1, 12)
    expect(cashOf(file[0])).toBeGreaterThan(0)
    expect(cashOf(file[1])).toBeLessThan(0)
    const accept = branchesOf(s, st, 'rateCase', 'accept')
    const settle = branchesOf(s, st, 'rateCase', 'settle')
    expect(accept).toHaveLength(1)
    expect(settle).toHaveLength(1)
    expect(cashOf(accept[0])).toBeLessThan(0)
    expect(cashOf(settle[0])).toBeLessThan(0)
    expect(cashOf(file[1])).toBeLessThan(cashOf(accept[0]))

    // A grant: the odds follow the condition too; skipping costs and gains nothing.
    const grant = (condition: number): Branch[] => branchesOf(s, { ...s.seed, condition }, 'subsidy', 'apply')
    expect(grant(0)[0].p).toBeCloseTo(.2, 9)
    expect(grant(100)[0].p).toBeCloseTo(.7, 9)
    expect(grant(80)[0].p).toBeGreaterThan(grant(40)[0].p)
    expect(grant(80)).toHaveLength(2)
    expect(cashOf(grant(80)[0])).toBeGreaterThan(0)
    expect(cashOf(grant(80)[1])).toBeLessThan(0)
    expect(cashOf(grant(80)[0]) + 0).toBeGreaterThan(-cashOf(grant(80)[1]))
    expect(branchesOf(s, st, 'subsidy', 'skip')).toHaveLength(1)
    expect(cashOf(branchesOf(s, st, 'subsidy', 'skip')[0])).toBe(0)

    // A big customer: a discount is a gamble on demand, locking a contract moves the contract share and costs more, and letting them go can cost a little demand.
    const l = desk('logistics')
    const lst = busy(l)
    const discount = branchesOf(l, lst, 'bigCustomer', 'discount')
    const lock = branchesOf(l, lst, 'bigCustomer', 'lock')
    const release = branchesOf(l, lst, 'bigCustomer', 'release')
    expect(discount).toHaveLength(2)
    expect(discount[0].p + discount[1].p).toBeCloseTo(1, 12)
    expect(discount[0].fx.demandTo ?? 1).toBeGreaterThan(1)
    expect(cashOf(discount[0])).toBeLessThan(0)
    expect(cashOf(discount[1])).toBe(0)
    expect(lock).toHaveLength(1)
    expect(lock[0].sec?.add).toEqual({ contract: .25 })
    expect(lock[0].fx.demandTo ?? 1).toBeGreaterThan(discount[0].fx.demandTo ?? 1)
    expect(cashOf(lock[0])).toBeLessThan(cashOf(discount[0]))
    expect(release.length).toBeGreaterThan(0)
    expect(release.every((b) => cashOf(b) === 0)).toBe(true)
    expect(release.some((b) => (b.fx.demandTo ?? 1) < 1)).toBe(true)

    // A shortage: a raise moves the pay level for good, temps are a gamble, cutting back loses output.
    const raise = branchesOf(l, lst, 'shortage', 'raise')
    const temps = branchesOf(l, lst, 'shortage', 'temps')
    const cut = branchesOf(l, lst, 'shortage', 'cut')
    expect(raise).toHaveLength(1)
    expect(raise[0].fx.wage).toBeCloseTo(.04, 12)
    expect(temps).toHaveLength(2)
    expect(temps[0].p + temps[1].p).toBeCloseTo(1, 12)
    expect(cashOf(temps[0])).toBeLessThan(0)
    expect(cashOf(temps[0])).toBe(cashOf(temps[1]))
    expect(temps[1].fx.capacityTo ?? 0).toBeGreaterThan(temps[0].fx.capacityTo ?? 0)
    expect(cut).toHaveLength(1)
    expect(cut[0].fx.capacityTo ?? 0).toBeGreaterThanOrEqual(.08)
    expect(cashOf(cut[0])).toBe(0)

    // A recall: replacing costs and lifts the condition; waiting risks a worse bill and more wear, more so on a worn plant.
    const replace = branchesOf(s, st, 'recall', 'replace')
    const wait = (condition: number): Branch[] => branchesOf(s, { ...s.seed, condition }, 'recall', 'wait')
    expect(replace).toHaveLength(1)
    expect(cashOf(replace[0])).toBeLessThan(0)
    expect(replace[0].sec?.add).toEqual({ condition: 3 })
    expect(wait(40)).toHaveLength(2)
    expect(wait(40)[0].p + wait(40)[1].p).toBeCloseTo(1, 12)
    expect(cashOf(wait(40)[0])).toBe(0)
    expect(cashOf(wait(40)[1])).toBeLessThan(cashOf(replace[0]))
    expect(wait(40)[1].sec?.add).toEqual({ condition: -4 })
    expect(wait(40)[1].p).toBeGreaterThan(wait(90)[1].p)
    expect(wait(40)[1].fx.capacityTo ?? 0).toBeGreaterThan(0)
  })

  it('has the weights of spec 4.4', () => {
    const weight = (trade: Industry, id: string): number => {
      const s = setup(trade)
      return eventOf(id).weight(s.g, s.b, s.seed)
    }
    const pick = (id: string, trades: readonly (typeof TRADES)[number][], w: number): void => {
      for (const trade of TRADES) expect(weight(trade, id), `${id} ${trade}`).toBe(trades.includes(trade) ? w : 0)
    }
    pick('storm', TRADES, 1)
    pick('rateCase', ['energy', 'water'], .8)
    pick('fuelSpike', ['energy', 'water', 'dataCenter', 'farm', 'logistics'], .7)
    pick('subsidy', ['energy', 'solar', 'water', 'farm'], .5)
    pick('bigCustomer', ['dataCenter', 'telecom', 'logistics'], .6)
    pick('shortage', ['logistics', 'farm', 'dataCenter'], .6)
    pick('recall', TRADES, .4)
    // The rate case reads the trade's regulated floor, the fuel spike its fuel share.
    for (const trade of TRADES) {
      expect(weight(trade, 'rateCase') > 0, trade).toBe(UTIL[trade].floor >= .5)
      expect(weight(trade, 'fuelSpike') > 0, trade).toBe(UTIL[trade].fuel > 0)
    }
    // A storm is likelier as the plant wears down: 1.5 at condition 40.
    const s = setup('farm')
    expect(eventOf('storm').weight(s.g, s.b, { ...s.seed, condition: 40 })).toBeCloseTo(1.5, 12)
    expect(eventOf('storm').weight(s.g, s.b, { ...s.seed, condition: 90 })).toBe(1)
  })

  it('pins the choice ids', () => {
    const s = setup('energy')
    const ids = (id: string): string[] => eventOf(id).choices(s.g, s.b, busy(s)).map((c) => c.id)
    expect(ids('storm')).toEqual(['crews', 'degraded', 'power'])
    expect(ids('rateCase')).toEqual(['file', 'accept', 'settle'])
    expect(ids('fuelSpike')).toEqual(['hedge', 'pass', 'absorb'])
    expect(ids('subsidy')).toEqual(['apply', 'skip'])
    expect(ids('bigCustomer')).toEqual(['discount', 'release', 'lock'])
    expect(ids('shortage')).toEqual(['raise', 'temps', 'cut'])
    expect(ids('recall')).toEqual(['replace', 'wait'])
  })

  it('reads the era and names the trade', () => {
    // Every scene of every trade fits every year the family can roll in.
    for (const year of [1950, 1985, 2026]) {
      for (const trade of TRADES) {
        const s = desk(trade, year)
        const st = busy(s)
        for (const ev of UTIL_EVENTS) expect(eraFits(s.g, s.b.countryId, ev.scene(s.g, s.a, s.b, st)), `${trade} ${year} ${ev.id}`).toBe(true)
      }
    }
    // What the storm hit and who went short come from the trade.
    const storm: Record<string, RegExp> = { energy: /lines/, solar: /panels/, water: /mains/, telecom: /towers/, dataCenter: /generators/, farm: /field/, logistics: /roads/ }
    for (const trade of TRADES) {
      const s = desk(trade)
      expect(eventOf('storm').scene(s.g, s.a, s.b, s.seed), trade).toMatch(storm[trade])
    }
    const short: Record<string, RegExp> = { logistics: /drivers/, farm: /harvest hands/, dataCenter: /technicians/ }
    for (const trade of ['logistics', 'farm', 'dataCenter'] as const) {
      const s = desk(trade)
      expect(eventOf('shortage').scene(s.g, s.a, s.b, s.seed), trade).toMatch(short[trade])
    }
    const customer: Record<string, RegExp> = { dataCenter: /tenant/, telecom: /lines for every site/, logistics: /shipper/ }
    for (const trade of ['dataCenter', 'telecom', 'logistics'] as const) {
      const s = desk(trade, 1960)
      expect(eventOf('bigCustomer').scene(s.g, s.a, s.b, s.seed), trade).toMatch(customer[trade])
    }
    const grant: Record<string, RegExp> = { energy: /grid/, solar: /panels/, water: /pipe/, farm: /farm aid/ }
    for (const trade of ['energy', 'solar', 'water', 'farm'] as const) {
      const s = desk(trade)
      expect(eventOf('subsidy').scene(s.g, s.a, s.b, s.seed), trade).toMatch(grant[trade])
    }

    // Telecom speaks of broadband only once the internet exists there.
    const old = desk('telecom', 1960)
    const now = desk('telecom', 2026)
    expect(bizHas(old.g, old.b.countryId, 'internet')).toBe(false)
    expect(bizHas(now.g, now.b.countryId, 'internet')).toBe(true)
    for (const ev of UTIL_EVENTS) {
      for (const line of shownBy(old, ev, busy(old))) expect(line, `1960 ${ev.id}`).not.toMatch(/broadband/i)
    }
    expect(eventOf('bigCustomer').scene(now.g, now.a, now.b, now.seed)).toMatch(/broadband/)
    expect(eventOf('bigCustomer').scene(old.g, old.a, old.b, old.seed)).not.toMatch(/broadband/)
    // No other trade mentions it at any time.
    for (const trade of TRADES.filter((t) => t !== 'telecom')) {
      const t = desk(trade, 2026)
      for (const ev of UTIL_EVENTS) for (const line of shownBy(t, ev, busy(t))) expect(line, `${trade} ${ev.id}`).not.toMatch(/broadband/i)
    }
  })

  it('has no free lever', () => {
    // An overhaul is worth doing on a run-down plant and not on a sound one (the same sign as the math file's own check).
    const overhaul = leverOf('overhaul')
    for (const trade of ['energy', 'logistics'] as const) {
      const s = setup(trade)
      const value = (condition: number): number => leverValue(s.g, s.a, s.b, { ...s.seed, condition }, overhaul, 1, worthOf(1), s.ctx)
      expect(value(60), `${trade} at 60`).toBeGreaterThan(0)
      expect(value(85), `${trade} at 85`).toBeLessThan(0)
      // The best option is "do it" at 60 and "leave it" (worth nothing) at 85.
      const best = (condition: number): number => (value(condition) > 0 ? 1 : 0)
      expect(best(60)).toBe(1)
      expect(best(85)).toBe(0)
    }
    // A hedge costs a premium every year, so in a calm year it is worth less than nothing, and in an oil spike it pays.
    const s = setup('logistics')
    const hedge = leverOf('hedge')
    const calm = leverValue(s.g, s.a, s.b, s.seed, hedge, .8, worthOf(1), s.ctx)
    expect(calm).toBeLessThan(0)
    s.g.year = 1974
    const spike = leverValue(s.g, s.a, s.b, s.seed, hedge, .8, worthOf(1), s.ctx)
    expect(spike).toBeGreaterThan(calm)
    // The current setting is worth nothing against itself.
    expect(leverValue(s.g, s.a, s.b, s.seed, hedge, 0, worthOf(1), s.ctx)).toBe(0)
    expect(leverValue(s.g, s.a, s.b, s.seed, leverOf('cover'), 0, worthOf(1), s.ctx)).toBe(0)
  })

  it('has no generic double', () => {
    let rolled = 0
    let years = 0
    for (const trade of ['energy', 'farm'] as const) {
      for (const seed of [1, 2, 3]) {
        const { g, a } = deskGame(trade, { seed, talent: false })
        for (let i = 0; i < 12; i++) {
          const popups = playYear(g)
          const events = popups.filter((m) => m.scriptId === SECTOR_EVENT_SCRIPT || m.scriptId?.startsWith('business.ev.'))
          expect(events.length, `${trade} ${seed} year ${i}`).toBeLessThanOrEqual(1)
          rolled += popups.filter((m) => m.scriptId === SECTOR_EVENT_SCRIPT).length
          years++
          const b = bizOf(g, a)
          expect(Number.isFinite(b.cash), `${trade} ${seed} year ${i}`).toBe(true)
          const st = readSector(b)
          expect(st?.family).toBe('util')
          if (st?.family === 'util') for (const v of [st.condition, st.contract, st.hedge, st.cover, st.outages]) expect(Number.isFinite(v)).toBe(true)
        }
      }
    }
    expect(years).toBe(72)
    expect(rolled).toBeGreaterThan(0)
    expect(rolled / years).toBeLessThanOrEqual(.30)
  }, 300_000)

  it('marks one best choice for the Business talent and plays every answer', () => {
    let seen = 0
    for (const trade of ['logistics', 'water'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const { g, a } = deskGame(trade, { seed })
        for (let i = 0; i < 12; i++) {
          for (const m of playYear(g).filter((x) => x.scriptId === SECTOR_EVENT_SCRIPT)) {
            seen++
            expect(m.choices.filter((c) => c.hint), `${trade} ${seed} ${m.title}`).toHaveLength(1)
          }
        }
        expect(deskLines(g, a).join(' ')).toContain('Condition')
        const st = readSector(bizOf(g, a))
        expect(st?.family).toBe('util')
        expect(st?.pending).toBeNull()
        expect(st?.diary.length).toBeLessThanOrEqual(6)
      }
    }
    expect(seen).toBeGreaterThan(0)
  }, 300_000)

  it('plays every choice of every event through the script', () => {
    // Fire each event by hand: a pending token, then the script, once per choice and branch roll.
    for (const trade of ['energy', 'logistics'] as const) {
      for (const ev of UTIL_EVENTS) {
        const room = desk(trade)
        for (const c of ev.choices(room.g, room.b, busy(room))) {
          for (const seed of [3, 7, 11]) {
            const s = desk(trade)
            const st: UtilState = { ...busy(s), since: s.g.year - 3, lastYear: s.g.year - 1, pending: { token: 'tok', id: ev.id, year: s.g.year } }
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
            if (after?.family === 'util') {
              expect(after.condition).toBeGreaterThanOrEqual(0)
              expect(after.condition).toBeLessThanOrEqual(100)
              expect(after.hedge).toBeLessThanOrEqual(.8)
              expect(after.contract).toBeLessThanOrEqual(1)
            }
          }
        }
      }
    }
  })

  it('applies the hedge and contract moves of an event to the record', () => {
    // The fuel spike's hedge choice sets the hedge to half; the lock choice adds a quarter to the contract share.
    const s = desk('logistics')
    const st: UtilState = { ...s.seed, since: s.g.year - 3, lastYear: s.g.year - 1, pending: { token: 'tok', id: 'fuelSpike', year: s.g.year } }
    saveSector(s.b, st)
    runScript(s.g, SECTOR_EVENT_SCRIPT, 'hedge', { assetId: s.a.id, token: 'tok' } as never, { kind: 'notice', id: 'x', title: '', text: '' })
    expect(readSector(bizOf(s.g, s.a))).toMatchObject({ hedge: .5, pending: null })
    const t = desk('logistics')
    saveSector(t.b, { ...t.seed, since: t.g.year - 3, lastYear: t.g.year - 1, pending: { token: 'tok', id: 'bigCustomer', year: t.g.year } })
    runScript(t.g, SECTOR_EVENT_SCRIPT, 'lock', { assetId: t.a.id, token: 'tok' } as never, { kind: 'notice', id: 'x', title: '', text: '' })
    expect(readSector(bizOf(t.g, t.a))?.family === 'util' && (readSector(bizOf(t.g, t.a)) as UtilState).contract).toBeCloseTo(t.seed.contract + .25, 9)
  })

  it('keeps every event inside its bounds for small and strong companies', () => {
    const small = desk('farm')
    small.b.last = { netRevenue: 12_000, wages: 3_000, sold: 400 } as unknown as BizState['last']
    const strong = desk('energy')
    strong.b.last = { netRevenue: 90_000_000, wages: 25_000_000, sold: 900_000 } as unknown as BizState['last']
    for (const s of [small, strong]) {
      const probes: UtilState[] = [s.seed, busy(s), { ...s.seed, condition: 100, contract: 1, hedge: .8 }, { ...s.seed, condition: 0, hedge: 0 }]
      for (const st of probes) for (const ev of UTIL_EVENTS) expect(eventProblems(ev, s.g, s.a, s.b, st), `${s.b.industry} ${ev.id}`).toEqual([])
    }
  })

  it('has every copy key', () => {
    const lines = copyLines(UTIL_COPY)
    expect(lines.length).toBeGreaterThanOrEqual(40)
    for (const l of lines) expect(l.key.startsWith('util.'), l.key).toBe(true)
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(UTIL_COPY, key)

    // Every option of every lever, for every trade that offers it, has a label and a tip.
    for (const lever of UTIL_LEVERS) {
      expect(has(`util.lever.${lever.id}.label`), lever.id).toBe(true)
      expect(lever.label).toBe(sectorText(UTIL_COPY, `util.lever.${lever.id}.label`))
      let options = 0
      for (const trade of TRADES) {
        const s = setup(trade)
        for (const o of lever.options(s.g, s.b, s.seed)) {
          options++
          expect(has(`util.lever.${lever.id}.${o.value}.label`), `${lever.id} ${o.value}`).toBe(true)
          expect(has(`util.lever.${lever.id}.${o.value}.tip`), `${lever.id} ${o.value}`).toBe(true)
          expect(o.label).toBe(sectorText(UTIL_COPY, `util.lever.${lever.id}.${o.value}.label`))
          expect(o.tip).toBe(sectorText(UTIL_COPY, `util.lever.${lever.id}.${o.value}.tip`))
        }
      }
      expect(options, lever.id).toBeGreaterThan(0)
    }
    // Every event has a head and a scene (or its trade variants), and every choice a label, over every trade.
    for (const trade of TRADES) {
      const t = desk(trade)
      const st = busy(t)
      for (const ev of UTIL_EVENTS) {
        expect(has(`util.ev.${ev.id}.head`), ev.id).toBe(true)
        expect(ev.title).toBe(sectorText(UTIL_COPY, `util.ev.${ev.id}.head`))
        const scenes = lines.filter((l) => new RegExp(`^util\\.ev\\.${ev.id}\\.(\\w+\\.)?scene$`).test(l.key))
        expect(scenes.length, ev.id).toBeGreaterThan(0)
        for (const c of ev.choices(t.g, t.b, st)) {
          expect(has(`util.ev.${ev.id}.${c.id}.label`), `${ev.id}.${c.id}`).toBe(true)
          c.branches(t.g, t.b, st).forEach((br, k) => {
            expect(br.text, `${ev.id}.${c.id}`).toBe(`util.ev.${ev.id}.${c.id}.${k}.out`)
            expect(has(br.text), br.text).toBe(true)
          })
        }
      }
    }
    for (const trade of TRADES) expect(has(`util.ev.storm.${trade}.scene`), trade).toBe(true)
    for (const trade of ['logistics', 'farm', 'dataCenter']) expect(has(`util.ev.shortage.${trade}.scene`), trade).toBe(true)
    for (const trade of ['dataCenter', 'telecom', 'logistics']) expect(has(`util.ev.bigCustomer.${trade}.scene`), trade).toBe(true)
    for (const trade of ['energy', 'solar', 'water', 'farm']) expect(has(`util.ev.subsidy.${trade}.scene`), trade).toBe(true)
  })

  it('keeps the copy inside the voice guide', () => {
    const roles = new Set<string>()
    for (const { key, role, text } of copyLines(UTIL_COPY)) {
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
