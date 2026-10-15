// Pins the firm's capacity and strategy outlook so a refactor of their formulas cannot change a number.
// Each case compares the exported function with the formula as it was written before capacityOf and
// outlookOf were pulled out of it, and with literal values taken from that older code. This file only
// uses what the firm's modules already export, so it passes before and after the extraction.
import { describe, expect, it } from 'vitest'
import { alphaMean, capacityFactor, fundSkill } from '../src/game/business/fund-model'
import { marketDrift, strategyOutlook } from '../src/game/business/fund-outlook'
import { readFund } from '../src/game/business/fund-state'
import type { HedgeStrategy } from '../src/game/business/fund-state'
import { leadershipPower } from '../src/game/business/leadership'
import type { BizState, KeyStaff } from '../src/game/business/state'
import { clampN } from '../src/game/business/util'
import type { GameState } from '../src/game/types'
import { firm } from './fund-fixtures'

const STRATEGIES: HedgeStrategy[] = ['longShort', 'macro', 'quant', 'event']

/** capacityFactor as it was written inside fund-model.ts. */
function oldCapacity(aum: number, skill: number, b: BizState): number {
  const cap = 4e9 * (1 + leadershipPower(b, 'quality') * .5) * (.5 + skill / 100)
  return clampN(Math.sqrt(cap / Math.max(1, aum)), 0, 1)
}

/** strategyOutlook as it was written inside fund-outlook.ts. */
function oldOutlook(g: GameState, b: BizState, f: ReturnType<typeof readFund>, strategy: HedgeStrategy): { strategy: HedgeStrategy; expected: number; swing: number } {
  const skill = fundSkill(g, b), cap = oldCapacity(f.aum, skill, b), drift = marketDrift(b.countryId)
  const alpha = alphaMean(skill) * (strategy === 'macro' ? 1 : cap)
  if (strategy === 'longShort') return { strategy, expected: .45 * drift + .025 + alpha * 1.2, swing: .1 }
  if (strategy === 'event') return { strategy, expected: .3 * drift + .055 - .015 + alpha * .8, swing: .07 }
  if (strategy === 'quant') return { strategy, expected: .1 * drift + .03 + (f.algoEdge + (skill - 50) * .0003) * cap + alpha * .6, swing: .05 }
  return { strategy, expected: alpha * .5, swing: .18 * f.lev }
}

function withQuality(b: BizState, skill: number, morale: number): void {
  const s: KeyStaff = { id: 'q1', firstName: 'Quinn', lastName: 'Park', gender: 'female', age: 38, role: 'Researcher', focus: 'quality', skill, salary: 90_000, trait: 'steady', morale, years: 2 }
  b.staff.push(s)
}

describe('capacityFactor keeps its numbers', () => {
  it('matches the original formula across sizes, skills and a quality team', () => {
    for (const quality of [false, true]) {
      const { b } = firm('hedge')
      if (quality) withQuality(b, 80, 70)
      for (const aum of [0, 1, 5e7, 1e6, 1e9, 4e9, 1e10, 1e11, 1e14]) {
        for (const skill of [5, 20, 50, 60, 100]) {
          expect(capacityFactor(aum, skill, b)).toBe(oldCapacity(aum, skill, b))
        }
      }
    }
  })

  it('returns the values the code gave before the change', () => {
    const { b } = firm('hedge')
    expect(capacityFactor(1e9, 60, b)).toBe(1)
    expect(capacityFactor(1e10, 60, b)).toBeCloseTo(0.6633249580710799, 12)
    expect(capacityFactor(1e11, 60, b)).toBeCloseTo(0.20976176963403034, 12)
    expect(capacityFactor(0, 60, b)).toBe(1)
    withQuality(b, 80, 70)
    expect(capacityFactor(1e11, 60, b)).toBeCloseTo(oldCapacity(1e11, 60, b), 14)
    expect(capacityFactor(1e11, 60, b)).toBeGreaterThan(0.20976176963403034)
  })
})

describe('strategyOutlook keeps its numbers', () => {
  it('matches the original formula for every strategy, size, leverage and algorithm edge', () => {
    for (const skill of [undefined, 30, 90]) {
      for (const aum of [0, 2_000_000, 3e9, 5e10]) {
        for (const lev of [1, 2.5, 3]) {
          const { g, b } = firm('hedge', skill === undefined ? {} : { skill })
          withQuality(b, 70, 60)
          const f = readFund(b)
          f.aum = aum; f.lev = lev; f.algoEdge = .03
          for (const s of STRATEGIES) expect(strategyOutlook(g, b, f, s)).toEqual(oldOutlook(g, b, f, s))
        }
      }
    }
  })

  it('returns the values the code gave before the change', () => {
    const { g, b } = firm('hedge')
    const f = readFund(b)
    f.aum = 2_000_000; f.lev = 2; f.algoEdge = 0
    // Frozen from the code as it was before the extraction.
    const frozen: Record<HedgeStrategy, { expected: number; swing: number }> = {
      longShort: { expected: 0.05208640000000001, swing: 0.1 },
      macro: { expected: -0.003713999999999998, swing: 0.36 },
      quant: { expected: 0.029829200000000007, swing: 0.05 },
      event: { expected: 0.0580576, swing: 0.07 },
    }
    for (const s of STRATEGIES) {
      const o = strategyOutlook(g, b, f, s)
      expect(o.strategy).toBe(s)
      expect(o.expected).toBeCloseTo(frozen[s].expected, 12)
      expect(o.swing).toBeCloseTo(frozen[s].swing, 12)
    }
  })
})
