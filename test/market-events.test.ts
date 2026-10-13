// Historical market events (v2.4.0): real booms, busts and shocks in their real years, hard on the
// markets at the center of each and milder on everyone else.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { activeMarketEvents, exposureOf, listingMood, MARKET_EVENTS, marketEventFactors, marketEventImpacts } from '../src/game/history/market-events'
import { nationalMarket } from '../src/game/business/dynamics'
import { exchangeMove, valuationOf } from '../src/game/business/economy'
import { historicalIndexReturn } from '../src/game/history/markets'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { marketMenu } from '../src/game/business/competition-menu'
import { bizOf } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { MenuGroup, MenuNode } from '../src/game/types'

const f = marketEventFactors

describe('the event table', () => {
  it('hits the market at the center hardest and everyone else mildly', () => {
    const house = f('realEstate', 'us', 2008), bakery = f('bakery', 'us', 2008), bank = f('bank', 'us', 2008)
    expect(house.demand).toBeLessThan(0.75)
    expect(house.value).toBeLessThanOrEqual(0.5)
    expect(bank.value).toBeLessThan(0.45)
    expect(bakery.value).toBeLessThan(0.8)
    expect(bakery.value).toBeGreaterThan(house.value)
    expect(bakery.demand).toBeLessThan(1)
    expect(bakery.demand).toBeGreaterThan(house.demand)
    // The crisis started in American, British, Irish and Spanish housing; abroad it was milder.
    expect(f('realEstate', 'cn', 2008).value).toBeGreaterThan(house.value)
  })

  it('follows the real years of each boom and bust', () => {
    expect(f('software', 'us', 1999, true).value).toBeGreaterThan(2)
    expect(f('software', 'us', 2001, true).value).toBeLessThan(0.5)
    expect(f('energy', 'us', 1974).demand).toBeGreaterThan(1.05)
    expect(f('energy', 'us', 1974).value).toBeGreaterThan(1.1)
    expect(f('logistics', 'us', 1974).costs).toBeGreaterThan(1.15)
    expect(f('energy', 'us', 2015).value).toBeLessThan(0.7)
    expect(f('hotel', 'us', 2020).demand).toBeLessThan(0.6)
    expect(f('ecommerce', 'us', 2020).value).toBeGreaterThan(1.2)
    expect(f('software', 'us', 2022, true).value).toBeLessThanOrEqual(0.6)
    expect(f('energy', 'us', 2022).value).toBeGreaterThan(1.3)
    expect(f('aiLab', 'us', 2025, true).value).toBeGreaterThan(1.9)
    expect(f('semiconductor', 'us', 2025, true).value).toBeGreaterThan(1.6)
    // Oil exporters boom with oil and slump with it.
    expect(f('bakery', 'sa', 1974).demand).toBeGreaterThan(1)
    expect(f('bakery', 'sa', 2015).demand).toBeLessThan(1)
    // Japan's bubble is Japan's.
    expect(f('realEstate', 'jp', 1992).value).toBeLessThan(0.5)
    expect(f('realEstate', 'us', 1992).value).toBeGreaterThan(0.85)
  })

  it('invents nothing: quiet years are neutral, 2026 only lifts AI, and the AI boom fades without a crash', () => {
    for (const year of [1950, 1965, 1986, 2005, 2018, 2031, 2045]) {
      for (const ind of ['bakery', 'realEstate', 'software', 'energy', 'aiLab']) expect(f(ind, 'us', year)).toEqual({ demand: 1, costs: 1, value: 1 })
    }
    for (const ind of ['bakery', 'realEstate', 'restaurant', 'bank', 'grocery', 'hotel']) expect(f(ind, 'us', 2026)).toEqual({ demand: 1, costs: 1, value: 1 })
    let last = f('aiLab', 'us', 2026, true).value
    for (let y = 2027; y <= 2031; y++) {
      const v = f('aiLab', 'us', y, true).value
      expect(v).toBeLessThanOrEqual(last)
      expect(v / last).toBeGreaterThan(0.75)
      last = v
    }
    expect(last).toBe(1)
  })

  it('stays within bounds and only names markets that exist', () => {
    for (const e of MARKET_EVENTS) {
      for (const y of Object.keys(e.years).map(Number)) {
        for (const ind of ['energy', 'realEstate', 'software', 'aiLab', 'hotel', 'bakery', 'bank']) {
          const x = f(ind, 'us', y)
          expect(x.demand).toBeGreaterThanOrEqual(0.45); expect(x.demand).toBeLessThanOrEqual(1.8)
          expect(x.costs).toBeGreaterThanOrEqual(0.75); expect(x.costs).toBeLessThanOrEqual(1.5)
          expect(x.value).toBeGreaterThanOrEqual(0.3); expect(x.value).toBeLessThanOrEqual(3)
        }
      }
    }
    expect(exposureOf('energy')?.market).toBe('oil')
    expect(exposureOf('bakery')).toBeNull()
    expect(activeMarketEvents('us', 2008).map((x) => x.event.id)).toEqual(['housing2008', 'oil2008'])
    expect(listingMood('software', 'us', 1999)).toBeGreaterThan(1.2)
    expect(listingMood('realEstate', 'us', 2008)).toBeLessThan(0.85)
    expect(marketEventImpacts('realEstate', 'us', 2008)[0].text).toMatch(/^Hits this market hard: demand −\d+%, valuations −\d+%\.$/)
    expect(marketEventImpacts('bakery', 'us', 2008)[0].text).toMatch(/^Felt here too: demand −\d+%, valuations −\d+%\.$/)
  })
})

describe('every company lives through them', () => {
  it('cuts demand for an exposed market more than for others, and valuations with it', () => {
    const g = makeTestGame(81, { age: 40, money: 1e6 })
    const ratio = (ind: string) => nationalMarket(g, ind, 'us', 2008).demand / nationalMarket(g, ind, 'us', 2005).demand
    expect(ratio('realEstate')).toBeLessThan(ratio('bakery'))
    expect(ratio('realEstate')).toBeLessThan(0.8)
    const a = createBusinessAsset(g, 'Bricks Co', newBiz(g, 'realEstate', 'us', 'Chicago', { cash: 0 }), 1e6)
    const b = bizOf(g, a)
    const book = (year: number) => { b.history = [year - 2, year - 1, year].map((y) => ({ year: y, revenue: 50e6, profit: 10e6, tax: 0, units: 1e4, price: 5000, staff: 50, valuation: 0, outlets: 1 })); return valuationOf(b) }
    expect(book(2008)).toBeLessThan(book(2005) * 0.7)
    expect(book(1999)).toBeGreaterThan(book(2005))
  })

  it('moves listed companies with the real stock market in history', () => {
    const g = makeTestGame(82, { age: 40, money: 1e6 })
    expect(exchangeMove(g, 'us', 2008)).toBeCloseTo(historicalIndexReturn('us', 2008)!, 9)
    expect(exchangeMove(g, 'us', 2008)).toBeLessThan(-0.2)
    expect(exchangeMove(g, 'us', 2040)).not.toBe(historicalIndexReturn('us', 2040))
  })

  it('announces an event once, when it first hits your companies hard, and shows it on the market screen', () => {
    const g = makeTestGame(83, { age: 40, money: 1e6 })
    g.year = 2008
    g.character.countryId = 'us'
    const a = createBusinessAsset(g, 'Bricks Co', newBiz(g, 'realEstate', 'us', 'Chicago', { cash: 2e6, founded: 2003 }), 1e6)
    g.assets.push(a)
    yearlyBusinessImpl(g)
    const note = g.queue.find((q) => q.kind === 'notice' && q.title === 'The housing crash and financial crisis')
    expect(note && note.kind === 'notice' ? note.text : '').toMatch(/Your companies: Bricks Co: hits this market hard: demand −\d+%/)
    expect(note?.id).toBe('mkt-housing2008-1-2008')
    g.queue = []
    yearlyBusinessImpl(g)
    expect(g.queue.some((q) => q.kind === 'notice' && q.title === 'The housing crash and financial crisis')).toBe(false)
    const rows = (marketMenu(a).children as (g: unknown) => MenuNode[])(g)
    expect(rows.some((n) => n.type === 'info' && String(n.text).startsWith('The housing crash and financial crisis: Hits this market hard'))).toBe(true)
    // Nothing is announced in a quiet year or for an event already under way.
    const q = makeTestGame(84, { age: 40, money: 1e6 })
    q.assets.push(createBusinessAsset(q, 'AI Co', newBiz(q, 'software', 'us', 'Chicago', { cash: 2e6, founded: 2020 }), 1e6))
    yearlyBusinessImpl(q)
    expect(q.queue.some((x) => x.kind === 'notice' && x.id.startsWith('mkt-'))).toBe(false)
    expect((marketMenu(q.assets[0]) as MenuGroup).label).toBe('Market & Competition')
  })
})
