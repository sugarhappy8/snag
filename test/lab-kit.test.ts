// The R&D 3.0 test kit must leave a breakthrough the way the engine does: a kit launch that no real launch
// could produce hides defects in everything that reads the record (the patent shield and the lead date
// above all). One company launches through startHeavy and advanceHeavy, its twin through the kit, and the
// two records and lines must agree on everything the roll doesn't decide.
import { describe, expect, it } from 'vitest'
import { marketKey } from '../src/game/business/competition-core'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { advanceHeavy, heavyCost, heavyLead, heavyYears, readHeavy, startHeavy } from '../src/game/business/heavy-rd'
import type { Industry } from '../src/game/data/markets'
import { labGame, launchBreakthrough } from './lab-kit'

/** What the engine leaves after a launch this year: the project is started now and its last year just ended. */
function realLaunch(seed: number, industry: Industry, country: string) {
  const { g, a, b } = labGame(seed, industry, { country })
  const name = breakthroughsFor(industry)[0].name
  const paid = heavyCost(g, b)
  const p = startHeavy(g, a, b, name)
  expect(p, `${industry} starts`).not.toBeNull()
  p!.odds = 1
  expect(advanceHeavy(g, a, b, p!, g.year - 1).won, `${industry} wins`).toBe(true)
  return { g, b, name, paid, rec: readHeavy(g, b.industry, marketKey(b))[0], line: b.products.find((x) => x.name === name)! }
}

describe('the launchBreakthrough kit', () => {
  it('writes the record and the line a real launch writes [kit]', () => {
    for (const [industry, country] of [['restaurant', 'us'], ['brewery', 'ca'], ['software', 'us']] as const) {
      const real = realLaunch(90, industry, country)
      const { g, a, b } = labGame(90, industry, { country })
      const family = launchBreakthrough(g, a, b)
      const rec = readHeavy(g, b.industry, marketKey(b))[0]
      const line = b.products.find((x) => x.name === family)!
      expect(family, industry).toBe(real.name)
      // the launch year is the first year the line is on sale: this year, and the year the engine files it under
      expect(real.rec.year, industry).toBe(g.year)
      expect(rec.year, industry).toBe(real.rec.year)
      expect(line.launched, industry).toBe(real.line.launched)
      // development years are the trade's own (4 to 6), the cost is what the company paid for it
      expect(rec.years, industry).toBe(heavyYears(b))
      expect(rec.years, industry).toBe(real.rec.years)
      expect(rec.cost, industry).toBe(real.paid)
      expect(rec.cost, industry).toBe(real.rec.cost)
      expect(rec.by, industry).toBe(a.id)
      expect(line.kind, industry).toBe(real.line.kind)
      expect(line.family, industry).toBe(real.line.family)
      // so the first giant rival can follow after the development time, as the news line says
      expect(heavyLead(rec), industry).toBe(g.year + heavyYears(b))
    }
  }, 120_000)
})
