// Care, Education and Personal Services. 'care math': the client base, plans, payer mix, accreditation and
// intake of the seven trades; careFx is called directly with a hand-made context, so no family model is
// involved. (The 'care desk' block, with the levers, events and copy of the registered family, is added with
// sector-care-play.ts.)
import { describe, expect, it } from 'vitest'
import { staffPower, localEcon, type Worth } from '../src/game/business/economy'
import { accProgramCost, accTier, CARE_NOTE_COPY, careFx, careHeader, careRoleMoves, careRow, careSeed, clientsOf } from '../src/game/business/sector-care'
import { SECTOR_BOUNDS, sectorValue } from '../src/game/business/sector-core'
import { CARE, SECTOR_ROLES } from '../src/game/business/sector-data'
import { seasonIndex, sectorHistoryLine, type SectorCtx, type SectorFx } from '../src/game/business/sector-kit'
import type { CareState } from '../src/game/business/sector-state'
import type { BizState, KeyStaff } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState } from '../src/game/types'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { deskGame, frozen } from './sector-kit'

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
