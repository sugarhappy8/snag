import { describe, expect, it } from 'vitest'
import { bestTechPlan, operatingValue, siliconOf } from '../src/game/business/deeptech-core'
import { presentDeepTechEvent } from '../src/game/business/deeptech-events'
import { techReportData } from '../src/game/business/deeptech-sim'
import { brandStep } from '../src/game/business/silicon'
import { runScript } from '../src/game/scripts'
import type { GameState } from '../src/game/types'
import { chipLab, labOf, playYear, type Lab } from './silicon-kit'

// A chip lab plays 2023 to 2028 three ways: control (the suggested price), a 20% accelerator discount and the
// price floor with 5% of demand supplied. The seeds, the strategies and the guards are the spec's section 7.

const SEEDS = [1, 2, 3, 4, 5]
const AI_CHIP = ['firstChip', 'volume', 'aiChip']

type Strategy = 'control' | 'discount' | 'floor'
interface Run { goodwill: number[]; brand: number[]; profit: number }

/**
 * The strategy's plan for the coming year. drain answers the report with the suggested price, so a strategy
 * overrides price and production before the first year and after every one. (A year that ends in a cash crunch
 * queues that popup instead of the report; drain takes its first choice, so the lab survives and the override
 * runs after every year either way.)
 */
function steer(g: GameState, strategy: Strategy): void {
  const { a, b, t } = labOf(g)
  if (strategy === 'discount') siliconOf(t).lanes = { accel: 0.2 }
  if (strategy === 'floor') {
    const r = techReportData(g, a, b)
    b.price = r.minPrice
    b.production = Math.round(0.05 * r.expectedDemand)
  }
}

const newGame = (seed: number): GameState => chipLab({ year: 2023, seed, patch: { done: AI_CHIP } }).g

/** One lab through fiscal 2023 to 2028; `goodwill` and `brand` hold the value after each of those six years. */
function play(strategy: Strategy, seed: number): Run {
  const g = newGame(seed)
  const goodwill: number[] = [], brand: number[] = []
  steer(g, strategy)
  for (let y = 0; y < 6; y++) {
    playYear(g)
    steer(g, strategy)
    const { b, t } = labOf(g)
    goodwill.push(t.silicon?.goodwill ?? 50)
    brand.push(b.brand)
  }
  return { goodwill, brand, profit: labOf(g).b.history.reduce((s, h) => s + h.profit, 0) }
}

const cache = new Map<string, Run>()
const run = (strategy: Strategy, seed: number): Run => {
  const key = `${strategy}|${seed}`
  let r = cache.get(key)
  if (!r) cache.set(key, (r = play(strategy, seed)))
  return r
}

const END_2027 = 4   // goodwill[4], brand[4]: the end of fiscal 2027

describe('a chip lab through 2023 to 2028, three ways', () => {
  it('the discount warms customers, the floor earns least, and nothing is NaN', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const control = run('control', seed), discount = run('discount', seed), floor = run('floor', seed)
      for (const r of [control, discount, floor]) {
        expect(r.goodwill.every(Number.isFinite), `seed ${seed}`).toBe(true)
        expect(r.brand.every(Number.isFinite), `seed ${seed}`).toBe(true)
        expect(Number.isFinite(r.profit), `seed ${seed}`).toBe(true)
      }
      expect(discount.goodwill[END_2027], `seed ${seed}: warmer`).toBeGreaterThan(control.goodwill[END_2027])
      expect(discount.profit, `seed ${seed}: at most 102% of the control`).toBeLessThanOrEqual(control.profit + 0.02 * Math.abs(control.profit))
      expect(floor.profit, `seed ${seed}: floor under control`).toBeLessThan(control.profit)
      expect(floor.profit, `seed ${seed}: floor under discount`).toBeLessThan(discount.profit)
    }
  })

  it('the control drifts to at most 57 and the lift over it is capped', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const control = run('control', seed), discount = run('discount', seed), floor = run('floor', seed)
      expect(control.goodwill[END_2027], `seed ${seed}`).toBeLessThanOrEqual(57)
      const steps = control.goodwill.slice(1, 5).map(brandStep)           // fiscal 2024 to 2027
      expect(steps.reduce((s, x) => s + x, 0), `seed ${seed}`).toBeLessThanOrEqual(2)
      discount.brand.forEach((v, i) => expect(v - control.brand[i], `seed ${seed}, year ${2023 + i}`).toBeLessThanOrEqual(15))
      floor.goodwill.forEach((v, i) => {
        expect(Math.abs(v - (i === 0 ? 50 : floor.goodwill[i - 1])), `seed ${seed}, year ${2023 + i}`).toBeLessThan(1)
        expect(v, `seed ${seed}, year ${2023 + i}`).toBeLessThanOrEqual(discount.goodwill[i])
      })
    }
  })

  it('investor money does not buy goodwill: the same floor year with venture high books the same', { timeout: 600_000 }, () => {
    // Venture money changes who pays a loss (a cash crunch popup against the investors), and so which random
    // life events follow; two long runs then drift apart for reasons that have nothing to do with price. So each
    // year is a fork: the same state, one twin with t.venture at 1e9, one booked year each, the same goodwill.
    const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g)) as GameState
    for (const seed of SEEDS) {
      const g = newGame(seed)
      steer(g, 'floor')
      for (let y = 0; y < 6; y++) {
        const twin = clone(g)
        labOf(twin).t.venture = 1e9
        playYear(g)
        playYear(twin)
        const plain = labOf(g).t.silicon?.last, funded = labOf(twin).t.silicon?.last
        expect(labOf(twin).t.silicon?.goodwill ?? 50, `seed ${seed}, year ${2023 + y}`).toBe(labOf(g).t.silicon?.goodwill ?? 50)
        expect(funded && { ...funded, perf: 0, quality: 0 }, `seed ${seed}, year ${2023 + y}`).toEqual(plain && { ...plain, perf: 0, quality: 0 })
        steer(g, 'floor')
      }
    }
  })
})

describe('the balance guards', () => {
  const AI = { patch: { done: AI_CHIP } }

  /** operatingValue with the brand at `brand` and goodwill at `goodwill`, for a lab that has booked one year (or none). */
  const value = (L: Lab, brand: number, goodwill: number): number => {
    L.b.brand = brand
    siliconOf(L.t).goodwill = goodwill
    return operatingValue(L.g, L.b, L.t)
  }

  it('G2: goodwill never moves the value, and brand moves it only through the profit multiple', { timeout: 300_000 }, () => {
    const ceiling = (0.85 + 65 / 333) / (0.85 + 50 / 333)
    for (const year of [2025, 2030]) {
      const fresh = chipLab({ year, ...AI })
      // No booked year: no profit multiple, so neither goodwill nor brand can move the value.
      expect(value(fresh, 50, 95), `${year}`).toBe(value(fresh, 50, 50))
      expect(value(fresh, 65, 50) / value(fresh, 50, 50), `${year}`).toBe(1)

      const L0 = chipLab({ year, ...AI })
      playYear(L0.g)
      const L = labOf(L0.g)
      expect(L.b.history.length, `${year}`).toBeGreaterThan(0)
      expect(value(L, 50, 95), `${year}`).toBe(value(L, 50, 50))
      const ratio = value(L, 65, 50) / value(L, 50, 50)
      expect(ratio, `${year}`).toBeGreaterThanOrEqual(1)
      expect(ratio, `${year}`).toBeLessThanOrEqual(ceiling + 1e-9)

      // A history with no profit: the revenue branch, which brand never touches.
      for (const h of L.b.history) h.profit = -1_000_000
      expect(value(L, 65, 50) / value(L, 50, 50), `${year}`).toBe(1)
    }
  })

  it('a 20% accelerator discount moves the best headline price by under 5%', () => {
    const base = chipLab({ year: 2025, ...AI }), cut = chipLab({ year: 2025, ...AI })
    siliconOf(cut.t).lanes = { accel: 0.2 }
    const p0 = bestTechPlan(base.g, base.b, base.t).price, p1 = bestTechPlan(cut.g, cut.b, cut.t).price
    expect(p0).toBeGreaterThan(0)
    expect(Math.abs(p1 / p0 - 1)).toBeLessThanOrEqual(0.05)
  })

  it('the shortage event\'s raise choice lifts premium by 0.04 and moves the booked step by at most 0.3', { timeout: 300_000 }, () => {
    const make = (): Lab => chipLab({ year: 2025, ...AI })
    const plain = make(), raised = make()
    const before = raised.t.premium
    expect(presentDeepTechEvent(raised.g, raised.a, 'shortage')).toBe(true)
    const at = raised.g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === 'deeptech.event')
    expect(at).toBeGreaterThanOrEqual(0)
    const [modal] = raised.g.queue.splice(at, 1)
    if (modal.kind !== 'choice') throw new Error('not a choice')
    runScript(raised.g, modal.scriptId!, 'raise', modal.data, modal)
    expect(labOf(raised.g).t.premium - before).toBeCloseTo(0.04, 10)

    // One booked year each; the 4% the reference moves sits inside the dead zone.
    const step = (L: Lab): number => { playYear(L.g); return labOf(L.g).t.silicon!.last!.step }
    expect(Math.abs(step(raised) - step(plain))).toBeLessThanOrEqual(0.3)
  })
})
