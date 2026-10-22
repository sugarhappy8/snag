// R3-E9 (C.12): the 200-year probe of the effort engine at maximum inputs, and the claims about ambition it proves. The engine half of
// the R3 probe: no field above its ceiling however long and however hard the player works (the other half, no field above the
// frontier plus headroom, needs the frontier ledgers: test/frontier-acceptance.test.ts holds the lead and the pool, and
// test/effort-mig-acceptance.test.ts holds that the world lifts no quality ceiling).
//
// The probe plays 200 years of a person who gives the engine everything it can take: a budget of 400 times the normal one (k), 4,000
// full-time people, perfect tools, ambition 100, pushing, and what each result taught fed back through `step` into the player's
// record. Every year, for three kinds of work, each quote holds: k at most 4, know-how at most 100 and worth at most 15 odds points,
// quality at most the task's ceiling, the pace ambition buys (`rho`, and `rho * phi` after fatigue) at most 1.25, the crew at most
// 4 times the reference, spend at most 4 times the cost, no money moved. Three lives are played: every run fails (know-how climbs to
// its ceiling), a mixed life (ambition climbs to its shift cap) and a life that pushes with overtime every year (the body gives out
// again and again, and each burnout drops the next year to a lean one).
//
// Then the claims the cap carries (D10, A9): rho is linear in ambition and never more than a quarter faster; a bold plan moves the odds
// toward even and adds no edge on a symmetric field; public research and rivals move a quote by at most +18 and -8 points; a push
// builds fatigue that takes back what ambition bought; `step` and the yearly settle are idempotent; and a hostile `effort.you` in an
// old save is cut to its ranges and the life plays on.
//
// No pinned seed: every life is makeTestGame's own, with a tuple of arguments, and the failures a life suffers come from a local
// generator (never g.rng).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { CREW_X_MAX, knowOdds, rhoOf } from '../src/game/effort/curves'
import { quote } from '../src/game/effort/engine'
import { FX_CAPS, newFx } from '../src/game/effort/fx'
import { yearlyEffort } from '../src/game/effort/module'
import { spendFocus } from '../src/game/effort/focus'
import {
  BURNOUT_F, FOCUS_OVERTIME_MAX, K_MAX, KNOW_MAX, KNOW_ODDS_MAX, RHO_MAX, RISK_MAX, SHIFT_MAX, SPILL_TERM_MAX, RIVAL_PTS,
} from '../src/game/effort/limits'
import { YOU_KEY, ambitionOf, burnedOut, fatigueOf, postureOf, readYou, setPosture } from '../src/game/effort/persona'
import { landQuality, resolve, step } from '../src/game/effort/step'
import { defineTask } from '../src/game/effort/task'
import type { EffortInput, Fx, Posture, Quote, Task } from '../src/game/effort/types'
import { yearlyHousehold } from '../src/game/household'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, Json } from '../src/game/types'
import { roundSig } from './effort-kit'
import { makeTestGame } from './helpers'
import { ROOT } from './scan-kit'

/** A deterministic generator in 0..1: a local one, nothing here touches g.rng. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Three kinds of work: a product with a hard clamp at 97, a lab with a soft ceiling, and an engine that speeds with know-how. */
function tasks(): Task[] {
  return [
    defineTask({
      field: 'rd.beverage', mode: 'project', cost: 30_000, p0: 0.4, baseYears: 1.5, minYears: 1, maxYears: 4, oddsLo: 0.05, oddsHi: 0.95,
      fteCap: 40, refCrew: { fte: 3, skill: 60 }, quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 }, hit: { p: 0.15, bonus: 10 }, partial: 0.1,
    }),
    defineTask({
      field: 'dt.aiLab.cap.reasoning', mode: 'project', cost: 2_000_000, p0: 0.3, baseYears: 3, minYears: 1, maxYears: 6, hardness: 1.5, fteCap: 40,
      refCrew: { fte: 20, skill: 80 }, quality: { up: 40, down: 20, exp: 0.7, ceiling: 1200, room: 200, lo: 0, hi: 1200 }, spread: 30, crewPts: 12,
    }),
    defineTask({ field: 'studio.engine', mode: 'project', cost: 800_000, p0: 0.6, baseYears: 2, minYears: 1, maxYears: 5, knowYears: 0.15, fteCap: 40, quality: null, hit: null }),
  ]
}

/** Everything the engine can take, with the actor's own posture left to the record. */
const MAX: EffortInput = {
  who: 'you', k: 400, tools: 1, ambition: 100, quality0: 1e6,
  people: [{ fte: 4000, skill: 100, morale: 100, drive: 100, fatigue: 0 }],
}

const START = 2026
const MONEY = 40_000

/** One quote against its bounds: every ceiling of the engine, at the maximum input. */
function bounded(q: Quote, task: Task, label: string): void {
  expect(q.k, `${label}: k`).toBe(Math.min(task.kmax, K_MAX))
  expect(q.k, label).toBeLessThanOrEqual(K_MAX)
  expect(q.spend, `${label}: spend`).toBeLessThanOrEqual(K_MAX * task.cost)
  expect(q.effort.rho, `${label}: rho`).toBeLessThanOrEqual(RHO_MAX)
  expect(q.effort.rho * q.effort.phi, `${label}: rho times phi`).toBeLessThanOrEqual(RHO_MAX)
  expect(q.effort.crew, `${label}: the crew`).toBeLessThanOrEqual(CREW_X_MAX)
  expect(q.p, `${label}: odds`).toBeGreaterThanOrEqual(task.oddsLo)
  expect(q.p, `${label}: odds`).toBeLessThanOrEqual(task.oddsHi)
  expect(q.years, `${label}: years`).toBeGreaterThanOrEqual(task.minYears)
  expect(q.years, `${label}: years`).toBeLessThanOrEqual(task.maxYears)
  expect(q.hitP, `${label}: hit odds`).toBeLessThanOrEqual(0.5)
  for (const risk of Object.values(q.risk)) expect(risk, `${label}: risk`).toBeLessThanOrEqual(RISK_MAX)
  expect(q.capped, `${label}: the ceilings that bound`).toEqual(expect.arrayContaining(['k', 'fte']))
  if (task.quality !== null) {
    expect(q.quality, `${label}: quality`).not.toBeNull()
    expect(q.quality!, `${label}: quality`).toBeLessThanOrEqual(task.quality.ceiling)
    expect(landQuality(q, task, 1, true), `${label}: a landing`).toBeLessThanOrEqual(task.quality.hi)
  } else expect(q.quality).toBeNull()
}

interface Year {
  year: number
  /** Know-how of each field after the year's steps. */
  know: Record<string, number>
  shift: number
  fatigue: number
  burnouts: number
  /** The pace in force during the year's work, and the one the settle that closed it put in force. */
  posture: Posture
  next: Posture
  /** The body gave out at this year's settle, and whether the settle told the player so. */
  burned: boolean
  told: boolean
  /** The most odds points know-how added to any of the year's quotes. */
  knowPts: number
}

interface Plan {
  years: number
  /** The roll for run `n`: a failure is a value at or above the odds. */
  u: (n: number) => number
  /** Focus weeks spent a year (past 12 they are overtime, past 24 they are refused). */
  weeks: number
  /** The pace chosen for the whole life, or null to leave it as it was. */
  posture: Posture | null
}

/** Plays `plan.years` years of max inputs on `g`, checking every bound every year, and returns what each year looked like. */
function play(g: GameState, plan: Plan): Year[] {
  const all = tasks()
  const fxs = new Map<string, Fx>(all.map((t) => [t.field, newFx(g.year)]))
  const out: Year[] = []
  const r = lcg(21)
  let n = 0
  if (plan.posture !== null) expect(setPosture(g, plan.posture)).toBe(true)
  for (let i = 0; i < plan.years; i++) {
    g.queue = []
    for (let w = 0; w < plan.weeks; w++) spendFocus(g, 'study', 1000, 1)
    const posture = postureOf(g)
    let knowPts = 0
    for (const task of all) {
      const label = `${task.field}, year ${i + 1}`
      const forced = quote(g, task, { ...MAX, posture: 'push' })
      const inForce = quote(g, task, MAX)
      const without = quote(g, task, { ...MAX, knowledge: 0 })
      bounded(forced, task, `${label} (pushing)`)
      bounded(inForce, task, `${label} (in force)`)
      // Know-how adds at most 15 odds points, in the line and in the odds themselves.
      const line = inForce.reasons.find((x) => x.key === 'know')?.pts ?? 0
      const moved = roundSig((inForce.p - without.p) * 100)
      expect(line, `${label}: the know-how line`).toBeLessThanOrEqual(KNOW_ODDS_MAX)
      expect(moved, `${label}: the odds know-how moved`).toBeLessThanOrEqual(KNOW_ODDS_MAX)
      knowPts = Math.max(knowPts, line, moved)
      // The pace in force is the posture's: a lean year is slower than a pushing one at the same ambition.
      expect(inForce.effort.rho, `${label}: the pace in force`).toBe(rhoOf(100, posture))
      const outcome = resolve(inForce, plan.u(n++), { drawHit: () => r(), done: 1, partial: task.partial })
      const result = step(g, task, outcome, { year: g.year, who: 'you', fx: fxs.get(task.field)!, k: inForce.k, weeks: 12, quality: inForce.quality ?? 0 })
      expect(result.knowledge, label).toBeLessThanOrEqual(KNOW_MAX)
    }
    // The age-up, in the order aging.ts runs them: the year turns, the counters reset, the household settles, then the effort settle.
    g.year += 1
    g.yearActions = {}
    yearlyHousehold(g)
    const burned = burnedOut(g)
    yearlyEffort(g)
    const you = readYou(g)
    const told = g.queue.some((m) => m.kind === 'notice' && m.title === 'Burnout')
    out.push({ year: g.year, know: { ...you.fieldK }, shift: you.shift, fatigue: fatigueOf(g), burnouts: you.burnouts, posture, next: postureOf(g), burned, told, knowPts })
    // Every year: the record is within its ranges and no dollar moved.
    expect(Math.abs(you.shift), `year ${i + 1}: shift`).toBeLessThanOrEqual(SHIFT_MAX)
    expect(Object.keys(you.fieldK).length).toBeLessThanOrEqual(40)
    for (const k of Object.values(you.fieldK)) expect(k >= 0 && k <= KNOW_MAX).toBe(true)
    expect(ambitionOf(g)).toBeLessThanOrEqual(100)
    expect(g.character.money, `year ${i + 1}: money`).toBe(MONEY)
  }
  // The effort records of the three works stay within their caps however long they run.
  for (const fx of fxs.values()) {
    for (const key of Object.keys(FX_CAPS) as (keyof typeof FX_CAPS)[]) expect(fx[key], key).toBeLessThanOrEqual(FX_CAPS[key])
  }
  return out
}

const life = (): GameState => makeTestGame(7, { age: 30, money: MONEY })

describe('200 years at maximum inputs', () => {
  it('all runs fail: know-how climbs to its ceiling and stops, worth 15 odds points and no more', () => {
    const g = life()
    const log = play(g, { years: 200, u: () => 0.9999, weeks: 0, posture: 'push' })
    expect(log).toHaveLength(200)
    expect(g.year).toBe(START + 200)
    for (const field of ['rd.beverage', 'dt.aiLab.cap.reasoning', 'studio.engine']) {
      const seen = log.map((y) => y.know[field] ?? 0)
      expect(Math.max(...seen), field).toBeLessThanOrEqual(KNOW_MAX)
      expect(seen[seen.length - 1]!, `${field}: it gets there`).toBeGreaterThanOrEqual(KNOW_MAX - 1)
      // Stepped every year, so it never fades, and it never goes backwards.
      for (let i = 1; i < seen.length; i++) expect(seen[i]!, `${field}, year ${i + 1}`).toBeGreaterThanOrEqual(seen[i - 1]!)
    }
    // The odds it banked are the curve's end and no more: exactly 15 points at the top.
    expect(Math.max(...log.map((y) => y.knowPts))).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    expect(knowOdds(KNOW_MAX)).toBe(KNOW_ODDS_MAX)
    expect(log.some((y) => y.knowPts > 10)).toBe(true)
    // A failing life never lifts its ambition.
    expect(Math.max(...log.map((y) => y.shift))).toBe(0)
  })

  it('a mixed life: wins lift ambition to the shift cap and no further, and the quote stays inside its bounds', () => {
    const g = life()
    const r = lcg(33)
    const rolls: number[] = Array.from({ length: 3 * 200 }, () => r())
    const log = play(g, { years: 200, u: (n) => rolls[n % rolls.length]!, weeks: 0, posture: 'push' })
    const shifts = log.map((y) => y.shift)
    expect(Math.max(...shifts)).toBeLessThanOrEqual(SHIFT_MAX)
    expect(shifts[shifts.length - 1]).toBe(SHIFT_MAX)
    expect(Math.max(...log.map((y) => y.knowPts))).toBeLessThanOrEqual(KNOW_ODDS_MAX)
    // Pushing with no overtime settles at a fatigue well under the burnout line, so there is none.
    expect(log.every((y) => !y.burned)).toBe(true)
    expect(Math.max(...log.map((y) => y.fatigue))).toBeLessThan(BURNOUT_F)
  })

  it('a life that pushes with overtime every year burns out again and again, and each burnout drops the next year to lean', () => {
    const g = life()
    const r = lcg(44)
    const rolls: number[] = Array.from({ length: 3 * 200 }, () => r())
    const log = play(g, { years: 200, u: (n) => rolls[n % rolls.length]!, weeks: 12 + FOCUS_OVERTIME_MAX, posture: 'push' })
    const burns = log.filter((y) => y.burned)
    expect(burns.length).toBeGreaterThanOrEqual(20)
    // The settle that finds the body gone puts the next year in lean, and every other settle puts the chosen push in force.
    for (const y of log) expect(y.next, `the year after ${y.year}`).toBe(y.burned ? 'lean' : 'push')
    // The year's work then goes at the pace in force: the first year is the steady default, then each year the one the settle chose.
    expect(log[0]!.posture).toBe('steady')
    for (let i = 1; i < log.length; i++) expect(log[i]!.posture, `year ${log[i]!.year}`).toBe(log[i - 1]!.next)
    expect(log.some((y) => y.posture === 'lean')).toBe(true)
    expect(log.some((y) => y.posture === 'push')).toBe(true)
    // Fatigue is bounded, ambition drifts within its cap, and the count the record keeps is the count of burnouts seen.
    expect(Math.max(...log.map((y) => y.fatigue))).toBeLessThanOrEqual(100)
    expect(Math.min(...log.map((y) => y.shift))).toBeGreaterThanOrEqual(-SHIFT_MAX)
    expect(log[log.length - 1]!.burnouts).toBe(burns.length)
    // The player is told once in a while and not every time: never twice within three years, and never without a burnout.
    const told = log.filter((y) => y.told)
    expect(told.length).toBeGreaterThanOrEqual(1)
    for (const y of told) expect(y.burned).toBe(true)
    for (let i = 1; i < told.length; i++) expect(told[i]!.year - told[i - 1]!.year, `notices at ${told[i - 1]!.year} and ${told[i]!.year}`).toBeGreaterThanOrEqual(3)
  })
})

describe('ambition buys pace, widens variance and adds no free edge', () => {
  it('rho is linear in ambition, never more than a quarter faster, and rho times phi stays under 1.25 at any fatigue', () => {
    const postures: Posture[] = ['lean', 'steady', 'push']
    for (const posture of postures) {
      let last = -Infinity
      for (let a = 0; a <= 100; a += 5) {
        const rho = rhoOf(a, posture)
        expect(rho, `${posture} at ${a}`).toBeLessThanOrEqual(RHO_MAX)
        expect(rho, `${posture} at ${a}`).toBeGreaterThanOrEqual(last)
        last = rho
      }
    }
    expect(rhoOf(50, 'steady')).toBe(1)
    expect(rhoOf(100, 'push')).toBeLessThanOrEqual(1.25)
    // Linear below the cap: equal steps of ambition buy equal steps of pace.
    const steps = [0, 10, 20, 30, 40, 50].map((a) => rhoOf(a, 'steady'))
    for (let i = 2; i < steps.length; i++) expect(steps[i]! - steps[i - 1]!).toBeCloseTo(steps[1]! - steps[0]!, 12)
    const t = tasks()[0]!
    const g = life()
    for (let a = 0; a <= 100; a += 10) {
      for (const posture of postures) {
        for (let f = 0; f <= 100; f += 10) {
          const q = quote(g, t, { ambition: a, posture, fatigue: f })
          expect(q.effort.rho * q.effort.phi, `${posture} at ambition ${a}, fatigue ${f}`).toBeLessThanOrEqual(RHO_MAX)
        }
      }
    }
  })

  it('a bold plan moves the odds toward even and adds nothing on a symmetric field, and it widens the spread', () => {
    const g = life()
    const t = tasks()[0]!
    let net = 0
    for (let p = 5; p <= 45; p += 5) {
      const low = p / 100
      const high = 1 - low
      const calm = { low: quote(g, t, { base: low }).p, high: quote(g, t, { base: high }).p }
      const bold = { low: quote(g, t, { base: low, ambition: 100, posture: 'push' }).p, high: quote(g, t, { base: high, ambition: 100, posture: 'push' }).p }
      expect(bold.low, `a long shot at ${p}%`).toBeGreaterThan(calm.low)
      expect(bold.high, `a favourite at ${100 - p}%`).toBeLessThan(calm.high)
      net += bold.low - calm.low + (bold.high - calm.high)
    }
    expect(Math.abs(net)).toBeLessThan(1e-9)
    expect(quote(g, t, { base: 0.5, ambition: 100, posture: 'push' }).p).toBe(quote(g, t, { base: 0.5 }).p)
    const wide = quote(g, t, { ambition: 100, posture: 'push' }).spread
    const mid = quote(g, t, {}).spread
    const narrow = quote(g, t, { ambition: 0, posture: 'steady' }).spread
    expect(wide).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(narrow)
  })
})

describe('what a push costs, over ten years', () => {
  /** Ten years of one posture (eleven settles: the first puts it in force), with the same overtime in the year's work. */
  function decade(posture: Posture, weeks: number): GameState {
    const g = life()
    setPosture(g, posture)
    for (let i = 0; i < 11; i++) {
      for (let w = 0; w < weeks; w++) spendFocus(g, 'study', 1000, 1)
      g.year += 1
      g.yearActions = {}
      g.queue = []
      yearlyHousehold(g)
      yearlyEffort(g)
    }
    return g
  }
  /** The pace the player's quote carries into the next year (rho times phi) at this ambition. */
  const pace = (g: GameState, ambition: number): number => {
    const q = quote(g, tasks()[0]!, { who: 'you', ambition })
    return q.effort.rho * q.effort.phi
  }

  it('builds fatigue that takes back the pace: well below the burnout line on its own, and past the knee', () => {
    const push = decade('push', 0)
    const steady = decade('steady', 0)
    expect(postureOf(push)).toBe('push')
    expect(fatigueOf(steady)).toBe(0)
    expect(fatigueOf(push)).toBeGreaterThan(35)
    expect(fatigueOf(push)).toBeLessThan(BURNOUT_F)
  })

  it('on pace alone, ends below steady for low ambition, and gains at most a few percent anywhere under 50', () => {
    const push = decade('push', 0)
    const steady = decade('steady', 0)
    for (let a = 0; a < 50; a += 1) {
      const ratio = pace(push, a) / pace(steady, a)
      if (a <= 25) expect(ratio, `ambition ${a}`).toBeLessThan(1)
      expect(ratio, `ambition ${a}`).toBeLessThan(1.05)
    }
    // The gain is the ambition's: it grows with it, so the crossing is a single point and not a patchwork.
    const ratios = Array.from({ length: 50 }, (_, a) => pace(push, a) / pace(steady, a))
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]!).toBeGreaterThanOrEqual(ratios[i - 1]!)
  })

  it('with the same overtime in both lives, ends below steady for every ambition under 50', () => {
    const push = decade('push', 18)
    const steady = decade('steady', 18)
    expect(fatigueOf(push)).toBeGreaterThan(fatigueOf(steady) + 30)
    for (let a = 0; a < 50; a += 1) expect(pace(push, a), `ambition ${a}`).toBeLessThan(pace(steady, a))
  })
})

describe('public research and rival pressure', () => {
  it('move a quote by at most +18 and -8 points, at spill 1000 and rival 1000, on every field of the grid', () => {
    const g = life()
    expect(SPILL_TERM_MAX).toBe(18)
    expect(RIVAL_PTS).toBe(8)
    for (const t of tasks()) {
      for (let p = 5; p <= 95; p += 5) {
        const none = quote(g, t, { base: p / 100 })
        const open = quote(g, t, { base: p / 100, spill: 1000 })
        const rival = quote(g, t, { base: p / 100, rival: 1000 })
        const both = quote(g, t, { base: p / 100, spill: 1000, rival: 1000 })
        const up = roundSig((open.p - none.p) * 100)
        const down = roundSig((none.p - rival.p) * 100)
        expect(up, `${t.field} at ${p}%: public research`).toBeLessThanOrEqual(SPILL_TERM_MAX)
        expect(up).toBeGreaterThanOrEqual(0)
        expect(down, `${t.field} at ${p}%: rivals`).toBeLessThanOrEqual(RIVAL_PTS)
        expect(down).toBeGreaterThanOrEqual(0)
        expect(roundSig((both.p - none.p) * 100), `${t.field} at ${p}%: both`).toBeLessThanOrEqual(SPILL_TERM_MAX)
        expect(roundSig((none.p - both.p) * 100), `${t.field} at ${p}%: both`).toBeLessThanOrEqual(RIVAL_PTS)
        expect(open.reasons.find((x) => x.key === 'spill')?.pts ?? 0).toBeLessThanOrEqual(SPILL_TERM_MAX)
        expect(rival.reasons.find((x) => x.key === 'rival')?.pts ?? 0).toBeGreaterThanOrEqual(-RIVAL_PTS)
      }
    }
    // Both terms really move a quote in the middle of the range, so the bound is not met by a dead term.
    const mid = tasks()[0]!
    expect(quote(g, mid, { base: 0.4, spill: 1000 }).p).toBeGreaterThan(quote(g, mid, { base: 0.4 }).p + 0.17)
    expect(quote(g, mid, { base: 0.4, rival: 1000 }).p).toBeLessThan(quote(g, mid, { base: 0.4 }).p - 0.07)
  })
})

describe('a capped term is worth its points however the other terms moved the odds', () => {
  // A logit shift sized at the money odds grows when a bold plan or a tool pulls the odds toward even: a long shot with know-how
  // 100 and a bold plan once moved 28 points, not 15. Know-how, public research and rivals are added in points, so the counterfactual
  // (the same quote without the term) moves by the cap and no more, whatever else is in play.
  it('know-how moves the odds by exactly 15 points (less only at the clamp), with a bold plan, tools, a crew and a hard field in play', () => {
    const g = life()
    const seen: number[] = []
    for (const p0 of [0.05, 0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const hardness of [0.5, 1, 2]) {
        for (const [ambition, posture] of [[50, 'steady'], [100, 'push'], [0, 'steady']] as const) {
          for (const tools of [0, 1]) {
            const t = defineTask({ field: 'rd.beverage', mode: 'project', cost: 30_000, p0, hardness, oddsLo: 0.02, oddsHi: 0.98, refCrew: { fte: 3, skill: 60 }, fteCap: 6 })
            const input: EffortInput = { ambition, posture, tools, people: [{ fte: 6, skill: 90, morale: 90, drive: 90 }], spill: 6 }
            const none = quote(g, t, { ...input, knowledge: 0 })
            const full = quote(g, t, { ...input, knowledge: 100 })
            const moved = roundSig((full.p - none.p) * 100)
            const label = `p0 ${p0}, hardness ${hardness}, ambition ${ambition} ${posture}, tools ${tools}`
            expect(moved, label).toBeLessThanOrEqual(KNOW_ODDS_MAX)
            expect(moved, label).toBeGreaterThanOrEqual(0)
            if (none.p + KNOW_ODDS_MAX / 100 <= 0.98) expect(moved, label).toBeCloseTo(KNOW_ODDS_MAX, 6)
            seen.push(moved)
          }
        }
      }
    }
    expect(seen.filter((m) => m === KNOW_ODDS_MAX).length).toBeGreaterThan(40)
  })

  it('public research moves a hard field by at most 18 points and rivals by at most 8, with every other term in play', () => {
    const g = life()
    for (const hardness of [0.5, 1, 1.5, 2]) {
      for (const p0 of [0.05, 0.3, 0.5, 0.8]) {
        const t = defineTask({ field: 'rd.beverage', mode: 'project', cost: 30_000, p0, hardness, oddsLo: 0.02, oddsHi: 0.98 })
        const input: EffortInput = { ambition: 100, posture: 'push', tools: 1, knowledge: 100, fatigue: 60 }
        const none = quote(g, t, input).p
        const open = roundSig((quote(g, t, { ...input, spill: 1000 }).p - none) * 100)
        const pressed = roundSig((none - quote(g, t, { ...input, rival: 1000 }).p) * 100)
        expect(open, `hardness ${hardness}, p0 ${p0}: public research`).toBeLessThanOrEqual(SPILL_TERM_MAX)
        expect(pressed, `hardness ${hardness}, p0 ${p0}: rivals`).toBeLessThanOrEqual(RIVAL_PTS)
        expect(open).toBeGreaterThanOrEqual(0)
        expect(pressed).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('idempotence', () => {
  it('step twice in one year equals once, for the record, a company map and an fx', () => {
    const t = tasks()[0]!
    const g = life()
    const q = quote(g, t, { who: 'you', k: 2 })
    const lost = resolve(q, 0.9999, { done: 0.8 })
    const fx = newFx(g.year)
    const map: Record<string, number> = {}
    const first = step(g, t, lost, { year: g.year, who: 'you', fx, know: map, k: 2, weeks: 3, quality: 50 })
    expect(first.replay).toBe(false)
    expect(first.learned).toBeGreaterThan(0)
    const snapshot = JSON.stringify([g.flags, fx, map])
    const second = step(g, t, lost, { year: g.year, who: 'you', fx, know: map, k: 2, weeks: 3, quality: 50 })
    expect(second.replay).toBe(true)
    expect(second.learned).toBe(0)
    expect(JSON.stringify([g.flags, fx, map])).toBe(snapshot)
    // With no fx the player's record keeps the stamp, so the same year again changes nothing there either.
    const h = life()
    expect(step(h, t, lost, { year: h.year, who: 'you' }).replay).toBe(false)
    const after = JSON.stringify(h.flags)
    expect(step(h, t, lost, { year: h.year, who: 'you' }).replay).toBe(true)
    expect(JSON.stringify(h.flags)).toBe(after)
    // The next year books again.
    expect(step(h, t, lost, { year: h.year + 1, who: 'you' }).replay).toBe(false)
  })

  it('the yearly settle twice in one year equals once, over a life of overtime and burnouts', () => {
    const g = life()
    const t = tasks()[0]!
    setPosture(g, 'push')
    for (let i = 0; i < 30; i++) {
      for (let w = 0; w < 24; w++) spendFocus(g, 'study', 1000, 1)
      step(g, t, { kind: 'fail', margin: -5, cause: 'deadEnd', done: 1 }, { year: g.year, who: 'you' })
      g.year += 1
      g.yearActions = {}
      yearlyHousehold(g)
      yearlyEffort(g)
      const once = JSON.stringify([g.flags, g.queue.length])
      yearlyEffort(g)
      yearlyEffort(g)
      expect(JSON.stringify([g.flags, g.queue.length]), `year ${i + 1}`).toBe(once)
      g.queue = []
    }
    expect(readYou(g).burnouts).toBeGreaterThan(5)
  })
})

describe('a hostile effort.you in an old save', () => {
  const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')
  const FIXTURES = readdirSync(FIXTURE_DIR).filter((n) => /^save-.*\.json\.gz$/.test(n)).sort()
  const TIMEOUT = 120_000

  const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

  /** Records a save may hold, as JSON would give them (so `__proto__` is an own key), each stamped for this life. */
  function hostile(owner: string): Json[] {
    const wide = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`rd.f${i}`, 1e12]))
    return [
      { owner, v: 1, shift: 1e9, posture: 'sprint', effective: 'push', over: 1e9, fieldK: wide, at: wide, burnouts: 1e12, burnAt: -9, last: 5 },
      JSON.parse(`{"owner": "${owner}", "fieldK": {"__proto__": 50, "constructor": 9, "rd.beverage": -4, "BAD KEY": 5}, "at": {"__proto__": 3}, "shift": "7", "last": "x"}`) as Json,
      { owner, posture: { push: true }, effective: [], fieldK: [1, 2, 3], at: 'no', burnouts: -1, over: -1, shift: -1e9, last: 1.5 },
      { owner: 'another:life', shift: 12, posture: 'push', effective: 'push', fieldK: { 'rd.beverage': 99 }, last: 5 },
      'not a record',
    ]
  }

  /** The path of the first number in the state that is not finite, or null. */
  function firstBadNumber(root: unknown): string | null {
    const stack: [unknown, string][] = [[root, '']]
    while (stack.length > 0) {
      const [v, path] = stack.pop()!
      if (typeof v === 'number' && !Number.isFinite(v)) return path
      if (typeof v === 'object' && v !== null) for (const [k, x] of Object.entries(v)) stack.push([x, `${path}/${k}`])
    }
    return null
  }

  function fixture(name: string): GameState {
    const raw = JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Record<string, unknown>
    const r = migrateSave(raw)
    if (r.kind !== 'ready') throw new Error(`${name} did not migrate: ${JSON.stringify(r)}`)
    return r.game
  }

  it('finds the old saves to play', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(3)
  })

  it.each(FIXTURES)(
    '%s: every hostile record reads within its ranges, and the life plays two years on',
    (name) => {
      const base = fixture(name)
      for (const [i, record] of hostile(ownerOf(base)).entries()) {
        const g = structuredClone(base)
        g.flags[YOU_KEY] = record
        const y = readYou(g)
        expect(Math.abs(y.shift), `record ${i}`).toBeLessThanOrEqual(SHIFT_MAX)
        expect(Object.keys(y.fieldK).length).toBeLessThanOrEqual(40)
        expect(Object.keys(y.at).length).toBeLessThanOrEqual(40)
        for (const v of Object.values(y.fieldK)) expect(v >= 0 && v <= KNOW_MAX).toBe(true)
        expect(y.over >= 0 && y.over <= 60).toBe(true)
        expect(['lean', 'steady', 'push']).toContain(y.posture)
        expect(['lean', 'steady', 'push']).toContain(y.effective)
        expect(Object.getPrototypeOf(y.fieldK)).toBe(Object.prototype)
        expect(ambitionOf(g)).toBeGreaterThanOrEqual(0)
        expect(ambitionOf(g)).toBeLessThanOrEqual(100)
        const q = quote(g, tasks()[0]!, { who: 'you' })
        expect(q.p >= 0.05 && q.p <= 0.95, `record ${i}: odds ${q.p}`).toBe(true)
        for (let year = 0; year < 2; year++) {
          g.queue = []
          ageUp(g)
          expect(firstBadNumber(g), `${name}, record ${i}, year ${year}`).toBeNull()
          const text = JSON.stringify(g)
          expect(JSON.stringify(JSON.parse(text)), `${name}, record ${i}, year ${year}: a round trip`).toBe(text)
          // What the save keeps of the record is bounded too (a record the settle rewrote is the one `readYou` reads).
          const kept = g.flags[YOU_KEY]
          if (kept !== undefined) expect(JSON.stringify(kept).length, `${name}, record ${i}`).toBeLessThan(20_000)
          if (!g.character.alive) break
        }
      }
    },
    TIMEOUT,
  )

  it('a record the settle rewrites is cut to the ranges it stores', () => {
    const g = fixture(FIXTURES[FIXTURES.length - 1]!)
    g.character.age = Math.max(g.character.age, 30)
    const wide = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`rd.f${i}`, 1e12]))
    g.flags[YOU_KEY] = { owner: ownerOf(g), v: 1, shift: 1e9, posture: 'push', effective: 'steady', over: 1e9, fieldK: wide, at: {}, burnouts: 1e12, burnAt: -1, last: 5 }
    g.year += 1
    yearlyEffort(g)
    const kept = g.flags[YOU_KEY] as Record<string, unknown>
    expect(kept).toBeDefined()
    expect(JSON.stringify(kept)).toBe(JSON.stringify(readYou(g)))
    expect(readYou(g).over).toBe(0)
    expect(readYou(g).effective).toBe('push')
    expect(Object.keys(readYou(g).fieldK).length).toBeLessThanOrEqual(40)
  })

  it.each([1e12, 9999, 2500, 2100])('a settle stamp of %i, from the far future of a hand-edited save, cannot freeze the settle for the life', (stamp) => {
    const g = fixture(FIXTURES[FIXTURES.length - 1]!)
    g.character.age = Math.max(g.character.age, 30)
    g.flags[YOU_KEY] = { owner: ownerOf(g), v: 1, shift: 0, posture: 'push', effective: 'steady', over: 40, fieldK: {}, at: {}, burnouts: 0, burnAt: -1, last: stamp }
    g.year = 2040
    yearlyEffort(g)
    expect(readYou(g).last, 'the settle ran and stamped this year').toBe(2040)
    expect(readYou(g).over, 'the overtime of the closing year is cleared').toBe(0)
    expect(readYou(g).effective, 'the chosen pace is in force').toBe('push')
    // And a second settle in the same year is the no-op it always was.
    const once = JSON.stringify(g.flags[YOU_KEY])
    yearlyEffort(g)
    expect(JSON.stringify(g.flags[YOU_KEY])).toBe(once)
  })
})
