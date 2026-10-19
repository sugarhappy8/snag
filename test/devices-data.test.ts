// Ecosystem companies: the pure chip core of the devices trade (constants, chip terms, reference prices).
import { describe, expect, it } from 'vitest'
import { computerUsd } from '../src/game/computer/era'
import {
  CHIP_RESERVE, CHIP_SHARE, DEVICE_NETWORK, FAB_BASE, FAB_CUT, FAB_MAINT, FAB_MAX, FAB_STEP, HARDWARE_FAMILIES, LIFT_K, LIFT_MAX, LINE_PRICE,
  MARKET_YIELD, OS_BETA, OS_FAMILY, OS_PULL_CAP, SISTER_CUT, chipBook, chipCostFactor, chipPerf, chipSource, chipTerms, devicePerf, kindReference,
  marketNode, readChips, readFabs, type ChipSupply,
} from '../src/game/business/devices-data'
import { chipPerformance } from '../src/game/business/silicon'

const co = (o: object = {}) => ({ industry: 'devices', ...o })
const sis = (stage: number, cover: number, node = 5, y = 0.8): ChipSupply => ({ year: 2026, from: 'a1', name: 'Acme Silicon', stage, node, yield: y, cover })

describe('devices chip core', () => {
  it('holds the spec constants', () => {
    expect([CHIP_SHARE, MARKET_YIELD, FAB_MAX, CHIP_RESERVE, LIFT_K, LIFT_MAX, FAB_BASE, FAB_STEP, FAB_MAINT, OS_BETA, OS_PULL_CAP, DEVICE_NETWORK])
      .toEqual([0.35, 0.7, 3, 0.2, 0.4, 6, 150_000_000, 0.35, 0.07, 0.9, 3, 1.5])
    expect(FAB_CUT).toEqual([0, 0.15, 0.25, 0.3])
    expect(SISTER_CUT).toEqual({ 2: 0.08, 3: 0.18, 4: 0.24 })
    expect(LINE_PRICE).toEqual({ core: 1, next: 1.05, premium: 1.25, value: 0.7, regional: 0.97, breakthrough: 1.2 })
    expect(HARDWARE_FAMILIES).toEqual(['Home Computer', 'Mobile Phone', 'Desktop PC', 'Laptop', 'Smartphone', 'VR Headset', 'AR Glasses'])
    expect(HARDWARE_FAMILIES).toHaveLength(7)
    expect(HARDWARE_FAMILIES).not.toContain(OS_FAMILY)
    expect(OS_FAMILY).toBe('Device Operating System')
  })

  it('marketNode steps 0 to 6 and never falls', () => {
    expect([2010, 2011, 2014, 2015, 2017, 2018, 2019, 2020, 2021, 2022, 2029, 2030].map(marketNode)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6])
    for (let y = 1900; y <= 2100; y++) expect(marketNode(y + 1)).toBeGreaterThanOrEqual(marketNode(y))
    expect(marketNode(NaN)).toBe(0)
  })

  it("chipPerf spans 0 to 50, devicePerf is Silicon 2.0's chipPerformance", () => {
    expect(chipPerf(0, 0.3)).toBe(0)
    expect(chipPerf(6, 0.97)).toBeCloseTo(50, 6)
    expect(devicePerf(62, 5, 0.7)).toBe(68)
    expect(devicePerf(100, 6, 0.97)).toBe(100)
    expect(devicePerf(0, 0, 0.3)).toBe(0)
    for (const t of [{ level: 60, node: 3, yieldRate: 0.55 }, { level: 0, node: 0, yieldRate: 0.3 }, { level: 100, node: 6, yieldRate: 0.97 }, { level: 41, node: 2, yieldRate: 0.8 }])
      expect(devicePerf(t.level, t.node, t.yieldRate)).toBe(chipPerformance(t))
  })

  it('chipSource never adds a fab and a sister', () => {
    expect(chipSource(co())).toEqual({ src: 'market', cut: 0, cover: 1 })
    expect(chipSource(co({ fabs: 1 }))).toEqual({ src: 'fab', cut: 0.15, cover: 1 })
    expect(chipSource(co({ chips: sis(4, 1) }))).toEqual({ src: 'sister', cut: 0.24, cover: 1 })
    expect(chipSource(co({ chips: sis(4, 0.5) })).cut).toBeCloseTo(0.12)
    expect(chipSource(co({ fabs: 3, chips: sis(4, 1) }))).toEqual({ src: 'fab', cut: 0.3, cover: 1 }) // not .54
    expect(chipSource(co({ fabs: 1, chips: sis(4, 1) })).cut).toBe(0.24) // not .39
    expect(chipSource(co({ chips: sis(4, 0) })).src).toBe('market')
    expect(chipSource({ industry: 'restaurant', fabs: 3, chips: sis(4, 1) })).toEqual({ src: 'market', cut: 0, cover: 1 })
  })

  it('takes the own fabs on a tie', () => {
    // Fab 1 cuts .15 and a stage-4 sister at cover .625 also cuts .15 (.24 x .625 is exactly .15): the tie goes to the fab.
    const tie = chipSource(co({ fabs: 1, chips: sis(4, 0.625) }))
    expect(tie.src).toBe('fab')
    expect(tie.cut).toBe(0.15)
  })

  it('reads damaged input as the market', () => {
    const bad = { year: 2026, from: 'a1', name: 'S', stage: 9, node: 5, yield: 0.8, cover: NaN }
    for (const x of [co({ fabs: 'x', chips: bad }), co({ fabs: NaN }), co({ fabs: 9 }), co({ chips: 7 })]) {
      const h = x as never
      expect(chipSource(h)).toEqual({ src: 'market', cut: 0, cover: 1 })
      expect(chipCostFactor(h)).toBe(1)
      expect(chipTerms(h, 2026).lift).toBe(0)
      for (const n of [chipTerms(h, 2026).node, chipTerms(h, 2026).yield, chipTerms(h, 2026).perfBump, chipTerms(h, 2026).cover]) expect(Number.isNaN(n)).toBe(false)
    }
  })

  it('chipTerms gives the 2026 table and caps the lift', () => {
    expect(chipTerms(co(), 2026)).toMatchObject({ src: 'market', cut: 0, node: 5, yield: 0.7, perfBump: 0, lift: 0 })
    const one = chipTerms(co({ fabs: 1 }), 2026)
    expect([one.node, one.yield]).toEqual([5, 0.75])
    expect(one.lift).toBeCloseTo(0.597, 2)
    const two = chipTerms(co({ fabs: 2 }), 2026)
    expect([two.node, two.yield]).toEqual([6, 0.8])
    expect(two.lift).toBeCloseTo(3.194, 2)
    const three = chipTerms(co({ fabs: 3 }), 2026)
    expect(three.yield).toBe(0.85)
    expect(three.lift).toBeCloseTo(3.791, 2)
    const sister = chipTerms(co({ chips: sis(3, 0.5, 6, 0.85) }), 2026)
    expect(sister).toMatchObject({ src: 'sister', from: 'a1', node: 6, yield: 0.85, cover: 0.5 })
    expect(sister.lift).toBeCloseTo(1.8955, 3)
    expect(chipTerms(co({ chips: sis(4, 1, 6, 0.97) }), 2011).lift).toBe(LIFT_MAX)
    expect(chipTerms(co({ fabs: 3, chips: sis(4, 1) }), 2026).src).toBe('fab')
  })

  it('chipCostFactor never drops below .895 and chipBook adds up', () => {
    const f = [co(), co({ fabs: 1 }), co({ fabs: 3 }), co({ chips: sis(4, 1) }), co({ fabs: 3, chips: sis(4, 1) }), { industry: 'restaurant', fabs: 3 }].map(chipCostFactor)
    const want = [1, 0.9475, 0.895, 0.916, 0.895, 1]
    f.forEach((v, i) => expect(v).toBeCloseTo(want[i], 10))
    const { saved, paid } = chipBook(1000, 0.3)
    expect(saved + paid).toBeCloseTo((1000 * 0.35) / 0.895, 8)
    expect(1000 + saved).toBeCloseTo(1000 / 0.895, 8)
    expect(chipBook(0, 0.3)).toEqual({ saved: 0, paid: 0 })
    expect(chipBook(1000, 0)).toEqual({ saved: 0, paid: 350 })
    expect(chipBook(NaN, 0.3)).toEqual({ saved: 0, paid: 0 })
  })

  it('kindReference hits the shop prices and follows computerUsd', () => {
    expect([kindReference('Smartphone', 2026), kindReference('Laptop', 2026), kindReference('VR Headset', 2026), kindReference('AR Glasses', 2026), kindReference('Mobile Phone', 2026)])
      .toEqual([900, 1300, 500, 800, 300])
    for (let y = 1977; y <= 1986; y++) expect(Math.abs(kindReference('Home Computer', y) / computerUsd(y) - 1)).toBeLessThanOrEqual(0.25)
    for (let y = 1985; y <= 2009; y++) expect(Math.abs(kindReference('Desktop PC', y) / computerUsd(y) - 1)).toBeLessThanOrEqual(0.25)
    for (let y = 1995; y <= 2009; y++) expect(Math.abs(kindReference('Laptop', y) / (1.4 * computerUsd(y)) - 1)).toBeLessThanOrEqual(0.25)
    expect(kindReference(OS_FAMILY, 2026)).toBe(0)
    expect(kindReference('nope', 2026)).toBe(0)
    expect(kindReference('constructor', 2026)).toBe(0)
    for (const fam of HARDWARE_FAMILIES) for (let y = 1977; y <= 2100; y++) {
      const v = kindReference(fam, y)
      expect(Number.isFinite(v) && v > 0).toBe(true)
    }
  })

  it('reads fabs and chips through readers that refuse damaged values', () => {
    const odd = [undefined, null, 'x', NaN, Infinity, -1, 0, 1, 2, 3, 4, 2.5, 1e9, '2', [2], {}] as never[]
    expect(odd.map(readFabs)).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0])
    const ok = { year: 2026, from: 'a1', name: 'Acme Silicon', stage: 3, node: 5, yield: 0.8, cover: 0.6 }
    expect(readChips(ok)).toEqual(ok)
    for (const bad of [{ year: '2026' }, { year: NaN }, { stage: '3' }, { stage: 1 }, { stage: 5 }, { stage: 3.5 }, { node: 7 }, { node: -1 }, { node: 2.5 }, { node: NaN },
      { yield: 0.2 }, { yield: 1 }, { yield: NaN }, { cover: -0.1 }, { cover: 1.1 }, { cover: NaN }, { year: 1e9 }, { year: 2026.5 }, { from: '' }, { from: 7 }, { name: 7 }])
      expect(readChips({ ...ok, ...bad } as never)).toBeNull()
    for (const bad of [[ok], null, undefined, 7, 'x', true]) expect(readChips(bad as never)).toBeNull()
    expect(readChips({ ...ok, name: 'n'.repeat(100) })?.name).toHaveLength(60)
    expect(readChips({ ...ok, junk: 1 } as never)).toEqual(ok)
  })
})
