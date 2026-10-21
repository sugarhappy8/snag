// C-09 (docs/FEATURE-ROADMAP.md): "bank long-horizon capital state is not consistently rolled;
// repeated manager calls can duplicate work". A hired CEO's yearly decisions are made once a fiscal
// year behind explicit phase markers, so a second financeManagerTurn in the same phase changes
// nothing. Investment firms already carried their markers (decisionYear, checkYear, actYear); a bank
// had only `planned` (rates) and `campaignYear`, so a second call after the books closed bought
// another product line, opened more branches and ran a campaign on top of the first call's work.
import { describe, expect, it } from 'vitest'
import { simulateBankYear } from '../src/game/business/bank'
import { readBank } from '../src/game/business/bank-state'
import { financeManagerTurn } from '../src/game/business/finance-firm'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { simulateFundYear } from '../src/game/business/fund'
import { readFund, type FundType } from '../src/game/business/fund-state'
import { bizOf, totalOutlets, type BizState } from '../src/game/business/state'
import type { GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { firm } from './fund-fixtures'
import { makeTestGame } from './helpers'

interface BankOpts { country?: string; year?: number; cash?: number; industry?: 'bank' | 'onlineBank'; skill?: number }

/** A bank run by a hired CEO, three years old, with the previous fiscal year already on the books. */
function managedBank(o: BankOpts = {}): { g: GameState; b: BizState } {
  const country = o.country ?? 'us', year = o.year ?? 2030
  const g = makeTestGame(5, { age: 40, money: 500_000_000, countryId: country, city: getCountry(country).cities[0] })
  g.year = year
  const b0 = newBiz(g, o.industry ?? 'bank', country, getCountry(country).cities[0], { cash: o.cash ?? 60_000_000, founded: year - 3, ownerSalary: 0 })
  b0.openFraction = 1
  const a = createBusinessAsset(g, 'Test Savings & Loan', b0, b0.cash)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.ceo = 'manager'
  b.manager = { firstName: 'Ada', lastName: 'Lovelock', gender: 'female', skill: o.skill ?? 90, salary: 150_000, since: year - 3 }
  return { g, b }
}

function settleBank(g: GameState, b: BizState): void {
  simulateBankYear(g, b, g.year - 1, 0)
  b.yearCosts = 0; b.yearIncome = 0
}

/** Everything a manager call could touch, for an exact before/after comparison. */
const snap = (g: GameState, b: BizState): string => JSON.stringify({ b, queue: g.queue, flags: g.flags, rng: g.rng, log: g.log, money: g.character.money })

const BANKS: BankOpts[] = [
  { country: 'us', year: 2030, skill: 90, cash: 60_000_000 },
  { country: 'us', year: 2030, skill: 90, cash: 60_000_000, industry: 'onlineBank' },
  { country: 'de', year: 2012, skill: 80, cash: 80_000_000 },
  { country: 'us', year: 1995, skill: 85, cash: 40_000_000 },
]

describe('C-09: a repeated bank manager call in one fiscal year duplicates no work', () => {
  it('after the books close, a second call buys, opens and spends nothing more', () => {
    for (const o of BANKS) {
      const label = `${o.country} ${o.year} ${o.industry ?? 'bank'}`
      const { g, b } = managedBank(o)
      settleBank(g, b)
      expect(readBank(b).lastYear, label).toBe(g.year - 1)
      const before = { cash: b.cash, costs: b.yearCosts, outlets: totalOutlets(b), products: Object.keys(readBank(b).products).length }
      financeManagerTurn(g, b)
      // The first call must have done real capital work, or this fixture proves nothing.
      expect(b.yearCosts, label).toBeGreaterThan(before.costs)
      const first = { cash: b.cash, costs: b.yearCosts, outlets: totalOutlets(b), products: Object.keys(readBank(b).products).length, json: snap(g, b) }
      financeManagerTurn(g, b)
      expect({ cash: b.cash, costs: b.yearCosts, outlets: totalOutlets(b), products: Object.keys(readBank(b).products).length }, label).toEqual({ cash: first.cash, costs: first.costs, outlets: first.outlets, products: first.products })
      expect(snap(g, b), label).toBe(first.json)
    }
  })

  it('before the books close, a second call changes nothing either', () => {
    for (const o of BANKS) {
      const { g, b } = managedBank(o)
      financeManagerTurn(g, b)
      const first = snap(g, b)
      financeManagerTurn(g, b)
      expect(snap(g, b), `${o.country} ${o.year}`).toBe(first)
    }
  })

  it('stamps the capital phase with the calendar year and leaves the stamp alone on a repeat', () => {
    const { g, b } = managedBank()
    expect(readBank(b).capitalYear).toBe(-1)
    settleBank(g, b)
    financeManagerTurn(g, b)
    const book = readBank(b)
    expect(book.capitalYear).toBe(g.year)
    expect(book.planned).toBe(g.year)
    expect(book.campaignYear).toBeLessThanOrEqual(g.year)
    financeManagerTurn(g, b)
    expect(readBank(b).capitalYear).toBe(g.year)
  })

  it('makes the same years whether the manager is called once or twice in each phase', () => {
    for (const o of [BANKS[0], BANKS[3]]) {
      const play = (calls: number) => {
        const { g, b } = managedBank(o)
        const stamps: number[] = []
        for (let i = 0; i < 8; i++) {
          g.year += 1; g.character.age += 1
          for (let k = 0; k < calls; k++) financeManagerTurn(g, b)
          settleBank(g, b)
          if (b.cash < 0) b.cash = 0
          for (let k = 0; k < calls; k++) financeManagerTurn(g, b)
          stamps.push(readBank(b).capitalYear)
        }
        return { json: snap(g, b), stamps }
      }
      const once = play(1), twice = play(2)
      expect(twice.json, `${o.country} ${o.year}`).toBe(once.json)
      // Each phase marker advances exactly one year at a time.
      const years = Array.from({ length: 8 }, (_, i) => (o.year ?? 2030) + 1 + i)
      expect(once.stamps).toEqual(years)
      expect(twice.stamps).toEqual(years)
    }
  }, 60_000)
})

describe('C-09: the bank capital marker is optional and bounded', () => {
  it('reads a record saved before the marker existed, and clamps a damaged one', () => {
    const { g, b } = managedBank()
    settleBank(g, b)
    const saved = { ...(b.financeFirm as Record<string, unknown>) }
    delete saved.capitalYear
    b.financeFirm = saved as never
    expect(readBank(b).capitalYear).toBe(-1)
    // An old save settled in this year makes its capital choices once, then holds.
    financeManagerTurn(g, b)
    expect(readBank(b).capitalYear).toBe(g.year)
    for (const [bad, want] of [[1e12, 100_000], [-9, -1], ['soon', -1], [null, -1], [2030.4, 2030]] as const) {
      b.financeFirm = { ...(b.financeFirm as Record<string, unknown>), capitalYear: bad } as never
      expect(readBank(b).capitalYear).toBe(want)
    }
  })
})

describe('C-09: a repeated investment firm manager call in one fiscal year duplicates no work', () => {
  const TYPES: FundType[] = ['asset', 'hedge', 'vc', 'broker']

  it('changes nothing on a second call, before or after the books close', () => {
    for (const type of TYPES) {
      for (const settled of [false, true]) {
        const { g, b } = firm(type, { skill: 85, cash: 30_000_000, year: 2026 })
        if (settled) { simulateFundYear(g, b, g.year - 1, 0); b.yearCosts = 0; b.yearIncome = 0 }
        financeManagerTurn(g, b)
        const first = snap(g, b)
        const f = readFund(b)
        if (settled) { expect(f.decisionYear).toBe(g.year); expect(f.checkYear).toBe(g.year) }
        financeManagerTurn(g, b)
        expect(snap(g, b), `${type} settled=${settled}`).toBe(first)
      }
    }
  })

  it('makes the same years whether the manager is called once or twice in each phase', () => {
    for (const type of TYPES) {
      const play = (calls: number) => {
        const { g, b } = firm(type, { skill: 85, cash: 30_000_000, year: 2026 })
        const marks: number[] = []
        for (let i = 0; i < 6; i++) {
          g.year += 1; g.character.age += 1
          for (let k = 0; k < calls; k++) financeManagerTurn(g, b)
          simulateFundYear(g, b, g.year - 1, 0)
          b.yearCosts = 0; b.yearIncome = 0
          for (let k = 0; k < calls; k++) financeManagerTurn(g, b)
          const f = readFund(b)
          marks.push(f.decisionYear, f.checkYear)
        }
        return { json: snap(g, b), marks }
      }
      const once = play(1), twice = play(2)
      expect(twice.json, type).toBe(once.json)
      expect(twice.marks, type).toEqual(once.marks)
    }
  }, 60_000)
})
