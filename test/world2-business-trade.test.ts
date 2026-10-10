import { describe, expect, it } from 'vitest'
import { ensureEconomy } from '../src/game/economy'
import { economyState, initialCountry, storeEconomy, type CountryEconomy } from '../src/game/economy/model'
import { advanceCountry, worldConditions } from '../src/game/economy/simulation'
import { initialTrade, sectorTrade } from '../src/game/economy/trade'
import { COUNTRIES } from '../src/game/world'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { planFor, simulateYear } from '../src/game/business/economy'
import { runSupply } from '../src/game/business/market-strategy'
import { bookSupply, readSupply, supplyConditions } from '../src/game/business/supply'
import type { BizState } from '../src/game/business/state'
import { makeTestGame } from './helpers'

function openingWorld() {
  const opening = Object.fromEntries(COUNTRIES.map(c => [c.id, initialCountry(c.id, 2030)]))
  // Already depleted aggregate reserves expose the consequences of a sustained
  // interruption; a country with full stores should absorb the first disruption.
  opening.jp.sectors.industry.stock = 0
  opening.jp.sectors.technology.stock = 0
  return opening
}
function company(opening: Record<string, CountryEconomy>) {
  const g = makeTestGame(920, { age: 35, countryId: 'jp', city: 'Tokyo', money: 1e9 })
  g.year = 2031
  ensureEconomy(g)
  const state = economyState(g)!
  const jp = advanceCountry(opening.jp, 'jp', g.year, 'world2-trade-business', worldConditions(opening), [], [], opening)
  storeEconomy(g, { ...state, previous: opening, countries: { ...state.countries, jp } })
  const b = newBiz(g, 'manufacturing', 'jp', 'Tokyo', {
    cash: 100_000_000, founded: 2020, production: 1e9, brand: 90, quality: 90, marketingLevel: 2,
    // The same busy, partially refurbished equipment in both scenarios: customers
    // already want everything it can deliver, so lost output is real lost sales.
    capacityLoss: .65,
  })
  const a = createBusinessAsset(g, 'Tokyo Components', b, 1_000_000)
  g.assets.push(a)
  return { g, a, b: a.details as unknown as BizState, jp }
}

describe('World 2: company responses to connected trade', () => {
  it('an exporting-country chip disruption cuts importer production/profit, while paid second sources recover only part', () => {
    const normalWorld = openingWorld(), disruptedWorld = structuredClone(normalWorld)
    disruptedWorld.tw.sectors.technology.output = 0
    disruptedWorld.kr.sectors.technology.output = 0
    const normal = company(normalWorld), short = company(disruptedWorld), diversified = company(disruptedWorld)
    const imported = sectorTrade(short.jp.tradeNetwork, 'industry', short.g.year).importedGap
    expect(imported).toBeGreaterThan(sectorTrade(normal.jp.tradeNetwork, 'industry', normal.g.year).importedGap)
    const baseline = planFor(normal.g, normal.b, normal.g.year)
    expect(baseline.demand).toBeGreaterThan(baseline.capacity)
    const openingCash = diversified.b.cash
    expect(runSupply(diversified.g, diversified.a, diversified.b)).toBe(true)
    const fee = openingCash - diversified.b.cash
    expect(fee).toBeGreaterThan(0)
    expect(diversified.b.yearCosts).toBe(fee)
    const original = simulateYear(normal.g, normal.b, normal.g.year, 0, 1).stmt
    const hit = simulateYear(short.g, short.b, short.g.year, 0, 1).stmt
    const mitigated = simulateYear(diversified.g, diversified.b, diversified.g.year, 0, 1).stmt
    expect(hit.produced).toBeLessThan(original.produced)
    expect(hit.sold).toBeLessThan(original.sold)
    expect(hit.net).toBeLessThan(original.net)
    expect(mitigated.produced).toBeGreaterThan(hit.produced)
    expect(mitigated.produced).toBeLessThan(original.produced)
    expect(mitigated.pbt + fee).toBeGreaterThan(hit.pbt)
    // The arrangement improves operations, but its real upfront fee still comes
    // off this year's statement; it is not guaranteed to pay back immediately.
    expect(mitigated.other).toBe(fee)
    expect(readSupply(diversified.b).last!.importedGap).toBeGreaterThan(0)
  })

  it('foreign diversification cannot restore domestic shutdowns or a shortage of qualified workers', () => {
    const x = company(openingWorld())
    const state = structuredClone(economyState(x.g)!)
    state.countries.jp.sectors.industry.availability = .2
    // Fully delivered imports isolate a domestic failure from even the ordinary
    // small cross-border delays in the settled trade network.
    state.countries.jp.tradeNetwork = initialTrade('jp', x.g.year)
    const trade = sectorTrade(state.countries.jp.tradeNetwork, 'industry', x.g.year)
    expect(trade.importedGap).toBe(0)
    storeEconomy(x.g, state)
    const before = bookSupply(x.g, x.b, x.g.year, 1000, 1000, 100)
    expect(runSupply(x.g, x.a, x.b)).toBe(true)
    const after = bookSupply(x.g, x.b, x.g.year, 1000, 1000, 100)
    expect(after.produced).toBe(before.produced)
    const labor = structuredClone(economyState(x.g)!)
    labor.countries.jp.sectors.industry.availability = 1
    labor.countries.jp.sectors.industry.workforce = .35
    storeEconomy(x.g, labor)
    expect(bookSupply(x.g, x.b, x.g.year, 1000, 1000, 100).produced).toBe(350)
  })

  it('trade-aware forecasts remain pure and expire diversification on the same fiscal boundary', () => {
    const opening = openingWorld()
    opening.tw.sectors.technology.output = 0
    opening.kr.sectors.technology.output = 0
    const x = company(opening)
    expect(runSupply(x.g, x.a, x.b)).toBe(true)
    const before = JSON.stringify(x.g)
    const result = bookSupply(x.g, x.b, x.g.year, 1000, 1000, 100)
    for (let i = 0; i < 5; i++) {
      expect(bookSupply(x.g, x.b, x.g.year, 1000, 1000, 100)).toEqual(result)
      supplyConditions(x.g, x.b, x.g.year)
    }
    expect(JSON.stringify(x.g)).toBe(before)
    expect(supplyConditions(x.g, x.b, x.g.year + 6).diversified).toBe(false)
  })
})
