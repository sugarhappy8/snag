// Deep tech on the Effort engine (R3-M5, C.3): the adapter between a lab's programs and `quote` (effort/engine.ts). Two quotes, as the
// lab always had two moments:
//
//   the terms    what funding a program at a budget buys, when it starts (deeptech-rd.ts `programTerms`): the odds
//                `1 - (1 - base) * k^-.35` (clamped .02 to .98), the years `plan / k^.55`, the price. The company's know-how in the
//                field and the world's public research and rival pressure enter here, so the odds a program starts with are the
//                odds it keeps (they are stored with it, as they always were) and a player sees them in the budget slider.
//   the roll     what a finished program rolls, at year-end (`finalOdds`): its stored odds, the lab's technical skill
//                (`.75 + skill / 200`), a blitz (`.96`) and the founder's talent (`1.05`), clamped .03 to .95. Those four are the
//                caller's own terms ("lab skill", "blitz pace", "talent"), worked out in the order the old formula multiplied them,
//                so the odds at the default actor are the old number; the engine adds the one term that is new: tiredness.
//
// The pace stays the calibration (deeptech-core.ts PACES: speed .75/1/1.5, cost .65/1/1.55, team .85/1/1.15), so the first year at any
// pace is exact. It is also the posture of the work (D11): the engine is always told steady, ambition 50 (a lab's pace is not the
// player's ambition), and a year at a pace adds the posture's strain (lean -4, steady 0, push +10, effort/limits.ts) to the program's
// own `fx.fatigue`, read back at the roll as `fatigue`: a long program run flat out loses a few points once it is past the engine's
// knee (35), and one that eases off keeps them. A program that never got tired has no `fx`, so a default lab saves as it always did.
//
// A leaf of the business import graph (adapter rule): numbers and plain records in, a Task or a Quote out. The cycle members the roll
// needs (`techSkill`) are read by deeptech-rd.ts, which hands the numbers in. Nothing here draws a number or books a dollar, and a
// module-level const is a literal (rule (d) of the layer ratchet).
import { quote } from '../effort/engine'
import { newFx, normalizeFx } from '../effort/fx'
import { POSTURE_STRAIN } from '../effort/limits'
import { defineTask, isField } from '../effort/task'
import type { Fx, Posture, Quote, Reason, Task, TermKey } from '../effort/types'
import type { GameState } from '../types'
import type { Pace } from './deeptech-state'
import { clampN } from './util'

/**
 * What the engine reads of the game when it is not told `who: 'you'`: nothing. A lab's quote always names its own posture, ambition
 * and fatigue, so a read made with no game in hand (the oracle's four-argument `programTerms`) passes this empty one.
 */
const NO_GAME = {} as GameState

/** What a program is, as the engine needs it: the field its know-how lives in, its yearly price, its plan in years, its base odds. */
export interface ProgramFacts {
  field: string
  /** Local dollars a year at the planned budget (what `programCost` says). */
  cost: number
  /** Years of work at a steady pace and the planned budget. */
  years: number
  /** The odds before funding (`def.odds(t)`), or for a running program the odds it started with. */
  odds: number
}

/** What the world's research does to the odds in the field (frontier terms): public research and rival pressure, in odds points. */
export interface WorldTerms {
  spill: number
  rival: number
}

/**
 * The know-how key of a program: its trade ('dt.quantum'), or for an AI capability track the capability ('dt.aiLab.cap.coding'), so a
 * failed track teaches that capability and no other. A key the engine would refuse falls back to the generic 'dt.lab'.
 */
export function programField(industry: string, cap?: string): string {
  const field = cap !== undefined && cap !== '' ? `dt.aiLab.cap.${cap}` : `dt.${industry}`
  return isField(field) ? field : 'dt.lab'
}

/**
 * The task of a program. With `roll` false it is the funding quote (odds clamp .02 to .98, a budget of up to 3 times the plan, the
 * shape the lab has always had: odds exponent .35, years exponent .55, half a year to ten); with `roll` true the same program at
 * the roll, whose clamp is .03 to .95. Numbers that are not usable are cut to ones that are (a price of at least 1, a plan of
 * years above 0), so building one never throws.
 */
export function programTask(f: ProgramFacts, roll = false): Task {
  return defineTask({
    field: f.field,
    mode: 'project',
    cost: Number.isFinite(f.cost) && f.cost >= 1 ? f.cost : 1,
    baseYears: Number.isFinite(f.years) && f.years > 0 ? f.years : 1,
    p0: Number.isFinite(f.odds) ? f.odds : 0.5,
    oddsExp: 0.35,
    yearsExp: 0.55,
    minYears: 0.5,
    maxYears: 10,
    kmax: 3,
    oddsLo: roll ? 0.03 : 0.02,
    oddsHi: roll ? 0.95 : 0.98,
  })
}

/**
 * What funding the program at `k` times its plan buys: the engine's quote with the company's know-how in the field and the world's
 * terms, steady, ambition 50, no tiredness (a program starts rested). `g` is read only for `who: 'you'`, which a lab never says.
 */
export function termsQuote(g: GameState | undefined, f: ProgramFacts, k: number, know: number, world: WorldTerms): Quote {
  return quote(g ?? NO_GAME, programTask(f), { k, knowledge: know, spill: world.spill, rival: world.rival, posture: 'steady', ambition: 50, fatigue: 0 })
}

/** What a finished program's roll depends on, besides the program's own odds. */
export interface RollFacts {
  /** The odds the program started with (stored on it). */
  odds: number
  /** The lab's technical skill, 0 to 100 (deeptech-core.ts techSkill). */
  skill: number
  /** The lab is at a blitz pace. */
  blitz: boolean
  /** The founder's Programming talent counts (a software-like trade the player runs). */
  programmer: boolean
  /** The founder's Academics talent counts (a science trade the player runs). */
  academic: boolean
  /** The program's own tiredness, 0 to 100 (`fx.fatigue`). */
  fatigue: number
}

interface Step {
  key: TermKey
  label: string
  /** The odds after this step, cut to the roll's clamp. */
  to: number
}

/** The odds the roll starts from and ends at: `.03` and `.95`. */
const cutRoll = (x: number): number => (x < 0.03 ? 0.03 : x > 0.95 ? 0.95 : x)

/** `x` rounded to whole points, half away from zero. */
const whole = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x))

/**
 * The labelled lines of the steps from `ref` to `base`: each step's own change in whole points, the rounding put on the largest line
 * so the lines add up to `round(base * 100) - round(ref * 100)`. A step of 0 points is left out. Steps are worked in the clamped
 * range, so a strong lab that is already at the ceiling shows the points it really added and not the ones the clamp took away.
 */
function lines(ref: number, base: number, steps: readonly Step[]): Reason[] {
  const raw: number[] = []
  let prev = ref
  for (const s of steps) {
    raw.push((s.to - prev) * 100)
    prev = s.to
  }
  const pts = raw.map(whole)
  const rest = Math.round(base * 100) - Math.round(ref * 100) - pts.reduce((a, b) => a + b, 0)
  if (rest !== 0 && pts.length > 0) {
    let at = 0
    for (let i = 1; i < raw.length; i++) if (Math.abs(raw[i]!) > Math.abs(raw[at]!)) at = i
    pts[at] = pts[at]! + rest
  }
  return steps.flatMap((s, i) => (pts[i] !== 0 ? [{ key: s.key, label: s.label, pts: pts[i]! }] : []))
}

/**
 * The odds a finished program rolls before the engine's own terms, and the lines that say why. The multiplications are the old
 * formula's, in its order and with its constants, so the number is bit for bit what `finalOdds` multiplied:
 * `odds * (.75 + skill / 200)`, `* .96` at a blitz, `* 1.05` for each talent that counts.
 */
export function rollBase(f: RollFacts): { base: number; terms: Reason[] } {
  let o = f.odds * (0.75 + f.skill / 200)
  const steps: Step[] = [{ key: 'team', label: 'lab skill', to: cutRoll(o) }]
  if (f.blitz) {
    o *= 0.96
    steps.push({ key: 'bold', label: 'blitz pace', to: cutRoll(o) })
  }
  if (f.programmer) {
    o *= 1.05
    steps.push({ key: 'team', label: 'talent', to: cutRoll(o) })
  }
  if (f.academic) {
    o *= 1.05
    steps.push({ key: 'team', label: 'talent', to: cutRoll(o) })
  }
  const base = cutRoll(o)
  return { base, terms: lines(cutRoll(f.odds), base, steps) }
}

/**
 * The roll of a finished program: its base (`rollBase`) with the tiredness the pace built, through the engine at the roll's clamp
 * (.03 to .95). At no tiredness it is the old `finalOdds` number; every point the engine takes off is a `tired` line.
 */
export function rollQuote(g: GameState, f: ProgramFacts, r: RollFacts): Quote {
  const { base, terms } = rollBase(r)
  return quote(g, programTask(f, true), { k: 1, base, baseTerms: terms, posture: 'steady', ambition: 50, fatigue: r.fatigue })
}

/** A pace as the posture of the work: lean eases off, steady is steady, blitz pushes. */
export function paceToPosture(p: Pace): Posture {
  return p === 'lean' ? 'lean' : p === 'blitz' ? 'push' : 'steady'
}

/** What a year at a pace adds to a program's tiredness: the posture's strain (lean -4, steady 0, blitz +10). */
export function paceStrain(p: Pace): number {
  return POSTURE_STRAIN[paceToPosture(p)]
}

/** Whether a record holds anything but its year stamp. */
function carries(fx: Fx): boolean {
  return fx.progress !== 0 || fx.quality !== 0 || fx.spent !== 0 || fx.hours !== 0 || fx.setbacks !== 0 || fx.insight !== 0 || fx.fatigue !== 0
}

/**
 * A program's record after a year at `pace`: its tiredness moved by the pace's strain and kept within 0 to 100, or nothing when
 * it carries nothing (never tired, or rested all the way). `started` is the year the program began, for a fresh record's stamp. A
 * year that changes nothing hands the record back as it was.
 */
export function strained(fx: Fx | undefined, pace: Pace, started: number): Fx | undefined {
  const now = fx?.fatigue ?? 0
  const next = clampN(now + paceStrain(pace), 0, 100)
  if (fx === undefined && next === 0) return undefined
  if (fx !== undefined && next === now) return fx
  const out = normalizeFx({ ...(fx ?? newFx(started)), fatigue: next })
  return carries(out) ? out : undefined
}
