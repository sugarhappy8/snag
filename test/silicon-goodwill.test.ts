import { describe, expect, it } from 'vitest'
import { industryCycle, siliconOf, techPlan, type LaneRow } from '../src/game/business/deeptech-core'
import { readTech } from '../src/game/business/deeptech-state'
import { premiumOf } from '../src/game/business/economy'
import { bookSilicon, brandStep, goodwillStep, goodwillTarget, squeezeOf } from '../src/game/business/silicon'
import { shortageIntensity } from '../src/game/history/market-events'
import { chipLab, type Lab } from './silicon-kit'

const CHIP = { industry: 'semiconductor', countryId: 'us' } as const

describe('the brand step', () => {
  it('has a dead zone of 3 points, a divisor of 10 and the caps', () => {
    expect([brandStep(50), brandStep(53), brandStep(54), brandStep(62), brandStep(83), brandStep(100)]).toEqual([0, 0, 0.1, 0.9, 3, 3])
    expect([brandStep(46), brandStep(0)]).toEqual([-0.1, -1.5])
  })
})

describe('goodwill guards', () => {
  it('floor price with 5% supplied moves goodwill by under a point', () => {
    expect(goodwillStep(50, 0.4, 0.05, 1) - 50).toBeLessThan(1)
  })
  it('a deep cut with 10% supplied stays within 4 points of neutral, a dear price counts in full', () => {
    expect(goodwillTarget(0.4, 0.1) - 50).toBeLessThanOrEqual(4 + 1e-9)
    expect(goodwillTarget(-0.2, 0.1)).toBeCloseTo(30, 10)
  })
  it('relaxes 12% of the gap outside the squeeze and moves at most 8 points inside it', () => {
    expect(goodwillStep(70, 0.4, 1, 0)).toBeCloseTo(70 - 0.12 * 20, 10)
    expect(goodwillStep(50, 0.4, 1, 1)).toBe(58)
  })
})

describe('the squeeze index', () => {
  const row = (id: string, index: number, ref = 1): LaneRow => ({ id, price: index * ref, ref, index, share: 0.25 })
  it('weighs only the lanes the squeeze hits, by weight times exposure', () => {
    const only = squeezeOf([row('core', 0.5), row('cpu', 0.5), row('accel', 0.9)], 0.01)
    expect([only.index, only.weight]).toEqual([0.9, 0.25])
    const both = squeezeOf([row('gfx', 0.8), row('accel', 0.9)], 0.01)
    expect(both.weight).toBeCloseTo(0.2 * 0.4 + 0.25, 10)
    expect(both.index).toBeCloseTo((0.08 * 0.8 + 0.25 * 0.9) / 0.33, 10)
    expect(squeezeOf([row('core', 0.5), row('cpu', 0.5)], 0.01)).toEqual({ index: 1, depth: 0, weight: 0 })
    expect(squeezeOf([], 0.01)).toEqual({ index: 1, depth: 0, weight: 0 })
  })
  it('a price at 0.25x and a price at cost give the same depth: below cost earns nothing extra', () => {
    const cost = 0.45, rows = (index: number) => [row('accel', index, 1.12), row('gfx', index, 1.048)]
    const cheap = squeezeOf(rows(0.25), cost * 1.12), atCost = squeezeOf(rows(0.45), cost * 1.12)
    expect(cheap.depth).toBe(atCost.depth)
    expect(cheap.index).toBe(atCost.index)
    expect(cheap.index).toBeGreaterThan(0.4)   // the guard binds at the cost price, not at 0.25
    expect(cheap.depth).toBe(0.4)
  })
  it('a dear price counts: the index goes above 1 and the depth below 0', () => {
    const dear = squeezeOf([row('accel', 1.3)], 0.45)
    expect([dear.index, dear.depth]).toEqual([1.3, -0.3].map((x) => expect.closeTo(x, 10)))
  })
  it('G4: two lives whose chip cycles differ give the same squeeze', () => {
    const make = (seed: number) => { const L = chipLab({ year: 2025, seed, patch: { done: ['firstChip', 'volume', 'aiChip'] } }); siliconOf(L.t).lanes = { accel: 0.2 }; return L }
    const A = make(3), B = make(4), rowsOf = ({ g, b, t }: Lab) => techPlan(g, b, t, 2025, { calm: true }).lanes
    expect(industryCycle(A.g, 'semiconductor', 2025).z).not.toBe(industryCycle(B.g, 'semiconductor', 2025).z)
    const ra = rowsOf(A), rb = rowsOf(B), ref = ra.find((l) => l.id === 'accel')!.ref
    expect(rb.find((l) => l.id === 'accel')!.ref).toBe(ref)
    expect(squeezeOf(rb, 0.45 * ref)).toEqual(squeezeOf(ra, 0.45 * ref))
    expect(squeezeOf(ra, 0.45 * ref).weight).toBeGreaterThan(0)
  })
})

// The calibration pin of spec 4.4: a US lab with graphics and accelerator lines, the headline at the market
// (1.0 before the squeeze markup), a unit cost of 45% of the reference, a fixed share of demand supplied.
const rowsFor = (year: number, disc: number, scale = 1): LaneRow[] => {
  const k = shortageIntensity('us', year)
  return [['gfx', 0.2, 0.4, 0], ['accel', 0.25, 1, disc]].map(([id, share, s, d]) => {
    const ref = (1 + 0.12 * +s * k) * scale, price = 1 - +d
    return { id: String(id), price, ref, index: price / ref, share: +share }
  })
}

describe('the worked example of spec 4.4', () => {
  const run = (disc: number, served: number) => {
    const t = readTech(undefined), out: number[] = []
    for (let y = 2024; y <= 2030; y++) {
      bookSilicon(CHIP, t, y, { lanes: rowsFor(y, disc), unitCost: 0.45 }, { sold: served * 1000, demand: 1000 })
      out.push(t.silicon!.goodwill)
    }
    return [0, 1, 2, 3, 4, 6].map((i) => out[i])   // 2024, 2025, 2026, 2027, 2028, 2030
  }
  for (const [disc, served, want, peak] of [[0, 0.9, [53, 55, 55, 55, 54, 53], 0.2], [0.15, 0.9, [57, 62, 62, 62, 60, 58], 0.9], [0.3, 0.9, [58, 66, 68, 68, 66, 62], 1.5], [0.3, 0.3, [54, 56, 57, 56, 56, 54], 0.35]] as const) {
    it(`discount ${disc}, served ${served}`, () => {
      const got = run(disc, served)
      got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(1))
      expect(Math.abs(Math.max(...got.map(brandStep)) - peak)).toBeLessThanOrEqual(0.2)
    })
  }
})

describe('bookSilicon', () => {
  const plan = (year: number, disc = 0.3) => ({ lanes: rowsFor(year, disc), unitCost: 0.45 })
  const sold = { sold: 900, demand: 1000 }
  it('stores nothing before the squeeze, and nothing for a lab that is not a chip lab', () => {
    const t = readTech(undefined)
    bookSilicon(CHIP, t, 2023, plan(2023), sold)
    expect(t.silicon).toBeUndefined()
    bookSilicon({ industry: 'aiLab', countryId: 'us' }, t, 2025, plan(2025), sold)
    expect(t.silicon).toBeUndefined()
    bookSilicon(CHIP, t, 2025, { lanes: [], unitCost: 0.45 }, sold)
    expect(t.silicon).toBeUndefined()
  })
  it('stores the year once and a second call changes nothing', () => {
    const t = readTech(undefined)
    bookSilicon(CHIP, t, 2025, plan(2025), sold)
    const s = t.silicon!, once = JSON.stringify(t)
    expect(s.last!.year).toBe(2025)
    expect(s.goodwill).toBeGreaterThan(50)
    expect(s.last!.win).toBe(1)
    expect([s.last!.served, s.last!.step]).toEqual([0.9, expect.closeTo(brandStep(s.goodwill), 2)])
    bookSilicon(CHIP, t, 2025, plan(2025), sold)
    bookSilicon(CHIP, t, 2024, plan(2024), sold)
    expect(JSON.stringify(t)).toBe(once)
  })
  it('a lab that sells nothing relaxes 12% toward neutral and stays finite (Review Focus 1)', () => {
    const t = readTech(undefined)
    siliconOf(t).goodwill = 70
    bookSilicon(CHIP, t, 2025, plan(2025), { sold: 0, demand: 0 })
    expect(t.silicon!.goodwill).toBeCloseTo(70 + 0.12 * (50 - 70), 10)
    expect(Object.values(t.silicon!.last!).every(Number.isFinite)).toBe(true)
    expect(t.silicon!.last!.served).toBe(0)
  })
  it('decays toward neutral after the window', () => {
    const t = readTech(undefined)
    siliconOf(t).goodwill = 70
    bookSilicon(CHIP, t, 2028, plan(2028), sold)
    expect(t.silicon!.goodwill).toBeCloseTo(70 + 0.12 * (50 - 70), 10)
    expect([t.silicon!.last!.year, t.silicon!.last!.win]).toEqual([2028, 0])
    bookSilicon(CHIP, t, 2029, plan(2029), sold)
    expect(t.silicon!.goodwill).toBeCloseTo(67.6 + 0.12 * (50 - 67.6), 2)
  })
  it('never touches hype', () => {
    const t = readTech(undefined)
    t.hype = 37
    for (let y = 2024; y <= 2030; y++) bookSilicon(CHIP, t, y, plan(y), sold)
    expect(t.hype).toBe(37)
  })
  it('a lab that only holds a lane or a policy starts booking the first year', () => {
    const t = readTech(undefined)
    siliconOf(t).lanes = { accel: 0.2 }
    bookSilicon(CHIP, t, 2021, plan(2021, 0.2), sold)
    expect([t.silicon!.goodwill, t.silicon!.last!.year, t.silicon!.last!.win]).toEqual([50, 2021, 0])
  })
  it('the feedback of brand on the reference stays within 2.5 goodwill points', () => {
    const { b } = chipLab(), at = (brand: number) => { b.brand = brand; return premiumOf(b) }
    const scale = at(65) / at(50), trace = (k: number, disc: number) => {
      const t = readTech(undefined), out: number[] = []
      for (let y = 2024; y <= 2031; y++) { bookSilicon(CHIP, t, y, { lanes: rowsFor(y, disc, k), unitCost: 0.45 }, { sold: 900, demand: 1000 }); out.push(t.silicon!.goodwill) }
      return out
    }
    expect(scale).toBeGreaterThan(1)
    for (const disc of [0, 0.15, 0.3]) {
      const base = trace(1, disc), lifted = trace(scale, disc)
      expect(Math.abs(lifted[lifted.length - 1] - base[base.length - 1])).toBeLessThanOrEqual(2.5)
      expect(Math.max(...lifted.map((v, i) => Math.abs(v - base[i])))).toBeLessThanOrEqual(2.5)
    }
  })
})
