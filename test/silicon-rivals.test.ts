import { describe, expect, it } from 'vitest'
import { marketViewOf } from '../src/game/business/competition'
import { marketKey, marketStateOf } from '../src/game/business/competition-core'
import { emptyMarket } from '../src/game/business/competition-state'
import { siliconOf } from '../src/game/business/deeptech-core'
import type { SiliconYear } from '../src/game/business/deeptech-state'
import { afterYearSilicon, chipPerformance, stackMod, undercutChance } from '../src/game/business/silicon'
import { toJson } from '../src/game/business/util'
import { chipLab, type Lab } from './silicon-kit'

describe('rival reaction and chip performance', () => {
  it('chipPerformance is the spec formula', () => {
    expect(chipPerformance({ level: 60, node: 3, yieldRate: 0.55 })).toBe(Math.round(30 + 15 + (20 * 0.25) / 0.67))
    expect([chipPerformance({ level: 100, node: 6, yieldRate: 0.97 }), chipPerformance({ level: 0, node: 0, yieldRate: 0.3 })]).toEqual([100, 0])
  })
  it('undercutChance is 0 under depth 0.05, capped at 0.45, halved at full win', () => {
    expect([undercutChance(0.05, 0), undercutChance(0.4, 0)]).toEqual([0, 0.45]); expect(undercutChance(0.4, 1)).toBeCloseTo(0.225); expect(undercutChance(0.1, 0)).toBeCloseTo(0.125)
  })
  it('stackMod multiplies by 1.08, clamps at 1.25 and ignores an expired mod', () => {
    expect(stackMod(undefined, 2026)).toEqual({ mult: 1.08, until: 2028 }); expect(stackMod({ mult: 1.2, until: 2030 }, 2026).mult).toBe(1.25); expect(stackMod({ mult: 1.2, until: 2025 }, 2026).mult).toBe(1.08)
  })

  // module level, shared by the next two tests
  const years = Array.from({ length: 30 }, (_, i) => 2024 + i)
  const setup = (last: Partial<SiliconYear> = {}, lifeId?: string): Lab => {
    const L = chipLab({ year: 2026 }); if (lifeId) L.g.lifeId = lifeId
    siliconOf(L.t).last = { year: 2026, index: 0.8, served: 0.9, depth: 0.4, win: 0.2, step: 0, perf: 0, quality: 0, ...last }; return L
  }
  const fought = (L: Lab, year: number): boolean => {            // one after-year step for fiscal `year`; true when a rival mod appeared
    L.t.silicon!.applied = 0; L.t.silicon!.last!.year = year
    const rng = JSON.stringify(L.g.rng); afterYearSilicon(L.g, L.a, L.b, L.t); expect(JSON.stringify(L.g.rng)).toBe(rng)
    return Object.values(marketStateOf(L.b)?.mods ?? {}).some((m) => m.until === year + 2)
  }
  it('reacts reproducibly, shares the heirs world and never uses the dice', () => {
    const run = (id?: string) => years.map((y) => fought(setup({}, id), y)), a = run()
    expect(run()).toEqual(a); expect(run(`${chipLab({ year: 2026 }).g.lifeId}-g2`)).toEqual(a)
    expect(a).toContain(true); expect(a).toContain(false)                                      // p is 0.405 here, so both happen over 30 years
  })
  it('does nothing without a squeeze, a deep cut, supply or a rival, and logs once when it fights', () => {
    const quiet = (last: Partial<SiliconYear>, noRivals = false) => {
      const L = setup(last); if (noRivals) L.b.market = toJson({ ...emptyMarket(marketKey(L.b)), year: 2025 })
      const before = JSON.stringify([L.b.market, L.g.log]); afterYearSilicon(L.g, L.a, L.b, L.t); return JSON.stringify([L.b.market, L.g.log]) === before
    }
    expect([quiet({ win: 0 }), quiet({ depth: 0.05 }), quiet({ served: 0.4 }), quiet({ served: 0 }), quiet({}, true)]).toEqual([true, true, true, true, true])   // served 0 is Review Focus 1
    const y = years[years.map((yr) => fought(setup(), yr)).indexOf(true)], L = setup(), top = marketViewOf(L.g, L.b).rivals[0]
    fought(L, y)
    expect(L.g.log.flatMap((e) => e.entries).map((e) => e.text).filter((x) => x === `${top.name} cut prices to match ${L.a.name}.`)).toHaveLength(1)
  })
  it('fills perf and quality once behind applied', () => {
    const L = chipLab({ year: 2026 }); siliconOf(L.t).last = { year: 2026, index: 1, served: 1, depth: 0, win: 0, step: 0, perf: 0, quality: 0 }
    afterYearSilicon(L.g, L.a, L.b, L.t); const once = JSON.stringify([L.g, L.b])
    expect([L.t.silicon!.last!.perf, L.t.silicon!.applied]).toEqual([chipPerformance(L.t), 2026])
    afterYearSilicon(L.g, L.a, L.b, L.t); expect(JSON.stringify([L.g, L.b])).toBe(once)                                  // state, market, nextId, rng
  })
})
