// Care, Education and Personal Services. 'care math': the client base, plans, payer mix, accreditation and
// intake of the seven trades; careFx is called directly with a hand-made context, so no family model is
// involved. 'care desk': the levers, the seven events and the copy of the registered family
// (sector-care-play.ts), through applyLever, the event script and the voice rules.
import { describe, expect, it } from 'vitest'
import { staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { staffPower, localEcon, type Worth } from '../src/game/business/economy'
import { eraFits } from '../src/game/business/era'
import { accProgramCost, accTier, CARE_NOTE_COPY, careFx, careHeader, careRoleMoves, careRow, careSeed, clientsOf } from '../src/game/business/sector-care'
import { CARE_COPY, CARE_EVENTS, CARE_LEVERS, CARE_MODEL } from '../src/game/business/sector-care-play'
import { prepareSectorYear, SECTOR_BOUNDS, sectorValue, seedSector } from '../src/game/business/sector-core'
import { CARE, SECTOR_ROLES } from '../src/game/business/sector-data'
import { eventProblems, SECTOR_EVENT_SCRIPT } from '../src/game/business/sector-events'
import { copyLines, modelOf, sectorCtx, sectorText, seasonIndex, sectorHistoryLine, type Branch, type LeverDef, type SectorCtx, type SectorEvent, type SectorFx } from '../src/game/business/sector-kit'
import { applyLever, deskLines, leverValue, sectorMenu } from '../src/game/business/sector-menu'
import { readSector, saveSector, type CareState } from '../src/game/business/sector-state'
import { bizOf, type BizState, type KeyStaff } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import type { Industry } from '../src/game/data/markets'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { deskGame, frozen, playYear } from './sector-kit'

const TRADES = ['clinic', 'education', 'gym', 'salon', 'petCare', 'homeCare', 'autoShop'] as const
const PAYER_TRADES = ['clinic', 'education', 'gym', 'homeCare', 'autoShop'] as const
const BASE = 1_000_000

/** A company at the neutral point: quality 50, morale 60, charging the going price. */
function setup(trade: Industry, year = 2024): { g: GameState; a: Asset; b: BizState; going: number; seed: CareState; ctx: (use: number) => SectorCtx } {
  const { g, a, b } = deskGame(trade, { year })
  b.quality = 50
  b.morale = 60
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  b.price = going
  return { g, a, b, going, seed: careSeed(g, a, b, g.year - 1), ctx: (use) => ({ use, base: BASE, level: 1, going }) }
}

/** The synthetic worth of the plan: contribution margin `c` on a million of sales, 20% cost of goods. */
function worthOf(c: number, util: number): Worth {
  return { contrib: c * BASE, revenue: BASE, cogs: .2 * BASE, overhead: 0, wages: 0, util, brand: 0, quality: 0, morale: 0, moraleTarget: 0, karma: 0, arrest: 0 }
}

/** The trade's one extra key role, held by someone of this skill. */
function holder(trade: Industry, skill: number): KeyStaff {
  const role = SECTOR_ROLES[trade]
  return { id: 'k1', firstName: 'Ann', lastName: 'Lee', gender: 'female', age: 40, role: role.title, focus: role.focus, skill, salary: role.pay, trait: 'steady', morale: 60, years: 0 }
}

/** The effect of a state over one fiscal year at the year being lived. */
function run(s: ReturnType<typeof setup>, st: CareState, use: number, mode: 'book' | 'expected' = 'expected', fiscal = s.g.year): SectorFx {
  return careFx(s.g, s.a, s.b, st, fiscal, mode, s.ctx(use))
}

function care(st: SectorFx['next']): CareState {
  if (st.family !== 'care') throw new Error('expected a care record')
  return st
}

/** The retention target a year used, read back from how far the client base moved: loyal' = loyal + .5 * (ret - loyal). */
function targetOf(st: CareState, fx: SectorFx): number {
  return st.loyal + 2 * (care(fx.next).loyal - st.loyal)
}

/** A copy template turned back into what the voice report measures: every named hole becomes "${...}". */
const template = (text: string): string => text.replace(/\$\{\w+\}/g, '${...}')

describe('care math', () => {
  it('seeds', () => {
    for (const trade of TRADES) {
      const s = setup(trade)
      expect(s.seed.loyal).toBe(CARE[trade].r0)
      expect(s.seed).toMatchObject({ plans: 0, planTarget: 0, payer: 0, acc: 62, intake: 0, program: 0, since: s.g.year - 1, lastYear: s.g.year - 1 })
      expect(s.seed.family).toBe('care')
    }
    const s = setup('clinic')
    s.b.quality = 80
    expect(careSeed(s.g, s.a, s.b, 2020).acc).toBeCloseTo(71, 10)
    s.b.quality = -100
    expect(careSeed(s.g, s.a, s.b, 2020).acc).toBe(30)
    s.b.quality = 300
    expect(careSeed(s.g, s.a, s.b, 2020).acc).toBe(90)
    expect(careSeed(s.g, s.a, s.b, 2020)).toMatchObject({ since: 2020, lastYear: 2020 })
  })

  it('has the spec table', () => {
    expect(CARE.clinic).toEqual({ visits: 3.2, r0: .78, crowd: .85, amp: .02, payer: { disc: .22, up: .55, deny: .07 } })
    expect(CARE.education).toEqual({ visits: 1.6, r0: .55, crowd: .90, amp: .05, payer: { disc: .30, up: .70, deny: .02 } })
    expect(CARE.gym).toEqual({ visits: 1.0, r0: .68, crowd: .80, amp: .06, payer: { disc: .15, up: .35, deny: 0 } })
    expect(CARE.salon).toEqual({ visits: 5.0, r0: .72, crowd: .85, amp: .03, payer: null })
    expect(CARE.petCare).toEqual({ visits: 5.0, r0: .70, crowd: .85, amp: .03, payer: null })
    expect(CARE.homeCare).toEqual({ visits: 4.0, r0: .74, crowd: .90, amp: .02, payer: { disc: .25, up: .60, deny: .04 } })
    expect(CARE.autoShop).toEqual({ visits: 1.6, r0: .60, crowd: .90, amp: .02, payer: { disc: .12, up: .30, deny: .01 } })
    for (const trade of TRADES) expect(careRow(trade)).toBe(CARE[trade])
    expect(careRow('restaurant')).toBeNull()
    expect(careRow('constructor')).toBeNull()
    expect(careRow('toString')).toBeNull()
  })

  it('neutral identity', () => {
    for (const trade of TRADES) {
      const s = setup(trade)
      const fx = run(s, s.seed, .5)
      expect(fx.demand).toBe(1)
      expect(fx.income).toBe(0)
      expect(fx.costs).toBe(0)
      expect(fx.randIncome).toBe(0)
      expect(fx.randCosts).toBe(0)
      expect(fx.cost).toBe(1)
      expect(fx.capLoss).toBe(0)
      expect(fx.open).toBe(1)
      expect(fx.note).toBeNull()
    }
  })

  it('satisfaction and retention', () => {
    const s = setup('gym')
    const fx = run(s, s.seed, .82)
    // sat = .5 - 1.2 * (.82 - .80) = .476, so ret = .68 + .004 * (62 - 60) + .30 * (.476 - .5) = .6808.
    const ret = targetOf(s.seed, fx)
    expect(Math.abs(ret - .681)).toBeLessThan(.001)
    expect(Math.abs((ret - CARE.gym.r0 - .008) / .30 + .5 - .476)).toBeLessThan(1e-9)
    expect(fx.demand).toBe(1)
    expect(fx.income).toBe(0)
    expect(fx.costs).toBe(0)
    expect(care(fx.next).loyal).toBeCloseTo(.68 + .5 * (.6808 - .68), 9)

    // Quality and morale lift satisfaction, a crowd lowers it, and it stays between 0 and 1.
    const good = setup('gym')
    good.b.quality = 90
    good.b.morale = 100
    expect(targetOf(good.seed, run(good, good.seed, .5))).toBeGreaterThan(targetOf(s.seed, run(s, s.seed, .5)))
    const jammed = run(s, s.seed, 1.3)
    expect(targetOf(s.seed, jammed)).toBeLessThan(targetOf(s.seed, run(s, s.seed, .5)))
    // The target is held between .35 and .93.
    const star = setup('salon')
    star.b.quality = 100
    star.b.morale = 100
    star.b.staff.push(holder('salon', 100))
    expect(targetOf({ ...star.seed, acc: 100, plans: .6 }, run(star, { ...star.seed, acc: 100, plans: .6, planTarget: .6 }, .5))).toBeCloseTo(.93, 9)
    const sunk = setup('education')
    sunk.b.quality = 0
    sunk.b.morale = 0
    expect(targetOf(sunk.seed, run(sunk, { ...sunk.seed, acc: 0 }, 1.3))).toBeCloseTo(.35, 9)
  })

  it('client base repairs slowly', () => {
    // A neutral company: quality 40 and morale 85 give satisfaction .5 and an accreditation target of 60,
    // so acc 60 holds and the retention target is exactly r0.
    const s = setup('gym')
    s.b.quality = 40
    s.b.morale = 85
    const r0 = CARE.gym.r0
    let st: CareState = { ...s.seed, loyal: r0 - .08, acc: 60 }
    const gaps: number[] = []
    const demand: number[] = []
    for (let k = 0; k < 3; k++) {
      const fx = run(s, st, .5, 'expected', s.g.year + k)
      demand.push(fx.demand)
      st = care(fx.next)
      expect(st.acc).toBeCloseTo(60, 9)
      gaps.push(r0 - st.loyal)
    }
    expect(Math.abs(gaps[0] - .040)).toBeLessThan(.002)
    expect(Math.abs(gaps[1] - .020)).toBeLessThan(.002)
    expect(Math.abs(gaps[2] - .010)).toBeLessThan(.002)
    expect(gaps[1] / gaps[0]).toBeCloseTo(.5, 9)
    expect(gaps[2] / gaps[1]).toBeCloseTo(.5, 9)
    // 87.5% of the gap is repaired after three years.
    expect((.08 - gaps[2]) / .08).toBeCloseTo(.875, 9)
    // Loyalty demand reads the loyalty at the start of the year.
    expect(demand[0]).toBeCloseTo(1 + .6 * -.08, 9)
    expect(demand[1]).toBeCloseTo(1 + .6 * -.04, 9)
    expect(demand[2]).toBeCloseTo(1 + .6 * -.02, 9)
  })

  it('loyalty demand is held between .85 and 1.15', () => {
    const s = setup('gym')
    expect(run(s, { ...s.seed, loyal: 1 }, .5).demand).toBeCloseTo(1.15, 9)
    expect(run(s, { ...s.seed, loyal: .2 }, .5).demand).toBeCloseTo(.85, 9)
  })

  it('plans', () => {
    const s = setup('gym')
    let st: CareState = { ...s.seed, planTarget: .4 }
    const demand: number[] = []
    const costs: number[] = []
    const net: number[] = []
    const w = worthOf(.8, .5)
    for (let k = 0; k < 6; k++) {
      const fx = run(s, st, .82, 'expected', s.g.year + k)
      demand.push(fx.demand)
      costs.push(fx.costs / BASE)
      net.push(sectorValue(s.g, s.b, w, fx))
      st = care(fx.next)
    }
    const wantDemand = [1, 1.0077, 1.0191, 1.0323, 1.0464, 1.0534]
    const wantCosts = [.006, .012, .018, .024, .024, .024]
    demand.forEach((d, i) => expect(Math.abs(d - wantDemand[i])).toBeLessThan(.001))
    costs.forEach((c, i) => expect(Math.abs(c - wantCosts[i])).toBeLessThan(.001))
    expect(st.plans).toBe(.4)
    // Negative in years 1 to 3, positive from year 4.
    for (const k of [0, 1, 2]) expect(net[k]).toBeLessThan(0)
    for (const k of [3, 4, 5]) expect(net[k]).toBeGreaterThan(0)

    // The stock ramps by at most .10 a year, up or down, and never past the target.
    const up = care(run(s, { ...s.seed, planTarget: .6 }, .5).next)
    expect(up.plans).toBe(.1)
    const down = care(run(s, { ...s.seed, plans: .3, planTarget: 0 }, .5).next)
    expect(down.plans).toBe(.2)
    const near = care(run(s, { ...s.seed, plans: .3, planTarget: .4 }, .5).next)
    expect(near.plans).toBe(.4)
    expect(care(run(s, { ...s.seed, plans: .5, planTarget: .6 }, .5).next).plans).toBe(.6)
    // The year's cost uses the ramped value: members who leave stop paying at once.
    expect(run(s, { ...s.seed, plans: .3, planTarget: 0 }, .5).costs / BASE).toBeCloseTo(.06 * .2, 9)
    // Plans lift the retention target by .25 a unit of plans.
    const base = targetOf(s.seed, run(s, s.seed, .5))
    const planned = run(s, { ...s.seed, plans: .5, planTarget: .6 }, .5)
    expect(targetOf(s.seed, planned) - base).toBeCloseTo(.25 * .6, 9)
  })

  it('plans cut the season swing', () => {
    const s = setup('gym')
    let year = 2000
    while (Math.abs(seasonIndex(s.g, s.a, year, 'wx')) < .5) year++
    const idx = seasonIndex(s.g, s.a, year, 'wx')
    const amp = CARE.gym.amp
    const plain = run(s, s.seed, .5, 'book', year)
    expect(plain.demand).toBeCloseTo(1 + amp * idx, 9)
    const planned = run(s, { ...s.seed, plans: .6, planTarget: .6 }, .5, 'book', year)
    expect(planned.demand).toBeCloseTo(1 + amp * (1 - .6 * .6) * idx, 9)
    // Expected mode has no season.
    expect(run(s, { ...s.seed, plans: .6, planTarget: .6 }, .5, 'expected', year).demand).toBe(1)
  })

  it('payer mix', () => {
    const s = setup('clinic')
    const fx = run(s, { ...s.seed, payer: .4 }, .5)
    expect(fx.demand).toBeCloseTo(1.22, 9)
    expect(Math.abs(fx.costs / BASE - .1415)).toBeLessThan(.002)
    expect(fx.costs / BASE).toBeCloseTo(.4 * 1.22 * (.22 + .07), 9)

    // From accreditation 80 the discount part is 14% lower (and the tier lifts demand by 4%).
    const high = run(s, { ...s.seed, payer: .4, acc: 80 }, .5)
    expect(high.demand).toBeCloseTo(1.22 * 1.04, 9)
    expect(high.costs / BASE).toBeCloseTo(.4 * 1.22 * (.22 * .86 + .07), 9)
    expect(run(s, { ...s.seed, payer: .4, acc: 79.9 }, .5).costs / BASE).toBeCloseTo(.4 * 1.22 * (.22 + .07), 9)

    // Finance staff cut the denials by 25% at full power.
    const desk = setup('clinic')
    desk.b.staff.push({ ...holder('clinic', 100), id: 'f1', role: 'Controller', focus: 'finance' })
    const power = Math.min(1, staffPower(desk.b, 'finance'))
    expect(power).toBeGreaterThan(.3)
    expect(run(desk, { ...desk.seed, payer: .4 }, .5).costs / BASE).toBeCloseTo(.4 * 1.22 * (.22 + .07 * (1 - .25 * power)), 9)

    // The lever pays only with idle capacity.
    const w = (util: number): Worth => worthOf(.78, util)
    const worth = (util: number): number => sectorValue(s.g, s.b, w(util), run(s, { ...s.seed, payer: .4 }, .5)) - sectorValue(s.g, s.b, w(util), run(s, s.seed, .5))
    expect(worth(.7)).toBeGreaterThan(0)
    expect(worth(.98)).toBeLessThan(0)

    // Every trade with a payer row lifts demand by its own `up`.
    for (const trade of PAYER_TRADES) {
      const t = setup(trade)
      const row = CARE[trade].payer
      expect(row).not.toBeNull()
      expect(run(t, { ...t.seed, payer: .2 }, .5).demand).toBeCloseTo(1 + (row?.up ?? 0) * .2, 9)
    }

    // Salon and pet care have no payer row: a record that holds a payer share bills nobody.
    for (const trade of ['salon', 'petCare'] as const) {
      const t = setup(trade)
      const none = run(t, { ...t.seed, payer: .4 }, .5)
      expect(none.demand).toBe(1)
      expect(none.costs).toBe(0)
    }
  })

  it('accreditation', () => {
    // The target: 62 + 25 * role + 20 * program + .2 * (quality - 50) - (use above .95 ? 6 : 0); acc moves 30% of the way.
    const s = setup('clinic')
    const accAfter = (st: CareState, use = .5): number => care(run(s, st, use).next).acc
    expect(accAfter(s.seed)).toBeCloseTo(62, 9)
    s.b.staff.push(holder('clinic', 100))
    expect(accAfter(s.seed)).toBeCloseTo(62 + .3 * 25, 9)
    expect(accAfter({ ...s.seed, program: s.g.year })).toBeCloseTo(62 + .3 * 45, 9)
    expect(accAfter({ ...s.seed, program: s.g.year - 1 })).toBeCloseTo(62 + .3 * 25, 9)
    expect(accAfter(s.seed, .95)).toBeCloseTo(62 + .3 * 25, 9)
    expect(accAfter(s.seed, .96)).toBeCloseTo(62 + .3 * 19, 9)
    s.b.quality = 80
    expect(accAfter(s.seed)).toBeCloseTo(62 + .3 * (25 + 6), 9)
    s.b.quality = 50
    s.b.staff.length = 0
    expect(accAfter(s.seed, 1)).toBeCloseTo(62 - .3 * 6, 9)
    expect(accAfter({ ...s.seed, acc: 100 })).toBeCloseTo(100 - .3 * 38, 9)
    expect(accAfter({ ...s.seed, acc: 0 })).toBeCloseTo(.3 * 62, 9)

    // The tiers read the stock at the start of the year.
    expect(accTier(49.9)).toBe('provisional')
    expect(accTier(50)).toBe('standard')
    expect(accTier(79.9)).toBe('standard')
    expect(accTier(80)).toBe('high')
    const prov = run(s, { ...s.seed, acc: 49.9 }, .5)
    expect(prov.demand).toBeCloseTo(.93, 9)
    expect(prov.capLoss).toBeCloseTo(.05, 9)
    expect(run(s, { ...s.seed, acc: 50 }, .5)).toMatchObject({ demand: 1, capLoss: 0 })
    expect(run(s, { ...s.seed, acc: 79.9 }, .5)).toMatchObject({ demand: 1, capLoss: 0 })
    expect(run(s, { ...s.seed, acc: 80 }, .5)).toMatchObject({ demand: 1.04, capLoss: 0 })

    // The role moves acc for quality-focus trades and the retention target for sales-focus trades.
    for (const trade of ['clinic', 'education', 'petCare', 'homeCare'] as const) expect(careRoleMoves({ industry: trade })).toBe('acc')
    for (const trade of ['gym', 'salon', 'autoShop'] as const) expect(careRoleMoves({ industry: trade })).toBe('ret')
    for (const trade of TRADES) expect(careRoleMoves({ industry: trade })).toBe(SECTOR_ROLES[trade].focus === 'quality' ? 'acc' : 'ret')

    const gym = setup('gym')
    const bare = run(gym, gym.seed, .5)
    gym.b.staff.push(holder('gym', 100))
    const staffed = run(gym, gym.seed, .5)
    expect(care(staffed.next).acc).toBeCloseTo(62, 9)
    expect(targetOf(gym.seed, staffed) - targetOf(gym.seed, bare)).toBeCloseTo(.04, 9)

    const clinic = setup('clinic')
    const plain = run(clinic, clinic.seed, .5)
    clinic.b.staff.push(holder('clinic', 100))
    expect(targetOf(clinic.seed, run(clinic, clinic.seed, .5))).toBeCloseTo(targetOf(clinic.seed, plain), 9)
    // A different trade's role does nothing here.
    const other = setup('clinic')
    other.b.staff.push(holder('gym', 100))
    expect(care(run(other, other.seed, .5).next).acc).toBeCloseTo(62, 9)
  })

  it('intake', () => {
    const s = setup('gym')
    expect(run(s, { ...s.seed, intake: 0 }, 1).capLoss).toBe(0)
    expect(run(s, { ...s.seed, intake: 1 }, 1).capLoss).toBeCloseTo(.10, 9)
    expect(run(s, { ...s.seed, intake: 2 }, 1).capLoss).toBeCloseTo(.25, 9)
    // Under the cap nothing is turned away.
    expect(run(s, { ...s.seed, intake: 1 }, .9).capLoss).toBe(0)
    expect(run(s, { ...s.seed, intake: 2 }, .7).capLoss).toBe(0)
    expect(run(s, { ...s.seed, intake: 2 }, 1.3).capLoss).toBeCloseTo(.55 / 1.3, 9)
    // A provisional tier and a cap combine as 1 - (1 - a) * (1 - b).
    expect(run(s, { ...s.seed, intake: 2, acc: 45 }, 1).capLoss).toBeCloseTo(1 - .75 * .95, 9)

    // Satisfaction uses min(use, cap): a protected intake spares the clients the crowd.
    const open = targetOf(s.seed, run(s, { ...s.seed, intake: 0 }, 1))
    const steady = targetOf(s.seed, run(s, { ...s.seed, intake: 1 }, 1))
    const shut = targetOf(s.seed, run(s, { ...s.seed, intake: 2 }, 1))
    expect(open).toBeCloseTo(.68 + .008 + .30 * (.26 - .5), 9)
    expect(steady).toBeCloseTo(.68 + .008 + .30 * (.5 - 1.2 * .1 - .5), 9)
    expect(shut).toBeCloseTo(.68 + .008, 9)
    expect(shut).toBeGreaterThan(steady)
    expect(steady).toBeGreaterThan(open)
  })

  it('history', () => {
    const s = setup('clinic', 2020)
    const idx = seasonIndex(s.g, s.a, 2020, 'wx')
    const hit = run(s, s.seed, .5, 'book', 2020)
    expect(hit.demand).toBeCloseTo(.92 * (1 + CARE.clinic.amp * idx), 9)
    // Expected mode never reads past g.year: in 2019 the 2020 crash is unknown.
    const before = setup('clinic', 2019)
    expect(run(before, before.seed, .5, 'expected', 2020).demand).toBe(1)
    // A trade the engine already maps has no row.
    const gym = setup('gym', 2020)
    expect(run(gym, gym.seed, .5, 'expected', 2020).demand).toBe(1)
    const home = setup('homeCare', 2020)
    expect(run(home, home.seed, .5, 'expected', 2020).demand).toBeCloseTo(1.06, 9)
  })

  it('writes one note when the tier moves', () => {
    const s = setup('clinic')
    const up = run(s, { ...s.seed, acc: 49 }, .5)
    expect(up.note?.tone).toBe('good')
    expect(up.note?.text).toContain('accredited again')
    expect(up.note?.text.length).toBeLessThanOrEqual(90)

    s.b.staff.push(holder('clinic', 100))
    const top = run(s, { ...s.seed, acc: 79.5, program: s.g.year }, .5)
    expect(top.note?.tone).toBe('good')
    expect(top.note?.text).toContain('top tier')
    s.b.staff.length = 0

    const down = run(s, { ...s.seed, acc: 80.5 }, .5)
    expect(down.note?.tone).toBe('bad')
    expect(down.note?.text).toContain('top tier')

    s.b.quality = 0
    const low = run(s, { ...s.seed, acc: 50.5 }, 1)
    expect(low.note?.tone).toBe('bad')
    expect(low.note?.text).toContain('provisional')
    expect(run(s, s.seed, .5).note).toBeNull()

    for (const key of Object.keys(CARE_NOTE_COPY)) {
      expect(key.startsWith('care.')).toBe(true)
      expect(key.endsWith('.log')).toBe(true)
      expect(unitFlags(template(CARE_NOTE_COPY[key]), 'log')).toEqual([])
    }
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
    const s = setup('gym')
    const before = JSON.stringify(s.g.rng)
    const fx = run(s, s.seed, .5, 'book', 2011)
    expect(JSON.stringify(s.g.rng)).toBe(before)
    expect(fx.demand).toBeCloseTo(1 + CARE.gym.amp * seasonIndex(s.g, s.a, 2011, 'wx'), 9)
    expect(run(s, s.seed, .5, 'expected', 2011).demand).toBe(1)
  })

  it('cost floor', () => {
    const s = setup('clinic')
    expect(accProgramCost(s.b, { use: .5, base: 10_000, level: 1, going: s.going })).toBe(2000)
    expect(accProgramCost(s.b, { use: .5, base: 1_000_000, level: 1, going: s.going })).toBe(6000)
    expect(accProgramCost(s.b, { use: .5, base: 10_000, level: 2, going: s.going })).toBe(4000)
  })

  it('counts the clients from last year\'s sales', () => {
    const s = setup('gym')
    s.b.last = null
    expect(clientsOf(s.b, CARE.gym)).toBe(0)
    s.b.last = { sold: 3444 } as unknown as BizState['last']
    expect(clientsOf(s.b, CARE.gym)).toBe(3444)
    expect(clientsOf(s.b, CARE.clinic)).toBe(Math.round(3444 / 3.2))
    expect(clientsOf(s.b, CARE.salon)).toBe(Math.round(3444 / 5))
  })

  it('runs 12 years finite and inside the bounds', () => {
    for (const trade of TRADES) {
      for (const use of [.5, .85, 1.3]) {
        const s = setup(trade, 2012)
        let st = s.seed
        for (let k = 0; k < 12; k++) {
          const fx = run(s, st, use, 'book', 2012 + k)
          for (const v of [fx.demand, fx.cost, fx.capLoss, fx.open, fx.income, fx.costs, fx.randIncome, fx.randCosts]) expect(Number.isFinite(v)).toBe(true)
          expect(fx.demand).toBeGreaterThanOrEqual(SECTOR_BOUNDS.demand[0])
          expect(fx.demand).toBeLessThanOrEqual(SECTOR_BOUNDS.demand[1])
          expect(fx.cost).toBeGreaterThanOrEqual(SECTOR_BOUNDS.cost[0])
          expect(fx.cost).toBeLessThanOrEqual(SECTOR_BOUNDS.cost[1])
          expect(fx.capLoss).toBeGreaterThanOrEqual(0)
          expect(fx.capLoss).toBeLessThanOrEqual(SECTOR_BOUNDS.capLoss)
          expect(fx.open).toBe(1)
          st = care(fx.next)
          expect(st.loyal).toBeGreaterThanOrEqual(.2)
          expect(st.loyal).toBeLessThanOrEqual(1)
          expect(st.acc).toBeGreaterThanOrEqual(0)
          expect(st.acc).toBeLessThanOrEqual(100)
          expect(st.plans).toBeGreaterThanOrEqual(0)
          expect(st.plans).toBeLessThanOrEqual(.6)
        }
      }
    }
    // The levers at their strongest never leave the table ranges, even if the core would clamp the effect.
    for (const trade of TRADES) {
      const s = setup(trade, 2012)
      let st: CareState = { ...s.seed, planTarget: .6, payer: CARE[trade].payer ? .6 : 0, intake: 2 }
      for (let k = 0; k < 12; k++) {
        const fx = run(s, st, 1.1, 'book', 2012 + k)
        for (const v of [fx.demand, fx.cost, fx.capLoss, fx.costs]) expect(Number.isFinite(v)).toBe(true)
        st = care(fx.next)
        expect(st.plans).toBeLessThanOrEqual(.6)
        expect(st.loyal).toBeLessThanOrEqual(1)
      }
    }
    // Identical calls give identical results and g.rng is untouched.
    const s = setup('salon', 2018)
    const rng = JSON.stringify(s.g.rng)
    expect(run(s, s.seed, .9, 'book', 2018)).toEqual(run(s, s.seed, .9, 'book', 2018))
    expect(JSON.stringify(s.g.rng)).toBe(rng)
  })

  it('is pure on frozen inputs', () => {
    for (const trade of TRADES) {
      const s = setup(trade, 2020)
      const st: CareState = { ...s.seed, planTarget: .4, payer: CARE[trade].payer ? .4 : 0, intake: 1 }
      const ctx = s.ctx(.9)
      const fx = careFx(frozen(s.g), frozen(s.a), frozen(s.b), frozen(st), 2020, 'book', frozen(ctx))
      expect(fx.next).not.toBe(st)
      expect(careHeader(s.g, s.b, st).length).toBeGreaterThan(0)
    }
  })

  it('header', () => {
    const gym = setup('gym')
    gym.b.last = { sold: 3444 } as unknown as BizState['last']
    const lines = careHeader(gym.g, gym.b, gym.seed)
    expect(lines.join(' ')).toBe('About 3,444 clients, 68% come back. Plans 0%. Accredited, score 62. Payer mix 0%. Intake open.')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(140)
    expect(careHeader(gym.g, gym.b, null)).toEqual([])
    expect(lines.join(' ')).not.toContain('rough estimate')

    // A salon has no payer line.
    const salon = setup('salon')
    expect(careHeader(salon.g, salon.b, salon.seed).join(' ')).not.toContain('Payer')
    expect(careHeader(salon.g, salon.b, salon.seed)).toHaveLength(4)

    // The tiers, the plan target and the intake settings.
    expect(careHeader(gym.g, gym.b, { ...gym.seed, acc: 45 })[2]).toBe('Provisional, score 45.')
    expect(careHeader(gym.g, gym.b, { ...gym.seed, acc: 80 })[2]).toBe('Top tier, score 80.')
    expect(careHeader(gym.g, gym.b, { ...gym.seed, plans: .1, planTarget: .4 })[1]).toBe('Plans 10%, target 40%.')
    expect(careHeader(gym.g, gym.b, { ...gym.seed, plans: .4, planTarget: .4 })[1]).toBe('Plans 40%.')
    expect(careHeader(gym.g, gym.b, { ...gym.seed, payer: .4 })[3]).toBe('Payer mix 40%.')
    expect(careHeader(gym.g, gym.b, { ...gym.seed, intake: 1 }).at(-1)).toBe('Intake steady at 90%.')
    expect(careHeader(gym.g, gym.b, { ...gym.seed, intake: 2 }).at(-1)).toBe('Intake protected at 75%.')

    // Clients come from sales over the trade's visits, and the count reads with the units helper.
    const clinic = setup('clinic', 2020)
    clinic.b.last = { sold: 32_000 } as unknown as BizState['last']
    expect(careHeader(clinic.g, clinic.b, clinic.seed)[0]).toBe('About 10K clients, 78% come back.')

    // The 2020 crash row: one rough-estimate line, last, and only for a trade with a row.
    const line = sectorHistoryLine(clinic.g, clinic.b)
    expect(line).not.toBeNull()
    expect(careHeader(clinic.g, clinic.b, clinic.seed).at(-1)).toBe(line)
    const crash = setup('gym', 2020)
    expect(careHeader(crash.g, crash.b, crash.seed).join(' ')).not.toContain('rough estimate')
    for (const trade of TRADES) {
      const t = setup(trade)
      for (const l of careHeader(t.g, t.b, t.seed)) {
        expect(l.length).toBeLessThanOrEqual(140)
        expect(unitFlags(l, 'text')).toEqual([])
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The desk: levers, events and copy of the family (sector-care-play.ts)

const EVENT_IDS = ['accreditationReview', 'contractOffer', 'incident', 'payerAudit', 'rush', 'starLeaves', 'waitlist']

function leverOf(id: string): LeverDef {
  const l = modelOf('care')?.levers.find((x) => x.id === id)
  if (!l) throw new Error(`no ${id} lever`)
  return l
}

function eventOf(id: string): SectorEvent {
  const e = modelOf('care')?.events.find((x) => x.id === id)
  if (!e) throw new Error(`no ${id} event`)
  return e
}

/** The branches of one choice of one event, in a state. */
function branchesOf(s: ReturnType<typeof setup>, st: CareState, event: string, choice: string): Branch[] {
  const c = eventOf(event).choices(s.g, s.b, st).find((x) => x.id === choice)
  if (!c) throw new Error(`no ${choice} choice`)
  return c.branches(s.g, s.b, st)
}

/** A state where every event of the family is live: payers in, a brand to trade on, clients that stay above the trade's retention. */
function busy(s: ReturnType<typeof setup>): CareState {
  s.b.brand = 60
  return { ...s.seed, payer: CARE[s.b.industry as keyof typeof CARE].payer ? .4 : 0, loyal: CARE[s.b.industry as keyof typeof CARE].r0 + .05 }
}

/** The two long dashes the voice guide bans, built from their code points so that this file holds neither a dash nor an escape for one. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)

describe('care desk', () => {
  it('registers the care model', () => {
    const model = modelOf('care')
    expect(model).not.toBeNull()
    expect(model).toBe(CARE_MODEL)
    expect(model?.levers.map((l) => l.id)).toEqual(['plans', 'payer', 'intake', 'program'])
    expect(model?.levers).toBe(CARE_LEVERS)
    expect(model?.events).toBe(CARE_EVENTS)
    expect(model?.events.map((e) => e.id).sort()).toEqual(EVENT_IDS)
    expect(model?.events).toHaveLength(7)
    expect(model?.copy).toBe(CARE_COPY)
    expect(model?.levers.map((l) => l.paid)).toEqual([false, false, false, true])

    // Salon and pet care bill no payers, so they offer no payer lever; the other five do.
    for (const trade of ['salon', 'petCare'] as const) {
      const s = setup(trade)
      expect(leverOf('payer').options(s.g, s.b, s.seed), trade).toEqual([])
    }
    for (const trade of PAYER_TRADES) {
      const s = setup(trade)
      expect(leverOf('payer').options(s.g, s.b, s.seed).map((o) => o.value), trade).toEqual([0, .2, .4, .6])
    }
    const s = setup('clinic')
    expect(leverOf('plans').options(s.g, s.b, s.seed).map((o) => o.value)).toEqual([0, .2, .4, .6])
    expect(leverOf('intake').options(s.g, s.b, s.seed).map((o) => o.value)).toEqual([0, 1, 2])
    expect(leverOf('program').options(s.g, s.b, s.seed).map((o) => o.value)).toEqual([1])
    // The current setting of each lever reads from the record.
    expect(leverOf('plans').current({ ...s.seed, planTarget: .4 }, s.g.year)).toBe(.4)
    expect(leverOf('payer').current({ ...s.seed, payer: .2 }, s.g.year)).toBe(.2)
    expect(leverOf('intake').current({ ...s.seed, intake: 2 }, s.g.year)).toBe(2)
    expect(leverOf('program').current({ ...s.seed, program: s.g.year }, s.g.year)).toBe(1)
    expect(leverOf('program').current({ ...s.seed, program: s.g.year - 1 }, s.g.year)).toBe(0)
  })

  it('hides the payer submenu of a trade that bills no payers', () => {
    const ids = (trade: Industry): string[] => {
      const s = setup(trade)
      return sectorMenu(s.a).children(s.g)
        .filter((n: MenuNode) => n.type === 'menu' && (n.visible?.(s.g) ?? true))
        .map((n: MenuNode) => n.id)
    }
    expect(ids('salon').some((id) => id.startsWith('sector.lever.payer.'))).toBe(false)
    expect(ids('clinic').some((id) => id.startsWith('sector.lever.payer.'))).toBe(true)
    expect(ids('salon')).toHaveLength(3)
    expect(ids('clinic')).toHaveLength(4)
  })

  it('shows the desk through deskLines', () => {
    const s = setup('gym')
    expect(deskLines(s.g, s.a).join(' ')).toContain('The desk opens at the next year end.')
    expect(applyLever(s.g, s.a, 'intake', 1, 'owner')).toEqual({ ok: true, paid: 0 })
    const lines = deskLines(s.g, s.a)
    expect(lines.join(' ')).toContain('come back. Plans 0%. Accredited, score 62.')
    expect(lines.join(' ')).toContain('Intake steady at 90%.')
    expect(lines.at(-1)).toBe(`${s.g.year}: Intake now Steady 90%.`)
  })

  it('moves the levers through applyLever', () => {
    const a1 = setup('gym')
    const bA = (): BizState => bizOf(a1.g, a1.a)

    // Plans set the target, and a free lever books nothing.
    const cash = bA().cash
    expect(applyLever(a1.g, a1.a, 'plans', .4, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(bA().cash).toBe(cash)
    expect(readSector(bA())).toMatchObject({ planTarget: .4, plans: 0, since: a1.g.year - 1, lastYear: a1.g.year - 1 })
    expect(applyLever(a1.g, a1.a, 'plans', .6, 'owner').ok).toBe(false)
    expect(applyLever(a1.g, a1.a, 'plans', .3, 'owner').ok).toBe(false)
    expect(applyLever(a1.g, a1.a, 'payer', .6, 'owner')).toEqual({ ok: true, paid: 0 })
    expect(readSector(bA())).toMatchObject({ planTarget: .4, payer: .6 })

    // The stock ramps by .10 a year toward the target; the payer share applies at once.
    prepareSectorYear(a1.g, a1.a, bA(), a1.g.year)
    const first = readSector(bA())
    expect(first).toMatchObject({ plans: .1, planTarget: .4, payer: .6 })
    const row = first?.ledger.at(-1)
    expect(row?.year).toBe(a1.g.year)
    expect(row?.demand).toBeCloseTo((1 + .35 * .6) * (1 + CARE.gym.amp * (1 - .6 * .1) * seasonIndex(a1.g, a1.a, a1.g.year, 'wx')), 6)
    expect(row?.costs).toBeGreaterThan(0)
    prepareSectorYear(a1.g, a1.a, bA(), a1.g.year + 1)
    expect(readSector(bA())).toMatchObject({ plans: .2 })
    prepareSectorYear(a1.g, a1.a, bA(), a1.g.year + 2)
    prepareSectorYear(a1.g, a1.a, bA(), a1.g.year + 3)
    expect(readSector(bA())).toMatchObject({ plans: .4 })

    // The program: priced once, refused a second time, and it lifts the accreditation target for the year.
    const clinic1 = setup('clinic')
    const clinic2 = setup('clinic')
    const cB = (k: typeof clinic1): BizState => bizOf(k.g, k.a)
    const price = accProgramCost(cB(clinic1), sectorCtx(clinic1.g, cB(clinic1), clinic1.g.year))
    expect(price).toBeGreaterThan(0)
    const before = cB(clinic1).cash
    const costs = cB(clinic1).yearCosts
    expect(applyLever(clinic1.g, clinic1.a, 'program', 1, 'owner')).toEqual({ ok: true, paid: price })
    expect(cB(clinic1).cash).toBe(before - price)
    expect(cB(clinic1).yearCosts).toBe(costs + price)
    expect(readSector(cB(clinic1))).toMatchObject({ program: clinic1.g.year })
    expect(applyLever(clinic1.g, clinic1.a, 'program', 1, 'owner').ok).toBe(false)
    expect(cB(clinic1).cash).toBe(before - price)

    // The control run has the same record and no program; both books close for the year just lived.
    expect(seedSector(clinic2.g, clinic2.a, cB(clinic2), clinic2.g.year - 1)).not.toBeNull()
    prepareSectorYear(clinic1.g, clinic1.a, cB(clinic1), clinic1.g.year)
    prepareSectorYear(clinic2.g, clinic2.a, cB(clinic2), clinic2.g.year)
    const withProgram = readSector(cB(clinic1))
    const without = readSector(cB(clinic2))
    expect(withProgram?.family === 'care' && without?.family === 'care').toBe(true)
    if (withProgram?.family !== 'care' || without?.family !== 'care') return
    expect(Math.abs(withProgram.acc - without.acc - .3 * 20)).toBeLessThan(.05)
  })

  it('has valid events', () => {
    const probes = (s: ReturnType<typeof setup>): CareState[] => [s.seed, busy(s), { ...s.seed, acc: 40 }]
    let seen = 0
    for (const trade of TRADES) {
      const s = setup(trade)
      for (const st of probes(s)) {
        for (const ev of CARE_EVENTS) {
          expect(eventProblems(ev, s.g, s.a, s.b, st), `${trade} ${ev.id} ${st.acc}`).toEqual([])
          const shown = [ev.title, ev.scene(s.g, s.a, s.b, st)]
          for (const c of ev.choices(s.g, s.b, st)) {
            shown.push(c.label)
            for (const br of c.branches(s.g, s.b, st)) shown.push(sectorText(CARE_COPY, br.text, br.vals))
          }
          for (const line of shown) {
            expect(line.length, `${ev.id} has an empty line`).toBeGreaterThan(0)
            expect(line, `${trade} ${ev.id}`).not.toMatch(/\$\{|NaN|undefined|Infinity/)
          }
          seen++
        }
      }
    }
    expect(seen).toBe(TRADES.length * 3 * 7)
    // The tier lines of the yearly rule render too.
    for (const key of Object.keys(CARE_NOTE_COPY)) {
      const line = sectorText(CARE_COPY, key, { name: 'Test gym' })
      expect(line).toContain('Test gym')
      expect(line).not.toMatch(/\$\{|undefined/)
    }
  })

  it('has the review odds', () => {
    const s = setup('clinic')
    const odds = (st: CareState, choice: string): number => branchesOf(s, st, 'accreditationReview', choice)[0].p
    const want = (acc: number, bonus: number): number => Math.min(.97, Math.max(.1, acc / 110 + bonus))
    expect(odds(s.seed, 'prepare')).toBeCloseTo(want(62, .15), 9)
    expect(odds(s.seed, 'time')).toBeCloseTo(want(62, .05), 9)
    expect(odds(s.seed, 'bluff')).toBeCloseTo(want(62, -.10), 9)
    expect(odds(s.seed, 'prepare')).toBeGreaterThan(odds(s.seed, 'time'))
    expect(odds(s.seed, 'time')).toBeGreaterThan(odds(s.seed, 'bluff'))
    // The odds are held between .1 and .97.
    expect(odds({ ...s.seed, acc: 0 }, 'bluff')).toBeCloseTo(.1, 9)
    expect(odds({ ...s.seed, acc: 100 }, 'prepare')).toBeCloseTo(.97, 9)
    for (const acc of [0, 30, 62, 90, 100]) for (const choice of ['prepare', 'time', 'bluff']) expect(odds({ ...s.seed, acc }, choice)).toBeCloseTo(want(acc, { prepare: .15, time: .05, bluff: -.10 }[choice] ?? 0), 9)
    // A failed review takes 12 points off the score; a pass takes none.
    for (const choice of ['prepare', 'time', 'bluff']) {
      const branches = branchesOf(s, s.seed, 'accreditationReview', choice)
      expect(branches).toHaveLength(2)
      expect(branches[0].sec).toBeUndefined()
      expect(branches[1].sec?.add).toEqual({ acc: -12 })
      expect(branches[0].p + branches[1].p).toBeCloseTo(1, 12)
    }
    // Preparing the files costs the program price, once: a program already paid this year covers it.
    const price = accProgramCost(s.b, sectorCtx(s.g, s.b, s.g.year))
    expect(branchesOf(s, s.seed, 'accreditationReview', 'prepare')[0].fx.cash).toBe(-price)
    expect(branchesOf(s, { ...s.seed, program: s.g.year }, 'accreditationReview', 'prepare')[0].fx.cash ?? 0).toBe(0)
    expect(branchesOf(s, s.seed, 'accreditationReview', 'time')[0].fx.cash ?? 0).toBe(0)
  })

  it('has the star, payer, contract and waitlist outcomes', () => {
    const s = setup('gym')
    const st = busy(s)
    // A counter-offer loses less of the client base than letting them go, and costs a raise.
    const counter = branchesOf(s, st, 'starLeaves', 'counter')
    const release = branchesOf(s, st, 'starLeaves', 'release')
    const enforce = branchesOf(s, st, 'starLeaves', 'enforce')
    expect(counter[0].sec?.add?.loyal).toBe(-.03)
    expect(release[0].sec?.add?.loyal).toBe(-.08)
    expect(enforce[0].sec?.add?.loyal).toBe(-.08)
    expect(counter[0].fx.wage).toBe(.02)
    expect(release[0].fx.wage ?? 0).toBe(0)
    expect(enforce[0].fx.brand).toBe(-5)
    expect(counter[0].fx.cash ?? 0).toBe(0)
    // The retention shown in the outcome is the one the record ends with.
    expect(release[0].vals?.pct).toBe(`${Math.round((st.loyal - .08) * 100)}%`)

    // A payer audit: paying is certain, contesting is a gamble, dropping the contract takes 20 points of the payer mix.
    const pay = branchesOf(s, st, 'payerAudit', 'pay')
    const contest = branchesOf(s, st, 'payerAudit', 'contest')
    const drop = branchesOf(s, st, 'payerAudit', 'drop')
    expect(pay).toHaveLength(1)
    expect(pay[0].fx.cash).toBeLessThan(0)
    expect(contest).toHaveLength(2)
    expect(contest[1].fx.cash).toBeLessThan(pay[0].fx.cash ?? 0)
    expect(contest[0].fx.cash).toBeGreaterThan(pay[0].fx.cash ?? 0)
    expect(drop[0].sec?.add).toEqual({ payer: -.2 })
    expect(drop[0].fx.cash ?? 0).toBe(0)

    // A contract offer adds plans and payers; negotiating is a chance at the same deal with no discount paid.
    const sign = branchesOf(s, st, 'contractOffer', 'sign')
    const negotiate = branchesOf(s, st, 'contractOffer', 'negotiate')
    const decline = branchesOf(s, st, 'contractOffer', 'decline')
    expect(sign[0].sec?.add).toEqual({ plans: .1, payer: .1 })
    expect(sign[0].fx.cash).toBeLessThan(0)
    expect(negotiate[0].sec?.add).toEqual({ plans: .1, payer: .1 })
    expect(negotiate[0].fx.cash ?? 0).toBe(0)
    expect(negotiate[0].p + negotiate[1].p).toBeCloseTo(1, 12)
    expect(decline[0].sec).toBeUndefined()
    // The plan target follows the new plans, so the next yearly update doesn't undo the deal.
    const target = sign[0].sec?.set?.planTarget
    expect(target).toBeGreaterThanOrEqual(st.plans + .1 - 1e-9)
    // A trade that bills no payers adds plans only.
    const salon = setup('salon')
    const salonSign = branchesOf(salon, busy(salon), 'contractOffer', 'sign')
    expect(salonSign[0].sec?.add).toEqual({ plans: .1 })

    // A waiting list: more hours cost money and bring the clients back more often.
    const hours = branchesOf(s, st, 'waitlist', 'hours')
    expect(hours[0].sec?.add?.loyal).toBe(.04)
    expect(hours[0].fx.cash).toBeLessThan(0)
    expect(branchesOf(s, st, 'waitlist', 'small')[0].fx.cash ?? 0).toBe(0)

    // A rush: temps beat riding it out by 12 points of odds, and capping intake sets the intake lever to at least Steady.
    const temps = branchesOf(s, st, 'rush', 'temps')
    const ride = branchesOf(s, st, 'rush', 'ride')
    expect(temps[0].p).toBeCloseTo(Math.min(.9, ride[0].p + .12), 9)
    expect(temps[0].fx.cash).toBeLessThan(0)
    expect(ride[0].p).toBeGreaterThanOrEqual(.1)
    expect(ride[0].p).toBeLessThanOrEqual(.85)
    const cap = branchesOf(s, st, 'rush', 'cap')
    expect(cap).toHaveLength(1)
    expect(cap[0].sec?.set).toEqual({ intake: 1 })
    expect(branchesOf(s, { ...st, intake: 2 }, 'rush', 'cap')[0].sec?.set).toEqual({ intake: 2 })
  })

  it('pays an incident from insurance at 15%', () => {
    const plain = setup('clinic')
    const covered = setup('clinic')
    covered.b.insured = true
    plain.b.insured = false
    for (const choice of ['settle', 'fight', 'report']) {
      const open = branchesOf(plain, plain.seed, 'incident', choice)
      const shut = branchesOf(covered, covered.seed, 'incident', choice)
      expect(shut).toHaveLength(open.length)
      open.forEach((br, i) => {
        const was = -(br.fx.cash ?? 0)
        const now = -(shut[i].fx.cash ?? 0)
        expect(was, `${choice} ${i}`).toBeGreaterThan(0)
        expect(Math.abs(now - .15 * was), `${choice} ${i}`).toBeLessThanOrEqual(1)
        expect(shut[i].p).toBeCloseTo(br.p, 12)
      })
    }
    // The cost shown on the label is the cost paid.
    const settle = eventOf('incident').choices(covered.g, covered.b, covered.seed).find((c) => c.id === 'settle')
    const paid = -(branchesOf(covered, covered.seed, 'incident', 'settle')[0].fx.cash ?? 0)
    expect(settle?.label).toBe(sectorText(CARE_COPY, 'care.ev.incident.settle.label', { cost: money(paid) }))
  })

  it('reads the era and names the trade', () => {
    // Every scene of every trade fits every year the family can roll in.
    for (const year of [1950, 1985, 2026]) {
      for (const trade of TRADES) {
        const s = setup(trade, year)
        const st = busy(s)
        for (const ev of CARE_EVENTS) expect(eraFits(s.g, s.b.countryId, ev.scene(s.g, s.a, s.b, st)), `${trade} ${year} ${ev.id}`).toBe(true)
      }
    }
    // The star's job and the season of the rush come from the trade.
    const person: Record<string, string> = { clinic: 'doctor', education: 'teacher', gym: 'trainer', salon: 'stylist', petCare: 'groomer', homeCare: 'carer', autoShop: 'mechanic' }
    const season: Record<string, RegExp> = { gym: /January/, education: /Exam season/, clinic: /Flu season/, homeCare: /Flu season/, salon: /Holiday week/, petCare: /Holiday week/, autoShop: /first frost/ }
    for (const trade of TRADES) {
      const s = setup(trade)
      expect(eventOf('starLeaves').scene(s.g, s.a, s.b, s.seed), trade).toContain(person[trade])
      expect(eventOf('rush').scene(s.g, s.a, s.b, s.seed), trade).toMatch(season[trade])
    }
    // A shop that sold nothing yet still names a number of regulars.
    const fresh = setup('salon')
    fresh.b.last = null
    expect(eventOf('starLeaves').scene(fresh.g, fresh.a, fresh.b, fresh.seed)).toMatch(/^Your lead stylist gave notice\. [1-9]\d* regulars/)
  })

  it('is gated by state', () => {
    const s = setup('clinic')
    const weight = (id: string, st: CareState): number => eventOf(id).weight(s.g, s.b, st)
    expect(weight('payerAudit', s.seed)).toBe(0)
    expect(weight('payerAudit', { ...s.seed, payer: .2 })).toBeGreaterThan(0)
    s.b.brand = 29
    expect(weight('contractOffer', s.seed)).toBe(0)
    s.b.brand = 30
    expect(weight('contractOffer', s.seed)).toBeGreaterThan(0)
    expect(weight('waitlist', s.seed)).toBe(0)
    expect(weight('waitlist', { ...s.seed, loyal: CARE.clinic.r0 - .01 })).toBe(0)
    expect(weight('waitlist', { ...s.seed, loyal: CARE.clinic.r0 + .01 })).toBeGreaterThan(0)
    for (const id of ['accreditationReview', 'starLeaves', 'rush', 'incident']) expect(weight(id, s.seed), id).toBeGreaterThan(0)
    // The weights of spec 4.3.
    expect(weight('accreditationReview', s.seed)).toBe(1)
    expect(weight('starLeaves', s.seed)).toBe(.8)
    expect(weight('payerAudit', { ...s.seed, payer: .2 })).toBe(.8)
    expect(weight('rush', s.seed)).toBe(.6)
    expect(weight('incident', s.seed)).toBe(.6)
    expect(weight('contractOffer', s.seed)).toBe(.5)
    expect(weight('waitlist', { ...s.seed, loyal: CARE.clinic.r0 + .01 })).toBe(.4)
    // A trade with no payer row has no payer audit even with a payer share on file.
    const salon = setup('salon')
    expect(eventOf('payerAudit').weight(salon.g, salon.b, { ...salon.seed, payer: .4 })).toBe(0)
  })

  it('pins the choice ids', () => {
    const s = setup('clinic')
    const ids = (id: string): string[] => eventOf(id).choices(s.g, s.b, busy(s)).map((c) => c.id)
    expect(ids('accreditationReview')).toEqual(['prepare', 'bluff', 'time'])
    expect(ids('starLeaves')).toEqual(['counter', 'release', 'enforce'])
    expect(ids('payerAudit')).toEqual(['pay', 'contest', 'drop'])
    expect(ids('rush')).toEqual(['temps', 'cap', 'ride'])
    expect(ids('incident')).toEqual(['settle', 'fight', 'report'])
    expect(ids('contractOffer')).toEqual(['sign', 'negotiate', 'decline'])
    expect(ids('waitlist')).toEqual(['hours', 'small'])
  })

  it('has no free lever', () => {
    // With idle capacity a payer mix pays; with a full house it only discounts sales that were sold anyway.
    const worth = (util: number): Worth => worthOf(.78, util)
    for (const trade of ['clinic', 'gym'] as const) {
      const s = setup(trade)
      const lever = leverOf('payer')
      const cx = s.ctx(.5)
      const best = (util: number): { value: number; gain: number } => {
        let top = { value: 0, gain: 0 }
        for (const o of lever.options(s.g, s.b, s.seed)) {
          const gain = leverValue(s.g, s.a, s.b, s.seed, lever, o.value, worth(util), cx)
          if (gain > top.gain) top = { value: o.value, gain }
        }
        return top
      }
      expect(best(.7).value, `${trade} at .7`).toBeGreaterThan(0)
      expect(best(.98).value, `${trade} at .98`).toBe(0)
      // The current setting is worth nothing against itself.
      expect(leverValue(s.g, s.a, s.b, s.seed, lever, 0, worth(.7), cx)).toBe(0)
    }
    // A program pays only near a tier: in a provisional tier (40) or just under the top one (75 to 80), not at the seed score.
    const s = setup('clinic')
    const program = leverOf('program')
    const cx = s.ctx(.5)
    const idle = worthOf(.78, .7)
    const value = (acc: number): number => leverValue(s.g, s.a, s.b, { ...s.seed, acc }, program, 1, idle, cx)
    expect(value(40)).toBeGreaterThan(0)
    expect(value(80)).toBeGreaterThan(0)
    expect(value(62)).toBeLessThan(0)
    expect(value(70)).toBeLessThan(0)
  })

  it('has no generic double', () => {
    let rolled = 0
    let years = 0
    for (const trade of ['clinic', 'gym'] as const) {
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
          expect(st?.family).toBe('care')
          if (st?.family === 'care') for (const v of [st.loyal, st.plans, st.planTarget, st.payer, st.acc]) expect(Number.isFinite(v)).toBe(true)
        }
      }
    }
    expect(years).toBe(72)
    expect(rolled).toBeGreaterThan(0)
    expect(rolled / years).toBeLessThanOrEqual(.30)
  }, 300_000)

  it('marks one best choice for the Business talent and plays every answer', () => {
    let seen = 0
    for (const trade of ['salon', 'education'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        const { g, a } = deskGame(trade, { seed })
        for (let i = 0; i < 12; i++) {
          for (const m of playYear(g).filter((x) => x.scriptId === SECTOR_EVENT_SCRIPT)) {
            seen++
            expect(m.choices.filter((c) => c.hint), `${trade} ${seed} ${m.title}`).toHaveLength(1)
          }
        }
        expect(deskLines(g, a).join(' ')).toContain('clients')
        const st = readSector(bizOf(g, a))
        expect(st?.family).toBe('care')
        expect(st?.pending).toBeNull()
        expect(st?.diary.length).toBeLessThanOrEqual(6)
      }
    }
    expect(seen).toBeGreaterThan(0)
  }, 300_000)

  it('plays every choice of every event through the script', () => {
    // Fire each event by hand: a pending token, then the script, once per choice and branch roll.
    for (const trade of ['clinic', 'salon'] as const) {
      for (const ev of CARE_EVENTS) {
        const room = setup(trade)
        for (const c of ev.choices(room.g, room.b, busy(room))) {
          for (const seed of [3, 7, 11]) {
            const s = setup(trade)
            const st: CareState = { ...busy(s), since: s.g.year - 3, lastYear: s.g.year - 1, pending: { token: 'tok', id: ev.id, year: s.g.year } }
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
            if (after?.family === 'care') {
              expect(after.loyal).toBeGreaterThanOrEqual(.2)
              expect(after.loyal).toBeLessThanOrEqual(1)
              expect(after.payer).toBeLessThanOrEqual(.6)
              expect(after.plans).toBeLessThanOrEqual(.6)
            }
          }
        }
      }
    }
  })

  it('keeps every event inside its bounds for small and strong companies', () => {
    const small = setup('salon')
    small.b.last = { netRevenue: 12_000, wages: 3_000, sold: 400 } as unknown as BizState['last']
    const strong = setup('clinic')
    strong.b.quality = 100
    strong.b.last = { netRevenue: 9_000_000, wages: 2_500_000, sold: 90_000 } as unknown as BizState['last']
    for (const s of [small, strong]) {
      const probes: CareState[] = [s.seed, busy(s), { ...s.seed, acc: 100, loyal: 1 }, { ...s.seed, acc: 0, loyal: .2 }]
      for (const st of probes) for (const ev of CARE_EVENTS) expect(eventProblems(ev, s.g, s.a, s.b, st), `${s.b.industry} ${ev.id}`).toEqual([])
    }
  })

  it('has every copy key', () => {
    const lines = copyLines(CARE_COPY)
    expect(lines.length).toBeGreaterThanOrEqual(40)
    for (const l of lines) expect(l.key.startsWith('care.'), l.key).toBe(true)
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(CARE_COPY, key)

    // Every option of every lever, offered or not, has a label and a tip.
    const s = setup('clinic')
    for (const lever of CARE_LEVERS) {
      expect(has(`care.lever.${lever.id}.label`), lever.id).toBe(true)
      expect(lever.label).toBe(sectorText(CARE_COPY, `care.lever.${lever.id}.label`))
      const options = lever.options(s.g, s.b, s.seed)
      expect(options.length).toBeGreaterThan(0)
      for (const o of options) {
        expect(has(`care.lever.${lever.id}.${o.value}.label`), `${lever.id} ${o.value}`).toBe(true)
        expect(has(`care.lever.${lever.id}.${o.value}.tip`), `${lever.id} ${o.value}`).toBe(true)
        expect(o.label).toBe(sectorText(CARE_COPY, `care.lever.${lever.id}.${o.value}.label`))
        expect(o.tip).toBe(sectorText(CARE_COPY, `care.lever.${lever.id}.${o.value}.tip`))
      }
    }
    // Every event has a head and a scene (or its trade variants), and every choice a label, over every trade.
    for (const trade of TRADES) {
      const t = setup(trade)
      const st = busy(t)
      for (const ev of CARE_EVENTS) {
        expect(has(`care.ev.${ev.id}.head`), ev.id).toBe(true)
        expect(ev.title).toBe(sectorText(CARE_COPY, `care.ev.${ev.id}.head`))
        const scenes = lines.filter((l) => new RegExp(`^care\\.ev\\.${ev.id}\\.(\\w+\\.)?scene$`).test(l.key))
        expect(scenes.length, ev.id).toBeGreaterThan(0)
        for (const c of ev.choices(t.g, t.b, st)) {
          expect(has(`care.ev.${ev.id}.${c.id}.label`), `${ev.id}.${c.id}`).toBe(true)
          c.branches(t.g, t.b, st).forEach((br, k) => {
            expect(br.text, `${ev.id}.${c.id}`).toBe(`care.ev.${ev.id}.${c.id}.${k}.out`)
            expect(has(br.text), br.text).toBe(true)
          })
        }
      }
    }
    for (const trade of TRADES) {
      expect(has(`care.ev.starLeaves.${trade}.scene`), trade).toBe(true)
      expect(has(`care.ev.rush.${trade}.scene`), trade).toBe(true)
    }
  })

  it('keeps the copy inside the voice guide', () => {
    const roles = new Set<string>()
    for (const { key, role, text } of copyLines(CARE_COPY)) {
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
