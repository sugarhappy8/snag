import { describe, expect, it } from 'vitest'
import { bestTechPlan, industryCycle, marketReference, planContribution, priceIndex, siliconOf, techOf, techPlan, techPriceBounds } from '../src/game/business/deeptech-core'
import { CHIP_LANES, laneById } from '../src/game/business/silicon-data'
import { premiumOf } from '../src/game/business/economy'
import { bizOf } from '../src/game/business/state'
import { round2 } from '../src/game/business/util'
import { adultIn } from './deeptech-kit'
import { company, chipLab, type Lab } from './silicon-kit'

describe('Silicon 2.0 one market price', () => {
  const OLD = ['price', 'going', 'suggested', 'demand', 'capacity', 'equipmentCapacity', 'unitCost', 'taxRate'] as const
  const legacy = ({ g, b, t }: Lab, year: number) => {
    const p = techPlan(g, b, t, year, { calm: true })
    return { plan: Object.fromEntries(OLD.map((k) => [k, p[k]])), best: bestTechPlan(g, b, t) }
  }
  const aiLab = (): Lab => { const g = adultIn('us', 5_000_000, 3, 95, 2025), a = company(g, 'aiLab', { stage: 2, models: [{ gen: 1, name: 'Nova 1', score: 60, open: false, year: 2024 }] }), b = bizOf(g, a); return { g, a, b, t: techOf(b) } }
  it('legacy plans, pinned from the code before this task', () => {
    expect(legacy(chipLab({ year: 2025 }), 2025)).toMatchInlineSnapshot(`
      {
        "best": {
          "price": 51.68,
          "production": 633656,
          "profit": 21537967.687999997,
        },
        "plan": {
          "capacity": 902720,
          "demand": 656693.3751876787,
          "equipmentCapacity": 902720.0000000003,
          "going": 54.4,
          "price": 50.59,
          "suggested": 50.59,
          "taxRate": 0,
          "unitCost": 17.69,
        },
      }
    `)
    expect(legacy(chipLab({ year: 2030, patch: { plant: 1, stage: 3 } }), 2030)).toMatchInlineSnapshot(`
      {
        "best": {
          "price": 48.96,
          "production": 1541558,
          "profit": 52058364.914,
        },
        "plan": {
          "capacity": 2985920,
          "demand": 1478196.0061876136,
          "equipmentCapacity": 2985920.000000001,
          "going": 54.4,
          "price": 50.59,
          "suggested": 50.59,
          "taxRate": 0,
          "unitCost": 15.19,
        },
      }
    `)
    expect(legacy(aiLab(), 2025)).toMatchInlineSnapshot(`
      {
        "best": {
          "price": 3150,
          "production": 3485,
          "profit": 7494353.1,
        },
        "plan": {
          "capacity": 3494,
          "demand": 3760.519959423751,
          "equipmentCapacity": 3494.4000000000005,
          "going": 3000,
          "price": 3000,
          "suggested": 2790,
          "taxRate": 0,
          "unitCost": 999.54,
        },
      }
    `)
  })

  const CORE = CHIP_LANES[0]
  const lab = (lanes?: Record<string, number>): Lab => {
    const L = chipLab({ year: 2025, patch: { done: ['firstChip', 'volume', 'aiChip'] } })
    if (lanes) siliconOf(L.t).lanes = lanes
    return L
  }
  const plan = ({ g, b, t }: Lab, y = 2025) => techPlan(g, b, t, y, { calm: true })

  it('priceIndex clamps and guards', () => {
    expect([priceIndex(0.88, 1), priceIndex(5, 0), priceIndex(NaN, 1), priceIndex(1000, 1), priceIndex(-3, 1)]).toEqual([0.88, 1, 1, 10, 0])
  })
  it('the core reference is techPlan.suggested, with or without a chip cycle', () => {
    const A = chipLab({ year: 2025, seed: 3 }), B = chipLab({ year: 2025, seed: 4 }), ys = [2024, 2025, 2026, 2027]
    for (const y of ys) {
      const r = marketReference(A.g, A.b, A.t, CORE, y)
      expect(r).toBe(plan(A, y).suggested); expect(marketReference(B.g, B.b, B.t, CORE, y)).toBe(r)
    }
    expect(ys.some((y) => industryCycle(A.g, 'semiconductor', y).price !== industryCycle(B.g, 'semiconductor', y).price)).toBe(true)   // the lives really differ
  })
  it('adds the squeeze markup only to exposed lanes inside the window', () => {
    const { g, b, t } = chipLab({ year: 2025 }), at = (id: string, y: number) => marketReference(g, b, t, laneById(id)!, y) / marketReference(g, b, t, CORE, y)
    expect([at('accel', 2025), at('gfx', 2025), at('mem', 2025)].map((x) => +x.toFixed(6))).toEqual([1.12, 1.048, 1.06])
    expect([at('cpu', 2025), at('accel', 2023), at('accel', 2028)]).toEqual([1, 1, 1]); expect(at('accel', 2027)).toBeCloseTo(1.048, 10)
    const de = chipLab({ year: 2025, country: 'de' })
    expect(marketReference(de.g, de.b, de.t, laneById('accel')!, 2025) / marketReference(de.g, de.b, de.t, CORE, 2025)).toBeCloseTo(1.084, 10)   // abroad x0.7
  })
  it('with no discount the plan is the headline: mix is the price, shares are the weights', () => {
    const p = plan(lab()), ai = plan(aiLab())
    expect(p.mix).toBe(p.price); expect(p.lanes.map((l) => l.id)).toEqual(['core', 'gfx', 'cpu', 'accel'])
    expect(p.lanes.map((l) => l.share)).toEqual([0.4, 0.2, 0.15, 0.25].map((x) => expect.closeTo(x, 10)))
    expect([ai.lanes, ai.mix]).toEqual([[], ai.price])
  })
  it('blends discounts: shares sum to 1, mix is below the headline, demand rises', () => {
    const p = plan(lab({ accel: 0.3, gfx: 0.15 })), base = plan(lab()), accel = p.lanes.find((l) => l.id === 'accel')!
    expect(p.lanes.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 10); expect(p.mix).toBeLessThan(p.price)
    expect(p.mix).toBeCloseTo(p.lanes.reduce((s, l) => s + l.share * l.price, 0), 8); expect(accel.price).toBeCloseTo(p.price * 0.7, 8); expect(p.demand).toBeGreaterThan(base.demand)
  })
  it('G1 and G3: the window never enters demand, and shares don\'t follow the size curve', () => {
    const L = lab({ accel: 0.3 }), a = plan(L, 2025), b = plan(L, 2030), ref = (p: typeof a) => p.lanes.find((l) => l.id === 'accel')!.ref
    expect(a.lanes.map((l) => l.share)).toEqual(b.lanes.map((l) => l.share)); expect(a.mix).toBe(b.mix); expect(ref(a) / ref(b)).toBeCloseTo(1.12, 10)
  })
  it('ignores a discount on a closed lane and follows a moved headline', () => {                         // Review Focus 2 and 3
    const shut = plan(lab({ mem: 0.4 })), base = plan(lab())
    expect(shut.lanes.some((l) => l.id === 'mem')).toBe(false); expect([shut.mix, shut.demand]).toEqual([base.mix, base.demand])
    const L = lab({ accel: 0.3 }); L.b.price = round2(L.b.price * 0.85)                                   // a price war
    const p = plan(L)
    for (const l of p.lanes) expect(l.price).toBeLessThanOrEqual(L.b.price + 1e-9)
    expect(p.lanes.find((l) => l.id === 'accel')!.price).toBeCloseTo(L.b.price * 0.7, 8)
  })
  it('caps the search at the policy and never under a cent', () => {                                      // Review Focus 4
    const { g, b, t } = lab(); expect('limit' in bestTechPlan(g, b, t)).toBe(false)
    siliconOf(t).ceiling = 0.9
    const best = bestTechPlan(g, b, t)
    expect(best.limit).toBe(round2(0.9 * premiumOf(b) * techPriceBounds(g, b, t).going)); expect(best.price).toBeLessThanOrEqual(best.limit!)
    expect(priceIndex(best.price, marketReference(g, b, t, CORE, g.year))).toBeLessThanOrEqual(0.91)
    b.quality = 0; b.brand = 0; siliconOf(t).ceiling = 0.6
    const low = bestTechPlan(g, b, t)
    expect(low.price).toBeLessThanOrEqual(low.limit!); expect(low.price).toBeGreaterThanOrEqual(0.01); expect([low.production, low.profit].every(Number.isFinite)).toBe(true)
  })
  it('planContribution is the old inline profit', () => {
    const { g, b, t } = lab(), best = bestTechPlan(g, b, t)
    expect(planContribution(g, b, techPlan(g, b, t, g.year, { price: best.price, calm: true }))).toEqual({ production: best.production, profit: best.profit })
  })
})
