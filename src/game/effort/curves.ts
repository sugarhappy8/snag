// The pure curves of the effort engine (R3-E2, C.1). Every function takes numbers and returns a number: it reads no game state, makes
// no roll and moves no money, and the same arguments always give the same answer. `quote` (engine.ts) composes them; a migrated
// system never calls one directly. Each growth term here has a ceiling a person could name, and a test that scales it by 100.
//
//   softCeil       a quality that bends under its ceiling instead of hitting it (room 0 is a plain clamp, the product shape)
//   laborOf        people saturate: the tenth person adds far less than the first
//   crewRatio      how much faster or slower the crew you have is than the crew the task was calibrated on
//   rhoOf, boldOf  ambition buys pace (linear, never past RHO_MAX) and a bolder plan (wider spread, odds pulled toward even)
//   phiOf          what fatigue costs of that pace: the price of pushing
//   budgetQuality  what money buys in quality, the shape of the product R&D budget curve with its constants as fields
//   knowGain, knowBank, knowOdds  know-how: harder to gain the more you have, banked by a failure, worth at most KNOW_ODDS_MAX points
//
// At the neutral inputs (ambition 50, steady, fatigue 0, drive 50, no know-how, no crew) every deviation here is exactly 0 or 1, so an
// old formula routed through the engine gives the old answer bit for bit. Numbers that are not numbers are read as the neutral value;
// infinity is read as the nearest end of the range. Rule (d) of the layer ratchet holds the module-level consts below to literals.
import {
  FATIGUE_KNEE,
  FATIGUE_SLOPE,
  FTE_CAP_MAX,
  KNOW_BANK,
  KNOW_MAX,
  KNOW_ODDS_MAX,
  POSTURE_FACTOR,
  RHO_MAX,
  RHO_MIN,
} from './limits'
import { cutNum, hasOwn, isRecord } from './num'
import type { Posture, QualityCurve, Task, Worker } from './types'

/** Labor has diminishing returns: the pace of a crew goes with its labor to this power (the shape of leadership.ts, which saturates). */
export const LABOR_EXP = 0.8
/** The morale the reference crew of a task is assumed to have: a crew of its size and skill at this morale is exactly 1. */
export const CREW_REF_MORALE = 50
/** A crew is at most this many times as fast as the one the task was calibrated on. At the default crewPts of 6 this is CREW_PTS_MAX odds points. */
export const CREW_X_MAX = 4
/** ...and at least this fraction as fast. */
export const CREW_X_MIN = 0.25
/** The smallest budget multiple the quality curve reads (the floor rd.ts budgetQuality uses). */
export const BUDGET_K_FLOOR = 0.05
/** How fast know-how turns into odds: the odds term is 1 - exp(-K / this), scaled so 100 know-how is exactly KNOW_ODDS_MAX points. */
export const KNOW_ODDS_SCALE = 45
/** Know-how gains are damped by (1 - K / this) to the KNOW_DAMP_EXP: hard to gain the more you have, never to zero below 100. */
export const KNOW_DAMP_AT = 110
/** The power of that damping. */
export const KNOW_DAMP_EXP = 1.3
/** The `learn` a task has by default (task.ts); a task that teaches more or less banks more or less, relative to it, up to twice as much. */
export const LEARN_REF = 12

/**
 * `raw` bent under `ceiling`: the identity up to `ceiling - room`, then `ceiling - room * exp(-(raw - knee) / room)`, which rises
 * more slowly and approaches the ceiling without passing it. Continuous with slope 1 at the knee and monotone. With room 0 it is a
 * plain clamp at the ceiling. A negative room is 0; a `raw` that is not a number is the knee; infinity lands on the ceiling.
 */
export function softCeil(raw: number, ceiling: number, room: number): number {
  const top = cutNum(ceiling, -1e9, 1e9, 0)
  const r = cutNum(room, 0, 1e9, 0)
  const knee = top - r
  const x = cutNum(raw, -1e12, 1e12, knee)
  if (x <= knee) return x
  if (r === 0) return top
  return top - r * Math.exp(-(x - knee) / r)
}

/** Labor from `fte` full-time people on work that can use at most `cap` of them: `cap * (1 - exp(-fte / cap))`, which saturates at `cap` (itself at most FTE_CAP_MAX). */
export function laborOf(fte: number, cap: number): number {
  const c = cutNum(cap, 0, FTE_CAP_MAX, 0)
  if (!(c > 0)) return 0
  const f = cutNum(fte, 0, 1e6, 0)
  return c * (1 - Math.exp(-f / c))
}

/** Pace lost to fatigue: 1 up to FATIGUE_KNEE, then FATIGUE_SLOPE a point (fatigue is 0 to 100, so never below 0.74). */
export function phiOf(fatigue: number): number {
  const f = cutNum(fatigue, 0, 100, 0)
  return 1 - FATIGUE_SLOPE * Math.max(0, f - FATIGUE_KNEE)
}

/**
 * What one worker gets done per person: `skill/100 * (.35 + .95 * morale/100)` (the shape of leadership.ts), times
 * `(.9 + .2 * drive/100)` (a driven person is up to 10% faster, an idle one 10% slower) and the pace fatigue leaves them. A worker
 * with drive 50 and no fatigue is the old formula bit for bit. Skill, morale and drive are cut to 0..100; a row that is not a worker is 0.
 */
export function workerOutput(w: Worker): number {
  if (!isRecord(w)) return 0
  const skill = cutNum(w.skill, 0, 100, 0)
  const morale = cutNum(w.morale, 0, 100, 0)
  const drive = cutNum(w.drive, 0, 100, 50)
  return (skill / 100) * (0.35 + (0.95 * morale) / 100) * (0.9 + (0.2 * drive) / 100) * phiOf(cutNum(w.fatigue, 0, 100, 0))
}

/**
 * How the crew you have compares with the crew the task was calibrated on: `(L^.8 * q) / (Lref^.8 * qref)`, where L is the labor of
 * your people (laborOf over the task's cap), q their average output per person weighted by time (workerOutput), and Lref and qref the
 * same for `task.refCrew` at CREW_REF_MORALE. 1 with no crew, no usable row or no reference crew; otherwise cut to CREW_X_MIN..CREW_X_MAX
 * so a crew can neither stall the work nor multiply its pace without end. A row that is not a worker counts for nothing.
 */
export function crewRatio(task: Pick<Task, 'refCrew' | 'fteCap'>, people?: readonly Worker[] | null): number {
  const ref = task.refCrew
  if (ref === null || !Array.isArray(people)) return 1
  let fte = 0
  let output = 0
  for (const w of people as readonly unknown[]) {
    if (!isRecord(w)) continue
    const f = cutNum(w.fte, 0, 1e6, 0)
    if (!(f > 0)) continue
    fte += f
    output += f * workerOutput(w as unknown as Worker)
  }
  if (!(fte > 0)) return 1
  const mine = Math.pow(laborOf(fte, task.fteCap), LABOR_EXP) * (output / fte)
  const base = Math.pow(laborOf(ref.fte, task.fteCap), LABOR_EXP) * ((ref.skill / 100) * (0.35 + (0.95 * CREW_REF_MORALE) / 100))
  if (!(base > 0)) return 1
  return cutNum(mine / base, CREW_X_MIN, CREW_X_MAX, 1)
}

/** The ambition (0..100, 50 is neutral) a posture scales, as a number in 0..100; anything that is not a number is neutral. */
function ambitionIn(ambition: number): number {
  return cutNum(ambition, 0, 100, 50)
}

/** The factor of a posture; one the table doesn't hold (or inherits) is steady. */
function postureFactor(posture: Posture): number {
  return typeof posture === 'string' && hasOwn(POSTURE_FACTOR, posture) ? POSTURE_FACTOR[posture] : POSTURE_FACTOR.steady
}

/**
 * The pace ambition buys: `.85 + .30 * (A/100) * postureFactor`, linear in A and cut to RHO_MIN..RHO_MAX. Exactly 1 at ambition 50 and
 * steady, 1.24 at the most (ambition 100, pushing): no more than a quarter faster, and pushing pays for it in fatigue (phiOf).
 */
export function rhoOf(ambition: number, posture: Posture): number {
  const v = 0.85 + 0.3 * (ambitionIn(ambition) / 100) * postureFactor(posture)
  return v < RHO_MIN ? RHO_MIN : v > RHO_MAX ? RHO_MAX : v
}

/**
 * How bold the plan is, -1.3 to 1.3: `clamp((A - 50) / 50, -1, 1) * postureFactor`. Exactly 0 at ambition 50. A bold plan (above 0)
 * widens the spread of the result and pulls the odds toward even; a cautious one (below 0) narrows it and pushes the odds away. It
 * adds no free edge: the engine nets the two out around 50%.
 */
export function boldOf(ambition: number, posture: Posture): number {
  return ((ambitionIn(ambition) - 50) / 50) * postureFactor(posture)
}

/**
 * What a budget of `k` times the normal one adds to (or costs) a quality: `up * (1 - k^-exp)` from k = 1, which approaches `up` and
 * never reaches it, and `down * log2(k)` below 1. The shape of rd.ts budgetQuality with its constants (28, 14, .8) as fields; the
 * budget is floored at BUDGET_K_FLOOR as there. A `k` that is not a number is the normal budget.
 */
export function budgetQuality(k: number, curve: Pick<QualityCurve, 'up' | 'down' | 'exp'>): number {
  const x = Math.max(BUDGET_K_FLOOR, cutNum(k, -Infinity, Infinity, 1))
  return x >= 1 ? curve.up * (1 - Math.pow(x, -curve.exp)) : curve.down * Math.log2(x)
}

/** Know-how already held (0..100) damps what is gained next: `(1 - K / 110) ^ 1.3`, 1 at K 0 and under 0.05 at K 100. */
function damp(K: number): number {
  return Math.pow(1 - cutNum(K, 0, KNOW_MAX, 0) / KNOW_DAMP_AT, KNOW_DAMP_EXP)
}

/** The know-how points a study or practice session of `gain` points teaches someone who already holds `K`: `gain * (1 - K/110)^1.3`. */
export function knowGain(K: number, gain: number): number {
  return cutNum(gain, 0, KNOW_MAX, 0) * damp(K)
}

/**
 * The know-how a failed project banks, in points, damped the way knowGain is: `KNOW_BANK * 100 * done * (1 - K/110)^1.3`, with `done`
 * (how far the work got) cut to 0..1. A task that teaches more or less than the default (`learn` 12) banks more or less, relative
 * to it and at most twice as much; the default is exactly the formula.
 */
export function knowBank(K: number, done: number, learn: number = LEARN_REF): number {
  const scale = cutNum(learn, 0, 2 * LEARN_REF, LEARN_REF) / LEARN_REF
  return KNOW_BANK * 100 * cutNum(done, 0, 1, 0) * damp(K) * scale
}

/**
 * The odds points know-how in the field adds: concave, each point worth less than the last, 0 at K 0 and exactly KNOW_ODDS_MAX (15) at
 * K 100, never more. This is the whole of what a failed project can buy, which is why "failed research banks at most 15 points".
 */
export function knowOdds(K: number): number {
  const k = cutNum(K, 0, KNOW_MAX, 0)
  const pts = (KNOW_ODDS_MAX * (1 - Math.exp(-k / KNOW_ODDS_SCALE))) / (1 - Math.exp(-KNOW_MAX / KNOW_ODDS_SCALE))
  return pts > KNOW_ODDS_MAX ? KNOW_ODDS_MAX : pts
}
