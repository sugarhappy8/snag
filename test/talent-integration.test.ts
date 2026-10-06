// Cross-module talent perks and safety rails wired by the lead: Cooking and Leadership in the
// companies you run, the deep-tech demand default for markets without a tech scene, investors'
// liquidation preference on a quick exit, and price promises in the deep-tech Annual Report.
import { describe, expect, it } from 'vitest'
import { evolve, simulateYear } from '../src/game/business/economy'
import { readTech } from '../src/game/business/deeptech-state'
import { techReportData } from '../src/game/business/deeptech-sim'
import { ownerProceeds } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import type { BizState } from '../src/game/business/state'
import { promisePrice } from '../src/game/business/util'
import { industryDemand, type Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import type { GameState, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'

function adult(countryId: string, seed: number, talents: string[] = []): GameState {
  const g = createNewLife({ seed, year: 2000, countryId })
  g.queue = []
  const c = g.character
  c.age = 35
  c.money = 5_000_000
  c.city = getCountry(countryId).cities[0]
  c.talent = null
  c.talents = talents
  return g
}

/** Quality and morale after `years` of evolve() for a company the owner runs. */
function drift(industry: Industry, talents: string[], seed: number, years = 6): { quality: number; morale: number } {
  const g = adult('us', seed, talents)
  const b = newBiz(g, industry, 'us', g.character.city, { cash: 1_000_000, ceo: 'owner' })
  for (let y = 0; y < years; y++) {
    const res = simulateYear(g, b, g.year, 0, 1)
    evolve(g, b, res.stmt, g.year)
    g.year += 1
  }
  return { quality: b.quality, morale: b.morale }
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

describe('talent perks inside companies', () => {
  it('Cooking lifts a food business owner’s quality (reviews), not a software company’s', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
    const plain = avg(seeds.map((s) => drift('restaurant', [], s).quality))
    const chef = avg(seeds.map((s) => drift('restaurant', ['Cooking'], s).quality))
    expect(chef - plain).toBeGreaterThan(4)
    const softPlain = avg(seeds.map((s) => drift('software', [], s).quality))
    const softChef = avg(seeds.map((s) => drift('software', ['Cooking'], s).quality))
    expect(Math.abs(softChef - softPlain)).toBeLessThan(0.01)
  })

  it('Leadership makes the staff of a company you run happier', () => {
    const seeds = [11, 12, 13, 14, 15, 16, 17, 18]
    const plain = avg(seeds.map((s) => drift('gym', [], s).morale))
    const leader = avg(seeds.map((s) => drift('gym', ['Leadership'], s).morale))
    expect(leader - plain).toBeGreaterThan(3)
  })
})

describe('deep tech market defaults', () => {
  it('poorer markets without hand-written data get less deep-tech demand than rich ones', () => {
    for (const ind of ['quantum', 'semiconductor', 'spaceTech'] as const) {
      const ng = industryDemand('ng', ind)
      expect(ng, ind).toBeGreaterThanOrEqual(0.25)
      expect(ng, ind).toBeLessThan(0.6)
    }
    // Classic industries keep the neutral default.
    expect(industryDemand('ng', 'bakery')).toBeGreaterThan(0)
  })
})

describe('investor preference', () => {
  it('investors are paid back first on a quick exit, and convert when the company is worth more', () => {
    const b = { share: 0.6, pref: 900_000 } as BizState
    expect(ownerProceeds(b, 1_000_000)).toBe(100_000)
    expect(ownerProceeds(b, 500_000)).toBe(0)
    // Worth far more than the preference: investors take their 40% instead.
    expect(ownerProceeds(b, 10_000_000)).toBe(6_000_000)
    // Fully owned or no preference: the owner's share.
    expect(ownerProceeds({ share: 1 } as BizState, 1_000)).toBe(1_000)
    expect(ownerProceeds({ share: 0.5 } as BizState, 1_000)).toBe(500)
  })
})

describe('deep-tech Annual Report', () => {
  it('respects a price promise made earlier in the year', () => {
    const g = adult('us', 21, ['Business'])
    const b = newBiz(g, 'cybersecurity', 'us', g.character.city, { cash: 2_000_000, ceo: 'owner' })
    const t = readTech(undefined)
    Object.assign(t, { level: 60, stage: 2 })
    b.tech = JSON.parse(JSON.stringify(t)) as Json
    const a = createBusinessAsset(g, 'Test Cyber', b, 0)
    g.assets.push(a)
    const free = techReportData(g, a, b)
    const cap = Math.max(1, Math.round(free.maxPrice * 0.5))
    promisePrice(g, a.id, cap)
    const capped = techReportData(g, a, b)
    expect(capped.maxPrice).toBeLessThanOrEqual(cap)
    expect(capped.price).toBeLessThanOrEqual(cap)
    if (capped.talentHint) expect(capped.talentHint.price).toBeLessThanOrEqual(cap)
  })
})
