// Company hedge fund: which companies can put cash to work, how much is spare, the booking of the
// year through the statement (a gain is income, a loss is a cost, once a fiscal year), the floor that
// keeps a company liquid after the worst year, who sets the terms, and the rule that setting a target
// moves nothing. Nothing here reads or advances g.rng; every dollar moves through b.cash.
import { describe, expect, it } from 'vitest'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { boardView } from '../src/game/business/board-state'
import { payableCash, payoutCash, reserveDollars, runningCosts } from '../src/game/business/board-vote'
import { simulateYear, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { fundRng, leaderSkill, marketMove } from '../src/game/business/fund-model'
import { earmarkedCash, simulateStudioYear } from '../src/game/business/gamestudio'
import { simulateDeepTechYear } from '../src/game/business/deeptech'
import {
  bookHedgeYear, companyBlock, companyFloor, companyQuote, companyTerms, eligibleCompanies, KEEP_MONTHS, setCompanyFund,
} from '../src/game/business/hedge-company'
import { autoTerms, leadOf, macroBlock, marketBlock, skillOf, vehicleYear } from '../src/game/business/hedge-model'
import { readCompanyHedge, type CompanyHedge } from '../src/game/business/hedge-record'
import { bizOf, findBusiness, readBiz, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { netWorth } from '../src/game/core'
import type { Asset, GameState, NoticeModal } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { firm } from './fund-fixtures'
import { company, rich } from './hedge-kit'
import { listedGroup } from './own-listing-kit'
import { newLeader } from './politics-kit'

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

/** A company with plenty of cash that has traded for years. */
function rig(seed = 61, year = 2026, cash = 50_000_000): { g: GameState; a: Asset; b: BizState } {
  const g = rich(seed, 'us', 5_000_000, year)
  const c = company(g, { cash })
  c.b.founded = year - 8
  return { g, ...c }
}

/** The same, with the player as its chief executive (an owner-run year: the terms are theirs). */
function owned(seed = 61, year = 2026, cash = 50_000_000): { g: GameState; a: Asset; b: BizState } {
  const r = rig(seed, year, cash)
  becomeCeo(r.g, r.a, r.b)
  return r
}

function hedgeOf(b: BizState): CompanyHedge {
  const h = readCompanyHedge(b.hedge)
  if (!h) throw new Error('no hedge record')
  return h
}

function put(b: BizState, raw: unknown): void {
  ;(b as unknown as { hedge: unknown }).hedge = raw
}

function notices(g: GameState, title?: string): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && (title === undefined || m.title === title))
}

function prison(): NonNullable<GameState['character']['prison']> {
  return { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
}

/** A year (1990-2025) in which the home index fell by more than 20% for the first life seed. */
function crashYear(seed = 61): number {
  const g = rich(seed)
  for (let y = 1990; y <= 2025; y++) if (marketMove(g, 'us', y) < -0.2) return y
  throw new Error('no crash year')
}

describe('which companies can hold a fund', () => {
  it('lets an ordinary company in', () => {
    const { g, a, b } = rig()
    expect(companyBlock(g, a, b)).toBeNull()
  })

  it('keeps an investment firm out, with a pointer to its own screen', () => {
    const f = firm('hedge')
    expect(companyBlock(f.g, f.a, f.b)).toBe('Its own fund is on its company screen.')
  })

  it('keeps a bank out', () => {
    const { g } = rig()
    const a = createBusinessAsset(g, 'Test Bank', newBiz(g, 'bank', 'us', getCountry('us').cities[0], { cash: 15_000_000, founded: g.year - 3 }), 1e6)
    g.assets.push(a)
    expect(companyBlock(g, a, bizOf(g, a))).toBe("A bank can't put its capital in a fund.")
  })

  it('keeps a division of a group out', () => {
    const g = rich(61)
    const { members } = listedGroup(g, 'us', 0.6)
    const a = members[0]
    expect(companyBlock(g, a, readBiz(g, a))).toBe('Its cash belongs to the group.')
  })

  it('keeps out a company the player owns none of', () => {
    const { g, a, b } = rig()
    b.familyShares = [{ id: 'kin1', share: 1 }]
    b.share = 0
    expect(companyBlock(g, a, readBiz(g, a))).toBe('You own none of it.')
    expect(companyBlock(g, a, b)).toBe('You own none of it.')
  })

  it('keeps out every company before hedge funds exist', () => {
    const { g, a, b } = rig(61, 1948)
    expect(companyBlock(g, a, b)).toBe(marketBlock(g, 'us'))
    expect(companyBlock(g, a, b)).not.toBeNull()
    expect(eligibleCompanies(g)).toEqual([])
  })

  it('lists the eligible ones largest first, at most twenty', () => {
    const g = rich(61)
    const small = company(g, { name: 'Small Co', profit: 1e6 })
    const big = company(g, { name: 'Big Co', profit: 80e6 })
    const mid = company(g, { name: 'Mid Co', profit: 20e6 })
    expect(big.a.value).toBeGreaterThan(mid.a.value)
    expect(mid.a.value).toBeGreaterThan(small.a.value)
    const none = company(g, { name: 'None Co' })
    none.b.familyShares = [{ id: 'kin1', share: 1 }]
    none.b.share = 0
    expect(eligibleCompanies(g).map((r) => r.a.name)).toEqual(['Big Co', 'Mid Co', 'Small Co'])
    for (let i = 0; i < 20; i++) company(g, { name: `Extra ${i}`, profit: 5e6 })
    const list = eligibleCompanies(g)
    expect(list).toHaveLength(20)
    for (let i = 1; i < list.length; i++) expect(list[i - 1].a.value).toBeGreaterThanOrEqual(list[i].a.value)
  })

  it('drops the firm, the bank and the division from the list', () => {
    const f = firm('hedge')
    const ok = company(f.g, { name: 'Quiet Co' })
    const bankAsset = createBusinessAsset(f.g, 'Test Bank', newBiz(f.g, 'bank', 'us', getCountry('us').cities[0], { cash: 15_000_000, founded: f.g.year - 3 }), 1e6)
    f.g.assets.push(bankAsset)
    expect(eligibleCompanies(f.g).map((r) => r.a.id)).toEqual([ok.a.id])
  })
})

describe('the floor', () => {
  it('is six months of running costs for a company with no board', () => {
    const { g, a, b } = rig()
    expect(KEEP_MONTHS).toBe(6)
    expect(runningCosts(b)).toBeGreaterThan(0)
    expect(companyFloor(g, a, b)).toBe(Math.round(runningCosts(b) / 2))
  })

  it('is the larger of that and the board reserve when a board exists', () => {
    const { g, a, b } = rig()
    b.share = 0.6
    ;(b as unknown as { board: unknown }).board = { limits: { reserve: 12 } }
    const reserve = reserveDollars(b, boardView(g, a, b))
    expect(reserve).toBe(Math.round(runningCosts(b)))
    expect(companyFloor(g, a, b)).toBe(Math.max(Math.round(runningCosts(b) / 2), reserve))
    expect(companyFloor(g, a, b)).toBe(reserve)
    ;(b as unknown as { board: unknown }).board = { limits: { reserve: 1 } }
    expect(companyFloor(g, a, b)).toBe(Math.round(runningCosts(b) / 2))
  })
})

describe('spare cash and work', () => {
  it('spare is the payout cash above the floor, work is the lesser of target and spare, rounded down', () => {
    const { g, a, b } = rig()
    const floor = companyFloor(g, a, b)
    const spare = payoutCash(a, b) - floor
    expect(spare).toBeGreaterThan(5_000_000)
    expect(companyQuote(g, a, b, 2_000_000)).toEqual({ floor, spare, work: 2_000_000, why: null })
    expect(companyQuote(g, a, b, 1234.9).work).toBe(1234)
    expect(companyQuote(g, a, b, 1e12)).toEqual({ floor, spare, work: spare, why: null })
    expect(companyQuote(g, a, b, 0)).toEqual({ floor, spare, work: 0, why: null })
  })

  it('reads a negative, huge or broken target safely', () => {
    const { g, a, b } = rig()
    const spare = companyQuote(g, a, b, 0).spare
    expect(companyQuote(g, a, b, -5).work).toBe(0)
    expect(companyQuote(g, a, b, Number.NaN).work).toBe(0)
    expect(companyQuote(g, a, b, Infinity).work).toBe(0)
    expect(companyQuote(g, a, b, 1e30).work).toBe(spare)
  })

  it('loans take cash out of what is spare', () => {
    const { g, a, b } = rig()
    const before = companyQuote(g, a, b, 1e12).spare
    b.debt = 3_000_000
    expect(companyQuote(g, a, b, 1e12).spare).toBe(before - 3_000_000)
  })

  it('earmarked game money takes cash out of what is spare', () => {
    const g = rich(61)
    const a = createBusinessAsset(g, 'Studio Co', newBiz(g, 'gameStudio', 'us', getCountry('us').cities[0], { cash: 50_000_000, founded: g.year - 8 }), 1e6)
    g.assets.push(a)
    const b = bizOf(g, a)
    const before = companyQuote(g, a, b, 1e12).spare
    a.details.studio = { games: [{ id: 'sg1', title: 'Big Game', stage: 'dev', advanceGot: 1_000_000 }] }
    expect(earmarkedCash(a)).toBe(1_000_000)
    expect(companyQuote(g, a, b, 1e12).spare).toBe(before - 1_000_000)
  })

  it("investors' preference takes cash out of what is spare", () => {
    const { g, a, b } = rig()
    b.share = 0.6
    const open = payoutCash(a, b)
    b.pref = valuationOf(b) - 3_000_000
    expect(payoutCash(a, b)).toBeLessThan(open)
    const q = companyQuote(g, a, b, 1e12)
    expect(q.spare).toBe(payoutCash(a, b) - companyFloor(g, a, b))
    expect(q.spare).toBeLessThan(3_000_000)
  })

  it('says why nothing is spare, first reason that applies', () => {
    const { g, a, b } = rig()
    b.cash = 0
    expect(companyQuote(g, a, b, 1_000_000)).toMatchObject({ work: 0, why: 'It has no spare cash.' })
    b.cash = 4_000_000
    b.debt = 4_000_000
    expect(companyQuote(g, a, b, 1_000_000)).toMatchObject({ work: 0, why: 'Its loans come first.' })
    b.debt = 0
    b.share = 0.6
    b.pref = valuationOf(b) + 1
    expect(payableCash(a, b)).toBeGreaterThan(0)
    expect(companyQuote(g, a, b, 1_000_000)).toMatchObject({ work: 0, why: 'Investors are paid back first.' })
    b.share = 1
    b.pref = 0
    b.cash = companyFloor(g, a, b)
    expect(b.cash).toBeGreaterThan(1)
    expect(companyQuote(g, a, b, 1_000_000)).toMatchObject({ work: 0, why: 'Its cash is at the floor.' })
  })

  it('has no reason when nothing was asked for', () => {
    const { g, a, b } = rig()
    b.cash = 0
    expect(companyQuote(g, a, b, 0).why).toBeNull()
  })
})

describe('booking the year', () => {
  it('a gain is booked once: cash and income rise by the result, then the statement counts it', () => {
    const { g, a, b } = owned()
    const twin = structuredClone(g)
    const twinB = bizOf(twin, findBusiness(twin, a.id)!)
    expect(setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull' })).toBe(true)
    const cash = b.cash
    const income = b.yearIncome
    const costs = b.yearCosts
    const fiscal = g.year - 1
    bookHedgeYear(g, a, b, fiscal)
    const h = hedgeOf(b)
    expect(h.last).toMatchObject({ year: fiscal, work: 2_000_000 })
    const pnl = h.last!.pnl
    expect(pnl).toBeGreaterThan(0)
    expect(b.cash).toBe(cash + pnl)
    expect(b.yearIncome).toBe(income + pnl)
    expect(b.yearCosts).toBe(costs)
    expect(h.total).toBe(pnl)
    // The result is what the model says for the same inputs, on the company's own noise.
    const y = vehicleYear(g, { countryId: 'us', strategy: 'macro', call: 'bull', lev: 1, nav: 2_000_000, skill: skillOf(leaderSkill(g, b)), year: g.year }, fundRng(g, b, fiscal, 'hedgeco'))
    expect(h.last!.net).toBeCloseTo(y.net, 12)
    expect(h.last!.market).toBeCloseTo(y.market, 12)
    expect(pnl).toBe(Math.round(2_000_000 * y.net))
    // The statement: one more dollar of other income per dollar of gain, tax on it, and no second cash move.
    const withFund = simulateYear(g, b, fiscal, 0, 1)
    const without = simulateYear(twin, twinB, fiscal, 0, 1)
    expect(withFund.stmt.otherIncome - without.stmt.otherIncome).toBe(pnl)
    const tax = withFund.stmt.corpTax - without.stmt.corpTax
    const erosion = withFund.stmt.cashErosion - without.stmt.cashErosion
    expect(tax).toBeGreaterThan(0)
    expect(Math.abs(b.cash - twinB.cash - (pnl - tax - erosion))).toBeLessThanOrEqual(1)
  })

  it('every simulator counts the result once: a game studio and a deep-tech company too', () => {
    for (const [industry, simulate] of [['gameStudio', simulateStudioYear], ['biotech', simulateDeepTechYear]] as const) {
      const g = rich(61)
      const a = createBusinessAsset(g, 'Lab Co', newBiz(g, industry, 'us', getCountry('us').cities[0], { cash: 50_000_000, founded: g.year - 8 }), 1e6)
      g.assets.push(a)
      const b = bizOf(g, a)
      expect(companyBlock(g, a, b)).toBeNull()
      const twin = structuredClone(g)
      const twinAsset = findBusiness(twin, a.id)!
      const twinB = bizOf(twin, twinAsset)
      expect(setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull' })).toBe(true)
      bookHedgeYear(g, a, b, g.year - 1)
      const pnl = hedgeOf(b).last!.pnl
      expect(pnl).toBeGreaterThan(0)
      const withFund = simulate(g, a, b, g.year - 1, 0)
      const without = simulate(twin, twinAsset, twinB, g.year - 1, 0)
      expect(withFund.stmt.otherIncome - without.stmt.otherIncome).toBe(pnl)
      const tax = withFund.stmt.corpTax - without.stmt.corpTax
      const erosion = withFund.stmt.cashErosion - without.stmt.cashErosion
      expect(Math.abs(b.cash - twinB.cash - (pnl - tax - erosion))).toBeLessThanOrEqual(1)
    }
  })

  it('a loss is a cost: cash and costs move by the loss', () => {
    const year = crashYear()
    const { g, a, b } = owned(61, year)
    expect(marketMove(g, 'us', g.year)).toBeLessThan(-0.2)
    expect(setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull', lev: 3 })).toBe(true)
    const cash = b.cash
    const income = b.yearIncome
    const costs = b.yearCosts
    bookHedgeYear(g, a, b, g.year - 1)
    const h = hedgeOf(b)
    const pnl = h.last!.pnl
    expect(pnl).toBeLessThan(0)
    expect(h.last!.work).toBe(2_000_000)
    expect(b.cash).toBe(cash + pnl)
    expect(b.yearCosts).toBe(costs - pnl)
    expect(b.yearIncome).toBe(income)
    expect(h.total).toBe(pnl)
    // At most 95% of the money at work is lost in a year.
    expect(-pnl).toBeLessThanOrEqual(Math.round(2_000_000 * 0.9503))
  })

  it('the fund alone cannot sink the company, in the worst year of either kind', () => {
    // A crash with a leveraged bull call, and a boom with a leveraged bear call (the floor of the model, -95%).
    for (const [year, call] of [[crashYear(), 'bull'], [2026, 'bear']] as const) {
      for (const withBoard of [false, true]) {
        const { g, a, b } = owned(61, year)
        if (withBoard) {
          b.share = 0.6
          ;(b as unknown as { board: unknown }).board = { limits: { reserve: 12 } }
        }
        b.debt = 2_000_000
        expect(setCompanyFund(g, a.id, { target: 1e15, call, lev: 3 })).toBe(true)
        const floor = companyFloor(g, a, b)
        const spare = companyQuote(g, a, b, 1e15).spare
        expect(spare).toBeGreaterThan(1_000_000)
        bookHedgeYear(g, a, b, g.year - 1)
        const h = hedgeOf(b)
        expect(h.last!.work).toBe(spare)
        expect(h.last!.net).toBeLessThan(-0.7)
        expect(h.last!.pnl).toBeLessThan(0)
        expect(-h.last!.pnl).toBeLessThanOrEqual(Math.round(spare * 0.9503))
        expect(payableCash(a, b)).toBeGreaterThanOrEqual(floor - 1)
        expect(b.cash - b.debt).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('books once per fiscal year', () => {
    const { g, a, b } = owned()
    setCompanyFund(g, a.id, { target: 2_000_000 })
    bookHedgeYear(g, a, b, g.year - 1)
    const after = JSON.stringify(g)
    bookHedgeYear(g, a, b, g.year - 1)
    expect(JSON.stringify(g)).toBe(after)
    // The year before is also done.
    bookHedgeYear(g, a, b, g.year - 2)
    expect(JSON.stringify(g)).toBe(after)
    // A new fiscal year books again.
    bookHedgeYear(g, a, b, g.year)
    expect(hedgeOf(b).last!.year).toBe(g.year)
  })

  it('logs the result in a line the player can read', () => {
    const { g, a, b } = owned()
    setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull' })
    bookHedgeYear(g, a, b, g.year - 1)
    const lines = g.log.flatMap((y) => y.entries.map((e) => e.text))
    expect(lines.filter((t) => t.startsWith(`${a.name}'s fund`))).toHaveLength(1)
    expect(lines.find((t) => t.startsWith(`${a.name}'s fund`))).toMatch(/^.+'s fund (made|lost) \S.*\.$/)
  })

  it('with no cash to put to work it records why, logs it and moves nothing', () => {
    const { g, a, b } = owned()
    setCompanyFund(g, a.id, { target: 2_000_000 })
    b.cash = 0
    const income = b.yearIncome
    const costs = b.yearCosts
    bookHedgeYear(g, a, b, g.year - 1)
    const h = hedgeOf(b)
    expect(h.last).toEqual({ year: g.year - 1, work: 0, gross: 0, net: 0, market: 0, pnl: 0, why: 'It has no spare cash.' })
    expect(b.cash).toBe(0)
    expect(b.yearIncome).toBe(income)
    expect(b.yearCosts).toBe(costs)
    expect(h.total).toBe(0)
    const lines = g.log.flatMap((y) => y.entries.map((e) => e.text))
    expect(lines).toContain(`${a.name} had no cash to put to work.`)
    // Done for the year.
    const after = JSON.stringify(g)
    bookHedgeYear(g, a, b, g.year - 1)
    expect(JSON.stringify(g)).toBe(after)
  })

  it('does nothing when the company can no longer hold a fund', () => {
    const { g, a, b } = owned()
    setCompanyFund(g, a.id, { target: 2_000_000 })
    b.share = 0
    const before = JSON.stringify(g)
    bookHedgeYear(g, a, b, g.year - 1)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('the yearly loop books it before the statement and the statement counts it once', () => {
    const { g, a, b } = owned()
    setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull' })
    const fiscal = g.year - 1
    yearlyBusinessImpl(g)
    const h = hedgeOf(b)
    expect(h.last!.year).toBe(fiscal)
    const pnl = h.last!.pnl
    expect(pnl).not.toBe(0)
    expect(b.last!.otherIncome).toBe(pnl > 0 ? pnl : 0)
    expect(b.last!.other).toBe(pnl < 0 ? -pnl : 0)
    // A second pass in the same year changes nothing about the fund.
    const total = h.total
    yearlyBusinessImpl(g)
    expect(hedgeOf(b).total).toBe(total)
  })
})

describe('terms', () => {
  const macro = (): CompanyHedge => ({ v: 1, target: 2_000_000, strategy: 'macro', call: 'bull', lev: 2, total: 0 })

  it('a hired CEO runs the firm autopilot and the owner keeps their stored Macro', () => {
    const { g, a, b } = rig()
    installManager(g, b, managerCandidate(g, b, 80))
    b.manager!.skill = 80
    b.hedge = macro()
    const h = hedgeOf(b)
    expect(companyTerms(g, a, b, h, 2_000_000)).toEqual({ ...autoTerms({ countryId: 'us', lead: 80, nav: 2_000_000, year: g.year }), auto: true })
    bookHedgeYear(g, a, b, g.year - 1)
    const after = hedgeOf(b)
    expect(after.last!.work).toBe(2_000_000)
    expect(after).toMatchObject({ strategy: 'macro', call: 'bull', lev: 2 })
  })

  it('autopilot is Long/Short below skill 50', () => {
    const { g, a, b } = rig()
    installManager(g, b, managerCandidate(g, b, 30))
    b.manager!.skill = 30
    b.hedge = macro()
    expect(companyTerms(g, a, b, hedgeOf(b), 2_000_000)).toEqual({ strategy: 'longShort', call: 'flat', lev: 1, auto: true })
  })

  it("an owner-run Macro year uses the owner's call and then goes back to Long/Short, flat, 1x", () => {
    const { g, a, b } = owned()
    b.hedge = macro()
    expect(companyTerms(g, a, b, hedgeOf(b), 2_000_000)).toEqual({ strategy: 'macro', call: 'bull', lev: 2, auto: false })
    bookHedgeYear(g, a, b, g.year - 1)
    const h = hedgeOf(b)
    expect(h).toMatchObject({ strategy: 'longShort', call: 'flat', lev: 1, target: 2_000_000 })
    expect(h.last!.work).toBe(2_000_000)
    // The year ran on the call (bull at 2x), not on Long/Short.
    const input = { countryId: 'us', call: 'bull' as const, lev: 2, nav: 2_000_000, skill: skillOf(leaderSkill(g, b)), year: g.year }
    const asCalled = vehicleYear(g, { ...input, strategy: 'macro' }, fundRng(g, b, g.year - 1, 'hedgeco'))
    const asLongShort = vehicleYear(g, { ...input, strategy: 'longShort', call: 'flat', lev: 1 }, fundRng(g, b, g.year - 1, 'hedgeco'))
    expect(asCalled.net).not.toBeCloseTo(asLongShort.net, 6)
    expect(h.last!.net).toBeCloseTo(asCalled.net, 12)
    expect(h.last!.pnl).toBe(Math.round(2_000_000 * asCalled.net))
  })

  it('an owner-run Macro call with no cash behind it also lapses', () => {
    const { g, a, b } = owned()
    b.hedge = macro()
    b.cash = 0
    bookHedgeYear(g, a, b, g.year - 1)
    expect(hedgeOf(b)).toMatchObject({ strategy: 'longShort', call: 'flat', lev: 1 })
    expect(hedgeOf(b).last!.work).toBe(0)
  })

  it('a player in prison or under 18 is on autopilot', () => {
    const jailed = owned()
    jailed.b.hedge = macro()
    jailed.g.character.prison = prison()
    expect(companyTerms(jailed.g, jailed.a, jailed.b, hedgeOf(jailed.b), 2_000_000).auto).toBe(true)
    bookHedgeYear(jailed.g, jailed.a, jailed.b, jailed.g.year - 1)
    expect(hedgeOf(jailed.b)).toMatchObject({ strategy: 'macro', call: 'bull', lev: 2 })
    const young = owned()
    young.b.hedge = macro()
    young.g.character.age = 17
    expect(companyTerms(young.g, young.a, young.b, hedgeOf(young.b), 2_000_000).auto).toBe(true)
    const dead = owned()
    dead.b.hedge = macro()
    dead.g.character.alive = false
    expect(companyTerms(dead.g, dead.a, dead.b, hedgeOf(dead.b), 2_000_000).auto).toBe(true)
  })

  it("a company the player doesn't run is on autopilot", () => {
    const { g, a, b } = rig()
    b.hedge = macro()
    const t = companyTerms(g, a, b, hedgeOf(b), 2_000_000)
    expect(t.auto).toBe(true)
    expect(t).toEqual({ ...autoTerms({ countryId: 'us', lead: leaderSkill(g, b), nav: 2_000_000, year: g.year }), auto: true })
  })

  it('a politician never books Macro', () => {
    const g = newLeader(5)
    const c = company(g, { cash: 50_000_000 })
    c.b.founded = g.year - 8
    c.b.hedge = macro()
    expect(macroBlock(g)).not.toBeNull()
    const t = companyTerms(g, c.a, c.b, hedgeOf(c.b), 2_000_000)
    expect(t.strategy).not.toBe('macro')
    expect(t.call).toBe('flat')
    expect(t.lev).toBe(1)
    bookHedgeYear(g, c.a, c.b, g.year - 1)
    expect(hedgeOf(c.b).last!.work).toBe(2_000_000)
  })

  it('stored Quant falls back to Long/Short where Quant is not possible', () => {
    const { g, a, b } = owned(61, 1960)
    b.hedge = { v: 1, target: 1_000_000, strategy: 'quant', call: 'flat', lev: 1, total: 0 }
    expect(companyTerms(g, a, b, hedgeOf(b), 1_000_000)).toEqual({ strategy: 'longShort', call: 'flat', lev: 1, auto: false })
  })
})

describe('nothing happens without a target', () => {
  it('leaves everything alone for no record, a zero target and damaged records', () => {
    const records: unknown[] = [
      undefined,
      { v: 1, target: 0, strategy: 'longShort', call: 'flat', lev: 1, total: 0 },
      'x',
      7,
      [],
      { v: 2, target: 5_000_000 },
      null,
    ]
    for (const raw of records) {
      const { g, a, b } = owned()
      if (raw !== undefined) put(b, raw)
      const before = JSON.stringify(g)
      const rng = g.rng
      const id = g.nextId
      bookHedgeYear(g, a, b, g.year - 1)
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
      expect(g.nextId).toBe(id)
    }
  })

  it('a company with no hedge key goes through the yearly loop as it always did', () => {
    const base = owned()
    const clean = JSON.stringify((() => { yearlyBusinessImpl(base.g); return base.g })())
    expect('hedge' in base.b).toBe(false)
    for (const raw of [{ v: 1, target: 0, strategy: 'longShort', call: 'flat', lev: 1, total: 0 }, 'x']) {
      const other = owned()
      put(other.b, raw)
      yearlyBusinessImpl(other.g)
      delete (other.b as { hedge?: unknown }).hedge
      expect(JSON.stringify(other.g)).toBe(clean)
    }
  })
})

describe('setCompanyFund', () => {
  it('setting a target moves nothing', () => {
    const { g, a, b } = rig()
    const worth = netWorth(g)
    const value = a.value
    const valuation = valuationOf(b)
    const cash = b.cash
    const assets = g.assets.length
    const money = g.character.money
    expect(setCompanyFund(g, a.id, { target: 3_000_000 })).toBe(true)
    expect(netWorth(g)).toBe(worth)
    expect(a.value).toBe(value)
    expect(valuationOf(b)).toBe(valuation)
    expect(b.cash).toBe(cash)
    expect(g.assets).toHaveLength(assets)
    expect(g.character.money).toBe(money)
    expect(setCompanyFund(g, a.id, { target: 0 })).toBe(true)
    expect(netWorth(g)).toBe(worth)
    expect(b.cash).toBe(cash)
  })

  it('creates the record from defaults and says what it will do', () => {
    const { g, a, b } = rig()
    expect(b.hedge).toBeUndefined()
    setCompanyFund(g, a.id, { target: 3_000_000 })
    expect(b.hedge).toEqual({ v: 1, target: 3_000_000, strategy: 'longShort', call: 'flat', lev: 1, total: 0 })
    const n = notices(g, 'Fund Set')
    expect(n).toHaveLength(1)
    expect(n[0].text).toMatch(new RegExp(`^${a.name} will put up to .+ to work at year end\\.$`))
    setCompanyFund(g, a.id, { target: 0 })
    expect(notices(g, 'Fund Set')[1].text).toBe(`${a.name} stopped using a fund.`)
    expect(hedgeOf(b).target).toBe(0)
  })

  it('says nothing when the target does not change', () => {
    const { g, a } = rig()
    setCompanyFund(g, a.id, { target: 3_000_000 })
    setCompanyFund(g, a.id, { target: 3_000_000 })
    setCompanyFund(g, a.id, { strategy: 'event' })
    expect(notices(g, 'Fund Set')).toHaveLength(1)
  })

  it('refuses a bank, an investment firm, a division and a company you own none of', () => {
    const f = firm('hedge')
    expect(setCompanyFund(f.g, f.a.id, { target: 1_000_000 })).toBe(false)
    expect(notices(f.g, 'Cash at Work')[0].text).toBe('Its own fund is on its company screen.')
    expect(f.b.hedge).toBeUndefined()
    const { g, a, b } = rig()
    const bankAsset = createBusinessAsset(g, 'Test Bank', newBiz(g, 'bank', 'us', getCountry('us').cities[0], { cash: 15_000_000, founded: g.year - 3 }), 1e6)
    g.assets.push(bankAsset)
    expect(setCompanyFund(g, bankAsset.id, { target: 1_000_000 })).toBe(false)
    expect(bizOf(g, bankAsset).hedge).toBeUndefined()
    const { members } = listedGroup(g, 'us', 0.6)
    expect(setCompanyFund(g, members[0].id, { target: 1_000_000 })).toBe(false)
    expect(bizOf(g, members[0]).hedge).toBeUndefined()
    b.familyShares = [{ id: 'kin1', share: 1 }]
    b.share = 0
    expect(setCompanyFund(g, a.id, { target: 1_000_000 })).toBe(false)
    expect(b.hedge).toBeUndefined()
  })

  it('refuses for a player who cannot run a company now', () => {
    const jailed = rig()
    jailed.g.character.prison = prison()
    expect(setCompanyFund(jailed.g, jailed.a.id, { target: 1_000_000 })).toBe(false)
    expect(jailed.b.hedge).toBeUndefined()
    const young = rig()
    young.g.character.age = 17
    expect(setCompanyFund(young.g, young.a.id, { target: 1_000_000 })).toBe(false)
    expect(young.b.hedge).toBeUndefined()
    const dead = rig()
    dead.g.character.alive = false
    expect(setCompanyFund(dead.g, dead.a.id, { target: 1_000_000 })).toBe(false)
  })

  it('returns false for an asset that is not a company', () => {
    const { g } = rig()
    expect(setCompanyFund(g, 'nope', { target: 1_000_000 })).toBe(false)
    g.assets.push({ id: 'car1', kind: 'car', name: 'Car', emoji: '🚗', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 40, upkeep: 0, details: {} })
    expect(setCompanyFund(g, 'car1', { target: 1_000_000 })).toBe(false)
  })

  it('clamps a negative or huge target and refuses a broken one', () => {
    const { g, a, b } = rig()
    expect(setCompanyFund(g, a.id, { target: -50 })).toBe(true)
    expect(hedgeOf(b).target).toBe(0)
    expect(setCompanyFund(g, a.id, { target: 1e30 })).toBe(true)
    expect(hedgeOf(b).target).toBe(1e15)
    expect(setCompanyFund(g, a.id, { target: 1234.6 })).toBe(true)
    expect(hedgeOf(b).target).toBe(1235)
    for (const bad of [Number.NaN, Infinity, -Infinity, '5' as unknown as number]) {
      expect(setCompanyFund(g, a.id, { target: bad })).toBe(false)
      expect(hedgeOf(b).target).toBe(1235)
    }
  })

  it('sets Macro with a call and leverage in halves, and a non-Macro strategy resets them', () => {
    const { g, a, b } = rig()
    expect(setCompanyFund(g, a.id, { strategy: 'macro' })).toBe(true)
    expect(hedgeOf(b)).toMatchObject({ strategy: 'macro', call: 'flat', lev: 1 })
    expect(setCompanyFund(g, a.id, { call: 'bear', lev: 2.74 })).toBe(true)
    expect(hedgeOf(b)).toMatchObject({ strategy: 'macro', call: 'bear', lev: 2.5 })
    expect(setCompanyFund(g, a.id, { lev: 9 })).toBe(true)
    expect(hedgeOf(b)).toMatchObject({ strategy: 'macro', call: 'bear', lev: 3 })
    expect(setCompanyFund(g, a.id, { strategy: 'event' })).toBe(true)
    expect(hedgeOf(b)).toMatchObject({ strategy: 'event', call: 'flat', lev: 1 })
    // A call sets Macro.
    expect(setCompanyFund(g, a.id, { call: 'bull' })).toBe(true)
    expect(hedgeOf(b)).toMatchObject({ strategy: 'macro', call: 'bull' })
    // Bad ids change nothing.
    expect(setCompanyFund(g, a.id, { strategy: 'moon' as never })).toBe(false)
    expect(setCompanyFund(g, a.id, { call: 'sideways' as never })).toBe(false)
    expect(hedgeOf(b)).toMatchObject({ strategy: 'macro', call: 'bull' })
  })

  it('keeps what was set when a part of the patch is refused', () => {
    const { g, a, b } = rig(61, 1960)
    setCompanyFund(g, a.id, { target: 2_000_000 })
    const before = JSON.stringify(b.hedge)
    expect(setCompanyFund(g, a.id, { target: 9_000_000, strategy: 'quant' })).toBe(false)
    expect(JSON.stringify(b.hedge)).toBe(before)
  })

  it('refuses Quant where the firm refuses it', () => {
    const { g, a } = rig(61, 1960)
    expect(setCompanyFund(g, a.id, { strategy: 'quant' })).toBe(false)
    expect(notices(g, 'Cash at Work').length).toBeGreaterThan(0)
  })

  it('refuses Macro for an official', () => {
    const g = newLeader(5)
    const c = company(g, { cash: 50_000_000 })
    expect(setCompanyFund(g, c.a.id, { strategy: 'macro' })).toBe(false)
    expect(setCompanyFund(g, c.a.id, { call: 'bull' })).toBe(false)
    expect(c.b.hedge).toBeUndefined()
    expect(notices(g, 'Cash at Work').at(-1)?.text).toBe("Officials can't make market calls.")
    expect(setCompanyFund(g, c.a.id, { target: 1_000_000, strategy: 'event' })).toBe(true)
    expect(hedgeOf(c.b)).toMatchObject({ target: 1_000_000, strategy: 'event' })
  })

  it('repairs a damaged record when the player sets a new one', () => {
    const { g, a, b } = rig()
    put(b, 'junk')
    expect(setCompanyFund(g, a.id, { target: 1_000_000 })).toBe(true)
    expect(b.hedge).toEqual({ v: 1, target: 1_000_000, strategy: 'longShort', call: 'flat', lev: 1, total: 0 })
  })

  it('keeps the last result and the running total when the terms change', () => {
    const { g, a, b } = owned()
    setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull' })
    bookHedgeYear(g, a, b, g.year - 1)
    const h0 = hedgeOf(b)
    setCompanyFund(g, a.id, { target: 1_000_000 })
    const h1 = hedgeOf(b)
    expect(h1.last).toEqual(h0.last)
    expect(h1.total).toBe(h0.total)
    expect(h1.target).toBe(1_000_000)
  })
})

describe('determinism', () => {
  it('the same seed gives the same result', () => {
    const run = (): string => {
      const { g, a, b } = owned(62)
      setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull', lev: 2 })
      bookHedgeYear(g, a, b, g.year - 1)
      return JSON.stringify(hedgeOf(b))
    }
    expect(run()).toBe(run())
  })

  it('each fiscal year has its own noise', () => {
    const r = owned(63)
    setCompanyFund(r.g, r.a.id, { target: 2_000_000 })
    bookHedgeYear(r.g, r.a, r.b, r.g.year - 1)
    const first = hedgeOf(r.b).last!
    bookHedgeYear(r.g, r.a, r.b, r.g.year)
    const second = hedgeOf(r.b).last!
    expect(second.year).toBe(r.g.year)
    expect(second.gross).not.toBeCloseTo(first.gross, 8)
  })

  it('a Time Machine jump rerolls the year', () => {
    const plain = owned(64)
    const forked = owned(64)
    forked.g.flags.timelineForks = [{ year: forked.g.year - 2, salt: 'abc123' }]
    for (const r of [plain, forked]) {
      setCompanyFund(r.g, r.a.id, { target: 2_000_000 })
      bookHedgeYear(r.g, r.a, r.b, r.g.year - 1)
    }
    expect(hedgeOf(forked.b).last!.gross).not.toBeCloseTo(hedgeOf(plain.b).last!.gross, 8)
  })

  it('quotes, blocks, lists and booking never touch g.rng', () => {
    const { g, a, b } = owned()
    const rng = g.rng
    companyBlock(g, a, b)
    companyFloor(g, a, b)
    companyQuote(g, a, b, 1e6)
    companyTerms(g, a, b, { v: 1, target: 1, strategy: 'longShort', call: 'flat', lev: 1, total: 0 }, 1e6)
    eligibleCompanies(g)
    setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull' })
    bookHedgeYear(g, a, b, g.year - 1)
    expect(g.rng).toBe(rng)
  })

  it('renders its readers from a deep-frozen state', () => {
    const { g, a } = owned()
    setCompanyFund(g, a.id, { target: 2_000_000, call: 'bull' })
    const frozen = deepFreeze(structuredClone(g))
    const fa = frozen.assets.find((x) => x.id === a.id)!
    const fb = readBiz(frozen, fa)
    expect(companyBlock(frozen, fa, fb)).toBeNull()
    expect(companyFloor(frozen, fa, fb)).toBeGreaterThan(0)
    expect(companyQuote(frozen, fa, fb, 1_000_000).work).toBe(1_000_000)
    expect(companyTerms(frozen, fa, fb, hedgeOf(fb), 1_000_000).auto).toBe(false)
    expect(eligibleCompanies(frozen)).toHaveLength(1)
    expect(leadOf(frozen, 2000)).toBeGreaterThan(0)
  })

  it('reads the board reserve from a deep-frozen state', () => {
    const { g, a, b } = owned()
    b.share = 0.6
    ;(b as unknown as { board: unknown }).board = { limits: { reserve: 12 } }
    const frozen = deepFreeze(structuredClone(g))
    const fa = frozen.assets.find((x) => x.id === a.id)!
    const fb = readBiz(frozen, fa)
    expect(companyFloor(frozen, fa, fb)).toBe(companyFloor(g, a, b))
    expect(companyQuote(frozen, fa, fb, 1e12)).toEqual(companyQuote(g, a, b, 1e12))
    expect(eligibleCompanies(frozen)).toHaveLength(1)
  })
})
