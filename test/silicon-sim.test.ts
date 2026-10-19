import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bestTechPlan, siliconOf, techPlan } from '../src/game/business/deeptech-core'
import { afterDeepTechYearImpl, simulateDeepTechYearImpl } from '../src/game/business/deeptech-sim'
import { bizOf } from '../src/game/business/state'
import { bookSilicon, brandStep, pendingBrandStep } from '../src/game/business/silicon'
import { round2 } from '../src/game/business/util'
import { chipLab, labOf, playYear, type Lab } from './silicon-kit'

const AI_CHIP = ['firstChip', 'volume', 'aiChip']

describe('a chip lab through the squeeze', () => {
  it('books mix revenue, goodwill and the brand step against a control', { timeout: 300_000 }, () => {
    const make = (lanes?: Record<string, number>): Lab => {
      const L = chipLab({ year: 2024, patch: { done: AI_CHIP } })
      if (lanes) siliconOf(L.t).lanes = lanes
      return L
    }
    const play = (L0: Lab, control: boolean): Lab => {
      let L = L0
      for (let y = 2024; y <= 2027; y++) {
        const headline = L.b.price
        playYear(L.g)
        L = labOf(L.g)
        const { b, t, g } = L, st = b.last!, s = t.silicon!
        expect(g.year).toBe(y + 1)
        expect(s.last!.year).toBe(g.year - 1)
        expect(s.goodwill).toBeGreaterThanOrEqual(50)
        expect(s.goodwill).toBeLessThanOrEqual(100)
        expect(Math.abs(st.revenue - (t.last?.side ?? 0) - st.sold * st.price)).toBeLessThanOrEqual(st.sold * 0.005 + 1)
        expect(st.price).toBeLessThanOrEqual(headline + 0.005)
        if (control) expect(st.price).toBe(round2(headline))
      }
      return L
    }
    const warm = play(make({ accel: 0.3 }), false), control = play(make(), true)
    expect(warm.t.silicon!.goodwill).toBeGreaterThan(control.t.silicon!.goodwill)
    expect(warm.b.brand).toBeGreaterThanOrEqual(control.b.brand)
    expect(warm.b.last!.price).toBeLessThan(control.b.last!.price)   // the mix sits below the headline
  })

  it('leaves the years before the squeeze alone, and only fades after it (Review Focus 5)', { timeout: 300_000 }, () => {
    let early = chipLab({ year: 2020 })
    for (let y = 2020; y <= 2022; y++) { playYear(early.g); early = labOf(early.g) }
    expect(early.t.silicon).toBeUndefined()
    expect(JSON.stringify(early.b.tech)).not.toContain('silicon')

    // A 2026 lab with no silicon at all, and one that only holds a lane: both start at 50 and move from 2026.
    for (const lanes of [undefined, { accel: 0.3 }]) {
      let L = chipLab({ year: 2026, patch: { done: AI_CHIP } })
      if (lanes) siliconOf(L.t).lanes = lanes
      else expect(L.t.silicon).toBeUndefined()
      const goodwill: number[] = [50]
      for (let y = 2026; y <= 2029; y++) {
        playYear(L.g)
        L = labOf(L.g)
        goodwill.push(L.t.silicon!.goodwill)
        expect(L.t.silicon!.last!.year).toBe(y)
      }
      const [g0, g26, g27, g28, g29] = goodwill
      expect(Math.abs(g26 - g0)).toBeLessThanOrEqual(8)
      expect(Math.abs(g27 - g26)).toBeLessThanOrEqual(8)
      expect(g26).toBeGreaterThan(50)
      expect(g27).toBeGreaterThan(50)
      expect(g28).toBeLessThanOrEqual(g27)
      expect(g29).toBeLessThanOrEqual(g28)
      expect(g29).toBeGreaterThanOrEqual(50)
    }
  })

  it('a second booking for the same year changes nothing', { timeout: 300_000 }, () => {
    let L = chipLab({ year: 2025, patch: { done: AI_CHIP } })
    siliconOf(L.t).lanes = { accel: 0.3 }
    playYear(L.g)
    L = labOf(L.g)
    const { g, b, t } = L, plan = techPlan(g, b, t, 2025, { calm: true }), once = JSON.stringify([g, b])
    expect(t.silicon!.last!.year).toBe(2025)
    bookSilicon(b, t, 2025, plan, b.last!)
    expect(JSON.stringify([g, b])).toBe(once)
  })

  it('a hired CEO follows the pricing policy and the dice do not change', { timeout: 300_000 }, () => {
    const { g, a, b, t } = chipLab({ year: 2025, skill: 60 })
    siliconOf(t).ceiling = 0.8
    const limit = bestTechPlan(g, b, t).limit!
    expect(limit).toBeGreaterThan(0)
    ageUp(g)
    expect(bizOf(g, a).last!.price).toBeLessThanOrEqual(limit + 0.005)

    const make = (cap: boolean) => { const L = chipLab({ year: 2025, skill: 60 }); if (cap) siliconOf(L.t).ceiling = 0.8; return L }
    const plain = make(false), capped = make(true)
    simulateDeepTechYearImpl(plain.g, plain.a, plain.b, plain.g.year - 1, 0)
    simulateDeepTechYearImpl(capped.g, capped.a, capped.b, capped.g.year - 1, 0)
    expect(capped.b.price).toBeLessThan(plain.b.price)   // the cap really clipped the plan
    expect(capped.g.rng).toEqual(plain.g.rng)
  })

  it('the brand line adds the goodwill step once', () => {
    const { g, a, b, t } = chipLab({ year: 2026 })
    t.hype = 40
    b.brand = 50
    Object.assign(siliconOf(t), { goodwill: 100, last: { year: 2025, index: 0.8, served: 1, depth: 0.2, win: 1, step: 3, perf: 0, quality: 0 } })
    expect(pendingBrandStep(t)).toBe(3)
    afterDeepTechYearImpl(g, a, b)
    expect([b.brand, t.silicon!.applied, pendingBrandStep(t)]).toEqual([53, 2025, 0])
    expect(brandStep(100) + 5).toBeLessThanOrEqual(8)   // with the shortage event's loyal +5: at most 8 a year
  })

  it('pendingBrandStep is 0 without a booked year', () => {
    const { t } = chipLab({ year: 2026 })
    expect(pendingBrandStep(t)).toBe(0)
    siliconOf(t).goodwill = 90
    expect(pendingBrandStep(t)).toBe(0)
  })
})
