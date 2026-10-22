// R3-M8 (C.3): the Workshop's odds on the effort engine. `buildOdds` and `brainstormOdds` (build.ts) keep their names and signatures and
// ask `quote` (effort/engine.ts) for what the maker's own state adds to today's numbers; this file is the adapter that says how.
//
// The calibration is today's: a build's chance to blow up, the centre and spread of the quality it lands at, and a brainstorm's chance
// of an idea are the formulas build.ts had, worked out here from plain numbers and handed to the engine as the odds "before the engine's
// terms" (`base`). At the default actor (ambition 50, steady, no fatigue, no know-how) the engine adds exactly nothing, so every number
// is today's number bit for bit. Past the default it adds labelled terms and nothing else:
//   - know-how in the idea's category, banked by a blow-up (build.ts `learn`), lowers that category's next blow-up chance (at most 15
//     odds points, the engine's own ceiling) and lifts the prototype's quality by up to 3 points;
//   - tiredness costs odds, a bold plan (ambition over 50) widens the spread and raises the blow-up chance, a cautious one narrows it.
// Difficulty is already in the calibration (`(d - 1) * .03` of blow-up chance and `(d - 1) * 10` of quality), so the task's `hardness`
// stays neutral: the engine's hard-field term would count it twice. A build is one piece of work with no budget to scale (`kmax` 1).
//
// This file is a leaf (rule 1 of the adapter rule): pure functions of numbers and plain records, imports of types and of the effort
// engine only. It draws no random number and writes nothing; `quote` is called from menus and hints. The two draws of a build and the
// booking of its result stay in build.ts, in today's order.
import { quote } from '../effort/engine'
import { defineTask } from '../effort/task'
import type { EffortInput, Quote, Reason, Task } from '../effort/types'
import type { GameState } from '../types'
import type { IdeaDef } from './catalog'

/** Nominal prototype price by difficulty, before local prices and the approach (build.ts `buildCost` scales it). Index 0 is unused. */
export const BUILD_COST = [0, 150, 1_500, 8_000, 40_000, 250_000] as const

/** One row of the approaches table (build.ts APPROACHES): what the plan costs, shifts, spreads and risks, before the maker's own state. */
export interface ApproachCalib {
  cost: number
  shift: number
  spread: number
  kaboom: number
}

/** The numbers of the maker a build reads, as build.ts gathers them. `skill` is the effective inventing skill. */
export interface BuildFacts {
  skill: number
  smarts: number
  genius: boolean
  builds: number
}

/** What a build's odds come to, in the Workshop's own terms. `kaboom` is not rounded; `q` is the engine's quote, for its reasons. */
export interface BuildNumbers {
  kaboom: number
  low: number
  high: number
  spread: number
  q: Quote
}

/** The know-how field of a category of ideas: 'workshop.gadget'. A blow-up banks it; nothing else does. */
export const buildField = (cat: string): string => `workshop.${cat}`

/** A genius blows up half as often; a build never blows up under 1% (half of that for a genius) or over 60% (half for a genius) of the time. */
const GENIUS_KABOOM = 0.5
const KABOOM_FLOOR = 0.01
const KABOOM_CAP = 0.6

/** A difficulty as an index into BUILD_COST (a hostile idea is read as the nearest real level). */
const levelOf = (d: number): number => (Number.isFinite(d) ? Math.max(1, Math.min(5, Math.round(d))) : 1)

/**
 * The Task of a build: one project in the idea's category, with the approach's spread and its nominal price. The blow-up chance and the
 * centre of the quality are the maker's, so they travel in the input (`buildInputs`); the task holds what does not change with the
 * maker. The odds clamp is the legacy one, `1 - 60%` to `1 - 0.5%`; the quality curve adds nothing at the neutral inputs (it carries
 * only what know-how lifts, from 0).
 */
export function buildTask(def: Pick<IdeaDef, 'cat' | 'd'>, a: ApproachCalib): Task {
  return defineTask({
    field: buildField(def.cat),
    mode: 'project',
    cost: BUILD_COST[levelOf(def.d)] * a.cost,
    kmax: 1,
    p0: 1 - a.kaboom,
    oddsLo: 1 - KABOOM_CAP,
    oddsHi: 1 - KABOOM_FLOOR * GENIUS_KABOOM,
    baseYears: 1,
    minYears: 1,
    maxYears: 1,
    spread: a.spread,
    quality: { up: 0, down: 0, exp: 1, ceiling: 100, room: 0, lo: 0, hi: 100 },
  })
}

/** Today's blow-up chance (unrounded) and centre of the quality range, for a maker, an idea and an approach. build.ts's formulas verbatim. */
function calib(f: BuildFacts, def: Pick<IdeaDef, 'd'>, a: ApproachCalib): { kaboom: number; center: number } {
  const kaboom = Math.max(KABOOM_FLOOR, Math.min(KABOOM_CAP, a.kaboom + (def.d - 1) * 0.03 - f.skill * 0.0008)) * (f.genius ? GENIUS_KABOOM : 1)
  const center = 18 + f.skill * 0.55 + f.smarts * 0.15 + (f.genius ? 20 : 0) - (def.d - 1) * 10 + Math.min(9, f.builds * 3) + a.shift
  return { kaboom, center }
}

/**
 * The lines the calibration itself is made of, as labelled terms of the odds that the build works (`1 - kaboom`): what difficulty
 * costs, and the maker's skill, talent and the floor together. They add up to `base - p0` so a why line can name them; the engine's
 * own lines (know-how, tired, bold) come after. A line of 0 is left out.
 */
function baseTerms(f: BuildFacts, def: Pick<IdeaDef, 'd'>, a: ApproachCalib, works: number): Reason[] {
  const gf = f.genius ? GENIUS_KABOOM : 1
  const hard = -(def.d - 1) * 3 * gf
  const rest = (works - (1 - a.kaboom)) * 100 - hard
  const out: Reason[] = []
  if (Math.abs(rest) > 1e-9) out.push({ key: 'team', label: 'your skill', pts: rest })
  if (hard !== 0) out.push({ key: 'hard', label: 'hard build', pts: hard })
  return out
}

/**
 * The engine's input for a build: the player's own state (`who: 'you'` fills ambition, the posture in force, fatigue and the category's
 * know-how), today's works-odds as the base, and a quality that starts at 0 (the engine adds only what know-how lifts). `terms` also
 * passes the labelled lines of the calibration, for `buildWhy`.
 */
export function buildInputs(f: BuildFacts, def: Pick<IdeaDef, 'd'>, a: ApproachCalib, terms = false): EffortInput {
  const works = 1 - calib(f, def, a).kaboom
  return { who: 'you', base: works, quality0: 0, ...(terms ? { baseTerms: baseTerms(f, def, a, works) } : {}) }
}

/** The same input with the actor at the default, so the difference between two quotes is exactly what the maker's own state adds. */
const flat = (i: EffortInput): EffortInput => {
  const { who: _who, ...rest } = i
  return { ...rest, ambition: 50, posture: 'steady', fatigue: 0, knowledge: 0 }
}

/**
 * A build's odds on the engine. The blow-up chance is today's, moved by what the engine's terms did to the odds that it works (the
 * difference of two quotes, so it is exactly 0 at the default actor) and by the engine's explosion risk when the plan is bold, then cut to
 * the legacy bounds. The quality range is today's centre, lifted by what the quote says, with the quote's spread. Pure; draws nothing.
 */
export function buildNumbers(g: GameState, f: BuildFacts, def: Pick<IdeaDef, 'cat' | 'd'>, a: ApproachCalib): BuildNumbers {
  const { kaboom, center } = calib(f, def, a)
  const gf = f.genius ? GENIUS_KABOOM : 1
  const task = buildTask(def, a)
  const input = buildInputs(f, def, a)
  const q = quote(g, task, input)
  const shift = q.p - quote(g, task, flat(input)).p
  const floor = KABOOM_FLOOR * gf
  const top = KABOOM_CAP * gf
  const chance = Math.max(floor, Math.min(top, kaboom - shift + q.risk.explosion))
  const mid = center + (q.quality ?? 0)
  return { kaboom: chance, low: mid - q.spread / 2, high: mid + q.spread / 2, spread: q.spread, q }
}

/** The labelled lines of a build's odds: the calibration's (skill, difficulty) then the engine's (know-how, tired, bold). Pure. */
export function buildReasons(g: GameState, f: BuildFacts, def: Pick<IdeaDef, 'cat' | 'd'>, a: ApproachCalib): readonly Reason[] {
  return quote(g, buildTask(def, a), buildInputs(f, def, a, true)).reasons
}

/** The Task of a brainstorm: one try at an idea. It has no price, no quality and no budget, and no result banks know-how. */
export function brainstormTask(): Task {
  return defineTask({ field: 'workshop.brainstorm', mode: 'project', cost: 1, kmax: 1, p0: 0.2, oddsLo: 0.1, oddsHi: 0.95, baseYears: 1, minYears: 1, maxYears: 1 })
}

/**
 * The chance a brainstorm gives an idea, to two decimals. Today's formula is the base; what the engine's terms did to it (tiredness, a
 * bold plan) is added, and the answer is cut to 10% to 95% as before. Exactly today's number at the default actor. Pure.
 */
export function brainstormChance(g: GameState, f: Pick<BuildFacts, 'skill' | 'smarts' | 'genius'>): number {
  const base = Math.max(0.1, Math.min(0.95, 0.2 + f.smarts / 250 + (f.genius ? 0.35 : 0) + f.skill / 500))
  const task = brainstormTask()
  const input: EffortInput = { who: 'you', base }
  const shift = quote(g, task, input).p - quote(g, task, flat(input)).p
  return Math.round(Math.max(0.1, Math.min(0.95, base + shift)) * 100) / 100
}
