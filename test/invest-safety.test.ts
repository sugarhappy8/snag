import { describe, expect, it } from 'vitest'
import { buyImpact, saleImpact } from '../src/game/invest/liquidity'
import {
  BREAKTHROUGHS_KEY,
  SHOCKS_KEY,
  marketBreakthroughs,
  marketShocks,
  shockFactor,
  shockedMove,
} from '../src/game/invest/shocks'
import { exchangeInfo } from '../src/game/invest/engine'
import type { Json } from '../src/game/types'
import { makeTestGame } from './helpers'

describe('investment arithmetic safety', () => {
  it('keeps extreme finite order-book inputs finite', () => {
    for (const result of [saleImpact(1e308, 1), buyImpact(1e308, 1), saleImpact(1, 1e308), buyImpact(1, 1e308)]) {
      for (const value of Object.values(result)) {
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }
    }
    expect(saleImpact(Number.POSITIVE_INFINITY, 1)).toEqual({ proceeds: 0, end: 1, discount: 0 })
    expect(buyImpact(1, Number.NaN)).toEqual({ value: 0, end: 1 })
  })

  it('normalizes duplicate and out-of-range saved shocks without overflowing quotes', () => {
    const g = makeTestGame(91)
    const shock = {
      id: ' duplicate ', asset: 'stock', secId: 'made-up#s0g0', exKey: 'NYSE', slot: 9e9,
      name: 'Test', symbol: 'T', cause: 'contract', year: 2026.4, mult: 1e300,
      fade: -4, countryId: 'us',
    }
    g.flags[SHOCKS_KEY] = [shock, { ...shock, id: 'duplicate', mult: 2 }] as unknown as Json

    const normalized = marketShocks(g)
    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({ id: 'duplicate', slot: 255, year: 2026, mult: 1e12, fade: 0 })
    expect(shockFactor(g, 'made-up#s0g0', 2026)).toBe(1e12)

    const move = shockedMove(1e300, 1e300, 1e12, 1e-12)
    expect(move.price).toBe(1e15)
    expect(Number.isFinite(move.ret)).toBe(true)
  })

  it('deduplicates malformed breakthrough records and listing snapshots', () => {
    const g = makeTestGame(92)
    const key = exchangeInfo('us').key
    const event = {
      id: ' invention ', name: 'A'.repeat(300), year: 2026.2, mult: 5,
      exchanges: [
        { key, indexId: `${key}#fund`, stocks: [0, -1, Number.POSITIVE_INFINITY], pennies: [2] },
        { key, indexId: 'duplicate', stocks: [9], pennies: [9] },
      ],
      businesses: ['asset-1', 'asset-1'],
    }
    g.flags[BREAKTHROUGHS_KEY] = [event, { ...event, id: 'invention' }] as unknown as Json

    const normalized = marketBreakthroughs(g)
    expect(normalized).toHaveLength(1)
    expect(normalized[0].id).toBe('invention')
    expect(normalized[0].name).toHaveLength(100)
    expect(normalized[0].exchanges).toHaveLength(1)
    expect(normalized[0].exchanges[0].stocks).toEqual([0, null, null])
    expect(normalized[0].businesses).toEqual(['asset-1'])
  })
})
