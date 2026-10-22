// Studio game engines on the Effort engine (R3-M7, C.3): the adapter between gamestudio-engines.ts and effort/. The one labor-driven
// build of the business layer, and the only research with no odds: an engine in development never fails. What the engine adds is pace
// and a hazard. A leaf of the business import graph: it takes numbers and plain records and imports only modules outside the 59-module
// cycle (the engine, the seam research-effort.ts, the engine tiers), so gamestudio-engines.ts can call it without a new import cycle.
//
//   engineTask      the Task of a tier: its years and its yearly R&D, the studio's know-how field, and `knowYears` (a studio that has built
//                   engines builds the next a little faster, at most 15%). A task with no odds and no quality curve.
//   engineActor     who builds: the player (a studio the owner runs: the persona's ambition, posture and tiredness) or a steady hired CEO
//   engineQuote     the quote of one year of development: the years the engine takes at this pace, from the actor and the know-how
//   engineProgress  the year's gain, `(100 / years) * ratio^.8 * operations * open` with the quote's years: the team ratio, the operations
//                   and the open share are the studio's own (the old formula, term for term), so at the default actor it is v5.0.0 to the bit
//   engineQuality   what the engine lands at: the old formula (30 plus the company and the leader, plus the team), unrounded
//   setbackChance   the yearly hazard of a push (the quote's risk of a shortcut and of burnt people), at most SETBACK_MAX; 0 for any other posture
//   setbackLuck     the one draw of a pushing year, from outcomeStream 'effort.risk' keyed by the year and the engine (never g.rng)
//   markSetback     the engine's effort record after a setback
//   engineOutcome   how a finished engine is booked: a win, whole
//   engineAfterword what a finished engine teaches, in the words of the core's payoff line, and what that buys the next one
//   enginePace      the pace in words ("At this pace it builds a little faster (know-how)"), nothing at the default
//
// Where the rules are (D6, D11, D12, D13): the pace and the posture are the player's own, so an owner-run studio takes the persona and a
// hired-CEO studio is steady, ambition 50, fatigue 0; know-how acts on years only here (`knowYears` .15, so at most a seventh faster at
// full know-how), which is why the task is a practice and not a project: a project banks know-how by failing, and an engine doesn't fail.
// A push can set an engine back (the one place the engine rolls a risk, D12): the year's gain is cut to half, the stored progress, the
// team and the money are never touched, and a steady or lean year draws nothing, so no seeded life changes unless the player pushes.
//
// Nothing here draws from g.rng or books a dollar. A module-level const is a literal (rule (d) of the layer ratchet).
import { quote } from '../effort/engine'
import { newFx, normalizeFx } from '../effort/fx'
import { knowHowOf } from '../effort/knowhow'
import { postureOf } from '../effort/persona'
import { resolve } from '../effort/step'
import { defineTask } from '../effort/task'
import { payoffLine } from '../effort/why'
import type { EffortInput, Fx, Outcome, Posture, Quote, StepResult, Task } from '../effort/types'
import { outcomeStream } from '../kernel/streams'
import type { GameState } from '../types'
import { engineTier, type EngineTier } from './gamestudio-engine-state'
import { clampN } from './util'

/** The know-how key of the studio's engine work: one field, so every engine teaches every later one. */
export const ENGINE_FIELD = 'studio.engine'

/** The most a push's setback chance can be in a year, whatever the ambition. */
export const SETBACK_MAX = 0.1
/** The share of the year's gain a set-back year keeps. */
export const SETBACK_KEEP = 0.5

/**
 * The Task of one engine tier: its years and its yearly R&D at the tier's own team, the studio's know-how field, a speed that grows with
 * that know-how (`knowYears`, the engine's own ceiling is .15), and what a finished engine teaches (`learn`, 20 points at first, less
 * the more the studio knows). No odds (p0 1 and the clamp at 1) and no quality curve: the quality is the studio's own formula.
 */
export function engineTask(tier: EngineTier): Task {
  const t = engineTier(tier)
  return defineTask({
    field: ENGINE_FIELD,
    mode: 'practice',
    cost: t.research,
    baseYears: t.years,
    minYears: 1,
    maxYears: 6,
    kmax: 1,
    p0: 1,
    oddsLo: 1,
    oddsHi: 1,
    knowYears: 0.15,
    learn: 20,
  })
}

/** Who builds: the player (a studio the owner runs) or a steady hand (a hired CEO), and the posture of the year. */
export interface EngineActor {
  you: boolean
  posture: Posture
}

/** The actor of a studio's engines. `runs` is whether the player's own hands are on the studio (research-effort.ts `ownerRuns`). */
export function engineActor(g: GameState, runs: boolean): EngineActor {
  return runs ? { you: true, posture: postureOf(g) } : { you: false, posture: 'steady' }
}

/**
 * The input of one quote: a budget of one (an engine has no budget slider), the studio's know-how in the engine field, and the player
 * (`who: 'you'`: the persona's ambition, posture and tiredness) or a steady hand at ambition 50 with no tiredness.
 */
function inputOf(actor: EngineActor, knowHow: Readonly<Record<string, number>> | undefined): EffortInput {
  const input: EffortInput = { k: 1, knowledge: knowHowOf(knowHow, ENGINE_FIELD) }
  if (actor.you) input.who = 'you'
  else {
    input.posture = 'steady'
    input.ambition = 50
    input.fatigue = 0
  }
  return input
}

/**
 * The quote of a year of development of an engine of `tier`, by `actor` with the studio's `knowHow` map (undefined for none). Its
 * `yearsExact` is the years the engine takes at this pace; at the default actor it is the tier's own years. A read: no draw, no dollar.
 */
export function engineQuote(g: GameState, tier: EngineTier, actor: EngineActor, knowHow?: Readonly<Record<string, number>>): Quote {
  return quote(g, engineTask(tier), inputOf(actor, knowHow))
}

/**
 * The year's gain, in points of progress (0 to 100 is a whole engine): the old `(100 / years) * ratio^.8 * operations * open`, with the
 * years from the quote. `ratio` is the team against the tier's team, cut to 0 to 3 as it always was; `operations` and `open` are the
 * studio's. At the default actor `q.yearsExact` is the tier's years and this is the old number bit for bit.
 */
export function engineProgress(q: Quote, ratio: number, operations: number, open: number): number {
  return (100 / q.yearsExact) * Math.pow(clampN(ratio, 0, 3), 0.8) * operations * open
}

/** What an engine in development is of quality: the company's, the leader's and the team's, 20 to 98, as it always was (unrounded). */
export function engineQuality(quality: number, leadership: number, ratio: number): number {
  return clampN(30 + quality * 0.45 + leadership * 0.2 + Math.min(10, ratio * 5), 20, 98)
}

/**
 * The chance a year sets the build back: only at the posture push of a studio the player runs, the quote's risk of a shortcut and of
 * burnt people (both zero below the ceiling a quote reports), at most SETBACK_MAX. Any other actor or posture: 0.
 */
export function setbackChance(q: Quote, actor: EngineActor): number {
  if (!actor.you || actor.posture !== 'push') return 0
  return clampN(q.risk.shortcut + q.risk.scandal, 0, SETBACK_MAX)
}

/**
 * The luck of an engine's year, in [0, 1): a pure function of the life, the year and the engine (a named stream, never g.rng), so a
 * reload, a replay and an heir see the same one. Called only when the posture is push.
 */
export function setbackLuck(g: GameState, year: number, engineId: string): number {
  return outcomeStream(g, 'effort.risk', year, `studio:${engineId}`)()
}

/** The effort record of an engine that was set back: a fresh one (stamped the year before `year`) if it had none, with one more setback. */
export function markSetback(fx: Fx | undefined, year: number): Fx {
  const cur = fx ?? newFx(year)
  return normalizeFx({ ...cur, setbacks: cur.setbacks + 1 })
}

/** How a finished engine is booked: it works, whole. An engine has no odds, so nothing here is drawn. */
export function engineOutcome(): Outcome {
  return resolve({ p: 1, hitP: 0, reasons: [] } as unknown as Quote, 0)
}

/**
 * What a finished engine adds to its ready line: what it taught, in the core's words, and what that buys. Empty for a studio that
 * books nothing (`result` is null), for a replay and for a run that taught nothing new (a studio that already knows it all).
 */
export function engineAfterword(task: Task, out: Outcome, result: StepResult | null): string {
  if (result === null || result.replay || !(result.learned > 0)) return ''
  return `${payoffLine(task, out, result)} The next engine comes a little sooner.`
}

/** The words for a pace: a little, plain or much, faster or slower than usual. */
function paceWord(speed: number): string {
  const d = Math.abs(speed - 1)
  const size = d < 0.05 ? 'a little ' : d < 0.15 ? '' : 'much '
  return `${size}${speed > 1 ? 'faster' : 'slower'}`
}

/**
 * The pace of an engine in words, for the start notice and the engine screen: "At this pace it builds a little faster (know-how)."
 * Nothing at the default pace (within one point of it). It names what moved it: what the studio knows of engines, a drive above or
 * below the middle, and tiredness. Short, no number. Know-how acts on years and has no line among the quote's reasons, so it is read
 * from what is left of the speed once the actor's own part is taken out.
 */
export function enginePace(q: Quote): string {
  const e = q.effort
  if (!(Math.abs(e.speed - 1) >= 0.01)) return ''
  const own = e.crew * (1 + 0.3 * e.tools) * e.rho * e.phi
  const why: string[] = []
  if (e.speed / own > 1.0001) why.push('know-how')
  if (e.rho > 1.0001) why.push('drive')
  else if (e.rho < 0.9999) why.push('an easy pace')
  if (e.phi < 0.9999) why.push('tiredness')
  return `At this pace it builds ${paceWord(e.speed)}${why.length > 0 ? ` (${why.join(', ')})` : ''}.`
}
