import { describe, expect, it } from 'vitest'
import {
  INDUSTRY_IDS,
  exchangeFor,
  hasMarketData,
  industryDemand,
  isIndustryLegal,
  marketOf,
  type MarketProfile,
  type PriceCategory,
} from '../src/game/data/markets'
import { AFRICA_MIDDLE_EAST_MARKETS } from '../src/game/data/markets/africaMiddleEast'
import { getCountry } from '../src/game/world'

const IDS = [
  'dz', 'ao', 'dj', 'cd', 'eg', 'et', 'ke', 'ma', 'ng', 'za', 'tn', 'ug', 'zw',
  'ge', 'ir', 'iq', 'il', 'jo', 'kw', 'lb', 'qa', 'sa', 'sy', 'tr', 'ae',
]
const PRICE_CATEGORIES: PriceCategory[] = ['car', 'electronics', 'luxury', 'alcohol', 'food', 'fuel']
const INDUSTRIES = new Set<string>(INDUSTRY_IDS)

function eachMarket(fn: (m: MarketProfile, id: string) => void): void {
  for (const id of IDS) fn(AFRICA_MIDDLE_EAST_MARKETS[id], id)
}

function inRange(value: number, lo: number, hi: number, label: string): void {
  expect(Number.isFinite(value), label).toBe(true)
  expect(value, label).toBeGreaterThanOrEqual(lo)
  expect(value, label).toBeLessThanOrEqual(hi)
}

describe('Africa and Middle East market data', () => {
  it('covers exactly the 25 regional countries, each a real world.ts nation', () => {
    expect(Object.keys(AFRICA_MIDDLE_EAST_MARKETS).sort()).toEqual([...IDS].sort())
    for (const id of IDS) {
      expect(hasMarketData(id), id).toBe(true)
      expect(getCountry(id).id, id).toBe(id)
      expect(['Africa', 'Middle East'], id).toContain(getCountry(id).continent)
      expect(AFRICA_MIDDLE_EAST_MARKETS[id].countryId, id).toBe(id)
      expect(marketOf(id), id).toBe(AFRICA_MIDDLE_EAST_MARKETS[id])
    }
  })

  it('has sane identity and economy figures', () => {
    eachMarket((m, id) => {
      expect(m.currencyName.trim().length, id).toBeGreaterThan(0)
      expect(m.currencyCode, id).toMatch(/^[A-Z]{3}$/)
      expect(m.salesTaxName.trim().length, id).toBeGreaterThan(0)
      inRange(m.gdpPerCapita, 100, 200_000, `${id} gdpPerCapita`)
      expect(m.gdpPerCapita, id).toBeGreaterThan(0)
      inRange(m.populationM, 0.1, 2_000, `${id} populationM`)
      inRange(m.corporateTax, 0, 1, `${id} corporateTax`)
      inRange(m.salesTax, 0, 1, `${id} salesTax`)
      inRange(m.interestRate, 0, 1, `${id} interestRate`)
      inRange(m.inflation, 0, 5, `${id} inflation`)
      inRange(m.minWage, 0, 100_000, `${id} minWage`)
      inRange(m.rentCost, 0.05, 5, `${id} rentCost`)
      inRange(m.easeOfBusiness, 0, 100, `${id} easeOfBusiness`)
      inRange(m.corruption, 0, 100, `${id} corruption`)
      inRange(m.startupDays, 1, 365, `${id} startupDays`)
      expect(Number.isInteger(m.startupDays), id).toBe(true)
      inRange(m.startupFee, 1, 50_000, `${id} startupFee`)
    })
  })

  it('keeps labor cost within about 35% of the country wealth', () => {
    eachMarket((m, id) => {
      const wealth = getCountry(id).wealth
      expect(m.laborCost, id).toBeGreaterThan(0)
      expect(m.laborCost, id).toBeGreaterThanOrEqual(wealth * 0.65 - 1e-9)
      expect(m.laborCost, id).toBeLessThanOrEqual(wealth * 1.35 + 1e-9)
    })
  })

  it('lists real exchanges with valid fields when present', () => {
    eachMarket((m, id) => {
      if (!m.exchange) return
      const x = m.exchange
      expect(x.name.trim().length, id).toBeGreaterThan(0)
      expect(x.code, id).toMatch(/^[A-Z]{2,8}$/)
      expect(x.index.trim().length, id).toBeGreaterThan(0)
      inRange(x.volatility, 0.1, 0.6, `${id} volatility`)
      inRange(x.drift, -0.05, 0.2, `${id} drift`)
    })
  })

  it('provides the regional fallback exchanges (JSE for Africa, DFM for the Middle East)', () => {
    expect(marketOf('za').exchange?.code).toBe('JSE')
    expect(marketOf('ae').exchange?.code).toBe('DFM')
    eachMarket((m, id) => {
      const x = exchangeFor(id)
      if (m.exchange) expect(x, id).toBe(m.exchange)
      else expect(x.code, id).toBe(getCountry(id).continent === 'Africa' ? 'JSE' : 'DFM')
    })
  })

  it('uses only valid industries for demand and bans', () => {
    eachMarket((m, id) => {
      const keys = Object.keys(m.demand)
      expect(keys.length, id).toBeGreaterThanOrEqual(4)
      expect(keys.length, id).toBeLessThanOrEqual(10)
      for (const [industry, value] of Object.entries(m.demand)) {
        expect(INDUSTRIES.has(industry), `${id} demand ${industry}`).toBe(true)
        inRange(value as number, 0.3, 3, `${id} demand ${industry}`)
      }
      expect(new Set(m.banned).size, id).toBe(m.banned.length)
      for (const industry of m.banned) {
        expect(INDUSTRIES.has(industry), `${id} banned ${industry}`).toBe(true)
        expect(m.demand[industry], `${id} demand for banned ${industry}`).toBeUndefined()
        expect(industryDemand(id, industry), id).toBe(0)
        expect(isIndustryLegal(id, industry), id).toBe(false)
      }
    })
  })

  it('bans bars and breweries where alcohol is prohibited, and nothing else', () => {
    for (const id of ['ir', 'kw', 'sa', 'qa']) {
      expect([...AFRICA_MIDDLE_EAST_MARKETS[id].banned].sort(), id).toEqual(['bar', 'brewery'])
      expect(AFRICA_MIDDLE_EAST_MARKETS[id].businessNote.toLowerCase(), id).toMatch(/alcohol|bars/)
    }
    for (const id of ['ae', 'tr', 'lb', 'eg', 'ng', 'za', 'il']) expect(isIndustryLegal(id, 'bar'), id).toBe(true)
  })

  it('keeps local price multipliers in range', () => {
    eachMarket((m, id) => {
      for (const [category, value] of Object.entries(m.priceMult)) {
        expect(PRICE_CATEGORIES, `${id} priceMult ${category}`).toContain(category)
        inRange(value as number, 0.03, 4, `${id} priceMult ${category}`)
      }
    })
    // Oil states subsidize petrol; Israel taxes it heavily.
    expect(AFRICA_MIDDLE_EAST_MARKETS.ir.priceMult.fuel).toBeLessThan(0.1)
    expect(AFRICA_MIDDLE_EAST_MARKETS.kw.priceMult.fuel).toBeLessThan(0.5)
    expect(AFRICA_MIDDLE_EAST_MARKETS.il.priceMult.fuel).toBeGreaterThan(1.5)
  })

  it('has a finished business note and local company name words', () => {
    eachMarket((m, id) => {
      const note = m.businessNote.trim()
      expect(note.length, id).toBeGreaterThan(40)
      expect(note.length, id).toBeLessThanOrEqual(220)
      expect(note, id).toMatch(/[.!]$/)
      expect(note, id).not.toMatch(/TODO|TBD|lorem|undefined|NaN/i)
      expect(m.nameWords.length, id).toBeGreaterThanOrEqual(6)
      expect(m.nameWords.length, id).toBeLessThanOrEqual(10)
      expect(new Set(m.nameWords).size, id).toBe(m.nameWords.length)
      for (const w of m.nameWords) expect(w.trim().length, id).toBeGreaterThan(0)
    })
  })

  it('stays plain JSON', () => {
    expect(JSON.parse(JSON.stringify(AFRICA_MIDDLE_EAST_MARKETS))).toEqual(AFRICA_MIDDLE_EAST_MARKETS)
  })
})
