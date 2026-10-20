// C-12 (docs/FEATURE-ROADMAP.md): "some finance macro decisions rely on stale booked marks". A hired
// CEO of a bank or investment firm runs twice a year in yearly.ts: once before the fiscal year closes
// (the pre-book pass) and once after (the post-book pass). The window it may observe is last year
// (g.year - 1, the fiscal year being booked, and the only economy year besides this one the live
// economy still keeps) through this year (g.year); nothing may read an older year or a later one.
//
// A bank's CEO derived the year it plans on from the booked stamp (BankBook.lastYear + 1) with no
// window, and from g.year for a book with no stamp yet. So a book that skipped years planned on a
// year the economy no longer keeps (a flat baseline, not the booked marks), a damaged stamp in the
// future planned on a year that hasn't happened, and a new bank's first plan was made before its
// first books closed and stamped as this year's, which made the post-book pass skip planning on the
// results it had just booked.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { simulateBankYear } from '../src/game/business/bank'
import { bankLeaderSkill, bestRates } from '../src/game/business/bank-model'
import { readBank, saveBank } from '../src/game/business/bank-state'
import { financeManagerTurn } from '../src/game/business/finance-firm'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { simulateFundYear } from '../src/game/business/fund'
import { readFund, type FundType } from '../src/game/business/fund-state'
import { bizOf, type BizState } from '../src/game/business/state'
import { ensureEconomy, yearlyEconomy } from '../src/game/economy'
import * as economyModel from '../src/game/economy/model'
import type { GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { firm } from './fund-fixtures'
import { makeTestGame } from './helpers'

afterEach(() => { vi.restoreAllMocks() })

/** The economy years `fn` asked for, sorted and without repeats (a call with no year means g.year). */
function yearsRead(g: GameState, fn: () => void): number[] {
  const spy = vi.spyOn(economyModel, 'economyOf')
  fn()
  const years = new Set(spy.mock.calls.map(c => (c.length >= 3 && typeof c[2] === 'number' ? c[2] : g.year)))
  spy.mockRestore()
  return [...years].sort((x, y) => x - y)
}

/** A bank run by a hired CEO, `founded` the year it opened, with the economy stepped to `year`. */
function managedBank(year: number, founded: number, industry: 'bank' | 'onlineBank' = 'bank'): { g: GameState; b: BizState } {
  const g = makeTestGame(5, { age: 40, money: 500_000_000, countryId: 'us', city: getCountry('us').cities[0] })
  g.year = year
  const b0 = newBiz(g, industry, 'us', getCountry('us').cities[0], { cash: 60_000_000, founded, ownerSalary: 0 })
  b0.openFraction = 1
  const a = createBusinessAsset(g, 'Test Savings & Loan', b0, b0.cash)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.ceo = 'manager'
  b.manager = { firstName: 'Ada', lastName: 'Lovelock', gender: 'female', skill: 90, salary: 150_000, since: founded }
  ensureEconomy(g)
  return { g, b }
}

/** One new year for the economy, as ageUp does it before any business hook runs. */
function newYear(g: GameState): void {
  g.year += 1; g.character.age += 1
  yearlyEconomy(g)
}

/** The bank's books close for the fiscal year that just ended (yearly.ts: simulateYear). */
function closeBooks(g: GameState, b: BizState): void {
  simulateBankYear(g, b, g.year - 1, 0)
  b.yearCosts = 0; b.yearIncome = 0
  if (b.cash < 0) b.cash = 0
}

describe('C-12: a bank CEO observes last year before the books close and this year after, never older or later', () => {
  for (const industry of ['bank', 'onlineBank'] as const) {
    it(`${industry}: every phase of four years stays in the window`, () => {
      const { g, b } = managedBank(2030, 2027, industry)
      // The prior fiscal year is already booked, so the first pass below is an ordinary year.
      closeBooks(g, b)
      for (let i = 0; i < 4; i++) {
        newYear(g)
        const label = `${industry} ${g.year}`
        expect(readBank(b).lastYear, label).toBe(g.year - 2)
        expect(yearsRead(g, () => financeManagerTurn(g, b)), `${label} pre-book`).toEqual([g.year - 1])
        closeBooks(g, b)
        expect(readBank(b).lastYear, label).toBe(g.year - 1)
        expect(yearsRead(g, () => financeManagerTurn(g, b)), `${label} post-book`).toEqual([g.year])
        // The plan for the year just opened was made after the books it rests on closed.
        expect(readBank(b).planned, label).toBe(g.year)
      }
    }, 60_000)
  }

  it('the booked marks a post-book pass reads are all stamped last year, and capital choices wait for them', () => {
    const { g, b } = managedBank(2030, 2027)
    closeBooks(g, b)
    newYear(g)
    // Books still stamped two years back: no capital choice, no campaign, no spending.
    const before = JSON.stringify({ cash: b.cash, costs: b.yearCosts, outlets: b.outlets, fin: readBank(b).products })
    financeManagerTurn(g, b)
    expect(readBank(b).capitalYear).toBe(-1)
    expect(JSON.stringify({ cash: b.cash, costs: b.yearCosts, outlets: b.outlets, fin: readBank(b).products })).toBe(before)
    closeBooks(g, b)
    financeManagerTurn(g, b)
    const book = readBank(b)
    expect([book.lastYear, book.last?.year, b.last?.year, book.hist[book.hist.length - 1]?.y]).toEqual([g.year - 1, g.year - 1, g.year - 1, g.year - 1])
    expect(book.capitalYear).toBe(g.year)
  })

  it('a new bank plans its first year on last year, then plans again on the books it just closed', () => {
    const { g, b } = managedBank(2030, 2030)
    newYear(g)
    expect(b.founded).toBe(g.year - 1)
    expect(readBank(b).lastYear).toBe(-1)
    expect(yearsRead(g, () => financeManagerTurn(g, b))).toEqual([g.year - 1])
    expect(readBank(b).planned).toBe(g.year - 1)
    closeBooks(g, b)
    // What a planner would pick on the books that just closed (it reads them, it doesn't write them).
    const best = bestRates(g, b, g.year)
    expect(yearsRead(g, () => financeManagerTurn(g, b))).toEqual([g.year])
    // The post-book pass planned: the stamp moved on and the rates are the best ones for the booked books.
    expect(readBank(b).planned).toBe(g.year)
    const book = readBank(b)
    const err = (100 - bankLeaderSkill(g, b)) / 100 * .01
    expect(Math.abs(book.savingsGap - best.savingsGap)).toBeLessThanOrEqual(err + 1e-9)
    expect(Math.abs(book.loanGap - best.loanGap)).toBeLessThanOrEqual(err + 1e-9)
  })

  it('a book that skipped years plans on last year, the oldest year the economy still keeps', () => {
    for (const gap of [2, 3, 8, 40]) {
      const { g, b } = managedBank(2030, 2027)
      closeBooks(g, b)
      newYear(g)
      saveBank(b, { ...readBank(b), lastYear: g.year - 1 - gap })
      expect(yearsRead(g, () => financeManagerTurn(g, b)), `lastYear = g.year - ${1 + gap}`).toEqual([g.year - 1])
      expect(readBank(b).planned).toBe(g.year - 1)
      // And books still stamped that far back make no capital choice.
      expect(readBank(b).capitalYear).toBe(-1)
    }
  })

  it('a damaged stamp from the future never makes the CEO read a year that has not happened', () => {
    for (const ahead of [1, 5, 500, 90_000]) {
      const { g, b } = managedBank(2030, 2027)
      closeBooks(g, b)
      newYear(g)
      saveBank(b, { ...readBank(b), lastYear: g.year + ahead })
      const read = yearsRead(g, () => financeManagerTurn(g, b))
      expect(Math.max(...read), `lastYear = g.year + ${ahead}`).toBeLessThanOrEqual(g.year)
      expect(Math.min(...read)).toBeGreaterThanOrEqual(g.year - 1)
      expect(readBank(b).planned).toBeLessThanOrEqual(g.year)
    }
  })

  it('a bank with a track record keeps the plan it made after the books closed through the next pre-book pass', () => {
    const { g, b } = managedBank(2030, 2027)
    closeBooks(g, b)
    for (let i = 0; i < 3; i++) {
      newYear(g)
      financeManagerTurn(g, b)
      closeBooks(g, b)
      financeManagerTurn(g, b)
      const planned = readBank(b).planned
      expect(planned).toBe(g.year)
      // The next year's pre-book pass sees the stamp for the fiscal year it is about to book and leaves the plan alone.
      const gaps = [readBank(b).savingsGap, readBank(b).loanGap, readBank(b).appetite]
      g.year += 1; g.character.age += 1; yearlyEconomy(g)
      financeManagerTurn(g, b)
      expect([readBank(b).savingsGap, readBank(b).loanGap, readBank(b).appetite]).toEqual(gaps)
      expect(readBank(b).planned).toBe(g.year - 1)
      closeBooks(g, b)
      financeManagerTurn(g, b)
      expect(readBank(b).planned).toBe(g.year)
    }
  }, 60_000)
})

describe('C-12: an investment firm CEO reads no year outside the window and decides after the books close only', () => {
  const TYPES: FundType[] = ['asset', 'hedge', 'vc', 'broker']

  it('stays in the window through three years of both passes, and stamps this year only after the books close', () => {
    for (const type of TYPES) {
      const { g, b } = firm(type, { skill: 85, cash: 30_000_000, year: 2026 })
      ensureEconomy(g)
      for (let i = 0; i < 3; i++) {
        newYear(g)
        const label = `${type} ${g.year}`
        const pre = yearsRead(g, () => financeManagerTurn(g, b))
        expect(pre.every(y => y >= g.year - 1 && y <= g.year), `${label} pre-book ${pre}`).toBe(true)
        expect(readFund(b).lastYear, label).toBe(i === 0 ? -1 : g.year - 2)
        // Before the fiscal year closes the CEO has no new post-book decision to stamp.
        expect(readFund(b).decisionYear, label).toBeLessThan(g.year)
        expect(readFund(b).checkYear, label).toBeLessThan(g.year)
        simulateFundYear(g, b, g.year - 1, 0)
        b.yearCosts = 0; b.yearIncome = 0
        expect(readFund(b).lastYear, label).toBe(g.year - 1)
        const post = yearsRead(g, () => financeManagerTurn(g, b))
        expect(post.every(y => y >= g.year - 1 && y <= g.year), `${label} post-book ${post}`).toBe(true)
        expect(readFund(b).decisionYear, label).toBe(g.year)
        expect(readFund(b).checkYear, label).toBe(g.year)
      }
    }
  }, 60_000)

  it('makes no post-book decision, check or campaign off books stamped older than last year', () => {
    for (const type of TYPES) {
      const { g, b } = firm(type, { skill: 85, cash: 30_000_000, year: 2026 })
      ensureEconomy(g)
      newYear(g)
      simulateFundYear(g, b, g.year - 1, 0)
      b.yearCosts = 0; b.yearIncome = 0
      // Two more years pass with no books closed: the stamp is now three years behind.
      newYear(g); newYear(g)
      expect(readFund(b).lastYear).toBe(g.year - 3)
      const before = { cash: b.cash, costs: b.yearCosts, ...pick(readFund(b)), queue: g.queue.length }
      const read = yearsRead(g, () => financeManagerTurn(g, b))
      expect(read.every(y => y >= g.year - 1 && y <= g.year), `${type} ${read}`).toBe(true)
      expect({ cash: b.cash, costs: b.yearCosts, ...pick(readFund(b)), queue: g.queue.length }, type).toEqual(before)
    }
  })
})

/** The stamps and spending a post-book decision would move. */
function pick(f: ReturnType<typeof readFund>): { decisionYear: number; checkYear: number; campaign: number; boost: number; funds: number; cos: number } {
  return { decisionYear: f.decisionYear, checkYear: f.checkYear, campaign: f.campaign, boost: f.boost, funds: f.funds.length, cos: f.cos.length }
}
