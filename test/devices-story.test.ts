// Ecosystem companies: the story and the balance guards (S11). Over three seeds a US device company plays 2024 to 2034 three ways:
// nothing built (control), two chip fabs (built in 2025 and 2027), and a group with a stage-3 sister chip company under a chip
// contract. Every guard is relative to the control or to a bound, so a retuned economy moves the sizes and not the claims.
//
// The company is grown over the eleven hub countries (40 studios each), because one country saturates near 0.8B of sales whatever
// `outlets[0].count` is. Measured 2026 sales are 1.9B to 2.2B, which is the "about 2B" the guards were sized for.
import { beforeAll, describe, expect, it } from 'vitest'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { SCALE_SAVING } from '../src/game/business/competition-core'
import { groupsOf } from '../src/game/business/conglomerate-state'
import { techOf } from '../src/game/business/deeptech-core'
import {
  CHIP_SHARE, FAB_CUT, LIFT_MAX, SISTER_CUT, chipCostFactor, chipSource, chipTerms, devicePerf, type ChipSource, type ChipSupply,
} from '../src/game/business/devices-data'
import { bestPlan, costFactor, fabCost, marketCtxFor, planFor } from '../src/game/business/economy'
import { chipResultFor, prepareInternalServices, toggleService } from '../src/game/business/group-services'
import { buildFabAction } from '../src/game/business/manage'
import { bizOf, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { adult, company, drain, nextYear } from './market-kit'

const SEEDS = [3, 11, 29]
const FIRST = 2024
const LAST = 2034
const HUBS = ['us', 'cn', 'kr', 'jp', 'tw', 'in', 'gb', 'de', 'fi', 'sg', 'fr']
const STUDIOS = 40

/** The plan's yearly gain of each fab at 2026, in millions of dollars net of upkeep, and the sales it was measured on, in billions. */
const PIN: Record<number, { sales: number; gain: [number, number, number] }> = {
  3: { sales: 1.85, gain: [9.8, -1.05, -12.47] },
  11: { sales: 2.16, gain: [8.63, -0.36, -9.34] },
  29: { sales: 2.15, gain: [8.06, -0.8, -9.67] },
}

interface World { g: GameState; a: Asset; s?: Asset }

/** One year of one company as the guards read it. */
interface Row {
  year: number
  quality: number
  /** The unit cost the year is booked at: the plan's calm cost times `costFactor`, as yearly.ts reports it. */
  unit: number
  perf: number
  src: ChipSource
  lift: number
  factor: number
  /** Numbers that are not finite anywhere in the saved state (JSON.stringify would hide them as null). */
  bad: string[]
}

interface SisterYear {
  year: number
  chips: ChipSupply | null
  src: ChipSource
  /** The sister's `capacityLoss` straight after `prepareInternalServices`. */
  hold: number
  result: { provider: string; saved: number; year: number } | null
  /** The same buyer with three fabs added: one cut, never the sum. */
  three: { src: ChipSource; cut: number; factor: number; lift: number }
  sisterCut: number
}

interface Played {
  control: Row[]
  fabs: Row[]
  sister: Row[]
  built: number[]
  hints: Array<{ year: number; text: string }>
  gains: { sales: number; gain: number[]; cost: number[] }
  chips: SisterYear[]
}

/** A number that is not finite anywhere in a value. */
function nonFinite(v: unknown, path = ''): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (Array.isArray(v)) return v.flatMap((x, i) => nonFinite(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => nonFinite(x, `${path}.${k}`))
  return []
}

function world(seed: number, sister: boolean): World {
  const g = adult(seed, FIRST, 'us')
  const a = company(g, 'devices', { cash: 1e10, name: 'Story Devices' })
  bizOf(g, a).outlets = HUBS.map((countryId) => ({ countryId, city: getCountry(countryId).cities[0], count: STUDIOS, opened: 2020 }))
  if (!sister) return { g, a }
  const s = company(g, 'semiconductor', { cash: 1e10, name: 'Story Silicon' })
  const t = techOf(bizOf(g, s))
  t.stage = 3
  t.node = 5
  t.yieldRate = 0.8
  tend({ g, a, s })
  expect(formGroup(g, [s.id, a.id], 'Story Group')).toBe(true)
  expect(toggleService(g, groupsOf(g)[0].core.id, s.id, a.id)).toBe(true)
  return { g, a, s }
}

/** A chip company that stays a going concern. Tech level, demand boost and hype fade without R&D, so each year they are put back, and it books real sales. */
function tend(w: World): void {
  const t = techOf(bizOf(w.g, w.s!))
  t.level = Math.max(t.level, 85)
  t.boost = 1.5
  t.hype = 90
}

/** nextYear (market-kit) with one look between `prepareInternalServices` and the books, which is where the sister's hold exists. */
function sisterYear(w: World): number {
  const g = w.g
  tend(w)
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  prepareInternalServices(g, g.year - 1)
  const hold = bizOf(g, w.s!).capacityLoss
  yearlyBusinessImpl(g)
  drain(g)
  return hold
}

function row(w: World): Row {
  const { g, a } = w
  const b = bizOf(g, a)
  const t = chipTerms(b, g.year)
  return {
    year: g.year,
    quality: b.quality,
    unit: planFor(g, b, g.year, { calm: true }).unitCost * costFactor(b, true),
    perf: devicePerf(b.quality, t.node, t.yield),
    src: t.src,
    lift: t.lift,
    factor: chipCostFactor(b),
    bad: [...nonFinite(g.assets.map((x) => x.details), 'assets'), ...nonFinite(g.flags, 'flags'), ...nonFinite(g.character.money, 'money')],
  }
}

/** The plan's gain of the first, second and third fab, by the `bestPlan` differences the fab hint is built on. */
function gainsOf(w: World): Played['gains'] {
  const b = bizOf(w.g, w.a)
  const plans = [0, 1, 2, 3].map((fabs) => bestPlan(w.g, { ...b, fabs } as BizState, { fast: true }))
  return {
    sales: plans[0].demand * plans[0].price,
    gain: [1, 2, 3].map((k) => plans[k].profit - plans[k - 1].profit),
    cost: [0, 1, 2].map((fabs) => fabCost({ ...b, fabs } as BizState)),
  }
}

function sisterRow(w: World, hold: number): SisterYear {
  const { g, a } = w
  const b = bizOf(g, a)
  const both = { ...b, fabs: 3 } as BizState
  const t = chipSource(both)
  return {
    year: g.year,
    chips: b.chips ?? null,
    src: chipSource(b).src,
    hold,
    result: chipResultFor(g, a.id),
    three: { src: t.src, cut: t.cut, factor: chipCostFactor(both), lift: chipTerms(both, g.year).lift },
    sisterCut: chipSource(b).cut,
  }
}

function play(seed: number): Played {
  const control = world(seed, false)
  const fabs = world(seed, false)
  const sister = world(seed, true)
  const out: Played = { control: [], fabs: [], sister: [], built: [], hints: [], gains: { sales: 0, gain: [], cost: [] }, chips: [] }
  for (let y = FIRST; y < LAST; y++) {
    nextYear(control.g)
    out.control.push(row(control))
    if (control.g.year === 2026) out.gains = gainsOf(control)

    nextYear(fabs.g)
    if (fabs.g.year === 2025 || fabs.g.year === 2027) {
      buildFabAction(fabs.a).run(fabs.g)
      drain(fabs.g)
      out.built.push(bizOf(fabs.g, fabs.a).fabs ?? 0)
    }
    out.fabs.push(row(fabs))
    if (fabs.g.year >= 2027) out.hints.push({ year: fabs.g.year, text: buildFabAction(fabs.a).hint?.(fabs.g) ?? '' })

    const hold = sisterYear(sister)
    out.sister.push(row(sister))
    out.chips.push(sisterRow(sister, hold))
  }
  return out
}

describe.each(SEEDS)('a device company from 2024 to 2034 (seed %i)', (seed) => {
  let p: Played
  beforeAll(() => { p = play(seed) }, 900_000)

  it('keeps every number finite, quality under 98 and the chip lift under 6, in all three worlds', () => {
    for (const rows of [p.control, p.fabs, p.sister]) {
      expect(rows).toHaveLength(LAST - FIRST)
      for (const r of rows) {
        expect(r.bad, `${r.year}`).toEqual([])
        for (const n of [r.quality, r.unit, r.perf, r.lift, r.factor]) expect(Number.isFinite(n), `${r.year}`).toBe(true)
        expect(r.quality, `${r.year}`).toBeLessThanOrEqual(98)
        expect(r.lift, `${r.year}`).toBeLessThanOrEqual(LIFT_MAX)
      }
    }
  })

  it('never cuts the chip cost below .895, or below .80 with the scale saving of a dominant company', () => {
    for (const rows of [p.control, p.fabs, p.sister]) {
      for (const r of rows) {
        expect(r.factor, `${r.year}`).toBeGreaterThanOrEqual(0.895 - 1e-9)
        expect((1 - SCALE_SAVING) * r.factor, `${r.year}`).toBeGreaterThanOrEqual(0.8 - 1e-9)
      }
    }
    for (const r of p.control) expect([r.src, r.lift, r.factor], `${r.year}`).toEqual(['market', 0, 1])
  })

  it('builds two fabs, and by 2028 the fab world makes a unit for at most .96 of the control and runs faster', () => {
    expect(p.built).toEqual([1, 2])
    const at = (rows: Row[], year: number) => rows.find((r) => r.year === year)!
    expect(at(p.fabs, 2025).src).toBe('fab')
    for (let year = 2028; year <= LAST; year++) {
      const c = at(p.control, year)
      const f = at(p.fabs, year)
      expect(f.src, `${year}`).toBe('fab')
      // Measured (seed 3, 2028): 272 against 298 dollars a unit (.91), performance 72 against 64.
      expect(f.unit / c.unit, `${year}`).toBeLessThanOrEqual(0.96)
      expect(f.perf, `${year}`).toBeGreaterThan(c.perf)
    }
  })

  it('writes the sister record for last year, every year it has books to go on, and never holds more than half of it', () => {
    // The first fiscal year books no sales (production starts at 0), so the first record is for fiscal 2026, written at 2027.
    for (const r of p.chips) {
      if (r.year >= 2027) {
        expect(r.chips, `${r.year}`).not.toBeNull()
        expect(r.src, `${r.year}`).toBe('sister')
      }
      if (r.chips) {
        expect(r.chips.year, `${r.year}`).toBe(r.year - 1)
        expect(r.chips.stage).toBe(3)
      }
      expect(r.hold, `${r.year}`).toBeLessThanOrEqual(0.5)
      expect(r.hold, `${r.year}`).toBeGreaterThanOrEqual(0)
    }
    expect(p.chips.filter((r) => r.chips).length).toBeGreaterThanOrEqual(LAST - 2027 + 1)
    // The sister holds capacity back only for a buyer it serves, and the saving is booked once a year with no cash moved.
    for (const r of p.chips.filter((x) => x.year >= 2027)) {
      expect(r.hold, `${r.year}`).toBeGreaterThan(0)
      expect(r.result, `${r.year}`).not.toBeNull()
      expect(r.result!.year, `${r.year}`).toBe(r.year - 1)
      expect(r.result!.saved, `${r.year}`).toBeGreaterThan(0)
    }
  })

  it('gives a world with three fabs and a sister one cut and a lift of at most 6', () => {
    for (const r of p.chips.filter((x) => x.chips)) {
      expect(r.three.src, `${r.year}`).toBe('fab')
      expect(r.three.cut, `${r.year}`).toBe(FAB_CUT[3])
      expect(r.sisterCut, `${r.year}`).toBeGreaterThan(0)
      expect(r.sisterCut, `${r.year}`).toBeLessThanOrEqual(SISTER_CUT[3])
      // Never the sum of the two.
      expect(r.three.cut, `${r.year}`).toBeLessThan(FAB_CUT[3] + r.sisterCut)
      expect(r.three.factor, `${r.year}`).toBeCloseTo(1 - CHIP_SHARE * FAB_CUT[3], 10)
      expect(r.three.lift, `${r.year}`).toBeLessThanOrEqual(LIFT_MAX)
    }
  })

  it('pays less for every further fab, and the third is not worth building for cost alone', () => {
    const { sales, gain, cost } = p.gains
    const pin = PIN[seed]
    // Measured at 2026 (US, 440 studios over the eleven hubs, sales 1.9B to 2.2B). The first fab costs 159M and nets about 8M to 10M a
    // year after its upkeep (a 16 to 20 year payback), the second nets about nothing, and the third loses about 9M to 12M a year. These
    // measured numbers replace the spec's hand estimate (+47M, +24M, +1M on 2B of sales). The order and the bounds are what the guard is for.
    expect(gain[0]).toBeGreaterThan(gain[1])
    expect(gain[1]).toBeGreaterThan(gain[2])
    expect(gain[2]).toBeLessThan(0.1 * gain[0])
    expect(Math.abs(cost[1] - cost[0] * 1.35)).toBeLessThanOrEqual(1)
    expect(sales / 1e9).toBeGreaterThan(pin.sales * 0.8)
    expect(sales / 1e9).toBeLessThan(pin.sales * 1.2)
    expect(sales).toBeGreaterThan(1.5e9)
    expect(gain[0] / 1e6).toBeGreaterThan(pin.gain[0] * 0.8)
    expect(gain[0] / 1e6).toBeLessThan(pin.gain[0] * 1.2)
    expect(Math.abs(gain[1] / 1e6 - pin.gain[1])).toBeLessThan(1.5)
    expect(gain[2] / 1e6).toBeLessThan(pin.gain[2] * 0.8)
    expect(gain[2] / 1e6).toBeGreaterThan(pin.gain[2] * 1.2)
  })

  it('never promises a payback on a third fab once two are built', () => {
    expect(p.hints).toHaveLength(LAST - 2027 + 1)
    for (const h of p.hints) {
      expect(h.text, `${h.year}`).toMatch(/The savings alone take over 8 years to repay it\.$|The savings don't cover the upkeep\.$/)
      expect(h.text, `${h.year}`).not.toContain('repay it in about')
    }
  })
})

describe('the market and the chips stay inside their bounds', () => {
  it('keeps the 2013 over 2006 size of the devices market near its curve, so the smartphone wave is not counted twice', () => {
    // The curve alone gives .88 / .375 = 2.35. Measured with the wave: 2.41, the same for every seed.
    for (const seed of SEEDS) {
      const g = adult(seed, FIRST, 'us')
      const b = bizOf(g, company(g, 'devices'))
      const ratio = marketCtxFor(g, b, 2013).pot / marketCtxFor(g, b, 2006).pot
      expect(ratio, `seed ${seed}`).toBeGreaterThan(2.0)
      expect(ratio, `seed ${seed}`).toBeLessThan(3.2)
    }
  })

  it('holds for every source and every year: cost factor at least .895 (.80 with dominance), lift at most 6', () => {
    const sources: Array<{ fabs?: number; chips?: ChipSupply }> = []
    for (const fabs of [0, 1, 2, 3]) {
      sources.push({ fabs })
      for (const stage of [2, 3, 4]) for (const cover of [0, 0.25, 0.5, 1]) {
        sources.push({ fabs, chips: { year: 2026, from: 'a1', name: 'Acme Silicon', stage, node: 6, yield: 0.97, cover } })
      }
    }
    for (const s of sources) {
      const b = { industry: 'devices', ...s }
      expect(chipCostFactor(b)).toBeGreaterThanOrEqual(0.895 - 1e-9)
      expect((1 - SCALE_SAVING) * chipCostFactor(b)).toBeGreaterThanOrEqual(0.8 - 1e-9)
      for (let year = 1977; year <= 2100; year++) {
        const t = chipTerms(b, year)
        expect(Number.isFinite(t.lift) && t.lift >= 0 && t.lift <= LIFT_MAX, `${JSON.stringify(s)} ${year}`).toBe(true)
        expect(Number.isFinite(t.cut), `${JSON.stringify(s)} ${year}`).toBe(true)
      }
    }
  })
})
