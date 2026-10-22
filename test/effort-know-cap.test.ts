// ci: fast
// R3 fix (engine): know-how is worth at most 15 odds points, in the odds and in the line the player reads, under every plan.
//
// The owner's rule is that failed research banks at most 15 odds points (`KNOW_ODDS_MAX`). Two numbers carry it:
//   the odds     what a quote's `p` gains from know-how: the same input with the field's know-how and with none. The sweep of the
//                migration once measured 19.96 for a product project under the boldest plan (ambition 100, pushing), 17.2 for a deep
//                tech program and 16.3 for a capability track, because know-how was then a logit shift that grew when a bold plan
//                pulled the odds toward even. R3-E9 added it in odds points instead (`deviate`), so those figures are gone, and the
//                first group below pins that: no plan, clamp, budget, crew or tired owner makes 100 know-how worth more than 15.
//   the line     the "know-how +N" the odds line prints. The lines add up to the odds, and `attribute` put what the terms leave
//                together (rounding, the way logit shifts compound, a clamp) on the largest line, which for a long shot with a crew
//                was know-how: "know-how +41" for a term that adds exactly 15. The second group pins that the line never reads past
//                the cap (nor against the term's own sign), and that the lines still add up.
//
// No pinned seed: the game is makeTestGame's own and every grid is a plain nested loop.
import { describe, expect, it } from 'vitest'
import { quote } from '../src/game/effort/engine'
import { attribute, deviate } from '../src/game/effort/factors'
import { KNOW_ODDS_MAX, RIVAL_PTS, SPILL_TERM_MAX } from '../src/game/effort/limits'
import { defineTask } from '../src/game/effort/task'
import type { EffortInput, Posture, Task, Worker } from '../src/game/effort/types'
import { makeTestGame } from './helpers'

/** The float noise of subtracting two odds that are 0.15 apart. */
const EPS = 1e-9

/** A product-shaped task with the given odds clamp and hardness (the shape of rd.ts). */
function taskOf(lo: number, hi: number, hardness: number): Task {
  return defineTask({
    field: 'rd.beverage', mode: 'project', cost: 30_000, p0: 0.5, baseYears: 1.5, minYears: 1, maxYears: 4, oddsLo: lo, oddsHi: hi, hardness,
    fteCap: 40, refCrew: { fte: 3, skill: 60 }, quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 }, hit: { p: 0.15, bonus: 10 }, partial: 0.1,
  })
}

const CLAMPS: readonly (readonly [number, number])[] = [[0.05, 0.95], [0.1, 0.6], [0.02, 0.98], [0.15, 0.92], [0.01, 0.995]]
const POSTURES: readonly Posture[] = ['lean', 'steady', 'push']
const BIG_CREW: Worker = { fte: 4000, skill: 100, morale: 100, drive: 100, fatigue: 0 }

/** Every input of the grid, with `knowledge` left for the caller. */
function* grid(): Generator<{ task: Task; input: EffortInput; label: string }> {
  for (const [lo, hi] of CLAMPS) {
    for (const hardness of [0.7, 1, 1.5]) {
      const task = taskOf(lo, hi, hardness)
      for (const ambition of [0, 25, 50, 75, 100]) {
        for (const posture of POSTURES) {
          for (const fatigue of [0, 60]) {
            for (const base of [0.02, 0.1, 0.3, 0.5, 0.76, 0.9, 0.97]) {
              for (const k of [0.05, 0.5, 1, 2, 4]) {
                for (const tools of [0, 1]) {
                  for (const [rival, spill] of [[0, 0], [100, 0], [0, 100]] as const) {
                    for (const people of [undefined, [BIG_CREW]]) {
                      const input: EffortInput = { ambition, posture, fatigue, base, k, tools, rival, spill, ...(people ? { people } : {}) }
                      yield { task, input, label: `clamp ${lo}-${hi}, hardness ${hardness}, ${JSON.stringify([ambition, posture, fatigue, base, k, tools, rival, spill, people !== undefined])}` }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

describe('know-how is worth at most 15 odds points in the odds, under every plan', () => {
  const g = makeTestGame(7, { age: 30 })

  it('100 know-how moves the odds by at most 15 points over every clamp, hardness, plan, tiredness, budget, crew and pressure', () => {
    let worst = 0
    let where = ''
    let n = 0
    for (const { task, input, label } of grid()) {
      const full = quote(g, task, { ...input, knowledge: 100 })
      const none = quote(g, task, { ...input, knowledge: 0 })
      const moved = (full.p - none.p) * 100
      if (moved > worst) {
        worst = moved
        where = label
      }
      n++
    }
    expect(n).toBe(189_000)
    expect(worst, `the most know-how moved the odds, at ${where}`).toBeLessThanOrEqual(KNOW_ODDS_MAX + EPS)
    expect(worst, 'and it is worth its points somewhere, so the probe is not empty').toBeGreaterThan(14.9)
  })

  it('a half-learned field is worth less than a full one at every plan, and never a negative number of points', () => {
    for (const { task, input, label } of grid()) {
      if (input.fatigue !== 0 || input.k !== 1) continue
      const at = (knowledge: number): number => quote(g, task, { ...input, knowledge }).p
      const half = (at(50) - at(0)) * 100
      const full = (at(100) - at(0)) * 100
      expect(half, label).toBeGreaterThanOrEqual(-EPS)
      expect(half, label).toBeLessThanOrEqual(full + EPS)
      expect(full, label).toBeLessThanOrEqual(KNOW_ODDS_MAX + EPS)
    }
  })

  it('`deviate` adds a know-how term in odds points and cuts it at 15, whoever asks for more', () => {
    const none = { crew: 0, tools: 0, know: 0, hard: 0, rival: 0, spill: 0, tired: 0 }
    for (const bold of [-1.3, 0, 1.3]) {
      for (const pk of [0.06, 0.2, 0.5, 0.8, 0.9]) {
        const at = (know: number): number => deviate(pk, 0, 1, { ...none, know }, bold).p
        for (const asked of [15, 16, 40, 1e9]) expect(at(asked), `know ${asked} at ${pk}, bold ${bold}`).toBe(at(15))
        for (const asked of [-16, -40, -1e9]) expect(at(asked), `know ${asked} at ${pk}, bold ${bold}`).toBe(at(-15))
        // where the clamp at 1 is not in the way, the term is worth exactly its points
        if (at(0) + 0.15 < 1) expect((at(15) - at(0)) * 100).toBeCloseTo(15, 9)
      }
    }
  })
})

describe('the know-how line never reads past its cap, and the lines still add up', () => {
  const g = makeTestGame(7, { age: 30 })
  const lineOf = (reasons: readonly { key: string; pts: number }[], key: string): number | undefined => reasons.find((r) => r.key === key)?.pts

  it('know-how is a line of 0 to 15, rival pressure of -8 to 0 and public research of 0 to 18, in every quote of the grid', () => {
    const bad: string[] = []
    let top = 0
    for (const { task, input, label } of grid()) {
      const q = quote(g, task, { ...input, knowledge: 100 })
      const know = lineOf(q.reasons, 'know') ?? 0
      const rival = lineOf(q.reasons, 'rival') ?? 0
      const spill = lineOf(q.reasons, 'spill') ?? 0
      top = Math.max(top, know)
      if (know < 0 || know > KNOW_ODDS_MAX) bad.push(`know ${know}: ${label}`)
      if (rival > 0 || rival < -RIVAL_PTS) bad.push(`rival ${rival}: ${label}`)
      if (spill < 0 || spill > SPILL_TERM_MAX) bad.push(`spill ${spill}: ${label}`)
      const total = q.reasons.reduce((a, r) => a + r.pts, 0)
      const want = Math.round(q.p * 100) - Math.round(input.base! * 100)
      if (total !== want) bad.push(`sum ${total} vs ${want}: ${label}`)
    }
    expect(bad.slice(0, 5)).toEqual([])
    expect(top, 'the probe reaches the cap').toBe(KNOW_ODDS_MAX)
  })

  it('a long shot with a crew and good tools under a bold plan reads know-how +15, not what the other terms compound to', () => {
    const task = taskOf(0.05, 0.95, 1)
    const q = quote(g, task, { base: 0.1, k: 0.5, tools: 1, ambition: 100, posture: 'push', knowledge: 100, people: [BIG_CREW] })
    expect(lineOf(q.reasons, 'know')).toBe(KNOW_ODDS_MAX)
    expect(q.reasons.reduce((a, r) => a + r.pts, 0)).toBe(Math.round(q.p * 100) - 10)
  })

  it('`attribute` puts what is left over on the largest line that has no cap of its own', () => {
    // The pieces add up to 36 and the odds moved 60: the 24 the terms made together went on know-how (15, so a line of 39) before.
    const lines = attribute(0.1, 0.7, [
      { key: 'funding', pts: -4 },
      { key: 'crew', pts: 12 },
      { key: 'tools', pts: 6 },
      { key: 'know', pts: 15 },
      { key: 'bold', pts: 7 },
    ])
    expect(lines.find((x) => x.key === 'know')?.pts).toBe(15)
    expect(lines.reduce((a, r) => a + r.pts, 0)).toBe(60)
    expect(lines.find((x) => x.key === 'crew')?.pts).toBe(12 + 24)
  })

  it('`attribute` takes a point of rounding from know-how only while it stays inside 0 to 15', () => {
    // 14.6 rounds to 15, and the odds moved 16: the extra point is not know-how's, it goes to the funding line there is
    const over = attribute(0.5, 0.66, [
      { key: 'funding', pts: 0 },
      { key: 'know', pts: 14.6 },
    ])
    expect(over).toEqual([
      { key: 'funding', label: 'funding', pts: 1 },
      { key: 'know', label: 'know-how', pts: 15 },
    ])
    // ...and a term that is not at its cap keeps taking the rounding as it always did
    const inside = attribute(0.5, 0.64, [
      { key: 'funding', pts: 0 },
      { key: 'know', pts: 13.4 },
    ])
    expect(inside).toEqual([{ key: 'know', label: 'know-how', pts: 14 }])
  })

  it('`attribute` never reads a know-how line against its own sign: a clamp that took the odds back is the other terms\'', () => {
    // know-how 10, crew 8 and the clamp took 13 points back: know-how cannot lose points, so it is cut at 0 and crew takes the rest
    const lines = attribute(0.9, 0.95, [
      { key: 'crew', pts: 8 },
      { key: 'know', pts: 10 },
    ])
    expect(lines.find((x) => x.key === 'know')).toBeUndefined()
    expect(lines.reduce((a, r) => a + r.pts, 0)).toBe(5)
  })

  it('`attribute` keeps the old rule when no term has a cap in play: the largest line takes the remainder', () => {
    expect(attribute(0.5, 0.55, [{ key: 'crew', pts: 2.4 }, { key: 'tools', pts: 2.4 }])).toEqual([
      { key: 'crew', label: 'crew', pts: 3 },
      { key: 'tools', label: 'tools', pts: 2 },
    ])
  })
})
