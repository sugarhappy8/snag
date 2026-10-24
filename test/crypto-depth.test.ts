// How much a coin's market can absorb (investments.ts tradingDepth). In a year of real history a coin's depth is 5% of its real
// market size. After the record ends (the present and every year to come) coinMarketCap used to know nothing, and tradingDepth
// read that as a flat $1B market, so every coin, Bitcoin included, got $50M of depth and a $1B order lost four fifths of itself.
// Now a coin's size after the record is its price times the supply it ended with, so a big coin is deep and a small one thin.
import { describe, expect, it } from 'vitest'
import { coinSupply } from '../src/game/history/markets'
import { coinMarketCap } from '../src/game/invest/engine'
import { buySecurity, investmentHoldings, investmentListing, sellHolding } from '../src/game/investments'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

function whale(money = 100_000_000_000): GameState {
  const g = makeTestGame(7, { age: 50, money, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.lifeId = 'crypto-depth'
  g.year = 2030
  return g
}

const coins = (g: GameState) => investmentListing(g).filter((q) => q.type === 'crypto')

/** What a buy of `amount` leaves in the position, as a share of what was paid. */
function kept(g: GameState, secId: string, amount: number): number {
  const before = investmentHoldings(g).length
  expect(buySecurity(g, secId, amount, true)).toBe(true)
  const held = investmentHoldings(g)
  expect(held.length).toBe(before + 1)
  return held[held.length - 1]!.value / amount
}

describe('coinMarketCap after the record', () => {
  it('is the real size in a year of history, whatever price is passed', () => {
    const real = coinMarketCap(0, 2021)
    expect(real).toBeGreaterThan(500e9)
    expect(coinMarketCap(0, 2021, 1)).toBe(real)
  })

  it('is price times the supply the record ended with, once the record is over', () => {
    expect(coinSupply(0, 2030)).toBeCloseTo(19.97e6, -3)
    expect(coinMarketCap(0, 2030, 700_000)).toBeCloseTo(700_000 * coinSupply(0, 2030), -3)
  })

  it('stays null without a price, so the "room" a coin has this year is as unlimited as it was', () => {
    expect(coinMarketCap(0, 2030)).toBeNull()
    expect(coinMarketCap(0, 2030, 0)).toBeNull()
  })

  it('is null for a slot with no supply on record', () => {
    expect(coinSupply(9999, 2030)).toBe(0)
    expect(coinMarketCap(9999, 2030, 5)).toBeNull()
  })
})

describe('trading depth for coins after the record', () => {
  it('lets a $1B order into Bitcoin through almost whole, and a sale come back almost whole', () => {
    const g = whale()
    const btc = coins(g).find((q) => q.symbol === 'BTC')!
    expect(btc).toBeDefined()
    const share = kept(g, btc.secId, 1_000_000_000)
    // Fees are a few percent at most; price impact on a $15 trillion market is nothing.
    expect(share).toBeGreaterThan(0.9)
    const held = investmentHoldings(g)[0]!
    const marked = held.value
    const before = g.character.money
    expect(sellHolding(g, held.id, 'all', true)).toBe(true)
    expect(g.character.money - before).toBeGreaterThan(marked * 0.9)
  })

  it('keeps a small coin thin: the same order loses far more there than in Bitcoin', () => {
    const btc = coins(whale()).find((q) => q.symbol === 'BTC')!
    const keptBtc = kept(whale(), btc.secId, 1_000_000_000)
    const others = coins(whale()).filter((q) => q.symbol !== 'BTC')
    expect(others.length).toBeGreaterThan(2)
    const shares = others.map((q) => kept(whale(), q.secId, 1_000_000_000))
    // The thinnest market takes a bite out of the order, and Bitcoin's does not.
    expect(Math.min(...shares)).toBeLessThan(0.5)
    expect(Math.min(...shares)).toBeLessThan(keptBtc)
  })
})
