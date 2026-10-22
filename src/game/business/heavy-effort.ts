// Heavy R&D on the Effort engine (R3-M3, C.3): the pure part. A breakthrough is one kind of work for `quote` (effort/engine.ts) with
// a fixed budget: `kmax` 1, so money buys nothing here and the 8x price (heavy-rd.ts heavyCost) is the whole lever. Its odds,
// years and quality are today's numbers, calibrated into a Task, so at the default actor (ambition 50, steady, no fatigue, no
// know-how) the engine gives back exactly what heavy-rd.ts used to work out by itself.
//
//   heavyTaskOf   the Task: p0 is the odds of a normal launch scaled and clamped (heavyBase), the years are three times a normal
//                 project clamped to 4 to 6, the quality curve is flat (the lavish-budget quality arrives as the input's `quality0`)
//   heavyBase     55% of a normal launch's chance, between 8% and 60%
//   heavyField    the know-how key of one breakthrough ('heavy.RobotServerFleet'): a failed try banks know-how under it, so the next
//                 try of the same breakthrough is likelier and no other is
//   heavyTerms    the labelled lines that say what the base is made of (skill, the research team), in odds points
//
// A leaf of the business import graph (rule 1 of the adapter rule): it takes numbers and plain records and imports only util, the
// research seam (itself a leaf) and the engine's Task builder. What needs a member of the 59-module cycle (the CEO's skill, the
// quality staff, the price) is read by the caller in heavy-rd.ts and handed in. A module-level const here is a literal (rule (d)).
import { defineTask } from '../effort/task'
import type { Reason, Task } from '../effort/types'
import { launchSkill, launchTeam, type ResearchSnap } from './research-effort'
import { clampN } from './util'

/** A breakthrough takes this many times a normal project, but never under 4 or over 6 years... */
export const HEAVY_YEARS_X = 3
export const HEAVY_MIN_YEARS = 4
export const HEAVY_MAX_YEARS = 6
/** ...works at this share of a normal launch's chance, between these two bounds... */
export const HEAVY_ODDS_X = 0.55
export const HEAVY_ODDS_MIN = 0.08
export const HEAVY_ODDS_MAX = 0.6
/** ...aims this many points above a lavishly funded ordinary line (at most 97), a line funded at this many times a normal budget... */
export const HEAVY_QUALITY_PLUS = 14
export const HEAVY_QUALITY_MAX = 97
export const HEAVY_QUALITY_K = 2.5
/** ...and, when no classic idea can price it, the nominal price the engine's task is built on (only `spend` reads it; odds and years never do). */
export const HEAVY_NOMINAL_COST = 1

/** The most characters of a breakthrough's name that go into its know-how key (the key is 'heavy.' and these, at most 40 in all). */
const FIELD_NAME_MAX = 34

/**
 * The know-how key of a breakthrough: 'heavy.' and its name with everything but letters and digits taken out, cut to fit a field
 * key. The catalogue names are unique and no two of them agree on their first 34 letters and digits (a test holds it). Anything that
 * is not a name, or has no letter in it, is the trade-wide key 'heavy'.
 */
export function heavyField(name: unknown): string {
  const stem = typeof name === 'string' ? name.replace(/[^A-Za-z0-9]+/g, '').slice(0, FIELD_NAME_MAX) : ''
  return stem === '' ? 'heavy' : `heavy.${stem}`
}

/** The odds a breakthrough works at, before anything the engine adds: 55% of a normal launch's chance (`launch`), between 8% and 60%. */
export function heavyBase(launch: number): number {
  return clampN(HEAVY_ODDS_X * launch, HEAVY_ODDS_MIN, HEAVY_ODDS_MAX)
}

/** What a company brings to the task of building a breakthrough: read by heavy-rd.ts (the cycle members), handed in as numbers. */
export interface HeavySpec {
  /** The know-how key (`heavyField`). */
  field: string
  /** What it costs, internal dollars: the fixed 8x price, or the nominal one when nothing can price it. */
  cost: number
  /** Years a normal project takes in this trade (rd.ts baseYears). */
  baseYears: number
  /** The odds a normal launch works at (rd.ts launchP). */
  launch: number
}

/**
 * The Task of a breakthrough. Built inside a function (a module-level `defineTask` would read an import while the module loads).
 * Budget fixed at 1; odds clamped to 8% to 60% whatever the engine's terms add; years 4 to 6; quality a flat curve under 97, so the
 * company's quality terms (the input's `quality0`) land as they are and know-how adds its three points at most.
 */
export function heavyTaskOf(s: HeavySpec): Task {
  return defineTask({
    field: s.field,
    mode: 'project',
    cost: s.cost,
    p0: heavyBase(s.launch),
    baseYears: s.baseYears * HEAVY_YEARS_X,
    minYears: HEAVY_MIN_YEARS,
    maxYears: HEAVY_MAX_YEARS,
    kmax: 1,
    oddsLo: HEAVY_ODDS_MIN,
    oddsHi: HEAVY_ODDS_MAX,
    quality: { up: 0, down: 0, exp: 1, ceiling: HEAVY_QUALITY_MAX, room: 0, lo: 5, hi: HEAVY_QUALITY_MAX },
  })
}

/** A line in whole odds points; null for one that rounds to nothing. */
function line(key: Reason['key'], label: string, pts: number): Reason | null {
  const whole = Math.round(pts)
  return whole === 0 ? null : { key, label, pts: whole }
}

/**
 * The lines that say what the base is made of, in odds points (a deviation from an average company: a manager of 50, a quality of
 * 50, no staff and no team): the skill of whoever runs it with the company's quality and its quality staff, and the research team.
 * Both scale with the breakthrough's 55%, so they are the points this company's people add to a breakthrough, not to a normal launch.
 * They are passed to the engine as `baseTerms`: shown, never added a second time (the base already holds them).
 */
export function heavyTerms(s: ResearchSnap): Reason[] {
  const average = launchSkill({ ...s, skill: 50, quality: 50, qualityStaff: 0 })
  const out: Reason[] = []
  const skill = line('crew', 'skill', 100 * HEAVY_ODDS_X * (launchSkill(s) - average))
  const team = line('team', 'team', 100 * HEAVY_ODDS_X * launchTeam(s.scientists))
  if (skill !== null) out.push(skill)
  if (team !== null) out.push(team)
  return out
}
