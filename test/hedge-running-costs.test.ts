// A company fund's loss is booked through the year's costs (yearCosts), but it is not a running cost:
// the floors built on runningCosts (the fund's six months, the dividend rule's Cash to Keep, the board's
// reserve) must not jump after a bad fund year. Same shape as hedge-integration.test.ts: the same
// company with and without a fund, one year later.
import { describe, expect, it } from 'vitest'
import { boardView } from '../src/game/business/board-state'
import { reserveDollars, runningCosts } from '../src/game/business/board-vote'
import { dividendFloor } from '../src/game/business/dividend-year'
import { companyFloor, setCompanyFund } from '../src/game/business/hedge-company'
import { readCompanyHedge } from '../src/game/business/hedge-record'
import { bizOf, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Asset, GameState } from '../src/game/types'
import { company, rich } from './hedge-kit'

function birthday(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyBusinessImpl(g)
}

/** The same US software company twice, one year on: with a 60M fund (120M cash) and without. */
function yearOn(year: number): { g: GameState; a: Asset; b: BizState; base: GameState; baseA: Asset; baseB: BizState; pnl: number } {
  const g = rich(61, 'us', 5_000_000, year)
  const { a } = company(g, { cash: 120_000_000, profit: 20e6 })
  const base = structuredClone(g)
  expect(setCompanyFund(g, a.id, { target: 60_000_000 })).toBe(true)
  birthday(g)
  birthday(base)
  const b = bizOf(g, g.assets.find((x) => x.id === a.id)!)
  const baseA = base.assets.find((x) => x.id === a.id)!
  const pnl = readCompanyHedge(b.hedge)?.last?.pnl ?? 0
  return { g, a: g.assets.find((x) => x.id === a.id)!, b, base, baseA, baseB: bizOf(base, baseA), pnl }
}

/** What each floor reads from the books, for a company. */
function floors(g: GameState, a: Asset, b: BizState) {
  return { running: runningCosts(b), dividend: dividendFloor(g, a, b, 3), sleeve: companyFloor(g, a, b), reserve: reserveDollars(b, boardView(g, a, b)) }
}

describe('a company fund and the running costs', () => {
  it.each([2001, 2019, 2021])('a loss year leaves every floor where the same company without a fund has it (%i)', (year) => {
    const x = yearOn(year)
    expect(x.pnl).toBeLessThan(-1_000_000)
    // The loss is in the statement's costs, so the books really do differ.
    expect(x.b.last!.other - x.baseB.last!.other).toBe(-x.pnl)
    const withFund = floors(x.g, x.a, x.b)
    const without = floors(x.base, x.baseA, x.baseB)
    expect(withFund.running).toBe(without.running)
    expect(withFund.dividend).toBe(without.dividend)
    expect(withFund.sleeve).toBe(without.sleeve)
    expect(withFund.reserve).toBe(without.reserve)
  })

  it.each([2002, 2008, 2013])('a gain year leaves them there too (%i)', (year) => {
    const x = yearOn(year)
    expect(x.pnl).toBeGreaterThan(1_000_000)
    expect(floors(x.g, x.a, x.b)).toEqual(floors(x.base, x.baseA, x.baseB))
  })

  it('a company with no fund reads its books as before', () => {
    const g = rich(61, 'us', 5_000_000, 2019)
    const { a } = company(g, { cash: 120_000_000, profit: 20e6 })
    birthday(g)
    const b = bizOf(g, a)
    const s = b.last!
    expect(b.hedge).toBeUndefined()
    expect(runningCosts(b)).toBe(s.netRevenue + s.otherIncome - s.pbt)
  })

  it('only the last booked year\'s result comes out, and a damaged record comes out as nothing', () => {
    const g = rich(61, 'us', 5_000_000, 2019)
    const { a } = company(g, { cash: 120_000_000, profit: 20e6 })
    birthday(g)
    const b = bizOf(g, a)
    const s = b.last!
    const plain = s.netRevenue + s.otherIncome - s.pbt
    const hedge = { v: 1, target: 1, strategy: 'longShort', call: 'flat', lev: 1, total: 0 }
    const loss = Math.round(plain / 4)
    // A loss in another year is not this year's cost; a gain in this one cancels out of the books already.
    b.hedge = { ...hedge, marks: [{ y: s.year - 1, pnl: -loss }, { y: s.year, pnl: 2_000_000 }] } as never
    expect(runningCosts(b)).toBe(plain)
    // This year's loss is booked in the costs, so it comes out of them.
    b.hedge = { ...hedge, marks: [{ y: s.year - 1, pnl: -1 }, { y: s.year, pnl: -loss }] } as never
    expect(runningCosts(b)).toBe(plain - loss)
    b.hedge = 'junk' as never
    expect(runningCosts(b)).toBe(plain)
  })
})
