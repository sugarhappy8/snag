// What a yearly dividend rule would pay, and paying it (auto-dividends task 2): the cash floor, the
// quote and the reason a year pays nothing (all pure), the yearly payment through the manual
// dividend's own money move, and the shape of what it reports. Fixtures come from own-listing-kit.
import { describe, expect, it } from 'vitest'
import { payDividend } from '../src/game/business/board-menu'
import { boardOf } from '../src/game/business/board-state'
import { payableCash, payoutCash, runningCosts } from '../src/game/business/board-vote'
import { simulateBankYear } from '../src/game/business/bank'
import { capitalRatio } from '../src/game/business/bank-model'
import { minCapitalRatio, readBank } from '../src/game/business/bank-state'
import { autoDividendYear, dividendFloor, dividendQuote } from '../src/game/business/dividend-year'
import type { DividendPolicy } from '../src/game/business/dividend-policy'
import { refreshValue, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, findBusiness, stakeValue, type BizState, type Statement } from '../src/game/business/state'
import { num } from '../src/game/business/util'
import { netWorth } from '../src/game/core'
import { gameIncomeTax } from '../src/game/finance'
import { createPerson } from '../src/game/people'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { founder, listed, listedGroup, privateCompany } from './own-listing-kit'

const PROFIT: DividendPolicy = { mode: 'profit', pct: 0.5, keep: 3 }
const CASH: DividendPolicy = { mode: 'cash', pct: 0.5, keep: 3 }

/** A booked year of zeros with a fiscal year and a net profit. */
function stmt(year: number, net: number): Statement {
  return {
    year, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0, revenue: 0, salesTax: 0, netRevenue: 0, cogs: 0, wages: 0, keyStaff: 0,
    rent: 0, marketing: 0, interest: 0, upkeep: 0, other: 0, otherIncome: 0, ownerPay: 0, pbt: 0, corpTax: 0, net, cashErosion: 0, cycle: 1,
    openFraction: 1, employees: 0,
  }
}

/** Last year's books: a year of costs of 12e6, so three months is 3e6. */
function books(g: GameState, b: BizState, net: number): Statement {
  b.last = { ...stmt(g.year - 1, net), netRevenue: 12e6, pbt: 0 }
  return b.last
}

/** A wholly owned private company with 10e6 cash, no debt, a booked 4e6 profit and a value that already counts the cash. */
function rich(g: GameState): { a: Asset; b: BizState; s: Statement } {
  const { a, b } = privateCompany(g)
  b.share = 1
  b.cash = 10e6
  b.debt = 0
  const s = books(g, b, 4e6)
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  return { a, b, s }
}

function bank() {
  const country = 'us'
  const g = makeTestGame(5, { age: 40, money: 500_000_000, countryId: country, city: getCountry(country).cities[0] })
  g.year = 2030
  const b0 = newBiz(g, 'bank', country, getCountry(country).cities[0], { cash: 15_000_000, founded: g.year - 3, ownerSalary: 0 })
  b0.openFraction = 1
  const a = createBusinessAsset(g, 'Test Savings & Loan', b0, b0.cash)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

describe('what a yearly dividend rule pays', () => {
  it('floor is the larger of your months and the board reserve', () => {
    const g = founder()
    const { a, b } = rich(g)
    expect(dividendFloor(g, a, b, 3)).toBe(3e6)
    expect(dividendFloor(g, a, b, 0)).toBe(0)
    expect(dividendFloor(g, a, b, 24)).toBe(24e6)
    expect(dividendFloor(g, a, b, 99)).toBe(24e6)
    expect(dividendFloor(g, a, b, Number.NaN)).toBe(0)
    b.share = 0.6
    boardOf(b).limits.reserve = 6
    expect(dividendFloor(g, a, b, 3)).toBe(6e6)
    expect(dividendFloor(g, a, b, 12)).toBe(12e6)
  })

  it('profit rule: a share of the year, never past the spare cash', () => {
    const g = founder()
    const { a, b } = rich(g)
    expect(runningCosts(b)).toBe(12e6)
    const half = dividendQuote(g, a, b, PROFIT, 4e6)
    expect(half).toMatchObject({ basis: 4e6, floor: 3e6, spare: 7e6, pay: 2e6, why: null })
    expect(dividendQuote(g, a, b, { ...PROFIT, pct: 1 }, 4e6).pay).toBe(4e6)
    const capped = dividendQuote(g, a, b, { ...PROFIT, pct: 1 }, 20e6)
    expect(capped.pay).toBe(7e6)
    expect(capped.why).toBeNull()
  })

  it('cash rule: a share of the spare cash', () => {
    const g = founder()
    const { a, b } = rich(g)
    expect(dividendQuote(g, a, b, CASH, 0)).toMatchObject({ basis: 7e6, spare: 7e6, pay: 3.5e6, why: null })
    expect(dividendQuote(g, a, b, { ...CASH, pct: 1 }, 0).pay).toBe(7e6)
    const none = dividendQuote(g, a, b, { ...CASH, keep: 24 }, 0)
    expect(none.pay).toBe(0)
    expect(none.why).not.toBeNull()
  })

  it('says why nothing is paid', () => {
    const g = founder()
    // 1. A loss year on a profit rule.
    let x = rich(g)
    let q = dividendQuote(g, x.a, x.b, PROFIT, -1e6)
    expect(q.pay).toBe(0)
    expect(q.why).toBe('It made no profit.')
    // 2. Loans as big as the cash.
    x = rich(g)
    x.b.debt = 10e6
    q = dividendQuote(g, x.a, x.b, PROFIT, 4e6)
    expect(q.pay).toBe(0)
    expect(q.why).toBe('Its loans come first.')
    // 3. Investors hold a preference that swallows what the company is worth beyond it.
    x = rich(g)
    x.b.share = 0.5
    x.b.pref = 1e12
    expect(payableCash(x.a, x.b)).toBeGreaterThan(0)
    expect(payoutCash(x.a, x.b)).toBe(0)
    q = dividendQuote(g, x.a, x.b, PROFIT, 4e6)
    expect(q.pay).toBe(0)
    expect(q.why).toBe('Investors are paid back first.')
    // 4. Loans leave less cash than the floor.
    x = rich(g)
    x.b.debt = 9e6
    q = dividendQuote(g, x.a, x.b, PROFIT, 4e6)
    expect(q.pay).toBe(0)
    expect(q.why).toBe('Its cash is at the floor.')
    // 5. No cash at all on a cash rule.
    x = rich(g)
    x.b.cash = 0
    q = dividendQuote(g, x.a, x.b, CASH, 0)
    expect(q.pay).toBe(0)
    expect(q.why).toBe('It has no spare cash.')
  })

  it('cannot be funded by borrowing', () => {
    const g = founder()
    const { a, b } = rich(g)
    const before = dividendQuote(g, a, b, CASH, 0)
    b.debt += 5e6
    b.cash += 5e6
    const after = dividendQuote(g, a, b, CASH, 0)
    expect(after.pay).toBe(before.pay)
    expect(after.spare).toBe(before.spare)
  })

  it('a bank keeps its capital', () => {
    const { g, a, b } = bank()
    simulateBankYear(g, b, g.year - 1, 0)
    b.yearCosts = 0
    b.yearIncome = 0
    b.dividend = { mode: 'profit', pct: 1, keep: 0 }
    const room = payableCash(a, b)
    expect(room).toBeGreaterThan(0)
    expect(dividendQuote(g, a, b, b.dividend, 50e6).spare).toBeLessThanOrEqual(room)
    const s = stmt(g.year - 1, 50e6)
    const out = autoDividendYear(g, a, b, s)
    expect(out?.kind).toBe('paid')
    expect(capitalRatio(b, readBank(b))).toBeGreaterThanOrEqual(minCapitalRatio(b.countryId, g.year) - 1e-6)
    expect(payableCash(a, b)).toBe(0)
  })

  it('pays, and every dollar goes somewhere', () => {
    const g = founder()
    const { a, b, s } = rich(g)
    b.share = 0.6
    b.executiveEquity = 0.05
    const sib = createPerson(g, { relation: 'sibling', age: 40 })
    b.familyShares = [{ id: sib.id, share: 0.1 }]
    refreshValue(a, b)
    b.dividend = { ...PROFIT }
    const money = g.character.money
    const taxable = num(g.flags.taxableIncome)
    const sibMoney = sib.money
    const worth = netWorth(g)
    const out = autoDividendYear(g, a, b, s)
    expect(out?.kind).toBe('paid')
    if (out?.kind !== 'paid') return
    const p = out.paid
    expect(p).toMatchObject({ assetId: a.id, name: a.name, paid: 2e6, mine: 1.2e6, family: 0.2e6, rest: 0.6e6, share: 0.6, perShare: 0, price: null })
    expect(p.mine + p.family + p.rest).toBe(p.paid)
    expect(b.cash).toBe(8e6)
    expect(g.character.money - money).toBe(1.2e6)
    expect(num(g.flags.taxableIncome) - taxable).toBe(1.2e6)
    expect(sib.money - sibMoney).toBeCloseTo(0.16e6, 0)
    expect(bizOf(g, a).dividend?.last).toEqual({ year: s.year, paid: 2e6, mine: 1.2e6, perShare: 0 })
    expect(a.value).toBe(stakeValue(b))
    // The money moved from the stake to the player's pocket, so the net worth does not change.
    expect(Math.abs(netWorth(g) - worth)).toBeLessThanOrEqual(2)
  })

  it('a listed company: the price falls by the payout per share', () => {
    const g = founder()
    const { a, b } = listed(g, { marketCap: 5e9, sharesOut: 1e8, share: 0.6 })
    b.cash = 200e6
    b.debt = 0
    const s = books(g, b, 50e6)
    b.dividend = { ...CASH }
    const price = b.sharePrice
    const out = autoDividendYear(g, a, b, s)
    expect(out?.kind).toBe('paid')
    if (out?.kind !== 'paid') return
    const { paid, perShare } = out.paid
    expect(paid).toBeGreaterThan(0)
    expect(Math.abs(price - b.sharePrice - paid / 1e8)).toBeLessThanOrEqual(0.0101)
    expect(b.valuation).toBe(Math.round(b.sharePrice * 1e8))
    expect(Math.abs(perShare - paid / 1e8)).toBeLessThan(1e-6)
    expect(out.paid.price).toBe(b.sharePrice)
    expect(a.value).toBe(stakeValue(b))
    expect(b.dividend?.last?.perShare).toBe(perShare)
  })

  it('the tax estimate is the margin on the year so far', () => {
    const g = founder()
    const { a, b, s } = rich(g)
    b.dividend = { ...PROFIT, pct: 1 }
    g.flags.taxableIncome = 80_000
    const out = autoDividendYear(g, a, b, s)
    expect(out?.kind).toBe('paid')
    if (out?.kind !== 'paid') return
    const T = num(g.flags.taxableIncome)
    expect(out.paid.mine).toBe(4e6)
    expect(T).toBe(80_000 + 4e6)
    expect(out.paid.tax).toBe(gameIncomeTax(g, T) - gameIncomeTax(g, T - out.paid.mine))
    expect(out.paid.tax).toBeGreaterThan(0)
  })

  it('pays a fiscal year once', () => {
    const g = founder()
    const { a, b, s } = rich(g)
    b.dividend = { ...PROFIT }
    expect(autoDividendYear(g, a, b, s)?.kind).toBe('paid')
    const after = JSON.stringify(g)
    expect(autoDividendYear(g, a, b, s)).toBeNull()
    expect(JSON.stringify(g)).toBe(after)
    const next = autoDividendYear(g, a, b, { ...s, year: s.year + 1 })
    expect(next?.kind).toBe('paid')
    expect(b.dividend?.last?.year).toBe(s.year + 1)
  })

  it('does nothing without a usable rule', () => {
    const cases: [string, (g: GameState) => { a: Asset; b: BizState; s: Statement }][] = [
      ['no rule', (g) => rich(g)],
      ['a string', (g) => { const x = rich(g); x.b.dividend = 'x' as never; return x }],
      ['a weird mode', (g) => { const x = rich(g); x.b.dividend = { mode: 'weird' } as never; return x }],
      ['a division', (g) => {
        const { members } = listedGroup(g, 'us', 0.7)
        const a = members[0]!
        const b = bizOf(g, a)
        b.cash = 50e6
        b.dividend = { ...CASH }
        return { a, b, s: books(g, b, 4e6) }
      }],
      ['no stake', (g) => { const x = rich(g); x.b.share = 0; x.b.dividend = { ...CASH }; return x }],
      ['already paid this year', (g) => { const x = rich(g); x.b.dividend = { ...CASH, last: { year: x.s.year, paid: 1, mine: 1, perShare: 0 } }; return x }],
    ]
    for (const [name, build] of cases) {
      const g = founder()
      const { a, b, s } = build(g)
      const before = JSON.stringify(g)
      expect(autoDividendYear(g, a, b, s), name).toBeNull()
      expect(JSON.stringify(g), name).toBe(before)
    }
  })

  it('skips and says nothing else', () => {
    const g = founder()
    const { a, b, s } = rich(g)
    b.dividend = { ...PROFIT }
    const cash = b.cash
    const money = g.character.money
    const out = autoDividendYear(g, a, b, { ...s, net: -1e6 })
    expect(out).toEqual({ kind: 'skipped', name: a.name, why: 'It made no profit.' })
    expect(b.cash).toBe(cash)
    expect(b.dividend).toEqual(PROFIT)
    expect(g.character.money).toBe(money)
  })

  it('skips when the player part would round to nothing', () => {
    const g = founder()
    const { a, b, s } = rich(g)
    b.share = 0.0002
    b.dividend = { ...CASH, pct: 1 }
    b.cash = 3e6 + 3
    // The company could pay $3, but the player's part of that rounds to nothing.
    expect(dividendQuote(g, a, b, b.dividend, s.net)).toMatchObject({ pay: 3, why: null })
    const out = autoDividendYear(g, a, b, s)
    expect(out?.kind).toBe('skipped')
    if (out?.kind === 'skipped') expect(out.why).toBe('It has no spare cash.')
    expect(b.cash).toBe(3e6 + 3)
    expect(b.dividend?.last).toBeUndefined()
  })

  it('stays finite when a relatives share is damaged', () => {
    const g = founder()
    const { a, b, s } = rich(g)
    b.share = 0.6
    b.familyShares = [{ id: 'nobody', share: Number.NaN }, { id: 'nobody-else', share: -0.2 }]
    b.dividend = { ...PROFIT }
    const out = autoDividendYear(g, a, b, s)
    expect(out?.kind).toBe('paid')
    if (out?.kind !== 'paid') return
    expect(out.paid.family).toBe(0)
    expect(out.paid.rest).toBe(out.paid.paid - out.paid.mine)
  })

  it('is pure where it should be', () => {
    const g = founder()
    const { a, b, s } = rich(g)
    b.share = 0.6
    b.dividend = { ...PROFIT }
    const frozen = deepFreeze(structuredClone(g))
    const fa = findBusiness(frozen, a.id)!
    const fb = bizOf(frozen, fa)
    expect(Number.isFinite(dividendFloor(frozen, fa, fb, 3))).toBe(true)
    for (const profit of [Number.NaN, -5, 1e30, Number.POSITIVE_INFINITY]) {
      const q = dividendQuote(frozen, fa, fb, PROFIT, profit)
      for (const v of [q.basis, q.floor, q.spare, q.pay]) expect(Number.isFinite(v), `${profit}`).toBe(true)
    }
    const clone = structuredClone(g)
    const ca = findBusiness(clone, a.id)!
    const rng = clone.rng
    const ids = clone.nextId
    expect(autoDividendYear(clone, ca, bizOf(clone, ca), s)?.kind).toBe('paid')
    expect(clone.rng).toBe(rng)
    expect(clone.nextId).toBe(ids)
  })

  it('payDividend still does the same thing', () => {
    const g = founder()
    const { a, b } = rich(g)
    const money = g.character.money
    const cash = b.cash
    g.queue = []
    expect(payDividend(g, a, b, 1_000_000)).toBe(true)
    expect(g.character.money - money).toBe(1_000_000)
    expect(cash - b.cash).toBe(1_000_000)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Payday')).toBe(true)
    expect(a.value).toBe(stakeValue(b))
  })
})
