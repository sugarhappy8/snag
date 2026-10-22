// R3-E2 (C.1, the pure curves of the effort engine): every function here takes numbers and returns a number, with a real-world ceiling
// on each growth term. Nothing draws, nothing reads the game and nothing books money, so the cases are grids and hostile values. The
// parity cases import the product R&D function itself (business/rd.ts budgetQuality) and the product clamp (business/util.ts clampN),
// because the migration of the product system must reproduce them bit for bit under the knee.
//
// What each group guards:
//   softCeil     identity under the knee, never above the ceiling, monotone; room 0 is the hard clamp the product task needs (D18)
//   laborOf      diminishing returns that saturate at the task's cap
//   crewRatio    1 with no crew, the leadership.ts shape per worker with drive and fatigue, and a bound either way
//   rhoOf        ambition buys pace linearly and never more than 1.25; boldOf and phiOf are its variance and its price
//   budgetQuality  the rd.ts function with its constants as fields
//   knowGain, knowBank, knowOdds  know-how that fades in value as it grows and never buys more than 15 odds points
//   world terms  public research and rival pressure are capped, whatever the caller passes
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { budgetQuality as rdBudgetQuality } from '../src/game/business/rd'
import { clampN } from '../src/game/business/util'
import {
  CREW_REF_MORALE,
  CREW_X_MAX,
  CREW_X_MIN,
  boldOf,
  budgetQuality,
  crewRatio,
  knowBank,
  knowGain,
  knowOdds,
  laborOf,
  phiOf,
  rhoOf,
  softCeil,
  workerOutput,
} from '../src/game/effort/curves'
import { ceilingOf, rivalPts, spillPts } from '../src/game/effort/world'
import * as L from '../src/game/effort/limits'
import { learnKnowHow } from '../src/game/effort/knowhow'
import { defineTask } from '../src/game/effort/task'
import type { Posture, Task, Worker } from '../src/game/effort/types'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const POSTURES: Posture[] = ['lean', 'steady', 'push']

/** `n + 1` evenly spaced numbers from `lo` to `hi`. */
function span(lo: number, hi: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n)
}

/** Values nobody should pass and a save or a caller might. */
const HOSTILE: unknown[] = [Number.NaN, Infinity, -Infinity, '12', null, undefined, {}, [], true]

/** A task with a reference crew, for the crew ratio. */
function crewTask(over: Partial<Task> = {}): Task {
  return defineTask({ field: 'rd.test', mode: 'project', cost: 50_000, fteCap: 6, refCrew: { fte: 3, skill: 60 }, ...over })
}

/** A worker at the reference morale, neutral drive and no fatigue. */
const worker = (fte: number, skill: number, extra: Partial<Worker> = {}): Worker => ({ fte, skill, morale: CREW_REF_MORALE, ...extra })

describe('softCeil', () => {
  it('is the identity up to the knee, bit for bit', () => {
    for (const [ceiling, room] of [[100, 20], [97, 8], [50, 50], [1200, 300], [10, 0]] as const) {
      for (const raw of span(-50, ceiling - room, 60)) expect(softCeil(raw, ceiling, room)).toBe(raw)
    }
  })

  it('never goes above the ceiling, however large the raw number', () => {
    for (const [ceiling, room] of [[100, 20], [97, 8], [50, 50], [1200, 300], [10, 0.5]] as const) {
      for (const raw of [1, 1e3, 1e6, 1e12, 1e300, Number.MAX_VALUE, Infinity]) {
        const v = softCeil(raw, ceiling, room)
        expect(v).toBeLessThanOrEqual(ceiling)
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('stays strictly under the ceiling while the raw number is within reach of it', () => {
    for (const raw of span(80, 200, 40)) expect(softCeil(raw, 100, 20)).toBeLessThan(100)
    expect(softCeil(100, 100, 20)).toBeCloseTo(100 - 20 * Math.exp(-1), 12)
  })

  it('is monotone: more raw never gives less', () => {
    for (const [ceiling, room] of [[100, 20], [97, 8], [50, 50], [100, 0]] as const) {
      let prev = -Infinity
      for (const raw of span(-20, 300, 640)) {
        const v = softCeil(raw, ceiling, room)
        expect(v).toBeGreaterThanOrEqual(prev)
        prev = v
      }
    }
  })

  it('is continuous at the knee: no jump where the cushion starts', () => {
    const knee = 100 - 20
    expect(softCeil(knee, 100, 20)).toBe(knee)
    expect(Math.abs(softCeil(knee + 1e-6, 100, 20) - knee)).toBeLessThan(2e-6)
    // The slope is 1 at the knee and falls from there: the first points above it are worth less than one point each.
    expect(softCeil(knee + 5, 100, 20) - knee).toBeLessThan(5)
    expect(softCeil(knee + 5, 100, 20) - knee).toBeGreaterThan(4)
  })

  it('with room 0 is a hard clamp at the ceiling (the product task keeps parity under 97)', () => {
    expect(softCeil(150, 97, 0)).toBe(97)
    expect(softCeil(97, 97, 0)).toBe(97)
    expect(softCeil(96.5, 97, 0)).toBe(96.5)
    for (const raw of span(-10, 400, 100)) expect(softCeil(raw, 97, 0)).toBe(Math.min(raw, 97))
  })

  it('reproduces the product clamp(q, 5, 97) of rd.ts rdQuality once the floor is applied', () => {
    for (const raw of span(-60, 220, 560)) expect(softCeil(clampN(raw, 5, 97), 97, 0)).toBe(clampN(raw, 5, 97))
  })

  it('treats a negative room as none, and is total on hostile numbers', () => {
    expect(softCeil(120, 100, -5)).toBe(100)
    for (const h of HOSTILE) {
      for (const args of [[h, 100, 20], [50, h, 20], [50, 100, h], [150, h, h]] as const) {
        const v = softCeil(args[0] as number, args[1] as number, args[2] as number)
        expect(typeof v).toBe('number')
        expect(Number.isFinite(v), `softCeil(${String(args)})`).toBe(true)
      }
    }
    expect(softCeil(Infinity, 100, 20)).toBe(100)
  })
})

describe('laborOf', () => {
  it('is 0 for no people and rises with them', () => {
    expect(laborOf(0, 6)).toBe(0)
    let prev = 0
    for (const fte of span(0.5, 30, 59)) {
      const v = laborOf(fte, 6)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('saturates at the cap, however many people', () => {
    expect(laborOf(4000, 6)).toBe(6)
    expect(laborOf(400_000, 6)).toBe(6)
    for (const fte of [1, 5, 50, 500]) expect(laborOf(fte, 6)).toBeLessThanOrEqual(6)
  })

  it('has diminishing returns: never more than the people, and the next person adds less than the last', () => {
    for (const fte of span(0.25, 20, 79)) expect(laborOf(fte, 6)).toBeLessThanOrEqual(fte)
    const step = (n: number): number => laborOf(n + 1, 6) - laborOf(n, 6)
    for (let n = 0; n < 15; n++) expect(step(n + 1)).toBeLessThan(step(n))
    expect(laborOf(1, 6)).toBeCloseTo(6 * (1 - Math.exp(-1 / 6)), 12)
  })

  it('never takes a cap above FTE_CAP_MAX, and reads a cap that is not above 0 as no labor', () => {
    expect(laborOf(1e9, 1000)).toBeLessThanOrEqual(L.FTE_CAP_MAX)
    expect(laborOf(1e9, L.FTE_CAP_MAX)).toBe(L.FTE_CAP_MAX)
    expect(laborOf(5, 0)).toBe(0)
    expect(laborOf(5, -3)).toBe(0)
  })

  it('is total on hostile numbers', () => {
    for (const h of HOSTILE) {
      expect(Number.isFinite(laborOf(h as number, 6)), `fte ${String(h)}`).toBe(true)
      expect(Number.isFinite(laborOf(5, h as number)), `cap ${String(h)}`).toBe(true)
    }
    expect(laborOf(-4, 6)).toBe(0)
  })
})

describe('workerOutput', () => {
  it('is the leadership.ts shape for a neutral worker, bit for bit (skill/100 * (.35 + .95 morale/100))', () => {
    for (const skill of [0, 1, 17, 50, 63, 100]) {
      for (const morale of [0, 10, 50, 77, 100]) {
        const old = (skill / 100) * (0.35 + (0.95 * morale) / 100)
        expect(workerOutput({ fte: 1, skill, morale })).toBe(old)
        expect(workerOutput({ fte: 1, skill, morale, drive: 50, fatigue: 0 })).toBe(old)
      }
    }
  })

  it('moves by at most ten percent either way with drive (0.9 at drive 0, 1.1 at drive 100)', () => {
    const base = workerOutput(worker(1, 80))
    expect(workerOutput(worker(1, 80, { drive: 0 }))).toBeCloseTo(0.9 * base, 12)
    expect(workerOutput(worker(1, 80, { drive: 100 }))).toBeCloseTo(1.1 * base, 12)
    expect(workerOutput(worker(1, 80, { drive: 9999 }))).toBeCloseTo(1.1 * base, 12)
    expect(workerOutput(worker(1, 80, { drive: -9999 }))).toBeCloseTo(0.9 * base, 12)
  })

  it('loses pace with fatigue by phiOf, and nothing under the knee', () => {
    const base = workerOutput(worker(1, 80))
    expect(workerOutput(worker(1, 80, { fatigue: L.FATIGUE_KNEE }))).toBe(base)
    expect(workerOutput(worker(1, 80, { fatigue: 100 }))).toBeCloseTo(base * phiOf(100), 12)
    expect(workerOutput(worker(1, 80, { fatigue: 100 }))).toBeLessThan(base)
  })

  it('is bounded: never above 1.43 (skill 100, morale 100, drive 100) and never below 0', () => {
    for (const skill of [-50, 0, 100, 500]) {
      for (const morale of [-50, 0, 100, 500]) {
        const v = workerOutput({ fte: 1, skill, morale, drive: 100, fatigue: 0 })
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1.3 * 1.1 + 1e-12)
      }
    }
  })

  it('is total on a worker that is not one', () => {
    for (const h of HOSTILE) expect(Number.isFinite(workerOutput(h as Worker)), String(h)).toBe(true)
    expect(Number.isFinite(workerOutput({ fte: 1, skill: Number.NaN, morale: Infinity, drive: 'x', fatigue: {} } as unknown as Worker))).toBe(true)
  })
})

describe('crewRatio', () => {
  it('is 1 with no crew, and with a task that has no reference crew', () => {
    const t = crewTask()
    expect(crewRatio(t, undefined)).toBe(1)
    expect(crewRatio(t, null)).toBe(1)
    expect(crewRatio(t, [])).toBe(1)
    expect(crewRatio(t, [worker(0, 90)])).toBe(1)
    expect(crewRatio(crewTask({ refCrew: null }), [worker(6, 100), worker(2, 10)])).toBe(1)
  })

  it('is 1 for the reference crew itself (its size and skill, at the reference morale, drive 50 and no fatigue)', () => {
    const t = crewTask()
    expect(crewRatio(t, [worker(3, 60)])).toBeCloseTo(1, 12)
    // The same people split in two rows are the same crew.
    expect(crewRatio(t, [worker(1, 60), worker(2, 60)])).toBeCloseTo(1, 12)
  })

  it('rises with skill, size, morale and drive, and falls with fatigue', () => {
    const t = crewTask()
    const base = crewRatio(t, [worker(3, 60)])
    expect(crewRatio(t, [worker(3, 90)])).toBeGreaterThan(base)
    expect(crewRatio(t, [worker(5, 60)])).toBeGreaterThan(base)
    expect(crewRatio(t, [worker(3, 60, { morale: 90 })])).toBeGreaterThan(base)
    expect(crewRatio(t, [worker(3, 60, { drive: 90 })])).toBeGreaterThan(base)
    expect(crewRatio(t, [worker(3, 60, { fatigue: 90 })])).toBeLessThan(base)
    expect(crewRatio(t, [worker(1, 60)])).toBeLessThan(base)
  })

  it('weighs a worker by their share of the crew (a part-timer counts for less)', () => {
    const t = crewTask()
    const mixed = crewRatio(t, [worker(2.5, 80), worker(0.5, 10)])
    const swapped = crewRatio(t, [worker(0.5, 80), worker(2.5, 10)])
    expect(mixed).toBeGreaterThan(swapped)
  })

  it('has labor with diminishing returns (the 0.8 power), so doubling the people is less than doubling the pace', () => {
    const t = crewTask({ fteCap: 40, refCrew: { fte: 4, skill: 60 } })
    const one = crewRatio(t, [worker(4, 60)])
    const two = crewRatio(t, [worker(8, 60)])
    expect(two).toBeGreaterThan(one)
    expect(two / one).toBeLessThan(2)
    expect(two / one).toBeGreaterThan(1.5)
    // The same people (same skill, morale, drive) so only labor differs: the ratio is the labor ratio to the 0.8.
    expect(two / one).toBeCloseTo(Math.pow(laborOf(8, 40) / laborOf(4, 40), 0.8), 12)
  })

  it('stays within CREW_X_MIN to CREW_X_MAX: a crew can neither stall nor multiply the pace without end', () => {
    expect(CREW_X_MIN).toBe(0.25)
    expect(CREW_X_MAX).toBe(4)
    const t = crewTask({ refCrew: { fte: 0.1, skill: 1 } })
    expect(crewRatio(t, [worker(4000, 100, { drive: 100 })])).toBe(CREW_X_MAX)
    const strong = crewTask({ refCrew: { fte: 40, skill: 100 }, fteCap: 40 })
    expect(crewRatio(strong, [worker(0.01, 1, { fatigue: 100, drive: 0 })])).toBe(CREW_X_MIN)
  })

  it('does not grow with 100 times the people once the cap is reached (the 100x probe)', () => {
    const t = crewTask({ fteCap: 6 })
    // 600 people is far past the cap of 6, so 100 times as many is the same crew.
    const at = (scale: number): number => crewRatio(t, [worker(600 * scale, 80)])
    expect(at(100)).toBe(at(1))
    expect(at(100)).toBeLessThanOrEqual(CREW_X_MAX)
  })

  it('reads a crew spread over many rows the way it reads one row', () => {
    const t = crewTask()
    const many = Array.from({ length: 40 }, () => worker(0.5, 70))
    expect(crewRatio(t, many)).toBeCloseTo(crewRatio(t, [worker(20, 70)]), 12)
  })

  it('is total on hostile crews: rows that are not workers count for nothing', () => {
    const t = crewTask()
    for (const h of HOSTILE) {
      expect(Number.isFinite(crewRatio(t, [h as Worker, worker(3, 60)])), String(h)).toBe(true)
      expect(Number.isFinite(crewRatio(t, h as Worker[])), String(h)).toBe(true)
    }
    expect(crewRatio(t, [null as unknown as Worker, worker(3, 60)])).toBeCloseTo(1, 12)
    expect(crewRatio(t, [{ fte: Number.NaN, skill: 50, morale: 50 }])).toBe(1)
  })

  it('is deterministic and leaves the crew alone', () => {
    const t = crewTask()
    const crew = [worker(2, 70, { drive: 80 }), worker(1, 40, { fatigue: 50 })]
    const copy = JSON.stringify(crew)
    expect(crewRatio(t, crew)).toBe(crewRatio(t, crew))
    expect(JSON.stringify(crew)).toBe(copy)
  })
})

describe('rhoOf', () => {
  it('is exactly 1 at ambition 50 and steady, so every old formula is reproduced', () => {
    expect(rhoOf(50, 'steady')).toBe(1)
  })

  it('is at most 1.24 at ambition 100 and pushing, under RHO_MAX', () => {
    expect(rhoOf(100, 'push')).toBeCloseTo(1.24, 12)
    expect(rhoOf(100, 'push')).toBeLessThanOrEqual(L.RHO_MAX)
  })

  it('stays within RHO_MIN to RHO_MAX for every ambition and posture, hostile ones included', () => {
    for (const p of POSTURES) {
      for (const a of [...span(-100, 300, 80), Number.NaN, Infinity, -Infinity]) {
        const v = rhoOf(a, p)
        expect(v).toBeGreaterThanOrEqual(L.RHO_MIN)
        expect(v).toBeLessThanOrEqual(L.RHO_MAX)
      }
    }
    for (const h of HOSTILE) {
      expect(Number.isFinite(rhoOf(h as number, 'steady'))).toBe(true)
      expect(rhoOf(50, h as Posture)).toBe(1)
    }
  })

  it('is monotone and linear in ambition: no curve, no free edge', () => {
    for (const p of POSTURES) {
      let prev = -Infinity
      for (const a of span(0, 100, 100)) {
        const v = rhoOf(a, p)
        expect(v).toBeGreaterThanOrEqual(prev)
        prev = v
      }
      for (const a of span(5, 95, 18)) {
        expect(rhoOf(a - 5, p) + rhoOf(a + 5, p) - 2 * rhoOf(a, p)).toBeCloseTo(0, 12)
      }
    }
  })

  it('orders the postures: pushing is faster than steady, steady than easing off, from ambition above 0', () => {
    for (const a of span(5, 100, 19)) {
      expect(rhoOf(a, 'push')).toBeGreaterThan(rhoOf(a, 'steady'))
      expect(rhoOf(a, 'steady')).toBeGreaterThan(rhoOf(a, 'lean'))
    }
    expect(rhoOf(0, 'push')).toBe(L.RHO_MIN)
    expect(rhoOf(0, 'lean')).toBe(L.RHO_MIN)
  })

  it('treats a posture it does not know as steady, and never reads the prototype', () => {
    expect(rhoOf(80, 'constructor' as Posture)).toBe(rhoOf(80, 'steady'))
    expect(rhoOf(80, '__proto__' as Posture)).toBe(rhoOf(80, 'steady'))
  })
})

describe('boldOf', () => {
  it('is exactly 0 at ambition 50 whatever the posture, so the defaults add nothing', () => {
    for (const p of POSTURES) expect(boldOf(50, p)).toBe(0)
  })

  it('follows the sign of (ambition - 50) and is scaled by the posture', () => {
    for (const p of POSTURES) {
      expect(boldOf(80, p)).toBeGreaterThan(0)
      expect(boldOf(20, p)).toBeLessThan(0)
      expect(boldOf(75, p)).toBeCloseTo(0.5 * L.POSTURE_FACTOR[p], 12)
      expect(boldOf(25, p)).toBeCloseTo(-0.5 * L.POSTURE_FACTOR[p], 12)
    }
    expect(boldOf(100, 'push')).toBeCloseTo(1.3, 12)
    expect(boldOf(0, 'push')).toBeCloseTo(-1.3, 12)
    expect(boldOf(100, 'lean')).toBeCloseTo(0.6, 12)
  })

  it('is bounded by the largest posture factor, ambition out of range included', () => {
    for (const p of POSTURES) {
      for (const a of [...span(-200, 400, 60), Number.NaN, Infinity, -Infinity]) {
        const v = boldOf(a, p)
        expect(Math.abs(v)).toBeLessThanOrEqual(1.3 + 1e-12)
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('is monotone in ambition', () => {
    for (const p of POSTURES) {
      let prev = -Infinity
      for (const a of span(0, 100, 50)) {
        const v = boldOf(a, p)
        expect(v).toBeGreaterThanOrEqual(prev)
        prev = v
      }
    }
  })
})

describe('phiOf', () => {
  it('is 1 up to the knee: a rested person loses no pace', () => {
    expect(phiOf(0)).toBe(1)
    expect(phiOf(L.FATIGUE_KNEE)).toBe(1)
    for (const f of span(0, L.FATIGUE_KNEE, 35)) expect(phiOf(f)).toBe(1)
  })

  it('falls by FATIGUE_SLOPE a point above the knee, and never reaches 0', () => {
    expect(phiOf(85)).toBeCloseTo(1 - L.FATIGUE_SLOPE * 50, 12)
    expect(phiOf(100)).toBeCloseTo(1 - L.FATIGUE_SLOPE * 65, 12)
    expect(phiOf(100)).toBeGreaterThan(0.7)
    let prev = 1
    for (const f of span(35, 100, 65)) {
      expect(phiOf(f)).toBeLessThanOrEqual(prev)
      prev = phiOf(f)
    }
  })

  it('reads a fatigue past 100 as 100, a negative one as 0, and a bad one as rested', () => {
    expect(phiOf(5000)).toBe(phiOf(100))
    expect(phiOf(-30)).toBe(1)
    for (const h of HOSTILE) expect(phiOf(h as number), String(h)).toBe(phiOf(h === Infinity ? 100 : 0))
  })
})

describe('budgetQuality', () => {
  const PRODUCT = { up: 28, down: 14, exp: 0.8 } // rd.ts QUALITY_UP, QUALITY_DOWN and the -0.8 power of budgetQuality

  it('equals the rd.ts function over k .05 to 4 with the product constants, bit for bit', () => {
    for (const k of span(0.05, 4, 395)) expect(budgetQuality(k, PRODUCT)).toBe(rdBudgetQuality(k))
    for (const k of [0.05, 0.1, 0.25, 0.5, 0.99, 1, 1.01, 2, 3, 4]) expect(budgetQuality(k, PRODUCT)).toBe(rdBudgetQuality(k))
  })

  it('floors the budget at .05 the way rd.ts does, and is total beyond it', () => {
    for (const k of [0.04, 0.01, 0, -3]) expect(budgetQuality(k, PRODUCT)).toBe(rdBudgetQuality(k))
    // Something that is not a number is the normal budget (adds nothing); infinity is read as a number.
    for (const h of HOSTILE.filter((x) => typeof x !== 'number' || Number.isNaN(x))) expect(budgetQuality(h as number, PRODUCT), String(h)).toBe(0)
    expect(Number.isFinite(budgetQuality(-Infinity, PRODUCT))).toBe(true)
  })

  it('adds nothing at the normal budget, and approaches but never reaches `up` however much is spent', () => {
    expect(budgetQuality(1, PRODUCT)).toBe(0)
    for (const k of [4, 40, 4000, 1e9]) expect(budgetQuality(k, PRODUCT)).toBeLessThan(PRODUCT.up)
    expect(budgetQuality(Infinity, PRODUCT)).toBeLessThanOrEqual(PRODUCT.up)
  })

  it('costs `down` points a halving under the normal budget', () => {
    expect(budgetQuality(0.5, PRODUCT)).toBeCloseTo(-14, 12)
    expect(budgetQuality(0.25, PRODUCT)).toBeCloseTo(-28, 12)
    expect(budgetQuality(0.5, { up: 10, down: 3, exp: 1 })).toBeCloseTo(-3, 12)
  })

  it('takes its constants from the curve it is given', () => {
    const c = { up: 10, down: 3, exp: 1 }
    expect(budgetQuality(2, c)).toBeCloseTo(10 * (1 - 0.5), 12)
    expect(budgetQuality(4, c)).toBeCloseTo(10 * (1 - 0.25), 12)
  })
})

describe('knowGain', () => {
  it('gives the whole gain to someone who knows nothing, and less as they learn', () => {
    expect(knowGain(0, 12)).toBe(12)
    let prev = 12
    for (const K of span(5, 100, 19)) {
      const v = knowGain(K, 12)
      expect(v).toBeLessThan(prev)
      expect(v).toBeGreaterThan(0)
      prev = v
    }
    expect(knowGain(50, 12)).toBeCloseTo(12 * Math.pow(1 - 50 / 110, 1.3), 12)
  })

  it('is small near the top: at 100 it is under a twentieth of the gain', () => {
    expect(knowGain(100, 12)).toBeLessThan(12 / 20)
  })

  it('never adds a negative amount, and is total', () => {
    expect(knowGain(30, -5)).toBe(0)
    expect(knowGain(500, 12)).toBe(knowGain(100, 12))
    expect(knowGain(-20, 12)).toBe(12)
    for (const h of HOSTILE) {
      expect(Number.isFinite(knowGain(h as number, 12))).toBe(true)
      expect(Number.isFinite(knowGain(30, h as number))).toBe(true)
    }
  })
})

describe('knowBank', () => {
  it('is KNOW_BANK times 100 times how far the work got, for someone who knows nothing', () => {
    expect(knowBank(0, 1)).toBeCloseTo(L.KNOW_BANK * 100, 12)
    expect(knowBank(0, 0.5)).toBeCloseTo(L.KNOW_BANK * 50, 12)
    expect(knowBank(0, 0)).toBe(0)
  })

  it('is damped the way knowGain is: the same factor', () => {
    for (const K of span(0, 100, 20)) expect(knowBank(K, 1)).toBeCloseTo(knowGain(K, L.KNOW_BANK * 100), 12)
  })

  it('rises with how far the work got, falls with what is already known, and stays in range', () => {
    let prev = 0
    for (const d of span(0, 1, 20)) {
      const v = knowBank(10, d)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(knowBank(60, 1)).toBeLessThan(knowBank(10, 1))
    expect(knowBank(0, 5)).toBe(knowBank(0, 1))
    expect(knowBank(0, -2)).toBe(0)
  })

  it('scales with what the task teaches, relative to the default of 12, and at most doubles', () => {
    expect(knowBank(0, 1, 12)).toBe(knowBank(0, 1))
    expect(knowBank(0, 1, 6)).toBeCloseTo(knowBank(0, 1) / 2, 12)
    expect(knowBank(0, 1, 0)).toBe(0)
    expect(knowBank(0, 1, 50)).toBeCloseTo(knowBank(0, 1) * 2, 12)
  })

  it('is total on hostile numbers', () => {
    for (const h of HOSTILE) {
      expect(Number.isFinite(knowBank(h as number, 0.5)), String(h)).toBe(true)
      expect(Number.isFinite(knowBank(10, h as number)), String(h)).toBe(true)
      expect(Number.isFinite(knowBank(10, 0.5, h as number)), String(h)).toBe(true)
    }
  })

  it('banked through learnKnowHow over 400 failures, know-how stays at most 100 and the odds it buys at most 15 points', () => {
    const map: Record<string, number> = {}
    let last = 0
    for (let i = 0; i < 400; i++) {
      const K = learnKnowHow(map, 'rd.beverage', knowBank(map['rd.beverage'] ?? 0, 1))
      expect(K).toBeGreaterThanOrEqual(last)
      expect(K).toBeLessThanOrEqual(L.KNOW_MAX)
      expect(knowOdds(K)).toBeLessThanOrEqual(L.KNOW_ODDS_MAX)
      last = K
    }
    expect(last).toBeGreaterThan(90)
  })
})

describe('knowOdds', () => {
  it('is 0 for no know-how and at most KNOW_ODDS_MAX points at the top', () => {
    expect(knowOdds(0)).toBe(0)
    expect(knowOdds(L.KNOW_MAX)).toBeLessThanOrEqual(L.KNOW_ODDS_MAX)
    expect(knowOdds(L.KNOW_MAX)).toBeCloseTo(L.KNOW_ODDS_MAX, 9)
  })

  it('rises with know-how, with each point worth less than the last', () => {
    let prev = 0
    let prevStep = Infinity
    for (let K = 1; K <= 100; K++) {
      const v = knowOdds(K)
      expect(v).toBeGreaterThan(prev)
      expect(v - prev).toBeLessThan(prevStep)
      prevStep = v - prev
      prev = v
    }
  })

  it('never goes over 15 points however high the number passed, and reads nonsense as nothing', () => {
    for (const K of [101, 1000, 1e9, Infinity]) expect(knowOdds(K)).toBeLessThanOrEqual(L.KNOW_ODDS_MAX)
    expect(knowOdds(-40)).toBe(0)
    for (const h of HOSTILE) {
      const v = knowOdds(h as number)
      expect(Number.isFinite(v), String(h)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(L.KNOW_ODDS_MAX)
    }
  })

  it('pays visibly: one half-finished failure from scratch buys about five odds points', () => {
    const K = knowBank(0, 0.5)
    expect(knowOdds(K)).toBeGreaterThan(3)
    expect(knowOdds(K)).toBeLessThan(8)
  })
})

describe('world terms', () => {
  it('spillPts takes public research up to SPILL_TERM_MAX (18) points and no further', () => {
    expect(spillPts(0)).toBe(0)
    expect(spillPts(7.5)).toBe(7.5)
    expect(spillPts(18)).toBe(18)
    for (const v of [18.01, 100, 1000, 1e9, Infinity]) expect(spillPts(v)).toBe(L.SPILL_TERM_MAX)
    expect(L.SPILL_TERM_MAX).toBe(18)
  })

  it('rivalPts takes rival pressure up to RIVAL_PTS (8) points and no further', () => {
    expect(rivalPts(0)).toBe(0)
    expect(rivalPts(3.25)).toBe(3.25)
    expect(rivalPts(8)).toBe(8)
    for (const v of [8.01, 100, 1000, 1e9, Infinity]) expect(rivalPts(v)).toBe(L.RIVAL_PTS)
  })

  it('reads a negative or a nonsense number as no term at all', () => {
    for (const f of [spillPts, rivalPts]) {
      expect(f(-5)).toBe(0)
      expect(f(-Infinity)).toBe(0)
      for (const h of HOSTILE.filter((x) => x !== Infinity)) expect(f(h as number), String(h)).toBe(0)
    }
  })

  it('is monotone', () => {
    let a = 0
    let b = 0
    for (const v of span(0, 30, 120)) {
      expect(spillPts(v)).toBeGreaterThanOrEqual(a)
      expect(rivalPts(v)).toBeGreaterThanOrEqual(b)
      a = spillPts(v)
      b = rivalPts(v)
    }
  })

  it('ceilingOf is where the world stands plus the headroom one maker can add', () => {
    expect(ceilingOf(70, 10)).toBe(80)
    expect(ceilingOf(0, 0)).toBe(0)
    expect(ceilingOf(40, 0)).toBe(40)
    expect(ceilingOf(-20, 10)).toBe(10)
    expect(ceilingOf(20, -10)).toBe(20)
    for (const h of HOSTILE.filter((x) => x !== Infinity)) {
      expect(ceilingOf(h as number, 5), String(h)).toBe(5)
      expect(ceilingOf(5, h as number), String(h)).toBe(5)
    }
    expect(Number.isFinite(ceilingOf(Infinity, Infinity))).toBe(true)
    expect(Number.isFinite(ceilingOf(Number.MAX_VALUE, Number.MAX_VALUE))).toBe(true)
  })
})

describe('the curves stay pure', () => {
  const dir = join(ROOT, 'src', 'game', 'effort')

  it('curves.ts and world.ts import only limits, num and types: nothing that reads the game, draws a number or books money', () => {
    for (const f of ['curves.ts', 'world.ts']) {
      const src = readFileSync(join(dir, f), 'utf8')
      const from = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
      expect(from.length).toBeGreaterThan(0)
      for (const mod of from) expect(['./limits', './num', './types'], `${f} imports ${mod}`).toContain(mod)
      for (const line of src.match(/^import .*$/gm) ?? []) {
        if (line.includes("'./types'")) expect(line).toMatch(/^import type /)
      }
    }
  })

  it('holds no token that draws, reads the clock or touches the game state', () => {
    for (const f of ['curves.ts', 'world.ts']) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      for (const bad of [/\brand\b/, /\bchance\b/, /\.rng\b/, /Math\.random/, /\bDate\b/, /performance\.now/, /\bg\.[a-z]/, /\bcash\b/, /\bledger\b/, /\bspend\b/]) {
        expect(src, `${f} has ${String(bad)}`).not.toMatch(bad)
      }
    }
  })

  it('reads no import while the module loads (rule d): every module-level const is a literal', () => {
    for (const f of ['curves.ts', 'world.ts']) {
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(/^(?:export )?const ([A-Za-z_]+)(?:: [^=]+)? = (.+)$/gm)) {
        expect(m[2], `${f}: ${m[1]}`).toMatch(/^-?[0-9.]+(?:e[0-9]+)?$/)
      }
    }
  })

  it('holds no en-dash or em-dash in the new files (the voice guide)', () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    expect(files).toEqual(expect.arrayContaining(['curves.ts', 'world.ts']))
    for (const f of ['curves.ts', 'world.ts']) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(dash)
  })
})
