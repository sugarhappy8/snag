// The Device and Platform Company: one classic trade with eight dated kinds (home computers from 1977,
// mobile phones, desktops, laptops, smartphones, VR, AR and an operating system). This file pins the
// registration: the id lists, the industry and market entries, the tables that name every trade, the era
// gate, ideas in every year and a late country, first years free of anachronism, and a calibrated plan.
import { describe, expect, it } from 'vitest'
import { DEVICE_NETWORK, HARDWARE_FAMILIES, OS_FAMILY } from '../src/game/business/devices-data'
import { INDUSTRIES } from '../src/game/business/industries'
import { industryEraBlock, MARKETS } from '../src/game/business/competition-data'
import { relatedness } from '../src/game/business/conglomerate-econ'
import { bestPlan, startupCost } from '../src/game/business/economy'
import { listingsForSale } from '../src/game/business/founding'
import { goodsShare } from '../src/game/business/market-trade'
import { segmentNames } from '../src/game/business/market-view'
import { lineInfo } from '../src/game/business/product-market'
import { demandCurve } from '../src/game/business/product-data'
import { classicIdeas, productIdeas, styleOf } from '../src/game/business/products'
import { readBiz } from '../src/game/business/state'
import { supplyProfile } from '../src/game/business/supply'
import { DEEP_TECH_IDS, EXPANSION_INDUSTRY_IDS, INDUSTRY_IDS, PROCEDURAL_DEEP_TECH_IDS } from '../src/game/data/markets'
import { sectorOf } from '../src/game/economy/model'
import { anachronismsIn } from '../src/game/events/era'
import { adult, company } from './market-kit'

/** The year a kind of product is first sold somewhere rich. */
function firstYear(name: string): number {
  const c = demandCurve(name)
  return Array.isArray(c) ? (c[0] as number) : ((c as { first?: number }).first ?? 0)
}

const KINDS = [...HARDWARE_FAMILIES, OS_FAMILY]
const FIRST: Record<string, number> = {
  'Home Computer': 1977, 'Mobile Phone': 1983, 'Desktop PC': 1985, Laptop: 1995,
  Smartphone: 2007, 'VR Headset': 2016, 'AR Glasses': 2019, 'Device Operating System': 1981,
}

describe('the devices trade registration', () => {
  it('registers the trade once', () => {
    expect(INDUSTRY_IDS).toHaveLength(56)
    expect(INDUSTRY_IDS[INDUSTRY_IDS.length - 1]).toBe('devices')
    expect(INDUSTRY_IDS.filter((x) => x === 'devices')).toHaveLength(1)
    expect(INDUSTRY_IDS.indexOf('carbonCapture')).toBe(54)
    for (const list of [DEEP_TECH_IDS, EXPANSION_INDUSTRY_IDS, PROCEDURAL_DEEP_TECH_IDS] as readonly (readonly string[])[]) expect(list).not.toContain('devices')
  })

  it('has the spec industry entry', () => {
    const d = INDUSTRIES.devices
    expect(d).toMatchObject({
      id: 'devices', label: 'Device and Platform Company', unit: 'devices', unitOne: 'device', site: 'hardware studio', sitePlural: 'hardware studios',
      localShare: 0.25, tradable: 0.9, elasticity: 1.5, incomeSens: 0.6, capital: 7_000_000, capitalLocal: 0.35, staff: 36, staffScale: 0.6,
      maint: 0.08, capMult: 1.5, multiple: 11, growth: 0.9, perMillion: 0.1, taxShare: 1, perishable: 0.1, marketingShare: 0.06,
    })
    expect(d.products).toEqual(KINDS)
    expect(d.roles.map((r) => [r.title, r.focus])).toEqual([
      ['Chief Hardware Engineer', 'quality'], ['Head of Industrial Design', 'quality'], ['Head of Retail Sales', 'sales'], ['Supply Chain Director', 'ops'], ['CFO', 'finance'],
    ])
    expect(d.roles.map((r) => r.pay)).toEqual([230_000, 170_000, 150_000, 175_000, 190_000])
    expect(d.suffixes).toEqual(['Devices', 'Mobile', 'Computing', 'Electronics', 'Labs'])
    expect(d.price / d.unitCost).toBeGreaterThanOrEqual(1.4)
    expect(d.price / d.unitCost).toBeLessThanOrEqual(2.2)
  })

  it('has the spec market entry', () => {
    const m = MARKETS.devices
    expect(m).toMatchObject({
      scope: 'world', noun: 'device', ref: 5, field: 90, fringe: 0.3, network: 1.5, named: 16, emerging: true, from: 1977, needs: 'homeComputer',
      notYet: "Computers fill rooms and cost a fortune. A home computer doesn't exist yet.",
    })
    expect(m.network).toBe(DEVICE_NETWORK)
    expect(m.curve.map(([y]) => y)).toEqual([1977, 1980, 1984, 1990, 1995, 2000, 2001, 2005, 2007, 2010, 2013, 2016, 2019, 2022, 2026, 2040, 2060])
    expect(m.curve.map(([, v]) => v)).toEqual([0.001, 0.006, 0.03, 0.08, 0.15, 0.28, 0.25, 0.35, 0.4, 0.62, 0.88, 1, 0.97, 0.98, 1, 1.35, 1.7])
    expect(m.hubs).toEqual([['us', 26], ['cn', 24], ['kr', 12], ['jp', 10], ['tw', 8], ['in', 6], ['gb', 3], ['de', 3], ['fi', 2], ['sg', 2], ['fr', 2]])
    expect(m.names).toEqual({
      pre: ['Pocketwave', 'Glassline', 'Slateworks', 'Nimbo', 'Pixelcore', 'Lumio', 'Orbitron', 'Wristly', 'Visora', 'Kinetica'],
      post: ['Devices', 'Mobile', 'Electronics', 'Computing', 'Labs'],
    })
  })

  it('is wired into the other tables', () => {
    expect(sectorOf('devices')).toBe('technology')
    expect(relatedness('devices', 'semiconductor')).toBe(0.5)
    expect(goodsShare('devices')).toBe(1)
    expect(supplyProfile('devices')?.materialShare).toBe(supplyProfile('manufacturing')?.materialShare)
    expect(segmentNames('devices')).toEqual(['Entry devices', 'Mainstream', 'Premium', 'Flagship'])
    expect(styleOf('devices')).toBe('goods')
    expect(lineInfo('Smartphone Pro', 'devices')).toMatchObject({ family: 'Smartphone', kind: 'premium' })
    expect(lineInfo('Laptop Lite', 'devices')).toMatchObject({ family: 'Laptop', kind: 'value' })
    expect(lineInfo('Smartphone Mk II', 'devices')).toMatchObject({ family: 'Smartphone', kind: 'next', gen: 2 })
  })

  it('leaves devices out of the companies for sale, so the classic listings stay as they were', () => {
    // A bought device company would have no fabs or chip supply, and adding the trade to the weighted
    // pool shifted every seed's list (test/fuzz-regressions.test.ts pins one).
    let seen = 0
    for (const country of ['us', 'in', 'jp', 'de']) {
      for (let seed = 1; seed <= 60; seed++) {
        for (const l of listingsForSale(adult(seed, 2026, country))) {
          seen++
          expect(l.biz.industry, `${country} ${seed}`).not.toBe('devices')
        }
      }
    }
    expect(seen).toBeGreaterThan(300)
  })

  it('gates by era', () => {
    expect(industryEraBlock('devices', 'us', 1976)).toBe(MARKETS.devices.notYet)
    expect(industryEraBlock('devices', 'us', 1977)).toBeNull()
    expect(industryEraBlock('devices', 'in', 1977)).not.toBeNull()
    expect(industryEraBlock('devices', 'in', 2026)).toBeNull()
  })

  it('offers ideas from 1977 to 2040 at home and in a late country', () => {
    for (const country of ['us', 'in']) {
      for (let year = 1977; year <= 2040; year++) {
        const g = adult(3, year, country)
        const b = readBiz(g, company(g, 'devices'))
        expect(classicIdeas(g, b).length, `${country} ${year}`).toBeGreaterThanOrEqual(3)
        const ideas = productIdeas(g, b, 8)
        expect(ideas.length, `${country} ${year}`).toBe(8)
        expect(new Set(ideas).size, `${country} ${year} has duplicates`).toBe(ideas.length)
        for (const x of ideas) expect(x.trim().length, `${country} ${year}`).toBeGreaterThan(0)
      }
    }
  })

  it('never names a kind before its year', () => {
    for (const name of KINDS) expect(firstYear(name), name).toBe(FIRST[name])
    for (const name of KINDS) {
      const F = firstYear(name)
      expect(anachronismsIn(name, F, ['us']), `${name} in ${F}`).toEqual([])
      const before = adult(3, F - 1, 'us')
      expect(classicIdeas(before, readBiz(before, company(before, 'devices'))), `${name} before ${F}`).not.toContain(name)
      // A world market opens about two years late (laggard('world') is .3); the smartphone and the OS follow their technology curve.
      const after = adult(3, F + 3, 'us')
      expect(classicIdeas(after, readBiz(after, company(after, 'devices'))), `${name} at ${F + 3}`).toContain(name)
    }
  })

  it('has finite plans from 1950 to 2060 and earns 8% to 20% of capital in 2026', () => {
    for (const year of [1950, 1976, 1977, 1990, 2007, 2026, 2060]) {
      const g = adult(3, year, 'us')
      const b = readBiz(g, company(g, 'devices'))
      const p = bestPlan(g, b, { quick: true })
      for (const k of ['price', 'production', 'profit', 'demand'] as const) expect(Number.isFinite(p[k]), `${k} in ${year}`).toBe(true)
    }
    const g = adult(3, 2026, 'us')
    const b = readBiz(g, company(g, 'devices'))
    const ratio = bestPlan(g, b, { quick: true }).profit / startupCost('devices', 'us', b.city).capital
    expect(ratio).toBeGreaterThanOrEqual(0.08)
    expect(ratio).toBeLessThanOrEqual(0.2)
  })
})
