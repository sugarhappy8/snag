// R3-E9 (C.12): the ceiling rows of the effort engine. test/ceiling-list.json names eight growth terms of R3's research (the
// budget multiple, know-how, the odds know-how buys, quality under its ceiling, the pace ambition buys, the crew, public research and
// rivals, the focus weeks), and each has one row here that feeds the term's inputs one and a hundred times what a life reaches and
// reports the worst value it saw against the limit the cap sentence promises (the harness is test/ceiling-kit.ts).
//
// The rows call the engine's exported functions only (quote, step, spendFocus and the pure curves), draw no random number (the
// failures a row feeds are written out, not rolled) and book no dollar. Every game here is a plain makeTestGame life with no
// money in play. `at` names the case that came closest, so a failure points at the input and not only at the term.
//
// The limits are read inside the functions (never a module-level read of an import), the same habit src/game/effort keeps.
import { CREW_X_MAX, knowOdds, laborOf, rhoOf, softCeil } from '../src/game/effort/curves'
import { quote } from '../src/game/effort/engine'
import { focusUsed, spendFocus } from '../src/game/effort/focus'
import { learnKnowHow } from '../src/game/effort/knowhow'
import { CREW_PTS_MAX, FOCUS_OVERTIME_MAX, FOCUS_WEEKS, FTE_CAP_MAX, K_MAX, KNOW_MAX, KNOW_ODDS_MAX, RHO_MAX, RIVAL_PTS, SPILL_TERM_MAX } from '../src/game/effort/limits'
import { readYou } from '../src/game/effort/persona'
import { landQuality, step } from '../src/game/effort/step'
import { defineTask } from '../src/game/effort/task'
import type { Outcome, Posture, Task, TaskSpec, Worker } from '../src/game/effort/types'
import { rivalPts, spillPts } from '../src/game/effort/world'
import type { GameState } from '../src/game/types'
import type { CeilingProbe } from './ceiling-kit'
import { roundSig } from './effort-kit'
import { makeTestGame } from './helpers'

type Result = { value: number; limit: number; at: string }

/** Keeps the case with the highest value over limit (a NaN value counts as the worst there is), like the kit's own tightest(). */
function worst(): { add: (value: number, limit: number, at: string) => void; result: () => Result } {
  let best: Result = { value: 0, limit: 1, at: 'no case' }
  let bestRatio = -Infinity
  return {
    add(value, limit, at) {
      const ratio = Number.isNaN(value) ? Infinity : value / limit
      if (ratio > bestRatio) {
        bestRatio = ratio
        best = { value, limit, at }
      }
    },
    result: () => best,
  }
}

/** A life of 30. The quote reads it only for `who: 'you'`; step and spendFocus write the player's record on it. */
const life = (): GameState => makeTestGame(1, { age: 30, money: 0 })

/** The product research task as rd.ts has it (a hard clamp at 97), with the crew cap at its largest. */
function probeTask(over: Partial<TaskSpec> = {}): Task {
  return defineTask({
    field: 'rd.beverage',
    mode: 'project',
    cost: 30_000,
    p0: 0.4,
    baseYears: 1.5,
    minYears: 1,
    maxYears: 4,
    oddsLo: 0.05,
    oddsHi: 0.95,
    fteCap: FTE_CAP_MAX,
    refCrew: { fte: 3, skill: 60 },
    quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 },
    hit: { p: 0.15, bonus: 10 },
    ...over,
  })
}

/** A failure that got all the way to the end: the most a run can teach. */
const FAILED: Outcome = { kind: 'fail', margin: -90, cause: 'deadEnd', done: 1 }

/** A worker at the top of every scale. */
const STAR: Worker = { fte: 1, skill: 100, morale: 100, drive: 100, fatigue: 0 }

const POSTURES: readonly Posture[] = ['lean', 'steady', 'push']

const kMax: CeilingProbe = {
  id: 'effort-k-max',
  cap: 'a budget multiple is cut to 4 times the normal cost, so more money buys no more odds, speed or quality (R3-E2, C.1)',
  run: (scale) => {
    const g = life()
    const w = worst()
    for (const kmax of [1, 2, K_MAX]) {
      const task = probeTask({ kmax })
      for (const asked of [1, K_MAX, 25, 1e6]) {
        const k = asked * scale
        const q = quote(g, task, { k })
        w.add(q.k, task.kmax, `k ${k} asked of a task that takes ${task.kmax}`)
        w.add(q.spend, task.kmax * task.cost, `k ${k}: the spend of a task that takes ${task.kmax}`)
      }
    }
    return w.result()
  },
}

const knowledge: CeilingProbe = {
  id: 'effort-knowledge',
  cap: 'know-how in one field is at most 100 however many failures bank it (R3-E5, C.1)',
  run: (scale) => {
    const task = probeTask()
    const w = worst()
    // A company's map, failure after failure (a map with no fx has no stamp, so each call books).
    const g = life()
    const map: Record<string, number> = {}
    for (let i = 0; i < 5 * scale; i++) {
      step(g, task, FAILED, { year: 2026 + i, know: map })
      w.add(map[task.field] ?? 0, KNOW_MAX, `${i + 1} failures into a company map`)
    }
    // The player's own record, one failure a year.
    const you = life()
    for (let i = 0; i < 5 * scale; i++) {
      step(you, task, FAILED, { year: 2026 + i, who: 'you' })
      w.add(readYou(you).fieldK[task.field] ?? 0, KNOW_MAX, `${i + 1} failures into the player's record`)
    }
    // One huge gain written straight into a map.
    const huge: Record<string, number> = {}
    learnKnowHow(huge, task.field, 1e3 * scale)
    w.add(huge[task.field] ?? 0, KNOW_MAX, `one gain of ${1e3 * scale}`)
    return w.result()
  },
}

const knowOddsRow: CeilingProbe = {
  id: 'effort-know-odds',
  cap: 'know-how adds at most 15 odds points, so failed research banks at most 15 points however it piles up (R3, D6)',
  run: (scale) => {
    const g = life()
    const w = worst()
    for (const K of [25, 50, 100, 1e4]) w.add(knowOdds(K * scale), KNOW_ODDS_MAX, `know-how ${K * scale}, the curve`)
    // The same task with and without know-how: what the odds line says and what the odds really move.
    // (a hard field, a bold plan and good tools pull the odds about, and the term still moves them by its own points and no more)
    for (const p0 of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      for (const [hardness, ambition, posture, tools] of [[1, 50, 'steady', 0], [2, 100, 'push', 1], [0.5, 0, 'steady', 1]] as const) {
        const task = probeTask({ p0, hardness, oddsLo: 0.01, oddsHi: 0.99 })
        const actor = { ambition, posture, tools }
        const none = quote(g, task, actor)
        const full = quote(g, task, { ...actor, knowledge: 100 * scale })
        const at = `base odds ${p0}, hardness ${hardness}, ambition ${ambition} ${posture}, tools ${tools}, know-how ${100 * scale}`
        w.add(roundSig((full.p - none.p) * 100), KNOW_ODDS_MAX, `${at}: the odds`)
        w.add(full.reasons.find((r) => r.key === 'know')?.pts ?? 0, KNOW_ODDS_MAX, `${at}: the line`)
      }
    }
    // What failures really bank: failure after failure into a map, then the odds it buys.
    const task = probeTask({ oddsLo: 0.01, oddsHi: 0.99 })
    const map: Record<string, number> = {}
    for (let i = 0; i < 5 * scale; i++) step(g, task, FAILED, { year: 2026 + i, know: map })
    const none = quote(g, task, {})
    const banked = quote(g, task, { knowledge: map[task.field] ?? 0 })
    w.add(roundSig((banked.p - none.p) * 100), KNOW_ODDS_MAX, `${5 * scale} failures banked, the odds`)
    return w.result()
  },
}

/** The curves a task's quality can bend under: the product's hard clamp, two soft ones and a tech-lead scale. */
const CURVES: readonly { ceiling: number; room: number; lo: number; hi: number }[] = [
  { ceiling: 97, room: 0, lo: 5, hi: 97 },
  { ceiling: 90, room: 12, lo: 0, hi: 100 },
  { ceiling: 60, room: 30, lo: 0, hi: 100 },
  { ceiling: 1200, room: 200, lo: 0, hi: 5000 },
]

const quality: CeilingProbe = {
  id: 'effort-quality',
  cap: 'a quality bends under its task ceiling and never passes it, whatever the raw number or the budget (R3-E2, C.1)',
  run: (scale) => {
    const g = life()
    const w = worst()
    for (const c of CURVES) {
      const task = probeTask({ quality: { up: 28, down: 14, exp: 0.8, ...c } })
      for (const raw of [60, 1e3, 1e6]) w.add(softCeil(raw * scale, c.ceiling, c.room), c.ceiling, `softCeil of ${raw * scale} under ${c.ceiling} with room ${c.room}`)
      for (const q0 of [60, 1e3, 1e6]) {
        const q = quote(g, task, { quality0: q0 * scale, k: K_MAX * scale, knowledge: 100 * scale })
        if (q.quality === null) throw new Error('the probe task has a quality curve')
        w.add(q.quality, c.ceiling, `a quote from ${q0 * scale} at k ${K_MAX * scale} under ${c.ceiling} with room ${c.room}`)
        // A landing adds the roll's spread and a hit's bonus, and the bounds the caller gives still hold.
        w.add(landQuality(q, task, 1, true), c.hi, `a hit landing from ${q0 * scale} within ${c.hi}`)
      }
    }
    return w.result()
  },
}

const rho: CeilingProbe = {
  id: 'effort-rho',
  cap: 'the pace ambition buys is at most 1.25 times the steady pace, and pushing pays for it in fatigue (R3, D10)',
  run: (scale) => {
    const g = life()
    const w = worst()
    const task = probeTask()
    for (const posture of POSTURES) {
      for (const a of [50, 100]) {
        w.add(rhoOf(a * scale, posture), RHO_MAX, `ambition ${a * scale}, ${posture}`)
        const q = quote(g, task, { ambition: a * scale, posture, fatigue: 100 * scale })
        w.add(q.effort.rho, RHO_MAX, `a quote at ambition ${a * scale}, ${posture}: rho`)
        w.add(q.effort.rho * q.effort.phi, RHO_MAX, `a quote at ambition ${a * scale}, ${posture}, tired: rho times phi`)
        const rested = quote(g, task, { ambition: a * scale, posture, fatigue: 0 })
        w.add(rested.effort.rho * rested.effort.phi, RHO_MAX, `a quote at ambition ${a * scale}, ${posture}, rested: rho times phi`)
      }
    }
    return w.result()
  },
}

const labor: CeilingProbe = {
  id: 'effort-labor',
  cap: 'a task uses at most 40 full-time people and labor saturates, so no crew is more than 4 times the reference crew (R3-E2, C.1)',
  run: (scale) => {
    const g = life()
    const w = worst()
    for (const fte of [10, 40]) for (const cap of [6, 40]) w.add(laborOf(fte * scale, cap * scale), FTE_CAP_MAX, `${fte * scale} people on work that takes ${cap * scale}`)
    for (const crewPts of [6, 100]) {
      const task = probeTask({ crewPts })
      // The crew grows with the scale: 40 people at 1x, 4,000 at 100x.
      const q = quote(g, task, { people: [{ ...STAR, fte: 40 * scale }] })
      w.add(q.effort.crew, CREW_X_MAX, `${40 * scale} people, crew points ${crewPts}: the crew`)
      w.add(q.reasons.find((r) => r.key === 'crew')?.pts ?? 0, CREW_PTS_MAX, `${40 * scale} people, crew points ${crewPts}: the line`)
    }
    return w.result()
  },
}

const spill: CeilingProbe = {
  id: 'effort-spill',
  cap: 'public research moves a quote by at most 18 odds points and rival pressure by at most 8 (R3, D9)',
  run: (scale) => {
    const g = life()
    const w = worst()
    w.add(spillPts(10 * scale), SPILL_TERM_MAX, `public research ${10 * scale}, the term`)
    w.add(rivalPts(5 * scale), RIVAL_PTS, `rival pressure ${5 * scale}, the term`)
    for (const p0 of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      for (const [hardness, ambition, posture] of [[1, 50, 'steady'], [1.5, 100, 'push']] as const) {
        const task = probeTask({ p0, hardness, oddsLo: 0.01, oddsHi: 0.99 })
        const actor = { ambition, posture }
        const none = quote(g, task, actor)
        const open = quote(g, task, { ...actor, spill: 10 * scale })
        const pressed = quote(g, task, { ...actor, rival: 5 * scale })
        const at = `base odds ${p0}, hardness ${hardness}, ambition ${ambition} ${posture}`
        w.add(roundSig((open.p - none.p) * 100), SPILL_TERM_MAX, `${at}, public research ${10 * scale}: the odds`)
        w.add(open.reasons.find((r) => r.key === 'spill')?.pts ?? 0, SPILL_TERM_MAX, `${at}, public research ${10 * scale}: the line`)
        w.add(roundSig((none.p - pressed.p) * 100), RIVAL_PTS, `${at}, rival pressure ${5 * scale}: the odds`)
        w.add(-(pressed.reasons.find((r) => r.key === 'rival')?.pts ?? 0), RIVAL_PTS, `${at}, rival pressure ${5 * scale}: the line`)
      }
    }
    return w.result()
  },
}

const focus: CeilingProbe = {
  id: 'effort-focus',
  cap: 'a year holds at most 24 focus weeks, 12 in the pool and 12 of overtime, and the next week is refused (R3-E6, D16)',
  run: (scale) => {
    const w = worst()
    const limit = FOCUS_WEEKS + FOCUS_OVERTIME_MAX
    const keys = ['study', 'practice:chess', 'act.lesson.acting', 'computer.dev.tutorial']
    // Single weeks asked far past the year.
    const g = life()
    for (let i = 0; i < 30 * scale; i++) spendFocus(g, keys[i % keys.length]!, 3)
    w.add(focusUsed(g), limit, `${30 * scale} single weeks asked`)
    w.add(readYou(g).over, FOCUS_OVERTIME_MAX, `${30 * scale} single weeks asked: the overtime`)
    // One spend of many weeks, then one more week.
    const h = life()
    spendFocus(h, 'study', 3, 12 * scale)
    spendFocus(h, 'study', 3)
    w.add(focusUsed(h), limit, `a spend of ${12 * scale} weeks, then one more`)
    w.add(readYou(h).over, FOCUS_OVERTIME_MAX, `a spend of ${12 * scale} weeks, then one more: the overtime`)
    return w.result()
  },
}

/** The eight rows of the effort engine, one for each `effort-*` id of test/ceiling-list.json. */
export const EFFORT_ROWS: CeilingProbe[] = [kMax, knowledge, knowOddsRow, quality, rho, labor, spill, focus]
