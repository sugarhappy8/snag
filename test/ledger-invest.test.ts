// R2-L13 (A.K1 f): the markets book their dollars with a named counterparty.
//
//   F37  a bond redeems at its eroded face value (par), never at its marked price, and the government that issued it pays, less any
//        default haircut. The marked price is pulled to par, so it equals par in the maturity year.
//   F38  a realized gain is taxed at the nation's capital gains rate at the sale, to gov:<country> through the ledger; it no longer
//        passes through taxable income. The nation's transactions law is charged on every trade (never on a year-end close).
//   Payers of income: a coupon from the issuing government, a deposit's interest from the banks, a dividend from the markets.
//   Spreads: a buy then a sale in the same year loses money in every market that has a fee or a spread.
//
// Not in the fast tier: the bond scenarios play ten years of the investments module.
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What a scenario makes the market do each year (undefined: the real engine). Read at call time, so a test sets it before it plays. */
const over = vi.hoisted(() => ({
  fx: null as null | ((year: number) => { dep?: number; bondMove?: number; defaulted?: boolean; haircut?: number }),
}))

// The spy pattern of foresight-scan.test.ts and analyst-tip.test.ts: the real engine, with fxYear's bond terms overridden.
vi.mock('../src/game/invest/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/invest/engine')>()
  return {
    ...real,
    fxYear: (...args: Parameters<typeof real.fxYear>) => {
      const r = real.fxYear(...args)
      return over.fx ? { ...r, ...over.fx(args[2]) } : r
    },
  }
})

import { capitalGainsRate } from '../src/game/business/exit'
import { formatMoney } from '../src/game/core'
import { buySecurity, investmentHoldings, investmentListing, sellHolding, yearlyInvestments, liquidatePortfolio } from '../src/game/investments'
import { flowsOf } from '../src/game/kernel/ledger'
import { editPolicy, writePolicy } from '../src/game/nation/state'
import type { Asset, GameState, NoticeModal } from '../src/game/types'
import '../src/game/world/shards'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'
import { makeTestGame } from './helpers'

const START = 2026
const FACE = 1_000

beforeEach(() => {
  over.fx = null
})

function life(countryId = 'us', money = 2_000_000): GameState {
  const g = makeTestGame(7, { age: 30, money, countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = 'ledger-invest'
  return g
}

/** One year of the investments module alone (the pass of investments.test.ts). */
function passYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.queue = []
  yearlyInvestments(g)
}

function listed(g: GameState, type: string) {
  const q = investmentListing(g).find((x) => x.type === type)
  if (!q) throw new Error(`no ${type} for sale`)
  return q
}

/** A bond held for ten years, paying no coupon, with a small cost basis so that a redemption at par is a taxable gain. */
function bondLife(countryId = 'us'): { g: GameState; a: Asset; units: number; basis: number } {
  const g = life(countryId)
  expect(buySecurity(g, listed(g, 'bond').secId, 100_000, true)).toBe(true)
  const a = investmentHoldings(g)[0]
  a.details.yield = 0
  a.details.basis = 20_000
  a.purchasePrice = 20_000
  return { g, a, units: a.details.units as number, basis: 20_000 }
}

/** The lines of the log, newest year last. */
function lines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

const ROW = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length

describe('F37: a bond redeems at par, less any default haircut, paid by the issuing government', () => {
  it('pays par however far the market marked the bond above it', () => {
    over.fx = () => ({ dep: 0, bondMove: 0.3, defaulted: false, haircut: 0 })
    const { g, a, units, basis } = bondLife()
    let peak = 0
    for (let i = 0; i < 9; i++) {
      passYear(g)
      peak = Math.max(peak, a.details.price as number)
    }
    // The marked price ran far above par before it was pulled back.
    expect(peak).toBeGreaterThan(FACE * 1.5)
    const before = g.character.money
    passYear(g)
    expect(g.year).toBe(START + 10)
    expect(investmentHoldings(g)).toHaveLength(0)
    const paid = Math.round(units * FACE)
    const tax = Math.round((paid - basis) * capitalGainsRate(g))
    expect(a.details.par).toBe(FACE)
    expect(g.character.money - before).toBe(paid - tax)
    expect(flowTotal(g, 'bond.redeem', 'gov')).toBe(-paid)
    expect(flowTotal(g, 'tax.capgains', 'gov')).toBe(tax)
    expect(lines(g).some((l) => l.includes(`paid me back ${formatMoney(paid)}`))).toBe(true)
    expect(ROW(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('pays par less the haircut in a default year', () => {
    over.fx = (year) => ({ dep: 0, bondMove: 0, defaulted: year === START + 3, haircut: 0.4 })
    const { g, a, units, basis } = bondLife()
    for (let i = 0; i < 9; i++) passYear(g)
    expect(a.details.par).toBeCloseTo(FACE * 0.6, 9)
    const before = g.character.money
    passYear(g)
    const paid = Math.round(units * FACE * 0.6)
    const tax = Math.round((paid - basis) * capitalGainsRate(g))
    expect(g.character.money - before).toBe(paid - tax)
    expect(flowTotal(g, 'bond.redeem', 'gov')).toBe(-paid)
    expectConserved(g)
  })

  it('pays par eroded by the money it is paid in', () => {
    over.fx = () => ({ dep: 0.05, bondMove: 0, defaulted: false, haircut: 0 })
    const { g, a, units, basis } = bondLife()
    for (let i = 0; i < 9; i++) passYear(g)
    let par = FACE
    for (let i = 0; i < 10; i++) par *= 1 - 0.05
    const before = g.character.money
    passYear(g)
    const paid = Math.round(units * par)
    const tax = paid > basis ? Math.round((paid - basis) * capitalGainsRate(g)) : 0
    expect(a.details.par).toBeCloseTo(par, 9)
    expect(g.character.money - before).toBe(paid - tax)
    expect(flowTotal(g, 'bond.redeem', 'gov')).toBe(-paid)
    expectConserved(g)
  })

  it('lets face value rise with falling prices, but never past three times the issue', () => {
    over.fx = () => ({ dep: -0.5, bondMove: 0, defaulted: false, haircut: 0 })
    const { g, a, units } = bondLife()
    for (let i = 0; i < 10; i++) passYear(g)
    expect(a.details.par).toBe(FACE * 3)
    expect(flowTotal(g, 'bond.redeem', 'gov')).toBe(-Math.round(units * FACE * 3))
  })

  it('names the government that issued the bond, not the one the holder lives under now', () => {
    over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
    const { g, units } = bondLife('us')
    for (let i = 0; i < 9; i++) passYear(g)
    g.character.countryId = 'gb'
    const us = acctOf(g, 'gov:us')
    const gb = acctOf(g, 'gov:gb')
    passYear(g)
    const paid = Math.round(units * FACE)
    expect(acctOf(g, 'gov:us') - us).toBe(-paid)
    // The tax is the holder's country's: it reaches gov:gb, whose rate applies.
    expect(acctOf(g, 'gov:gb') - gb).toBeGreaterThan(0)
    expectConserved(g)
  })

  it('an old holding with no par starts at its eroded mark, never more than a thousand', () => {
    over.fx = () => ({ dep: 0.05, bondMove: 0.3, defaulted: false, haircut: 0 })
    const { g, a, units } = bondLife()
    expect(a.details.par).toBeUndefined()
    a.details.price = 700
    a.value = Math.round(units * 700)
    a.details.maturity = g.year + 1
    passYear(g)
    expect(a.details.par).toBeCloseTo(700 * 0.95, 9)
    expect(flowTotal(g, 'bond.redeem', 'gov')).toBe(-Math.round(units * 700 * 0.95))
    // A holding marked above a thousand is paid a thousand, not its mark.
    const h = bondLife()
    h.a.details.price = 1_300
    h.a.value = Math.round(h.units * 1_300)
    h.a.details.maturity = h.g.year + 1
    over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
    passYear(h.g)
    expect(h.a.details.par).toBe(FACE)
    expect(flowTotal(h.g, 'bond.redeem', 'gov')).toBe(-Math.round(h.units * FACE))
  })

  it('treats a damaged par as absent', () => {
    over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
    for (const junk of ['x', -5, 1e300, Number.NaN, 0, 4_000, null, [1], { a: 1 }]) {
      const { g, a } = bondLife()
      a.details.par = junk as never
      passYear(g)
      expect(a.details.par, `par ${String(junk)}`).toBe(FACE)
    }
  })
})

describe('F37: a damaged country on a bond', () => {
  it('falls back to the default payer and never throws', () => {
    over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
    for (const junk of ['bad country!', '', 'a:b c', 'x'.repeat(80)]) {
      const { g, a, units } = bondLife()
      a.details.country = junk
      a.details.maturity = g.year + 1
      a.details.yield = 0.04
      expect(() => passYear(g), junk).not.toThrow()
      expect(investmentHoldings(g)).toHaveLength(0)
      // The reason's own default pays: the holder's government, in the holder's country.
      expect(flowTotal(g, 'bond.redeem', 'gov')).toBe(-Math.round(units * FACE))
      // So does the coupon of the same year.
      expect(flowTotal(g, 'invest.income', 'gov')).toBeLessThan(0)
      expect(ROW(g, 'unreasoned')).toBe(0)
      expectConserved(g)
    }
  })
})

describe('F38: capital gains and the transactions law reach the government through the ledger', () => {
  /** Buys $50,000 of one stock, doubles its price and carries `carry` of old losses; returns the life and the holding. */
  function stockLife(carry = 0): { g: GameState; a: Asset } {
    const g = life()
    g.flags.taxableIncome = 80_000
    expect(buySecurity(g, listed(g, 'stock').secId, 50_000, true)).toBe(true)
    const a = investmentHoldings(g)[0]
    a.details.price = (a.details.price as number) * 2
    a.value = Math.round((a.details.units as number) * (a.details.price as number))
    if (carry) g.flags.investLossCarry = carry
    return { g, a }
  }

  it('books tax.capgains at the capital gains rate on the gain after carried losses, and not through taxable income', () => {
    const { g, a } = stockLife(5_000)
    const basis = a.details.basis as number
    const income = g.flags.taxableIncome
    const paid = g.flags.taxesPaid
    const before = booksOf(g)
    const gov = acctOf(g, 'gov:us')
    const cash = g.character.money
    expect(sellHolding(g, a.id, 'all', true)).toBe(true)
    const net = -flowTotal(g, 'trade.sell', 'pool')
    const taxable = Math.max(0, net - basis - 5_000)
    expect(taxable).toBeGreaterThan(40_000)
    const tax = Math.round(taxable * capitalGainsRate(g))
    expect(tax).toBeGreaterThan(0)
    expect(flowTotal(g, 'tax.capgains', 'gov')).toBe(tax)
    expect(acctOf(g, 'gov:us') - gov).toBe(tax)
    expect(g.character.money - cash).toBe(net - tax)
    expect(g.flags.investLossCarry).toBe(0)
    // The gain is not income, and the income tax's credit is not touched.
    expect(g.flags.taxableIncome).toBe(income)
    expect(g.flags.taxesPaid).toBe(paid)
    expect(g.counters.taxesPaid).toBe(tax)
    expect(driftSince(g, before)).toBe(0)
    expectConserved(g)
  })

  it('a loss books no tax and carries forward', () => {
    const g = life()
    expect(buySecurity(g, listed(g, 'stock').secId, 50_000, true)).toBe(true)
    const a = investmentHoldings(g)[0]
    a.details.price = (a.details.price as number) * 0.5
    a.value = Math.round((a.details.units as number) * (a.details.price as number))
    expect(sellHolding(g, a.id, 'all', true)).toBe(true)
    expect(flowTotal(g, 'tax.capgains', 'gov')).toBe(0)
    expect(g.flags.investLossCarry as number).toBeGreaterThan(20_000)
  })

  it('follows the nation: five more points of capital gains tax is five more points on the same sale', () => {
    const sale = (law: boolean): { tax: number; rate: number } => {
      const { g, a } = stockLife()
      if (law) {
        const p = editPolicy(g, 'us')
        p.national.taxes.capitalGains = 5
        writePolicy(g, p)
      }
      expect(sellHolding(g, a.id, 'all', true)).toBe(true)
      return { tax: flowTotal(g, 'tax.capgains', 'gov'), rate: capitalGainsRate(g) }
    }
    const plain = sale(false)
    const law = sale(true)
    expect(law.rate - plain.rate).toBeCloseTo(0.05, 9)
    expect(law.tax).toBeGreaterThan(plain.tax)
    // The same gain: the extra tax is the extra points of it.
    expect(law.tax / plain.tax).toBeCloseTo(law.rate / plain.rate, 2)
  })

  it('withholds the tax at a year-end close too (a bond that matured, a buyout)', () => {
    over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
    const { g, a, units, basis } = bondLife()
    a.details.maturity = g.year + 1
    passYear(g)
    const paid = Math.round(units * FACE)
    expect(flowTotal(g, 'tax.capgains', 'gov')).toBe(Math.round((paid - basis) * capitalGainsRate(g)))
    // passYear zeroes the year's income before the close; a gain that went through earnIncome would be here.
    expect(g.flags.taxableIncome ?? 0).toBe(0)
  })

  describe('the transactions law', () => {
    const lawLife = (level: number): GameState => {
      const g = life()
      const p = editPolicy(g, 'us')
      p.newTaxes.transactions = { level, industry: '' }
      writePolicy(g, p)
      return g
    }
    const noticeText = (g: GameState, title: string): string => {
      const n = g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === title).pop()
      if (!n) throw new Error(`no ${title} notice`)
      return n.text
    }

    it('charges 0.1 percent a level on a buy and on a sale, to gov:us, with one clause in the notice', () => {
      const g = lawLife(2)
      const id = listed(g, 'index').secId
      const cash = g.character.money
      expect(buySecurity(g, id, 100_000)).toBe(true)
      expect(flowTotal(g, 'tax.transaction', 'gov')).toBe(200)
      expect(g.character.money).toBe(cash - 100_000 - 200)
      expect(noticeText(g, 'Order Filled')).toContain(`Transactions tax: ${formatMoney(200)}.`)
      expect(buySecurity(g, id, 100_000, true)).toBe(true)
      expect(flowTotal(g, 'tax.transaction', 'gov')).toBe(400)
      g.queue = []
      const a = investmentHoldings(g)[0]
      const gov = acctOf(g, 'gov:us')
      expect(sellHolding(g, a.id, 100_000)).toBe(true)
      expect(flowTotal(g, 'tax.transaction', 'gov')).toBe(600)
      expect(acctOf(g, 'gov:us') - gov).toBe(200)
      expect(noticeText(g, 'Order Filled')).toContain(`Transactions tax: ${formatMoney(200)}.`)
      expect(ROW(g, 'unreasoned')).toBe(0)
      expectConserved(g)
    })

    it('with no law no row exists and the order notices say what they said before', () => {
      const none = life()
      const lvl2 = lawLife(2)
      const id = listed(none, 'index').secId
      for (const g of [none, lvl2]) {
        expect(buySecurity(g, id, 100_000)).toBe(true)
        expect(buySecurity(g, id, 100_000, true)).toBe(true)
      }
      expect(ROW(none, 'tax.transaction')).toBe(0)
      expect(noticeText(none, 'Order Filled')).not.toMatch(/ransactions tax/)
      // The law's notice is today's notice and one clause.
      const clause = ` Transactions tax: ${formatMoney(200)}.`
      expect(noticeText(lvl2, 'Order Filled').replace(clause, '')).toBe(noticeText(none, 'Order Filled'))
      none.queue = []
      lvl2.queue = []
      for (const g of [none, lvl2]) expect(sellHolding(g, investmentHoldings(g)[0].id, 100_000)).toBe(true)
      expect(ROW(none, 'tax.transaction')).toBe(0)
      expect(noticeText(lvl2, 'Order Filled').replace(clause, '')).toBe(noticeText(none, 'Order Filled'))
    })

    it('a law at level 0 charges nothing, and no law exists before 1900', async () => {
      const g = lawLife(0)
      expect(buySecurity(g, listed(g, 'index').secId, 100_000, true)).toBe(true)
      expect(ROW(g, 'tax.transaction')).toBe(0)
      const rates = await import('../src/game/nation/rates')
      const old = lawLife(3)
      old.year = 1850
      expect(rates.transactionsLevel(old)).toBe(0)
      expect(rates.transactionsLevy(old, 100_000)).toBe(0)
    })

    it('a buy that the levy would overdraw is refused, and nothing moves', () => {
      const g = lawLife(3)
      g.character.money = 100_000
      const id = listed(g, 'index').secId
      expect(buySecurity(g, id, 100_000, true)).toBe(false)
      expect(g.character.money).toBe(100_000)
      expect(investmentHoldings(g)).toHaveLength(0)
    })

    it('liquidating a portfolio pays the levy on each sale', () => {
      const g = lawLife(1)
      expect(buySecurity(g, listed(g, 'index').secId, 100_000, true)).toBe(true)
      expect(buySecurity(g, listed(g, 'gold').secId, 50_000, true)).toBe(true)
      const before = flowTotal(g, 'tax.transaction', 'gov')
      expect(liquidatePortfolio(g)).toBe(true)
      expect(flowTotal(g, 'tax.transaction', 'gov') - before).toBeGreaterThan(100)
      expectConserved(g)
    })

    it('a year-end close is not a trade: no levy on a maturity', () => {
      over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
      const g = lawLife(3)
      expect(buySecurity(g, listed(g, 'bond').secId, 100_000, true)).toBe(true)
      const a = investmentHoldings(g)[0]
      a.details.maturity = g.year + 1
      const levies = flowTotal(g, 'tax.transaction', 'gov', START)
      passYear(g)
      expect(investmentHoldings(g)).toHaveLength(0)
      expect(flowTotal(g, 'tax.transaction', 'gov')).toBe(0)
      expect(levies).toBe(300)
    })
  })

  it('exposes the rates as a leaf: the levy is a rounded 0.1 percent a level, and bad input is nothing', async () => {
    const rates = await import('../src/game/nation/rates')
    expect(rates.TRANSACTION_TAX_PER_LEVEL).toBe(0.001)
    const none = life()
    expect(rates.transactionsLevel(none)).toBe(0)
    expect(rates.transactionsLevy(none, 100_000)).toBe(0)
    const g = life()
    const p = editPolicy(g, 'us')
    p.newTaxes.transactions = { level: 3, industry: '' }
    writePolicy(g, p)
    expect(rates.transactionsLevel(g)).toBe(3)
    expect(rates.transactionsLevy(g, 100_000)).toBe(300)
    expect(rates.transactionsLevy(g, 1_234)).toBe(4)
    for (const bad of [Number.NaN, -5, 0, Number.POSITIVE_INFINITY]) expect(rates.transactionsLevy(g, bad)).toBe(0)
    // A damaged level is held to 0 to 3.
    p.newTaxes.transactions = { level: 99, industry: '' }
    writePolicy(g, p)
    expect(rates.transactionsLevel(g)).toBe(3)
    p.newTaxes.transactions = { level: -4, industry: '' }
    writePolicy(g, p)
    expect(rates.transactionsLevel(g)).toBe(0)
    // personalTax, capitalGainsRate and capitalGainsTax are where nation/effects and business/exit say they are.
    const exit = await import('../src/game/business/exit')
    const effects = await import('../src/game/nation/effects')
    expect(exit.capitalGainsRate).toBe(rates.capitalGainsRate)
    expect(exit.capitalGainsTax).toBe(rates.capitalGainsTax)
    expect(effects.personalTax).toBe(rates.personalTax)
    expect(rates.capitalGainsTax(g, 100_000, 40_000)).toBe(Math.round(60_000 * rates.capitalGainsRate(g)))
    expect(rates.capitalGainsTax(g, 10_000, 40_000)).toBe(0)
  })
})

describe('payers of income', () => {
  it('books a coupon from the issuing government and a dividend from the markets, each under invest.income', () => {
    over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
    const g = life()
    expect(buySecurity(g, listed(g, 'bond').secId, 100_000, true)).toBe(true)
    expect(buySecurity(g, listed(g, 'index').secId, 100_000, true)).toBe(true)
    const bond = investmentHoldings(g).find((a) => a.details.type === 'bond')!
    const index = investmentHoldings(g).find((a) => a.details.type === 'index')!
    bond.details.yield = 0.04
    index.details.yield = 0.02
    const govBefore = acctOf(g, 'gov:us')
    const marketsBefore = acctOf(g, 'pool:markets')
    const cash = g.character.money
    passYear(g)
    const got = g.character.money - cash
    const gov = acctOf(g, 'gov:us') - govBefore
    const markets = acctOf(g, 'pool:markets') - marketsBefore
    // The coupon: units 99.9 at 1000, 4 percent (the bond is marked at par until the move).
    expect(gov).toBe(-Math.round(0.04 * (bond.details.units as number) * FACE))
    expect(markets).toBeLessThan(0)
    // Everything that came in came from one of the two (the index may also have moved no cash at all).
    expect(got).toBe(-(gov + markets))
    expect(flowTotal(g, 'invest.income', 'person')).toBe(got)
    expect(g.flags.taxableIncome).toBe(got)
    expect(ROW(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('books a deposit interest as taxed income that stays in the account: cash unchanged, taxable income up', () => {
    over.fx = () => ({ dep: 0, bondMove: 0, defaulted: false, haircut: 0 })
    const g = life()
    expect(buySecurity(g, listed(g, 'savings').secId, 100_000, true)).toBe(true)
    const a = investmentHoldings(g)[0]
    a.details.product = 'term'
    a.details.yield = 0.05
    const cash = g.character.money
    const value = a.value
    const markets = acctOf(g, 'pool:markets')
    passYear(g)
    expect(g.character.money).toBe(cash)
    expect(a.value).toBeGreaterThan(value)
    expect(g.flags.taxableIncome).toBe(a.value - value)
    expect(flowTotal(g, 'invest.income', 'person')).toBe(a.value - value)
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-(a.value - value))
    // The two bookings cancel in the banks pool: it holds nothing, and the markets did not move.
    expect(acctOf(g, 'pool:banks')).toBe(0)
    expect(acctOf(g, 'pool:markets')).toBe(markets)
    expectConserved(g)
  })
})

describe('spreads: a buy then a sale in the same year loses money to the market', () => {
  /** Buys $10,000 of the first security of `type` that will take the order, then sells it all. */
  function roundTrip(type: string): { cash: number; after: number; markets: number } {
    const g = life()
    const cash = g.character.money
    let secId = ''
    for (const q of investmentListing(g).filter((x) => x.type === type)) {
      if (buySecurity(g, q.secId, 10_000, true)) {
        secId = q.secId
        break
      }
    }
    expect(secId, `no ${type} would take a $10,000 order`).not.toBe('')
    const a = investmentHoldings(g).find((x) => x.details.secId === secId)!
    expect(sellHolding(g, a.id, 'all', true)).toBe(true)
    expectConserved(g)
    expect(ROW(g, 'unreasoned')).toBe(0)
    return { cash, after: g.character.money, markets: acctOf(g, 'pool:markets') }
  }

  for (const type of ['stock', 'index', 'bond', 'gold', 'crypto']) {
    it(`${type}: the player ends with less cash and pool:markets gained`, () => {
      const r = roundTrip(type)
      expect(r.after).toBeLessThan(r.cash)
      expect(r.markets).toBeGreaterThan(0)
      // What the player lost is what the market gained (no tax on a loss, no levy under no law).
      expect(r.cash - r.after).toBe(r.markets)
    })
  }

  it('savings: a deposit is withdrawn at par, so the round trip is exactly even (the label says "No fees")', () => {
    const r = roundTrip('savings')
    expect(r.after).toBe(r.cash)
    expect(r.markets).toBe(0)
  })
})
