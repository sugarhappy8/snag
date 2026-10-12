// Your own order flow moves a thin market's quote (that is the order book), but it can never
// inflate what your own position is worth, pays out or settles at.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { netWorth } from '../src/game/core'
import { buySecurity, investmentHoldings, investmentListing, sellHolding, yearlyInvestments } from '../src/game/investments'
import { placeBet, settlePrice, stockTargets } from '../src/game/computer/money-stocks'
import type { GameState } from '../src/game/types'

function investor(seed = 500, money = 1_000_000_000, year = 2026): GameState {
  const g = makeTestGame(seed, { age: 40, money, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `self-impact-${seed}-${year}`
  g.year = year
  g.log = [{ age: 40, year, entries: [] }]
  return g
}

describe('self-impact on your own holdings', () => {
  it('buying a thin penny stock never raises your net worth, however it is split', () => {
    for (const split of [1, 10]) {
      const g = investor()
      const penny = investmentListing(g).find(q => q.type === 'penny')!
      const before = netWorth(g)
      for (let i = 0; i < split; i++) {
        expect(buySecurity(g, penny.secId, 50_000_000 / split)).toBe(true)
        expect(netWorth(g)).toBeLessThanOrEqual(before)
      }
      // The quote really moved (other buyers pay it), and unwinding through the same book returns
      // the money less fees: no gain hidden either way.
      expect(investmentListing(g).find(q => q.secId === penny.secId)!.price).toBeGreaterThan(penny.price * 2)
      const a = investmentHoldings(g).find(x => x.details.secId === penny.secId)!
      expect(a.value).toBeLessThanOrEqual(50_000_000)
      expect(sellHolding(g, a.id, 'all')).toBe(true)
      expect(g.character.money).toBeLessThanOrEqual(before)
      expect(g.character.money).toBeGreaterThan(before - 50_000_000 * 0.1)
    }
  })

  it('a pumped stock pays its takeover premium on the price you did not make yourself', () => {
    const g = investor(9, 5_000_000_000, 1998)
    const mobil = investmentListing(g).find(q => q.name === 'Mobil')!
    expect(mobil).toBeDefined()
    expect(buySecurity(g, mobil.secId, 1_000_000_000)).toBe(true)
    const a = investmentHoldings(g).find(x => x.details.secId === mobil.secId)!
    const cash = g.character.money
    g.year = 1999; g.character.age++; g.flags.taxableIncome = 0; g.queue = []
    yearlyInvestments(g)
    expect(investmentHoldings(g).some(x => x.id === a.id)).toBe(false)
    // Bought out at a 12-38% premium: never more than that on the money put in.
    expect(g.character.money - cash).toBeLessThan(1_000_000_000 * 1.4)
  })

  it('single-stock options settle on the market without your own later order flow', () => {
    const g = investor(31, 2_000_000_000)
    const t = stockTargets(g)[0]
    const bet = placeBet(g, { via: 'own', secId: t.secId, kind: 'call', strike: 'atm', stake: 100_000 })!
    expect(bet).not.toBeNull()
    g.queue = []
    const quiet = structuredClone(g)
    expect(buySecurity(g, t.secId, 1_000_000_000)).toBe(true)
    expect(investmentListing(g).find(q => q.secId === t.secId)!.price).toBeGreaterThan(t.price * 1.5)
    expect(settlePrice(g, bet)).toBeCloseTo(settlePrice(quiet, bet), 6)
  })
})
