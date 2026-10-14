// The engine seam the money team stands on (investments.ts): a `quiet` flag on buySecurity and
// sellHolding, the managed book (three buckets, read purely) and managedOrder (quiet trades).
import { describe, expect, it } from 'vitest'
import { investingBlocked } from '../src/game/history/markets'
import {
  buySecurity,
  investmentHoldings,
  investmentListing,
  managedBook,
  managedOrder,
  minTrade,
  sellHolding,
  yearlyInvestments,
  type MandateBucket,
} from '../src/game/investments'
import type { Asset, GameState } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { client, own, secIdOf, warp } from './advisors-kit'

const TYPE_OF: Record<MandateBucket, 'index' | 'bond' | 'savings'> = { stocks: 'index', bonds: 'bond', savings: 'savings' }

function fundId(g: GameState): string {
  return secIdOf(g, 'index')
}

function sum(xs: Asset[]): number {
  return xs.reduce((s, a) => s + a.value, 0)
}

function ofType(g: GameState, type: string, product?: string): Asset[] {
  return investmentHoldings(g).filter((a) => a.details.type === type && (product === undefined || a.details.product === product))
}

function logJson(g: GameState): string {
  return JSON.stringify(g.log)
}

describe('quiet orders', () => {
  it('queue nothing and log nothing, and trade exactly like a loud order', () => {
    const g = client()
    const g2 = structuredClone(g)
    const id = fundId(g)
    const logBefore = logJson(g2)

    expect(buySecurity(g, id, 100_000)).toBe(true)
    expect(buySecurity(g2, id, 100_000, true)).toBe(true)

    expect(g.queue.length).toBeGreaterThan(0)
    expect(logJson(g)).not.toBe(logBefore)
    expect(g2.queue.length).toBe(0)
    expect(logJson(g2)).toBe(logBefore)
    expect(g2.character.money).toBe(g.character.money)
    const a = ofType(g, 'index')[0], b = ofType(g2, 'index')[0]
    expect(b.details.units).toBe(a.details.units)
    expect(b.value).toBe(a.value)
    expect(b.details.basis).toBe(a.details.basis)
    expect(g2.counters).toEqual(g.counters)
  })

  it('sell the same way: same cash, units and value, and no popup or log line', () => {
    const g = client()
    own(g, 'index', 400_000)
    g.queue = []
    const g2 = structuredClone(g)
    const logBefore = logJson(g2)
    const id = ofType(g, 'index')[0].id

    expect(sellHolding(g, id, 50_000)).toBe(true)
    expect(sellHolding(g2, id, 50_000, true)).toBe(true)

    expect(g.queue.length).toBeGreaterThan(0)
    expect(g2.queue.length).toBe(0)
    expect(logJson(g2)).toBe(logBefore)
    expect(g2.character.money).toBe(g.character.money)
    expect(ofType(g2, 'index')[0].details.units).toBe(ofType(g, 'index')[0].details.units)
    expect(ofType(g2, 'index')[0].value).toBe(ofType(g, 'index')[0].value)
  })

  it('leave tax, fees and the loss carry alone when a sale realizes a gain or a loss', () => {
    const g = client(19, { money: 20_000_000 })
    own(g, 'index', 10_000_000)
    // A year of market moves, so the sale has a gain or a loss to tax.
    g.year += 1
    g.character.age += 1
    g.flags.taxableIncome = 0
    yearlyInvestments(g)
    g.queue = []
    const g2 = structuredClone(g)
    const id = ofType(g, 'index')[0].id

    expect(sellHolding(g, id, 'all')).toBe(true)
    expect(sellHolding(g2, id, 'all', true)).toBe(true)

    expect(g2.character.money).toBe(g.character.money)
    expect(g2.flags.investLossCarry).toBe(g.flags.investLossCarry)
    expect(g2.flags.taxableIncome).toBe(g.flags.taxableIncome)
    expect(g2.assets.length).toBe(g.assets.length)
    expect(g2.queue.length).toBe(0)
  })

  it('say nothing when an order is refused, whatever the reason', () => {
    const g = client(3, { money: 1_000 })
    const logBefore = logJson(g)
    expect(buySecurity(g, 'nope', 1_000, true)).toBe(false)
    expect(buySecurity(g, fundId(g), 1, true)).toBe(false) // under the minimum order
    expect(buySecurity(g, fundId(g), 5_000_000, true)).toBe(false) // more than the bank holds
    expect(buySecurity(g, fundId(g), Number.NaN, true)).toBe(false)
    expect(sellHolding(g, 'a999', 1_000, true)).toBe(false) // no such holding
    const kid = client(3, { age: 15 })
    expect(buySecurity(kid, fundId(kid), 10_000, true)).toBe(false) // too young
    const owned = client(3)
    own(owned, 'index', 100_000)
    owned.queue = []
    expect(sellHolding(owned, ofType(owned, 'index')[0].id, 0, true)).toBe(false) // nothing asked
    expect(g.queue.length).toBe(0)
    expect(kid.queue.length).toBe(0)
    expect(owned.queue.length).toBe(0)
    expect(logJson(g)).toBe(logBefore)
  })
})

describe('the managed book', () => {
  it('counts the three buckets and leaves the rest out', () => {
    const g = client(7, { money: 10_000_000 })
    own(g, 'index', 200_000)
    own(g, 'bond', 100_000)
    own(g, 'savings', 50_000)
    own(g, 'term', 30_000)
    own(g, 'stock', 40_000)
    const book = managedBook(g)
    expect(book.stocks.value).toBe(sum(ofType(g, 'index')))
    expect(book.bonds.value).toBe(sum(ofType(g, 'bond')))
    expect(book.savings.value).toBe(sum(ofType(g, 'savings', 'savings')))
    // The term deposit and the stock are in nobody's bucket.
    const everything = sum(investmentHoldings(g))
    expect(book.stocks.value + book.bonds.value + book.savings.value).toBe(everything - sum(ofType(g, 'savings', 'term')) - sum(ofType(g, 'stock')))
    expect(book.cash).toBe(g.character.money)
    expect(book.minOrder).toBe(minTrade(g))
    expect(book.idle).toBeNull()
  })

  it('shows the yield of what a new order buys and an empty bucket as zero and unblocked', () => {
    const g = client(7)
    const book = managedBook(g)
    const rows = investmentListing(g)
    expect(book.stocks.value).toBe(0)
    expect(book.stocks.sellBlock).toBeNull()
    expect(book.stocks.yield).toBe(rows.find((r) => r.type === 'index')!.yield)
    expect(book.bonds.yield).toBe(rows.find((r) => r.type === 'bond')!.yield)
    expect(book.savings.yield).toBe(rows.find((r) => r.secId.startsWith('savings:'))!.yield)
    expect(book.stocks.buyBlock).toBeNull()
    expect(book.bonds.buyBlock).toBeNull()
    expect(book.savings.buyBlock).toBeNull()
  })

  it('gives the idle reasons: too young, in prison, and a country that bans private investing', () => {
    const kid = client(4, { age: 17 })
    expect(managedBook(kid).idle).toMatch(/18/)

    const con = client(4)
    con.character.prison = { crime: 'Fraud', yearsTotal: 3, yearsServed: 0, security: 'minimum', respect: 50 } as unknown as GameState['character']['prison']
    expect(managedBook(con).idle).toMatch(/prison/)

    const dead = client(4)
    dead.character.alive = false
    expect(managedBook(dead).idle).toMatch(/dead/i)

    let hit: { countryId: string; year: number } | null = null
    for (const countryId of ['cn', 'cu', 'ru', 'ir']) {
      for (let year = 1950; year <= 1990 && !hit; year++) if (investingBlocked(countryId, year)) hit = { countryId, year }
      if (hit) break
    }
    expect(hit).not.toBeNull()
    const banned = client(4, hit!)
    expect(managedBook(banned).idle).toBe(investingBlocked(hit!.countryId, hit!.year))
  })

  it('a shut exchange blocks only the fund', () => {
    const g = client(5, { countryId: 'jp', year: 1946 })
    const book = managedBook(g)
    expect(book.stocks.buyBlock).toMatch(/closed/)
    expect(book.bonds.buyBlock).toBeNull()
    expect(book.savings.buyBlock).toBeNull()
    expect(book.idle).toBeNull()
  })

  it('before index funds the stock bucket is the investment trust, and still an index holding', () => {
    const g = client(6, { year: 1960 })
    expect(investmentListing(g).some((r) => r.type === 'index')).toBe(true)
    expect(managedBook(g).stocks.buyBlock).toBeNull()
    const fill = managedOrder(g, 'stocks', 'buy', 50_000)
    expect(fill.moved).toBeGreaterThan(0)
    const held = ofType(g, 'index')
    expect(held.length).toBe(1)
    expect(held[0].details.sector).toBe('Investment trust')
  })

  it('never reads or advances the rng, and is pure on a frozen game', () => {
    const g = client(8, { money: 10_000_000 })
    own(g, 'index', 200_000)
    own(g, 'bond', 100_000)
    own(g, 'savings', 50_000)
    own(g, 'term', 30_000)
    const snapshot = JSON.stringify(g)
    const rng = g.rng
    deepFreeze(g)
    const a = managedBook(g)
    const b = managedBook(g)
    expect(b).toEqual(a)
    expect(JSON.stringify(g)).toBe(snapshot)
    expect(g.rng).toBe(rng)
  })

  it('reads damaged holdings without throwing and keeps unknown types out of every bucket', () => {
    const g = client(8, { money: 1_000_000 })
    own(g, 'index', 100_000)
    const junk = (details: Record<string, unknown>): Asset => ({ id: `j${g.assets.length}`, kind: 'investment', name: 'Junk', emoji: '?', purchasePrice: 5, value: 5, condition: 100, purchasedAge: 30, upkeep: 0, details: details as Asset['details'] })
    g.assets.push(junk({ type: 'index', units: 'x', price: null }))
    g.assets.push(junk({ type: 'martian', units: 4, price: 25_000 }))
    g.assets.push(junk({ type: 'npcEquity', units: 4, price: 25_000 }))
    g.assets.push(junk({ type: 'savings', units: 1, price: 2_000, product: 7 }))
    g.assets.push(junk({ type: 'savings', units: 1, price: 3_000, product: 'term' }))
    const book = managedBook(g)
    for (const k of ['stocks', 'bonds', 'savings'] as const) expect(Number.isFinite(book[k].value)).toBe(true)
    // Both index lines (a damaged one counts at its recorded value, as everywhere else) and the savings line with a
    // non-text product; not the term deposit, the unknown type or the NPC stake.
    expect(ofType(g, 'index').length).toBe(2)
    expect(book.stocks.value).toBe(sum(ofType(g, 'index')))
    expect(book.savings.value).toBe(2_000)
    expect(book.bonds.value).toBe(0)
    const cash = g.character.money
    expect(() => managedOrder(g, 'stocks', 'sell', 10_000)).not.toThrow()
    expect(g.character.money).toBeGreaterThan(cash)
  })

  it('stays pure and finite in other countries and eras', () => {
    for (const [countryId, year] of [['jp', 1946], ['us', 1960], ['gb', 1980], ['de', 2000], ['br', 2026], ['cn', 1960]] as const) {
      const g = client(9, { countryId, year })
      deepFreeze(g)
      const book = managedBook(g)
      for (const k of ['stocks', 'bonds', 'savings'] as const) {
        expect(Number.isFinite(book[k].value)).toBe(true)
        expect(Number.isFinite(book[k].yield)).toBe(true)
      }
    }
  })
})

describe('managedOrder', () => {
  it('buys each bucket and reports what moved', () => {
    const g = client(10, { money: 3_000_000 })
    const rng = g.rng

    const cash0 = g.character.money
    const fund = managedOrder(g, 'stocks', 'buy', 400_000)
    expect(fund.reason).toBeNull()
    expect(fund.moved).toBe(cash0 - g.character.money)
    expect(fund.moved).toBe(400_000)
    expect(ofType(g, 'index').length).toBe(1)

    const cash1 = g.character.money
    const bond = managedOrder(g, 'bonds', 'buy', 300_000)
    expect(bond.moved).toBe(cash1 - g.character.money)
    expect(ofType(g, 'bond')[0].details.secId).toBe(`bond:us:${g.year}`)

    const cash2 = g.character.money
    const save = managedOrder(g, 'savings', 'buy', 200_000)
    expect(save.moved).toBe(cash2 - g.character.money)
    expect(ofType(g, 'savings')[0].details.product).toBe('savings')

    expect(g.queue.length).toBe(0)
    expect(g.rng).toBe(rng)
  })

  it('does nothing under the minimum order, and never spends more than the cash', () => {
    const g = client(10, { money: 600_000 })
    const min = minTrade(g)
    const small = managedOrder(g, 'stocks', 'buy', min - 1)
    expect(small.moved).toBe(0)
    expect(small.reason).toBeTruthy()
    expect(g.character.money).toBe(600_000)

    const big = managedOrder(g, 'bonds', 'buy', 9_000_000)
    expect(big.moved).toBeGreaterThan(0)
    expect(big.moved).toBeLessThanOrEqual(600_000)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    expect(g.character.money).toBe(600_000 - big.moved)

    const broke = managedOrder(g, 'bonds', 'buy', 1_000_000)
    expect(broke.moved).toBe(0)
    expect(broke.reason).toBeTruthy()
  })

  it('refuses hostile amounts without a trade', () => {
    const g = client(10)
    for (const x of [Number.NaN, Infinity, -Infinity, -5, 0, 0.9]) {
      for (const side of ['buy', 'sell'] as const) {
        const fill = managedOrder(g, 'stocks', side, x)
        expect(fill.moved).toBe(0)
      }
    }
    expect(g.assets.length).toBe(0)
    expect(g.queue.length).toBe(0)
  })

  it('does nothing while the book is idle, either way', () => {
    const kid = client(10, { age: 17 })
    const fill = managedOrder(kid, 'bonds', 'buy', 100_000)
    expect(fill.moved).toBe(0)
    expect(fill.reason).toMatch(/18/)
    expect(kid.assets.length).toBe(0)

    const con = client(10)
    own(con, 'bond', 100_000)
    con.character.prison = { crime: 'Fraud', yearsTotal: 3, yearsServed: 0, security: 'minimum', respect: 50 } as unknown as GameState['character']['prison']
    const money = con.character.money
    expect(managedOrder(con, 'bonds', 'sell', 50_000).moved).toBe(0)
    expect(managedOrder(con, 'bonds', 'buy', 50_000).moved).toBe(0)
    expect(con.character.money).toBe(money)
  })

  it('sells the largest holding first and leaves a smaller one alone', () => {
    const g = client(12, { year: 2025, money: 3_000_000 })
    const smaller = own(g, 'bond', 100_000)
    warp(g, 2026)
    const larger = own(g, 'bond', 150_000)
    g.queue = []
    const smallerBefore = smaller.value
    const rng = g.rng

    const fill = managedOrder(g, 'bonds', 'sell', 100_000)
    expect(fill.reason).toBeNull()
    expect(fill.moved).toBeGreaterThan(99_000)
    expect(fill.moved).toBeLessThan(101_000)
    expect(smaller.value).toBe(smallerBefore)
    expect(larger.value).toBeLessThan(150_000)
    expect(g.queue.length).toBe(0)
    expect(g.rng).toBe(rng)
  })

  it('sells across holdings when the ask is more than one holds, and never a term deposit', () => {
    const g = client(12, { year: 2025, money: 3_000_000 })
    const first = own(g, 'bond', 100_000)
    warp(g, 2026)
    const second = own(g, 'bond', 100_000)
    own(g, 'savings', 200_000)
    const term = own(g, 'term', 100_000)
    expect(ofType(g, 'bond').length).toBe(2)
    const termValue = term.value
    g.queue = []
    const rng = g.rng

    const ask = Math.round(1.5 * Math.max(first.value, second.value))
    const before = [first.value, second.value]
    const both = managedOrder(g, 'bonds', 'sell', ask)
    expect(Math.abs(both.moved - ask)).toBeLessThanOrEqual(ask * 0.01)
    const after = [first, second].map((a) => g.assets.find((x) => x.id === a.id)?.value ?? 0)
    expect(after[0]).toBeLessThan(before[0])
    expect(after[1]).toBeLessThan(before[1])

    // A savings sale leaves the term deposit alone, even when it asks for more than the account holds.
    const save = managedOrder(g, 'savings', 'sell', 50_000)
    expect(save.moved).toBeGreaterThan(49_000)
    expect(g.assets.find((a) => a.id === term.id)!.value).toBe(termValue)
    managedOrder(g, 'savings', 'sell', 10_000_000)
    expect(g.assets.find((a) => a.id === term.id)!.value).toBe(termValue)
    expect(ofType(g, 'savings', 'term').length).toBe(1)

    expect(g.queue.length).toBe(0)
    expect(g.rng).toBe(rng)
  })

  it('stops when what is left is under the minimum order', () => {
    const g = client(13)
    own(g, 'bond', 200_000)
    g.queue = []
    const min = minTrade(g)
    const held = ofType(g, 'bond')[0]
    const value = held.value
    // The whole holding plus a crumb under the minimum: the holding goes and the crumb is not chased.
    const fill = managedOrder(g, 'bonds', 'sell', value + (min - 1))
    expect(fill.moved).toBe(value)
    expect(ofType(g, 'bond').length).toBe(0)
    own(g, 'bond', 200_000)
    expect(managedOrder(g, 'bonds', 'sell', min - 1).moved).toBe(0)
  })

  it('refuses a sale in a shut market with a reason', () => {
    const g = client(5, { countryId: 'jp', year: 2000 })
    own(g, 'index', 300_000)
    g.queue = []
    g.year = 1946
    const held = ofType(g, 'index')[0]
    const units = held.details.units
    const money = g.character.money
    const fill = managedOrder(g, 'stocks', 'sell', 10_000)
    expect(fill.moved).toBe(0)
    expect(fill.reason).toMatch(/closed|no stock market/)
    expect(held.details.units).toBe(units)
    expect(g.character.money).toBe(money)
    expect(g.queue.length).toBe(0)
  })

  it('says there is nothing to sell from an empty bucket', () => {
    const g = client(14)
    const fill = managedOrder(g, 'savings', 'sell', 50_000)
    expect(fill.moved).toBe(0)
    expect(fill.reason).toBeTruthy()
  })

  it('moves what the book says it moved: a buy then a sale shows in the buckets', () => {
    const g = client(15, { money: 2_000_000 })
    for (const bucket of ['stocks', 'bonds', 'savings'] as const) {
      const before = managedBook(g)[bucket].value
      const bought = managedOrder(g, bucket, 'buy', 100_000)
      const mid = managedBook(g)[bucket].value
      expect(bought.moved).toBe(100_000)
      expect(mid).toBeGreaterThan(before)
      expect(ofType(g, TYPE_OF[bucket]).length).toBeGreaterThan(0)
      const sold = managedOrder(g, bucket, 'sell', 40_000)
      expect(sold.moved).toBeGreaterThan(39_000)
      expect(mid - managedBook(g)[bucket].value).toBe(sold.moved)
    }
  })
})
