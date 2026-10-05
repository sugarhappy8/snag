import { describe, expect, it } from 'vitest'
import { ASIA_OCEANIA_MARKETS } from '../src/game/data/markets/asiaOceania'
import {
  INDUSTRY_IDS,
  exchangeFor,
  hasMarketData,
  industryDemand,
  isIndustryLegal,
  marketOf,
  type Industry,
  type PriceCategory,
} from '../src/game/data/markets'
import { COUNTRIES, getCountry } from '../src/game/world'

const IDS = [
  'af', 'bd', 'cn', 'hk', 'in', 'id', 'jp', 'kz', 'my', 'mn', 'np',
  'pk', 'ph', 'sg', 'kr', 'tw', 'th', 'vn', 'au', 'nz', 'pg', 'ws',
]
const PRICE_CATEGORIES: PriceCategory[] = ['car', 'electronics', 'luxury', 'alcohol', 'food', 'fuel']
const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi

describe('Asia & Oceania market data', () => {
  it('covers exactly the 22 Asian and Oceanian countries in world.ts', () => {
    const worldIds = COUNTRIES.filter((c) => c.continent === 'Asia' || c.continent === 'Oceania').map((c) => c.id)
    expect(Object.keys(ASIA_OCEANIA_MARKETS).sort()).toEqual([...IDS].sort())
    for (const id of IDS) {
      expect(worldIds, id).toContain(id)
      expect(hasMarketData(id), id).toBe(true)
      expect(marketOf(id), id).toBe(ASIA_OCEANIA_MARKETS[id])
    }
  })

  for (const id of IDS) {
    it(`${id}: every field is in range`, () => {
      const m = ASIA_OCEANIA_MARKETS[id]
      expect(m.countryId).toBe(id)
      expect(m.currencyName.length).toBeGreaterThan(2)
      expect(m.currencyCode).toMatch(/^[A-Z]{3}$/)

      expect(m.gdpPerCapita).toBeGreaterThan(0)
      expect(m.populationM).toBeGreaterThan(0)
      for (const v of [m.corporateTax, m.salesTax, m.interestRate]) expect(inRange(v, 0, 1)).toBe(true)
      expect(inRange(m.inflation, -0.1, 5)).toBe(true)
      expect(m.salesTaxName.length).toBeGreaterThan(1)
      expect(inRange(m.minWage, 0, 60_000)).toBe(true)

      // Salaries are US pay x wealth, so business labor costs must stay close to it.
      const wealth = getCountry(id).wealth ?? 1
      expect(m.laborCost).toBeGreaterThan(0)
      expect(m.laborCost / wealth).toBeGreaterThanOrEqual(0.65)
      expect(m.laborCost / wealth).toBeLessThanOrEqual(1.35)
      expect(inRange(m.rentCost, 0.05, 4)).toBe(true)

      expect(inRange(m.easeOfBusiness, 0, 100)).toBe(true)
      expect(inRange(m.corruption, 0, 100)).toBe(true)
      expect(m.startupDays).toBeGreaterThan(0)
      expect(Number.isInteger(m.startupDays)).toBe(true)
      expect(m.startupFee).toBeGreaterThan(0)

      if (m.exchange) {
        expect(m.exchange.name.length).toBeGreaterThan(3)
        expect(m.exchange.code).toMatch(/^[A-Z]{2,6}$/)
        expect(m.exchange.index.length).toBeGreaterThan(2)
        expect(inRange(m.exchange.volatility, 0.1, 0.6)).toBe(true)
        expect(inRange(m.exchange.drift, 0, 0.3)).toBe(true)
      }

      for (const [industry, v] of Object.entries(m.demand)) {
        expect(INDUSTRY_IDS, `${id} demand.${industry}`).toContain(industry)
        expect(inRange(v as number, 0.3, 3), `${id} demand.${industry}=${v}`).toBe(true)
      }
      for (const industry of m.banned) {
        expect(INDUSTRY_IDS).toContain(industry)
        expect(m.demand[industry], `${id} bans ${industry} but lists demand for it`).toBeUndefined()
      }
      expect(new Set(m.banned).size).toBe(m.banned.length)

      for (const [cat, v] of Object.entries(m.priceMult)) {
        expect(PRICE_CATEGORIES, `${id} priceMult.${cat}`).toContain(cat)
        expect(inRange(v as number, 0.03, 4), `${id} priceMult.${cat}=${v}`).toBe(true)
      }

      expect(m.businessNote.length).toBeGreaterThan(30)
      expect(m.businessNote.length).toBeLessThan(200)
      expect(m.nameWords.length).toBeGreaterThanOrEqual(6)
      expect(m.nameWords.length).toBeLessThanOrEqual(10)
      for (const w of m.nameWords) expect(w.trim().length).toBeGreaterThan(1)
      expect(new Set(m.nameWords).size).toBe(m.nameWords.length)
    })
  }

  it('bans industries only where they are genuinely illegal', () => {
    const illegal = (id: string, industry: Industry) => !isIndustryLegal(id, industry)
    expect(illegal('af', 'bar') && illegal('af', 'brewery') && illegal('af', 'salon')).toBe(true)
    expect(illegal('pk', 'bar') && illegal('pk', 'brewery')).toBe(true)
    expect(industryDemand('af', 'salon')).toBe(0)
    expect(isIndustryLegal('my', 'bar')).toBe(true)
    expect(isIndustryLegal('th', 'bar')).toBe(true)
    const banning = IDS.filter((id) => ASIA_OCEANIA_MARKETS[id].banned.length > 0).sort()
    expect(banning).toEqual(['af', 'pk'])
  })

  it('feels different from country to country', () => {
    expect(marketOf('sg').priceMult.car).toBeGreaterThan(2)
    expect(marketOf('hk').salesTax).toBe(0)
    expect(marketOf('hk').rentCost).toBeGreaterThan(marketOf('np').rentCost * 5)
    expect(industryDemand('th', 'hotel')).toBeGreaterThan(1.5)
    expect(industryDemand('kz', 'energy')).toBeGreaterThan(1.5)
    expect(industryDemand('kr', 'beauty')).toBeGreaterThan(1.5)
    expect(industryDemand('nz', 'farm')).toBeGreaterThan(1.5)
    expect(marketOf('my').priceMult.fuel).toBeLessThan(1)
    expect(marketOf('nz').easeOfBusiness).toBeGreaterThan(marketOf('af').easeOfBusiness)
  })

  it('countries without a meaningful exchange invest on the nearest regional one', () => {
    for (const id of ['af', 'pg', 'ws']) expect(ASIA_OCEANIA_MARKETS[id].exchange).toBeNull()
    expect(exchangeFor('af').code).toBe('SGX')
    expect(exchangeFor('pg').code).toBe('ASX')
    expect(exchangeFor('ws').code).toBe('ASX')
    expect(exchangeFor('jp').index).toBe('Nikkei 225')
  })
})
