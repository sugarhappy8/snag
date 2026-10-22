// ci: fast
// R3 fix (engine): a slowdown under a quarter of a year does not add a year.
//
// `years` was `ceil(baseYears / (sqrt(k) * speed))`, so a hair's breadth of slowness turned a one-year project into a two-year one:
// ambition 47.5 (a quarter of a point under the middle, a speed of 0.9925) gave a restaurant project 1.0076 years, and the ceiling of
// that is 2. The rule now is that the years round up from what the default actor would take at the same budget (`normal`, which is
// exactly what v5.0.0 booked), and a slowdown of `YEARS_GRACE` (a quarter of a year) or less does not move them. Beyond it the
// years round up from the exact figure less the grace, so the rule is continuous before the rounding, never faster than the default
// actor when the actor is slower, and never slower than the old rule. A faster actor is not touched: it rounds up from its exact figure.
//
// Four things are guarded here:
//   the default   at the default actor (ambition 50, steady, rested, no crew) the years are the rd.ts formula, bit for bit, over a grid
//   the cliff     ambition 47.5 and every lean or easygoing pace that costs under a quarter of a year take the default's years
//   both sides    a slowdown of 0.2462 years adds none and one of 0.2516 adds one, through the engine and through the pure rule
//   the shape     over a grid, the years are never under the default's when slower, never over the old rule, and fall as ambition rises
//
// No pinned seed: the game is makeTestGame's own and every grid is a plain nested loop.
import { describe, expect, it } from 'vitest'
import { quote } from '../src/game/effort/engine'
import { yearsOf } from '../src/game/effort/factors'
import { YEARS_GRACE } from '../src/game/effort/limits'
import { defineTask } from '../src/game/effort/task'
import type { EffortInput, Posture, Task } from '../src/game/effort/types'
import { makeTestGame } from './helpers'

/** The product research task of rd.ts at the given base years: years 1 to 4, the square root of the budget, no crew term. */
function taskOf(baseYears: number, over: { minYears?: number; maxYears?: number } = {}): Task {
  return defineTask({
    field: 'rd.beverage', mode: 'project', cost: 30_000, p0: 0.5, baseYears, minYears: over.minYears ?? 1, maxYears: over.maxYears ?? 4,
    oddsExp: 0.4, yearsExp: 0.5, oddsLo: 0.05, oddsHi: 0.95, quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 },
    hit: { p: 0.15, bonus: 10 }, spread: 8,
  })
}

/** rd.ts: `Math.round(clampN(Math.ceil(baseYears(b.industry) / Math.sqrt(k) - 1e-9), 1, 4))`, the line the default actor must keep. */
const legacyYears = (baseYears: number, k: number): number => Math.min(4, Math.max(1, Math.ceil(baseYears / Math.sqrt(k) - 1e-9)))

const g = makeTestGame(7, { age: 30 })
const POSTURES: readonly Posture[] = ['lean', 'steady', 'push']
const BASES = [0.5, 1, 1.5, 2, 2.5, 3, 4]
const BUDGETS = [0.05, 0.1, 0.25, 0.5, 0.7, 1, 1.3, 2, 2.25, 3, 4]

describe('the default actor takes the years it always took', () => {
  it('ambition 50, steady, rested: the rd.ts years over every base and budget', () => {
    const bad: string[] = []
    for (const b of BASES) {
      for (const k of BUDGETS) {
        const q = quote(g, taskOf(b), { k, ambition: 50, posture: 'steady', fatigue: 0 })
        if (q.years !== legacyYears(b, k)) bad.push(`base ${b} k ${k}: ${q.years} vs ${legacyYears(b, k)}`)
        if (q.yearsExact !== b / Math.sqrt(k)) bad.push(`exact base ${b} k ${k}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('a quote with no actor at all is the same', () => {
    for (const b of BASES) for (const k of BUDGETS) expect(quote(g, taskOf(b), { k }).years).toBe(legacyYears(b, k))
  })
})

describe('a slowdown under a quarter of a year adds no year', () => {
  it('ambition 47.5 gives a restaurant project one year, as it did at 50', () => {
    const t = taskOf(1)
    const q = quote(g, t, { k: 1, ambition: 47.5, posture: 'steady', fatigue: 0 })
    expect(q.yearsExact).toBeGreaterThan(1)
    expect(q.yearsExact).toBeLessThan(1.01)
    expect(q.years).toBe(1)
    expect(quote(g, t, { k: 1, ambition: 50, posture: 'steady', fatigue: 0 }).years).toBe(1)
  })

  it('no ambition at a steady pace costs a one-year project its year: the least pace (0.85) is a slowdown of 0.176', () => {
    for (let ambition = 0; ambition <= 50; ambition += 2.5) {
      const q = quote(g, taskOf(1), { k: 1, ambition, posture: 'steady', fatigue: 0 })
      expect(q.years, `ambition ${ambition}`).toBe(1)
    }
  })

  it('a lean year costs a one-year project nothing, and the longer exact figure is still told', () => {
    const q = quote(g, taskOf(1), { k: 1, ambition: 50, posture: 'lean', fatigue: 0 })
    expect(q.years).toBe(1)
    expect(q.yearsExact).toBeCloseTo(1 / (0.85 + 0.3 * 0.5 * 0.6), 12)
    expect(q.yearsExact).toBeGreaterThan(1.05)
  })

  it('a longer project is graced the same way: two years at ambition 25 is two years, not three', () => {
    const q = quote(g, taskOf(2), { k: 1, ambition: 25, posture: 'steady', fatigue: 0 })
    expect(q.yearsExact - 2).toBeLessThan(YEARS_GRACE)
    expect(q.years).toBe(2)
  })

  it('both sides of the quarter: at ambition 0 and fatigue 49 a one-year project takes 1.2462 years and stays one, at 50 it takes 1.2516 and becomes two', () => {
    const at = (fatigue: number) => quote(g, taskOf(1), { k: 1, ambition: 0, posture: 'steady', fatigue })
    const under = at(49)
    const over = at(50)
    expect(under.yearsExact - 1).toBeLessThan(YEARS_GRACE)
    expect(over.yearsExact - 1).toBeGreaterThan(YEARS_GRACE)
    expect(under.years).toBe(1)
    expect(over.years).toBe(2)
  })

  it('a slowdown that is more than a quarter still counts the quarter in the player\'s favour: two years slowed to 2.35 is three, to 2.16 stays two', () => {
    // ambition 0 steady is a pace of 0.85: 2 / 0.85 = 2.353 (a slowdown of 0.353 is over the grace, so it rounds up from 2.103)
    expect(quote(g, taskOf(2), { k: 1, ambition: 0, posture: 'steady', fatigue: 0 }).years).toBe(3)
    // ambition 25 steady is 0.925: 2 / 0.925 = 2.162
    expect(quote(g, taskOf(2), { k: 1, ambition: 25, posture: 'steady', fatigue: 0 }).years).toBe(2)
  })

  it('the exact years are the exact years: the grace is in the rounding and nowhere else', () => {
    for (const ambition of [0, 25, 47.5, 50, 75, 100]) {
      for (const posture of POSTURES) {
        const q = quote(g, taskOf(1.5), { k: 1.3, ambition, posture, fatigue: 20 })
        expect(q.yearsExact).toBeCloseTo(1.5 / (Math.sqrt(1.3) * q.effort.speed), 12)
      }
    }
  })
})

describe('the rule itself', () => {
  it('`yearsOf` rounds up from the default actor\'s years while the slowdown is at most the grace, and from the exact years less the grace after', () => {
    expect(YEARS_GRACE).toBe(0.25)
    expect(yearsOf(1, 1, 1, 4)).toBe(1)
    expect(yearsOf(1, 1 + 1e-12, 1, 4)).toBe(1)
    expect(yearsOf(1, 1.2, 1, 4)).toBe(1)
    expect(yearsOf(1, 1.25, 1, 4)).toBe(1)
    expect(yearsOf(1, 1.2501, 1, 4)).toBe(2)
    expect(yearsOf(1, 1.5, 1, 4)).toBe(2)
    expect(yearsOf(1, 2.25, 1, 4)).toBe(2)
    expect(yearsOf(1, 2.2501, 1, 4)).toBe(3)
    // a default actor with a fraction of a year to spare is not given the year back: the old rounding is the floor
    expect(yearsOf(1.2, 1.3, 1, 4)).toBe(2)
    expect(yearsOf(1.2, 1.45, 1, 4)).toBe(2)
    expect(yearsOf(1.2, 1.4501, 1, 4)).toBe(2)
    expect(yearsOf(1.2, 2.25, 1, 4)).toBe(2)
    expect(yearsOf(1.2, 2.4, 1, 4)).toBe(3)
  })

  it('`yearsOf` leaves a faster actor to the old rounding, with its 1e-9 tolerance', () => {
    expect(yearsOf(2, 1.5, 1, 4)).toBe(2)
    expect(yearsOf(2, 1, 1, 4)).toBe(1)
    expect(yearsOf(2, 1 + 1e-10, 1, 4)).toBe(1)
    expect(yearsOf(2, 1.001, 1, 4)).toBe(2)
    expect(yearsOf(6, 6 / 1.24, 1, 8)).toBe(5)
  })

  it('`yearsOf` keeps the years between the least and the most, and never answers with a number it was not given the means for', () => {
    expect(yearsOf(0.2, 0.2, 1, 4)).toBe(1)
    expect(yearsOf(40, 60, 1, 4)).toBe(4)
    expect(yearsOf(3, 9, 2, 4)).toBe(4)
    expect(yearsOf(0.2, 0.1, 2, 4)).toBe(2)
  })
})

describe('the shape of the rule over a grid', () => {
  it('is never under the default actor\'s years when the actor is slower, never over the old rule, and the old rule where the actor is faster', () => {
    const bad: string[] = []
    let slowed = 0
    let graced = 0
    for (const b of BASES) {
      for (const k of BUDGETS) {
        const t = taskOf(b)
        const normal = legacyYears(b, k)
        for (const ambition of [0, 10, 25, 40, 47.5, 50, 52.5, 60, 80, 100]) {
          for (const posture of POSTURES) {
            for (const fatigue of [0, 40, 60, 100]) {
              const input: EffortInput = { k, ambition, posture, fatigue }
              const q = quote(g, t, input)
              const old = Math.min(4, Math.max(1, Math.ceil(q.yearsExact - 1e-9)))
              const label = `base ${b} k ${k} ${JSON.stringify([ambition, posture, fatigue])}: ${q.years}`
              if (q.years > old) bad.push(`over the old rule, ${label} vs ${old}`)
              if (q.yearsExact > b / Math.sqrt(k) + 1e-12) {
                slowed++
                if (q.years < normal) bad.push(`under the default, ${label} vs ${normal}`)
                if (q.years < old) graced++
              } else if (q.years !== old) bad.push(`a faster actor was touched, ${label} vs ${old}`)
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
    expect(slowed, 'the grid has slow actors').toBeGreaterThan(1000)
    expect(graced, 'and the grace saves some of them a year').toBeGreaterThan(100)
  })

  it('falls as ambition rises, at every posture, base, budget and tiredness (no ambition makes a project longer)', () => {
    const bad: string[] = []
    for (const b of BASES) {
      for (const k of BUDGETS) {
        for (const posture of POSTURES) {
          for (const fatigue of [0, 60]) {
            let last = Infinity
            for (let ambition = 0; ambition <= 100; ambition += 2.5) {
              const q = quote(g, taskOf(b), { k, ambition, posture, fatigue })
              if (q.years > last) bad.push(`base ${b} k ${k} ${posture} fatigue ${fatigue}: ${last} then ${q.years} at ambition ${ambition}`)
              last = q.years
            }
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
  })

  it('no slowdown of a one-year project in the whole range of a steady actor or a lean one reaches a second year', () => {
    for (let ambition = 0; ambition <= 100; ambition += 5) {
      for (const posture of ['lean', 'steady'] as const) expect(quote(g, taskOf(1), { k: 1, ambition, posture }).years, `${posture} at ${ambition}`).toBe(1)
    }
  })

  it('the years stay between the task\'s least and most, slow or fast', () => {
    for (const b of [0.2, 1, 40]) {
      for (const ambition of [0, 50, 100]) {
        for (const posture of POSTURES) {
          for (const k of [0.01, 1, 4]) {
            const q = quote(g, taskOf(b, { minYears: 2, maxYears: 3 }), { k, ambition, posture, fatigue: 100 })
            expect(q.years).toBeGreaterThanOrEqual(2)
            expect(q.years).toBeLessThanOrEqual(3)
          }
        }
      }
    }
  })
})
