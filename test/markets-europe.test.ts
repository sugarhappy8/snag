import { describe, expect, it } from 'vitest'
import { EUROPE_MARKETS } from '../src/game/data/markets/europe'
import { INDUSTRY_IDS, exchangeFor, hasMarketData, industryDemand, marketOf, type Industry } from '../src/game/data/markets'
import { countriesIn, getCountry } from '../src/game/world'

const EUROPE_IDS = [
  'ad', 'at', 'be', 'hr', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'mc', 'nl', 'no', 'pl', 'pt', 'ro',
  'ru', 'rs', 'sk', 'es', 'se', 'ch', 'ua', 'gb',
]
const PRICE_CATEGORIES = ['car', 'electronics', 'luxury', 'alcohol', 'food', 'fuel']
const EURO_IDS = ['ad', 'at', 'be', 'hr', 'ee', 'fi', 'fr', 'de', 'gr', 'ie', 'it', 'mc', 'nl', 'pt', 'sk', 'es']

describe('European market data', () => {
  it('covers every listed country, and every European country in world.ts', () => {
    for (const id of EUROPE_IDS) {
      expect(hasMarketData(id), id).toBe(true)
      expect(EUROPE_MARKETS[id], id).toBeDefined()
    }
    for (const c of countriesIn('Europe')) expect(EUROPE_IDS, c.id).toContain(c.id)
    expect(Object.keys(EUROPE_MARKETS).sort()).toEqual([...EUROPE_IDS].sort())
  })

  it('keys each profile by its own countryId', () => {
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      expect(m.countryId).toBe(id)
      expect(marketOf(id)).toBe(m)
    }
  })

  it('keeps every number finite and in range', () => {
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      const label = `${id}: ${JSON.stringify(m)}`
      for (const field of ['corporateTax', 'salesTax', 'interestRate'] as const) {
        expect(m[field], `${label} ${field}`).toBeGreaterThanOrEqual(0)
        expect(m[field], `${label} ${field}`).toBeLessThan(1)
      }
      expect(Number.isFinite(m.inflation), label).toBe(true)
      expect(m.inflation, label).toBeGreaterThan(-0.05)
      expect(m.inflation, label).toBeLessThan(0.5)
      expect(m.gdpPerCapita, label).toBeGreaterThan(0)
      expect(m.populationM, label).toBeGreaterThan(0)
      expect(m.minWage, label).toBeGreaterThanOrEqual(0)
      expect(m.minWage, label).toBeLessThan(m.gdpPerCapita)
      expect(m.laborCost, label).toBeGreaterThan(0)
      expect(m.rentCost, label).toBeGreaterThan(0)
      expect(m.rentCost, label).toBeLessThanOrEqual(4)
      for (const field of ['easeOfBusiness', 'corruption'] as const) {
        expect(m[field], `${label} ${field}`).toBeGreaterThanOrEqual(0)
        expect(m[field], `${label} ${field}`).toBeLessThanOrEqual(100)
      }
      expect(m.startupDays, label).toBeGreaterThan(0)
      expect(m.startupFee, label).toBeGreaterThan(0)
    }
  })

  it('keeps labour cost within about 35% of world.ts wealth', () => {
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      const wealth = getCountry(id).wealth
      expect(m.laborCost, id).toBeGreaterThanOrEqual(wealth * 0.65)
      expect(m.laborCost, id).toBeLessThanOrEqual(wealth * 1.35)
    }
  })

  it('names currencies and taxes', () => {
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      expect(m.currencyName.length, id).toBeGreaterThan(0)
      expect(m.currencyCode, id).toMatch(/^[A-Z]{3}$/)
      expect(m.salesTaxName.length, id).toBeGreaterThan(0)
    }
    for (const id of EURO_IDS) expect(EUROPE_MARKETS[id].currencyCode, id).toBe('EUR')
    expect(EUROPE_MARKETS.gb.currencyCode).toBe('GBP')
    expect(EUROPE_MARKETS.ch.currencyCode).toBe('CHF')
  })

  it('has valid stock exchanges, with a fallback where there is none', () => {
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      const ex = m.exchange
      if (ex) {
        expect(ex.name.length, id).toBeGreaterThan(0)
        expect(ex.code.length, id).toBeGreaterThan(0)
        expect(ex.index.length, id).toBeGreaterThan(0)
        expect(ex.volatility, id).toBeGreaterThanOrEqual(0.1)
        expect(ex.volatility, id).toBeLessThanOrEqual(0.6)
        expect(ex.drift, id).toBeGreaterThan(-0.05)
        expect(ex.drift, id).toBeLessThan(0.3)
      }
      const used = exchangeFor(id)
      expect(used.name.length, id).toBeGreaterThan(0)
    }
    // France hosts the regional fallback exchange for Europe.
    expect(EUROPE_MARKETS.fr.exchange).not.toBeNull()
    expect(exchangeFor('mc')).toEqual(EUROPE_MARKETS.fr.exchange)
  })

  it('uses valid industries for demand and bans', () => {
    const valid = new Set<string>(INDUSTRY_IDS)
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      for (const [industry, mult] of Object.entries(m.demand)) {
        expect(valid.has(industry), `${id} ${industry}`).toBe(true)
        expect(mult, `${id} ${industry}`).toBeGreaterThanOrEqual(0.3)
        expect(mult, `${id} ${industry}`).toBeLessThanOrEqual(3)
      }
      for (const industry of m.banned) {
        expect(valid.has(industry), `${id} ${industry}`).toBe(true)
        expect(industryDemand(id, industry as Industry)).toBe(0)
      }
      expect(new Set(m.banned).size, id).toBe(m.banned.length)
    }
  })

  it('keeps shop price multipliers in range', () => {
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      for (const [category, mult] of Object.entries(m.priceMult)) {
        expect(PRICE_CATEGORIES, `${id} ${category}`).toContain(category)
        expect(mult, `${id} ${category}`).toBeGreaterThanOrEqual(0.03)
        expect(mult, `${id} ${category}`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('has a business note and local name words', () => {
    for (const [id, m] of Object.entries(EUROPE_MARKETS)) {
      expect(m.businessNote.length, id).toBeGreaterThan(20)
      expect(m.businessNote, id).toMatch(/[.!]$/)
      expect(m.nameWords.length, id).toBeGreaterThanOrEqual(6)
      expect(m.nameWords.length, id).toBeLessThanOrEqual(10)
      for (const word of m.nameWords) expect(word.trim().length, id).toBeGreaterThan(0)
      expect(new Set(m.nameWords).size, id).toBe(m.nameWords.length)
    }
  })

  it('reflects some well-known local differences', () => {
    expect(EUROPE_MARKETS.hu.corporateTax).toBeLessThan(EUROPE_MARKETS.de.corporateTax)
    expect(EUROPE_MARKETS.hu.salesTax).toBeGreaterThan(EUROPE_MARKETS.ch.salesTax)
    expect(industryDemand('no', 'energy')).toBeGreaterThan(2)
    expect(industryDemand('mc', 'farm')).toBe(0)
    expect(EUROPE_MARKETS.no.priceMult.alcohol ?? 1).toBeGreaterThan(EUROPE_MARKETS.cz.priceMult.alcohol ?? 1)
    expect(EUROPE_MARKETS.ru.priceMult.fuel ?? 1).toBeLessThan(EUROPE_MARKETS.nl.priceMult.fuel ?? 1)
  })
})
