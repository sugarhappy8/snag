// The four newer deep-tech trades (fusion, neurotech, drones, carbon removal) must offer ideas to
// develop from the day they open, not only once their consumer-era products arrive. The shared
// anachronism rules and the half-lag world markets used to empty the list for years.
import { describe, expect, it } from 'vitest'
import { marketDef } from '../src/game/business/competition-data'
import { INDUSTRIES } from '../src/game/business/industries'
import { demandCurve, demandLevel } from '../src/game/business/product-data'
import { classicIdeas, productIdeas } from '../src/game/business/products'
import { readBiz } from '../src/game/business/state'
import { anachronismsIn } from '../src/game/events/era'
import { adult, company } from './market-kit'

const NEWER = ['fusion', 'neurotech', 'drones', 'carbonCapture'] as const

/** The year a kind of product is first sold somewhere rich. */
function firstYear(name: string): number {
  const c = demandCurve(name)
  return Array.isArray(c) ? (c[0] as number) : ((c as { first?: number }).first ?? 0)
}

describe('ideas for the newer deep-tech trades', () => {
  it('offers at least three classic ideas and a full list from the opening year to 2040, at home and in a lagging country', () => {
    for (const ind of NEWER) {
      const open = marketDef(ind).from!
      for (const country of ['us', 'in']) {
        for (let year = open; year <= 2040; year++) {
          const g = adult(3, year, country)
          const b = readBiz(g, company(g, ind))
          const classics = classicIdeas(g, b)
          expect(classics.length, `${ind} ${country} ${year}`).toBeGreaterThanOrEqual(3)
          const ideas = productIdeas(g, b, 8)
          expect(ideas.length, `${ind} ${country} ${year}`).toBe(8)
          expect(new Set(ideas).size, `${ind} ${country} ${year} has duplicates`).toBe(ideas.length)
          for (const x of ideas) expect(x.trim().length, `${ind} ${country} ${year}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('never names a product with a word that did not exist in the year it first sells', () => {
    for (const ind of NEWER) {
      for (const name of INDUSTRIES[ind].products) {
        const first = firstYear(name)
        expect(anachronismsIn(name, first, ['us']), `${name} in ${first}`).toEqual([])
        expect(demandLevel(name, 'world', first + 8).exists, `${name} exists eight years after it first sells`).toBe(true)
      }
    }
  })
})

describe('first years of older trades’ new ideas', () => {
  it('dates canned six-packs, windshield chip repair and liner cruises to their real decades', () => {
    expect(firstYear('Lager Six-Pack Line')).toBeGreaterThanOrEqual(1935)
    expect(firstYear('Lager Six-Pack Line')).toBeLessThanOrEqual(1940)
    expect(firstYear('Windshield Repair')).toBe(1972)
    expect(firstYear('Cruise Bookings')).toBeLessThanOrEqual(1925)
    expect(firstYear('Cruise Bookings')).toBeGreaterThanOrEqual(1915)
  })
})
