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
// R3-M9 adds the bench: lab access (`tools`, 0 to 1) and a hired assistant (`helper`, 0 to 1 of its skill) are plain numbers on the facts.
// They are bounded terms of their own and name themselves in the lines: tools add at most 5 points to the centre of the quality and cut
// the blow-up chance to 85% of itself, an assistant adds at most 3 and cuts it to 92%. At 0 each is exactly nothing (a factor of 1 and a
// point of 0), so the default maker's numbers are still v5.0.0's bit for bit. Reading who has tools or an assistant is bench.ts.
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

/** The most points of quality that lab access (school or company) adds to the centre of a build, at full access. */
export const WORKSHOP_TOOLS_MAX = 5
/** The most points an assistant adds to the centre, at full skill. */
export const HELPER_CENTRE_MAX = 3
/** At full access the blow-up chance is this share of itself; with a full-skill assistant it is this share again. */
const TOOLS_KABOOM = 0.85
const HELPER_KABOOM = 0.92

/**
 * The numbers of the maker a build reads, as build.ts gathers them. `skill` is the effective inventing skill. `tools` is lab access, 0 to 1,
 * and `helper` the assistant's skill as a share, 0 to 1; both are optional and read as none when left out (a bad number reads as none, a
 * big one as the most).
 */
export interface BuildFacts {
  skill: number
  smarts: number
  genius: boolean
  builds: number
  tools?: number
  helper?: number
}

/** A share of the bench's help: 0 to 1, and 0 for anything that is not a number. */
const share = (v: unknown): number => (typeof v === 'number' && !Number.isNaN(v) ? Math.max(0, Math.min(1, v)) : 0)

/**
 * What a build's odds come to, in the Workshop's own terms. `kaboom` is not rounded; `pre` is the same chance before the bench (lab access
 * and the assistant cut it by a share, so `kaboom` is never under 78% of `pre` except at the floor); `q` is the engine's quote, for its reasons.
 */
export interface BuildNumbers {
  kaboom: number
  pre: number
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

/**
 * Today's blow-up chance (unrounded) and centre of the quality range, for a maker, an idea and an approach: build.ts's formulas verbatim,
 * then the bench. `plain` is the blow-up chance before the bench and `toolsX` and `helperX` the shares of a chance that lab access and the
 * assistant leave (both exactly 1 with none). The centre carries the bench's quality.
 */
function calib(f: BuildFacts, def: Pick<IdeaDef, 'd'>, a: ApproachCalib): { plain: number; toolsX: number; helperX: number; center: number } {
  const t = share(f.tools)
  const h = share(f.helper)
  const plain = Math.max(KABOOM_FLOOR, Math.min(KABOOM_CAP, a.kaboom + (def.d - 1) * 0.03 - f.skill * 0.0008)) * (f.genius ? GENIUS_KABOOM : 1)
  const toolsX = 1 - (1 - TOOLS_KABOOM) * t
  const helperX = 1 - (1 - HELPER_KABOOM) * h
  const center = 18 + f.skill * 0.55 + f.smarts * 0.15 + (f.genius ? 20 : 0) - (def.d - 1) * 10 + Math.min(9, f.builds * 3) + a.shift + WORKSHOP_TOOLS_MAX * t + HELPER_CENTRE_MAX * h
  return { plain, toolsX, helperX, center }
}

/**
 * The lines the calibration itself is made of, as labelled terms of the odds that the build works (`1 - kaboom`): what difficulty costs
 * and the maker's skill, talent and the floor together. They add up to `base - p0` so a why line can name them; the bench's lines (lab
 * access, an assistant) and then the engine's own (know-how, tired, bold) come after. A line of 0 is left out.
 */
function baseTerms(f: BuildFacts, def: Pick<IdeaDef, 'd'>, a: ApproachCalib, plain: number): Reason[] {
  const gf = f.genius ? GENIUS_KABOOM : 1
  const hard = -(def.d - 1) * 3 * gf
  const rest = (a.kaboom - plain) * 100 - hard
  const out: Reason[] = []
  if (Math.abs(rest) > 1e-9) out.push({ key: 'team', label: 'your skill', pts: rest })
  if (hard !== 0) out.push({ key: 'hard', label: 'hard build', pts: hard })
  return out
}

/**
 * The engine's input for a build: the player's own state (`who: 'you'` fills ambition, the posture in force, fatigue and the category's
 * know-how), today's works-odds before the bench as the base, and a quality that starts at 0 (the engine adds only what know-how lifts).
 * `terms` also passes the labelled lines of the calibration followed by `bench` (the lab access and assistant lines), for `buildWhy`.
 */
export function buildInputs(f: BuildFacts, def: Pick<IdeaDef, 'd'>, a: ApproachCalib, terms = false, bench: readonly Reason[] = []): EffortInput {
  const { plain } = calib(f, def, a)
  return { who: 'you', base: 1 - plain, quality0: 0, ...(terms ? { baseTerms: [...baseTerms(f, def, a, plain), ...bench] } : {}) }
}

/** The same input with the actor at the default, so the difference between two quotes is exactly what the maker's own state adds. */
const flat = (i: EffortInput): EffortInput => {
  const { who: _who, ...rest } = i
  return { ...rest, ambition: 50, posture: 'steady', fatigue: 0, knowledge: 0 }
}

/**
 * A build's odds on the engine. The blow-up chance is today's, moved by what the engine's terms did to the odds that it works (the
 * difference of two quotes, so it is exactly 0 at the default actor) and by the engine's explosion risk when the plan is bold, cut to
 * the legacy bounds; then lab access and an assistant cut that chance by their shares (85% and 92% at most) and it is cut to the bounds
 * again. The quality range is today's centre with the bench's points, lifted by what the quote says, with the quote's spread. Pure.
 */
export function buildNumbers(g: GameState, f: BuildFacts, def: Pick<IdeaDef, 'cat' | 'd'>, a: ApproachCalib): BuildNumbers {
  const { plain, toolsX, helperX, center } = calib(f, def, a)
  const gf = f.genius ? GENIUS_KABOOM : 1
  const task = buildTask(def, a)
  const input = buildInputs(f, def, a)
  const q = quote(g, task, input)
  const shift = q.p - quote(g, task, flat(input)).p
  const floor = KABOOM_FLOOR * gf
  const top = KABOOM_CAP * gf
  const pre = Math.max(floor, Math.min(top, plain - shift + q.risk.explosion))
  const chance = Math.max(floor, Math.min(top, pre * toolsX * helperX))
  const mid = center + (q.quality ?? 0)
  return { kaboom: chance, pre, low: mid - q.spread / 2, high: mid + q.spread / 2, spread: q.spread, q }
}

/** The bench's lines, in odds points of the build working: what lab access and an assistant took off the blow-up chance. A line of 0 is left out. */
function benchLines(f: BuildFacts, def: Pick<IdeaDef, 'd'>, a: ApproachCalib, n: BuildNumbers): Reason[] {
  const { toolsX, helperX } = calib(f, def, a)
  const toolsPts = n.pre * (1 - toolsX) * 100
  const helperPts = n.pre * toolsX * (1 - helperX) * 100
  const out: Reason[] = []
  if (toolsPts > 1e-9) out.push({ key: 'tools', label: 'lab access', pts: toolsPts })
  if (helperPts > 1e-9) out.push({ key: 'crew', label: 'bench assistant', pts: helperPts })
  return out
}

/** The engine's quote with every labelled line of a build (the calibration's, the bench's, the engine's) and the numbers it came to. */
function lined(g: GameState, f: BuildFacts, def: Pick<IdeaDef, 'cat' | 'd'>, a: ApproachCalib): { n: BuildNumbers; q: Quote } {
  const n = buildNumbers(g, f, def, a)
  return { n, q: quote(g, buildTask(def, a), buildInputs(f, def, a, true, benchLines(f, def, a, n))) }
}

/** The labelled lines of a build's odds: the calibration's (skill, difficulty), the bench's (lab access, assistant), then the engine's (know-how, tired, bold). Pure. */
export function buildReasons(g: GameState, f: BuildFacts, def: Pick<IdeaDef, 'cat' | 'd'>, a: ApproachCalib): readonly Reason[] {
  return lined(g, f, def, a).q.reasons
}

/**
 * A build's quote as a menu shows it: the lines of the calibration, the bench and the engine, and the odds that the build works as it is
 * rolled (`1 - kaboom`, the blow-up chance after every term and the floor). `whyNodes` and `oddsLine` print it. Pure; draws nothing.
 */
export function buildLineQuote(g: GameState, f: BuildFacts, def: Pick<IdeaDef, 'cat' | 'd'>, a: ApproachCalib): Quote {
  const { n, q } = lined(g, f, def, a)
  return { ...q, p: 1 - n.kaboom }
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
