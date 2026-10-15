// Integration checks for the hedge funds that sit between the modules: what a company's fund result does
// to the company's value (it is cash, so it counts once), and the readers that carry that result.
import { describe, expect, it } from 'vitest'
import { valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { setCompanyFund } from '../src/game/business/hedge-company'
import { hedgeProfitIn, hedgeResultFor, readCompanyHedge } from '../src/game/business/hedge-record'
import { normalizeBiz, bizOf, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Asset, Json, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { company, rich } from './hedge-kit'

function birthday(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyBusinessImpl(g)
}

function bizIn(g: GameState, id: string): { a: Asset; b: BizState } {
  const a = g.assets.find((x) => x.id === id)
  if (!a) throw new Error('no company')
  return { a, b: bizOf(g, a) }
}

describe('a company fund and the value of the company', () => {
  // A fund result is cash the company already holds. The company's value counts that cash once: the
  // result is not capitalized as yearly earnings, the way one-off franchise fees are not.
  it.each([2003, 2009, 2013, 2019, 2021])('the value moves by the cash and no more (%i)', (year) => {
    const g = rich(61, 'us', 5_000_000, year)
    const { a } = company(g, { cash: 40_000_000, profit: 20e6 })
    const without = structuredClone(g)
    expect(setCompanyFund(g, a.id, { target: 20_000_000 })).toBe(true)
    for (const x of [g, without]) birthday(x)
    const withFund = bizIn(g, a.id).b
    const base = bizIn(without, a.id).b
    const pnl = readCompanyHedge(withFund.hedge)?.last?.pnl ?? 0
    expect(Math.abs(pnl)).toBeGreaterThan(100_000)
    const cash = withFund.cash - base.cash
    const worth = valuationOf(withFund) - valuationOf(base)
    // The cash differs by the result less the tax on it; the value follows that cash, not a multiple of it.
    expect(Math.abs(worth - cash)).toBeLessThanOrEqual(Math.abs(pnl) * 0.01 + 100)
  })

  // Deep-tech companies work out their own value from their profit, so the same rule has to hold there.
  it.each(['biotech', 'semiconductor', 'gameStudio', 'restaurant'] as const)('a %s is valued by the cash too, in each of its first years', (industry) => {
    for (const year of [2009, 2013]) {
      const g = rich(61, 'us', 5_000_000, year)
      const a = createBusinessAsset(g, 'Lab Co', newBiz(g, industry, 'us', getCountry('us').cities[0], { cash: 80_000_000, founded: g.year - 8 }), 1e6)
      g.assets.push(a)
      const without = structuredClone(g)
      expect(setCompanyFund(g, a.id, { target: 30_000_000 })).toBe(true)
      for (let i = 0; i < 3; i++) {
        for (const x of [g, without]) birthday(x)
        const withFund = bizIn(g, a.id).b
        const base = bizIn(without, a.id).b
        const pnl = readCompanyHedge(withFund.hedge)?.last?.pnl ?? 0
        const cash = withFund.cash - base.cash
        const worth = valuationOf(withFund) - valuationOf(base)
        expect(Math.abs(worth - cash), `${industry} ${g.year}, result ${pnl}`).toBeLessThanOrEqual(Math.abs(pnl) * 0.02 + 1000)
      }
    }
  })

  it('stays honest for as long as the years stay in the three-year window', () => {
    const g = rich(61, 'us', 5_000_000, 2009)
    const { a } = company(g, { cash: 40_000_000, profit: 20e6 })
    const without = structuredClone(g)
    expect(setCompanyFund(g, a.id, { target: 10_000_000 })).toBe(true)
    for (let i = 0; i < 5; i++) {
      for (const x of [g, without]) birthday(x)
      const withFund = bizIn(g, a.id).b
      const base = bizIn(without, a.id).b
      const pnl = readCompanyHedge(withFund.hedge)?.last?.pnl ?? 0
      const cash = withFund.cash - base.cash
      const worth = valuationOf(withFund) - valuationOf(base)
      // The base company keeps its own cash, so the two drift apart only by what the fund made and the tax on it.
      expect(Math.abs(worth - cash), `year ${g.year}, result ${pnl}`).toBeLessThanOrEqual(Math.max(Math.abs(cash), Math.abs(pnl)) * 0.15 + 1000)
    }
  })

  it('a company with no fund is valued exactly as before', () => {
    const g = rich(61, 'us', 5_000_000, 2013)
    const { a, b } = company(g, { cash: 40_000_000, profit: 20e6 })
    const before = valuationOf(b)
    expect(hedgeResultFor(b, 2012)).toBe(0)
    expect(valuationOf(bizIn(g, a.id).b)).toBe(before)
  })
})

describe('how much of a year\'s profit was the fund', () => {
  const hedge = { v: 1, target: 1, strategy: 'longShort', call: 'flat', lev: 1, total: 0, marks: [{ y: 2020, pnl: 200 }, { y: 2021, pnl: -200 }, { y: 2022, pnl: 300 }] }

  it('is the whole result when the year paid no tax', () => {
    expect(hedgeProfitIn({ hedge }, { year: 2020, profit: 700, tax: 0 })).toBe(200)
    expect(hedgeProfitIn({ hedge }, { year: 2021, profit: -900, tax: 0 })).toBe(-200)
  })

  it('is the result less the tax it added when the year was taxed', () => {
    // 1000 before tax at 25%: without the 200 the year would have paid 200, so the fund added 50 of tax.
    expect(hedgeProfitIn({ hedge }, { year: 2020, profit: 750, tax: 250 })).toBeCloseTo(150, 9)
    // A loss saves tax: 1000 before tax at 25% would have been 1200 without it.
    expect(hedgeProfitIn({ hedge }, { year: 2021, profit: 750, tax: 250 })).toBeCloseTo(-150, 9)
  })

  it('is capped by the profit it made possible when the year would have been a loss without it', () => {
    // 100 before tax, 25 paid: without the 300 the year had no profit and no tax.
    expect(hedgeProfitIn({ hedge }, { year: 2022, profit: 75, tax: 25 })).toBeCloseTo(275, 9)
  })

  it('is nothing for a year with no result, no record or a damaged one', () => {
    expect(hedgeProfitIn({ hedge }, { year: 2019, profit: 750, tax: 250 })).toBe(0)
    expect(hedgeProfitIn({}, { year: 2020, profit: 750, tax: 250 })).toBe(0)
    expect(hedgeProfitIn({ hedge: 'junk' }, { year: 2020, profit: 750, tax: 250 })).toBe(0)
    expect(hedgeProfitIn({ hedge }, { year: 2020, profit: NaN, tax: 250 })).toBe(200)
  })
})

describe('the record of what a fund made each year', () => {
  const good = { v: 1, target: 5, strategy: 'event', call: 'flat', lev: 1, total: 9 }

  it('keeps the last three booked years and reads a result by year', () => {
    const raw = { ...good, marks: [{ y: 2020, pnl: 1 }, { y: 2021, pnl: -2 }, { y: 2022, pnl: 3 }, { y: 2023, pnl: 4.6 }] }
    const h = readCompanyHedge(JSON.parse(JSON.stringify(raw)))
    expect(h?.marks).toEqual([{ y: 2021, pnl: -2 }, { y: 2022, pnl: 3 }, { y: 2023, pnl: 5 }])
    expect(hedgeResultFor({ hedge: raw }, 2022)).toBe(3)
    expect(hedgeResultFor({ hedge: raw }, 2020)).toBe(0)
    expect(hedgeResultFor({ hedge: raw }, 1999)).toBe(0)
  })

  it('drops damage without losing the rest of the record', () => {
    const hostile: unknown[] = [
      'x', 7, null, [], [{ y: 'a', pnl: 1 }], [{ y: 2020.5, pnl: 1 }], [{ y: 1700, pnl: 1 }], [{ y: 2020, pnl: NaN }], [{ y: 2020 }],
      [null, 3, { y: 2021, pnl: 1e30 }],
    ]
    for (const marks of hostile) {
      const h = readCompanyHedge({ ...good, marks })
      expect(h, JSON.stringify(marks)).not.toBeNull()
      expect(h?.target).toBe(5)
      for (const m of h?.marks ?? []) {
        expect(Number.isInteger(m.y)).toBe(true)
        expect(Number.isFinite(m.pnl)).toBe(true)
        expect(Math.abs(m.pnl)).toBeLessThanOrEqual(1e15)
      }
    }
    expect(readCompanyHedge({ ...good, marks: 'x' }) && 'marks' in readCompanyHedge({ ...good, marks: 'x' })!).toBe(false)
    expect(hedgeResultFor({ hedge: { ...good, marks: [{ y: 2020, pnl: NaN }] } }, 2020)).toBe(0)
  })

  it('merges a year that is listed twice, and never mutates its input', () => {
    const raw = Object.freeze({ ...good, marks: Object.freeze([Object.freeze({ y: 2020, pnl: 1 }), Object.freeze({ y: 2020, pnl: 6 })]) })
    expect(readCompanyHedge(raw)?.marks).toEqual([{ y: 2020, pnl: 6 }])
  })

  it('survives the loader and a round trip', () => {
    const g = rich(61, 'us', 5_000_000, 2013)
    const { a } = company(g, { cash: 40_000_000 })
    const marks = [{ y: 2011, pnl: 10 }, { y: 2012, pnl: -20 }]
    const kept = normalizeBiz({ ...a.details, hedge: { ...good, marks } } as Record<string, Json>, 2013)
    expect(kept.hedge?.marks).toEqual(marks)
    expect(JSON.parse(JSON.stringify(kept)).hedge.marks).toEqual(marks)
  })

  it('is written by the booking, once for each fiscal year', () => {
    const g = rich(61, 'us', 5_000_000, 2013)
    const { a } = company(g, { cash: 40_000_000 })
    expect(setCompanyFund(g, a.id, { target: 10_000_000 })).toBe(true)
    birthday(g)
    const h = readCompanyHedge(bizIn(g, a.id).b.hedge)
    expect(h?.last?.year).toBe(g.year - 1)
    expect(h?.marks).toEqual([{ y: g.year - 1, pnl: h?.last?.pnl }])
    expect(hedgeResultFor(bizIn(g, a.id).b, g.year - 1)).toBe(h?.last?.pnl)
  })
})
