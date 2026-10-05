import { describe, expect, it } from 'vitest'
import {
  INDUSTRY_IDS,
  corporateTax,
  exchangeFor,
  hasMarketData,
  industryDemand,
  isIndustryLegal,
  localPriceMult,
  marketOf,
  salesTaxRate,
  type Industry,
} from '../src/game/data/markets'
import { AMERICAS_MARKETS } from '../src/game/data/markets/americas'
import { COUNTRIES, getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

const AMERICAS = [
  'us', 'aw', 'bs', 'bz', 'ca', 'cr', 'cu', 'do', 'sv', 'gt', 'ht', 'jm', 'mx', 'ni', 'pa', 'pr',
  'ar', 'bo', 'br', 'cl', 'co', 'ec', 'gy', 'py', 'pe', 'uy', 've',
]

const PRICE_CATEGORIES = ['car', 'electronics', 'luxury', 'alcohol', 'food', 'fuel']

describe('Americas market data', () => {
  it('covers exactly the 27 American countries in world.ts', () => {
    expect(new Set(AMERICAS).size).toBe(27)
    expect(Object.keys(AMERICAS_MARKETS).sort()).toEqual([...AMERICAS].sort())
    const inWorld = COUNTRIES.filter((c) => c.continent === 'North America' || c.continent === 'South America').map((c) => c.id)
    expect(inWorld.sort()).toEqual([...AMERICAS].sort())
    for (const id of AMERICAS) {
      expect(hasMarketData(id), id).toBe(true)
      expect(getCountry(id).id).toBe(id)
      expect(marketOf(id).countryId).toBe(id)
      expect(AMERICAS_MARKETS[id].countryId).toBe(id)
    }
  })

  it.each(AMERICAS)('%s has in-range, well-formed figures', (id) => {
    const m = marketOf(id)
    const wealth = getCountry(id).wealth
    expect(m.currencyName.trim().length).toBeGreaterThan(0)
    expect(m.currencyCode).toMatch(/^[A-Z]{3}$/)
    expect(m.gdpPerCapita).toBeGreaterThan(0)
    expect(m.populationM).toBeGreaterThan(0)
    for (const rate of [m.corporateTax, m.salesTax, m.interestRate]) {
      expect(Number.isFinite(rate)).toBe(true)
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(1)
    }
    expect(Number.isFinite(m.inflation)).toBe(true)
    expect(m.inflation).toBeGreaterThanOrEqual(-0.05)
    expect(m.inflation).toBeLessThanOrEqual(5)
    expect(m.salesTaxName.trim().length).toBeGreaterThan(0)
    expect(m.minWage).toBeGreaterThanOrEqual(0)
    expect(m.laborCost).toBeGreaterThan(0)
    // Salaries are US pay x wealth, so business wages must stay close to it.
    expect(m.laborCost).toBeGreaterThanOrEqual(wealth * 0.65 - 1e-9)
    expect(m.laborCost).toBeLessThanOrEqual(wealth * 1.35 + 1e-9)
    expect(m.rentCost).toBeGreaterThan(0)
    expect(m.rentCost).toBeLessThanOrEqual(5)
    expect(m.easeOfBusiness).toBeGreaterThanOrEqual(0)
    expect(m.easeOfBusiness).toBeLessThanOrEqual(100)
    expect(m.corruption).toBeGreaterThanOrEqual(0)
    expect(m.corruption).toBeLessThanOrEqual(100)
    expect(Number.isInteger(m.startupDays)).toBe(true)
    expect(m.startupDays).toBeGreaterThan(0)
    expect(m.startupFee).toBeGreaterThan(0)

    if (m.exchange) {
      expect(m.exchange.name.trim().length).toBeGreaterThan(0)
      expect(m.exchange.code).toMatch(/^[A-Z0-9]{2,8}$/)
      expect(m.exchange.index.trim().length).toBeGreaterThan(0)
      expect(m.exchange.volatility).toBeGreaterThanOrEqual(0.1)
      expect(m.exchange.volatility).toBeLessThanOrEqual(0.6)
      expect(m.exchange.drift).toBeGreaterThan(-0.1)
      expect(m.exchange.drift).toBeLessThan(0.3)
    }

    for (const [industry, value] of Object.entries(m.demand)) {
      expect(INDUSTRY_IDS as readonly string[], `${id} demand ${industry}`).toContain(industry)
      expect(value).toBeGreaterThanOrEqual(0.3)
      expect(value).toBeLessThanOrEqual(3)
    }
    for (const industry of m.banned) expect(INDUSTRY_IDS as readonly string[]).toContain(industry)
    expect(new Set(m.banned).size).toBe(m.banned.length)

    for (const [category, value] of Object.entries(m.priceMult)) {
      expect(PRICE_CATEGORIES, `${id} priceMult ${category}`).toContain(category)
      expect(value).toBeGreaterThanOrEqual(0.03)
      expect(value).toBeLessThanOrEqual(4)
    }

    expect(m.businessNote.trim().length).toBeGreaterThan(20)
    expect(m.businessNote).toMatch(/[.!?]$/)
    expect(m.businessNote).not.toMatch(/TODO|TBD|lorem/i)
    expect(m.nameWords.length).toBeGreaterThanOrEqual(6)
    expect(m.nameWords.length).toBeLessThanOrEqual(10)
    for (const word of m.nameWords) expect(word.trim().length).toBeGreaterThan(0)
    expect(new Set(m.nameWords).size).toBe(m.nameWords.length)
  })

  it('keeps the US as the neutral price baseline', () => {
    const us = marketOf('us')
    expect(us.laborCost).toBe(1)
    expect(us.rentCost).toBe(1)
    expect(us.priceMult).toEqual({})
    expect(us.exchange?.code).toBe('NYSE')
  })

  it('feeds the market helpers with local figures', () => {
    const g = makeTestGame()
    g.character.countryId = 'br'
    expect(salesTaxRate(g)).toBeCloseTo(0.18)
    expect(localPriceMult(g, 'electronics')).toBeGreaterThan(1.3)
    g.character.countryId = 've'
    expect(localPriceMult(g, 'fuel')).toBeLessThan(0.5)
    g.character.countryId = 'uy'
    expect(localPriceMult(g, 'fuel')).toBeGreaterThan(1.5)
    expect(corporateTax('bs', 100_000)).toBe(0)
    expect(corporateTax('py', 100_000)).toBe(10_000)
  })

  it('bans private clinics and power companies in Cuba only', () => {
    for (const industry of ['clinic', 'energy'] as Industry[]) {
      expect(isIndustryLegal('cu', industry)).toBe(false)
      expect(industryDemand('cu', industry)).toBe(0)
    }
    for (const id of AMERICAS.filter((c) => c !== 'cu')) expect(marketOf(id).banned).toEqual([])
    expect(marketOf('cu').businessNote).toMatch(/clinic/i)
  })

  it('falls back to a regional exchange where there is no local one', () => {
    expect(exchangeFor('pr').code).toBe('NYSE')
    expect(exchangeFor('cu').code).toBe('NYSE')
    expect(exchangeFor('uy').code).toBe('B3')
    expect(exchangeFor('ec').code).toBe('B3')
    expect(exchangeFor('mx').code).toBe('BMV')
    const codes = AMERICAS.map((id) => marketOf(id).exchange?.code).filter((c): c is string => !!c)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
