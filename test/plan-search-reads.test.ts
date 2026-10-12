// Hot-path reads: a company's plan search and a portfolio revaluation read what doesn't change
// between trials once (pure caches, no state writes, no randomness), with identical results.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTestGame } from './helpers'
import { ensureEconomy } from '../src/game/economy'
import * as trade from '../src/game/economy/trade'
import * as competition from '../src/game/business/competition-core'
import { createBusinessAsset, initialProduction, newBiz } from '../src/game/business/founding'
import { bestPlan, bookYear, marketCtxFor, planFor, planOutcome, yearFixed } from '../src/game/business/economy'
import { supplyConditions } from '../src/game/business/supply'
import { investmentListing } from '../src/game/investments'
import { addMarketShock, indexShockFactor, marketShocks, shockFactor, SHOCKS_KEY } from '../src/game/invest/shocks'
import { getCountry } from '../src/game/world'
import type { Json } from '../src/game/types'

afterEach(() => vi.restoreAllMocks())

function multinational() {
  const g = makeTestGame(4242, { age: 45, money: 50_000_000 })
  g.year = 2030; g.lifeId = 'plan-reads'; g.log = [{ age: 45, year: 2030, entries: [] }]
  ensureEconomy(g)
  const outlets = (['us', 'de', 'jp', 'gb'] as const).map((countryId, i) => ({ countryId, city: getCountry(countryId).cities[0], count: 2 + i % 2, opened: 2026 }))
  const b = newBiz(g, 'manufacturing', 'us', getCountry('us').cities[0], { cash: 40_000_000, founded: 2024, outlets })
  b.production = initialProduction(g, b); b.valuation = 60_000_000
  g.assets.push(createBusinessAsset(g, 'Reads Co', b, 40_000_000))
  return { g, b }
}

describe('plan search reads', () => {
  it('reads the market context and supply conditions once per search, not once per trial', () => {
    const { g, b } = multinational()
    const before = JSON.stringify(g)
    const ctx = vi.spyOn(competition, 'buildCtx'), supply = vi.spyOn(trade, 'sectorTrade')
    bestPlan(g, b, { fast: true })
    const fastCtx = ctx.mock.calls.length
    ctx.mockClear(); supply.mockClear()
    // The full search books hundreds of trials; it reads the market as often as the fastest one
    // (once for the search, once for the production ceiling) and the supply once per outlet country.
    const plan = bestPlan(g, b)
    expect(ctx.mock.calls.length).toBe(fastCtx); expect(fastCtx).toBeLessThanOrEqual(2)
    expect(supply).toHaveBeenCalledTimes(b.outlets.length)
    ctx.mockClear(); supply.mockClear()
    planOutcome(g, b, plan.price, plan.production)
    expect(ctx).toHaveBeenCalledTimes(1); expect(supply).toHaveBeenCalledTimes(b.outlets.length)
    expect(JSON.stringify(g)).toBe(before)
  })
  it('books exactly what an uncached trial books', () => {
    const { g, b } = multinational()
    const plan = planFor(g, b, g.year, { price: b.price * 1.1 })
    const cached = planFor(g, b, g.year, { price: b.price * 1.1, ctx: marketCtxFor(g, b, g.year) })
    expect(cached).toEqual(plan)
    const cold = bookYear(g, b, g.year, plan, b.production, 0)
    const warm = bookYear(g, b, g.year, cached, b.production, 0, { ...yearFixed(g, b), supply: { year: g.year, conditions: supplyConditions(g, b, g.year) } })
    expect(warm).toEqual(cold)
    // Conditions read for another year are never used.
    const stale = bookYear(g, b, g.year, plan, b.production, 0, { ...yearFixed(g, b), supply: { year: g.year - 1, conditions: { ...supplyConditions(g, b, g.year), availability: .1 } } })
    expect(stale).toEqual(cold)
  })
})

describe('market shock reads', () => {
  it('parses the stored shock record once for a whole listing, and sees every change', () => {
    const g = makeTestGame(77, { age: 40, money: 1_000_000 })
    const stocks = investmentListing(g).filter(q => q.type === 'stock')
    for (const [i, q] of stocks.entries()) {
      const m = /^(.*)#s(\d+)g(\d+)$/.exec(q.secId)!
      addMarketShock(g, { asset: 'stock', secId: q.secId, exKey: m[1], slot: Number(m[2]), name: q.name, symbol: q.symbol, cause: i % 2 ? 'liquidity' : 'contract', year: g.year, mult: 1.05, fade: 0, countryId: 'us' })
    }
    const stored = g.flags[SHOCKS_KEY] as Json[]
    expect(stored.length).toBe(stocks.length)
    // Count how often prices read the raw record.
    let reads = 0
    const counted = stored.map(raw => {
      const copy = { ...(raw as Record<string, Json>) }
      return new Proxy(copy, { get: (t, k) => { if (k === 'secId') reads++; return Reflect.get(t, k) } })
    })
    g.flags[SHOCKS_KEY] = counted as unknown as Json
    const quotes = JSON.stringify(investmentListing(g))
    for (const q of stocks) shockFactor(g, q.secId, g.year)
    expect(reads).toBe(stocks.length)
    expect(JSON.stringify(investmentListing(g))).toBe(quotes)
    // A new record (every writer replaces the array) is read again, and prices follow it.
    const first = stocks[0], m = /^(.*)#s(\d+)g(\d+)$/.exec(first.secId)!
    const priced = shockFactor(g, first.secId, g.year), index = indexShockFactor(g, m[1], g.year)
    addMarketShock(g, { asset: 'stock', secId: first.secId, exKey: m[1], slot: Number(m[2]), name: first.name, symbol: first.symbol, cause: 'contract', year: g.year, mult: 2, fade: 0, countryId: 'us' })
    expect(shockFactor(g, first.secId, g.year)).toBeCloseTo(priced * 2)
    expect(indexShockFactor(g, m[1], g.year)).toBeGreaterThan(index)
    expect(marketShocks(g)).toHaveLength(stocks.length + 1)
  })
})
