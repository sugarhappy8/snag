// The yearly world economy memoizes pure lookups (route terms by year, wars by country, CPI by
// year). These pin that the memos never change an answer, whatever was asked before.
import { describe, expect, it } from 'vitest'
import { initialCountry, type CountryEconomy } from '../src/game/economy/model'
import { countryTrade } from '../src/game/economy/trade'
import { WARS, warStartFor, warsAt } from '../src/game/history/events-wars'
import { PRESENT_YEAR, priceLevel } from '../src/game/history/timeline'
import { COUNTRIES } from '../src/game/world'

function frame(year: number): Record<string, CountryEconomy> {
  return Object.fromEntries(COUNTRIES.map(c => [c.id, initialCountry(c.id, year)]))
}

describe('world economy memos', () => {
  it('warsAt lists exactly the wars of the full table, in table order', () => {
    const ids = new Set([...COUNTRIES.map(c => c.id), ...WARS.flatMap(w => w.countries)])
    for (const id of ids) for (let year = 1890; year <= PRESENT_YEAR + 2; year++) {
      const naive = year >= PRESENT_YEAR ? [] : WARS.filter(w => w.countries.includes(id) && year >= warStartFor(w, id) && year <= w.to)
      expect(warsAt(id, year).map(w => w.id), `${id} ${year}`).toEqual(naive.map(w => w.id))
    }
    // Callers get their own list.
    const first = warsAt('us', 1944)
    first.length = 0
    expect(warsAt('us', 1944).length).toBeGreaterThan(0)
  })

  it('a year of trade settles the same after other years have churned the route memo', () => {
    const opening = frame(2030)
    const before = JSON.stringify(COUNTRIES.slice(0, 12).map(c => countryTrade(opening, c.id, 2031)))
    for (const year of [1961, 1991, 2041]) {
      const old = frame(year - 1)
      for (const c of COUNTRIES.slice(0, 10)) countryTrade(old, c.id, year)
    }
    expect(JSON.stringify(COUNTRIES.slice(0, 12).map(c => countryTrade(opening, c.id, 2031)))).toBe(before)
    // A different opening world with the same countries is not mistaken for this one.
    const reordered = Object.fromEntries(Object.entries(opening).reverse())
    expect(JSON.stringify(COUNTRIES.slice(0, 12).map(c => countryTrade(reordered, c.id, 2031)))).toBe(before)
  })

  it('price-level conversions are the same on repeat, for whole and fractional years', () => {
    for (const year of [1900, 1933.5, 1980, 2008, PRESENT_YEAR, 2040]) {
      const first = priceLevel(year)
      expect(priceLevel(year)).toBe(first)
      expect(Number.isFinite(first)).toBe(true)
    }
    expect(priceLevel(1980)).toBeLessThan(priceLevel(2008))
    // Fractional years are not memoized under a whole year.
    const [a, mid, b] = [priceLevel(1950), priceLevel(1950.5), priceLevel(1951)]
    expect(mid).toBeGreaterThan(Math.min(a, b)); expect(mid).toBeLessThan(Math.max(a, b))
  })
})
