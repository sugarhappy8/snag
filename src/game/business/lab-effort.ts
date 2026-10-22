// Operations R&D on the Effort engine (R3-M4, C.3): the pure part. A program is one kind of work for `quote` (effort/engine.ts) with a
// fixed budget: `kmax` 1, so money buys nothing here and the price (lab-rules.ts opsPrice, fixed per trade and rung) is the whole
// lever. Its odds, years and price are today's numbers, calibrated into a Task, so at the default actor (ambition 50, steady, no
// fatigue, no banked know-how) the engine gives back exactly what lab-rules.ts used to work out by itself.
//
//   opsField         the know-how key of a track ('ops.cost', 'ops.yield', 'ops.quality'): a failed program banks know-how under it,
//                    so the next try on that track is likelier (at most 15 points in all) and no other track's is
//   opsOddsBase      the odds a program works at before anything the engine adds: 90% of a normal launch's chance, plus the tier's
//                    ease, less the rung's difficulty, between 15% and 92%
//   opsTaskOf        the Task: that base, the trade's usual project time stretched by the rung (1 to 4 years), a budget of one
//   opsTerms         the labelled lines that say what the base is made of (skill, the research team), in odds points
//   opsKnowledge     a 0 to 100 view of how far a track's lab level has come: a read for the Knowledge screens, never an input
//
// The lab level already acts on the track's effect (lab-state.ts opsEffectsOf), so it is not know-how: the quote's knowledge is the
// banked know-how only, which keeps the odds exact at default after any number of wins ("LabLevel becomes K" as a view, not a second
// boost).
//
// A leaf of the business import graph (rule 1 of the adapter rule): it takes numbers and plain records and imports only util, the
// lab's data and state (neither is in the 59-module cycle), the research seam (itself a leaf) and the engine's Task builder. What
// needs a member of the cycle (the manager's skill, the quality staff, the trade's project time, the price) is read by the caller in
// lab-rules.ts and handed in. A module-level const here is a literal (rule (d)).
import { defineTask } from '../effort/task'
import type { Reason, Task } from '../effort/types'
import { LAB_LEVEL_MAX, OPS_TIER, RUNG_PENALTY, RUNG_YEARS, type LabTier } from './lab-data'
import { levelOf, readLab, type LabTrack } from './lab-state'
import { launchSkill, launchTeam, type ResearchSnap } from './research-effort'
import type { BizState } from './state'
import { clampN } from './util'

/** A program works at this share of a normal launch's chance, plus the tier's ease, less the rung's difficulty... */
export const OPS_LAUNCH_X = 0.9
/** ...kept between these two bounds, whatever the engine's terms add... */
export const OPS_ODDS_MIN = 0.15
export const OPS_ODDS_MAX = 0.92
/** ...and takes the trade's usual project time times the rung's, from this many booked years to that many. */
export const OPS_YEARS_MIN = 1
export const OPS_YEARS_MAX = 4
/** The nominal price the engine's task is built on when nothing can price a program (only `spend` reads it; odds and years never do). */
export const OPS_NOMINAL_COST = 1

/** The most characters of a track name that go into its know-how key ('ops.' and these). */
const TRACK_MAX = 12

/**
 * The know-how key of a track: 'ops.cost', 'ops.yield', 'ops.quality'. Anything that is not a track name, or has no letter in it, is
 * the lab-wide key 'ops' (it has no banked know-how, so a quote asked for no track reads none).
 */
export function opsField(track: unknown): string {
  const stem = typeof track === 'string' ? track.replace(/[^A-Za-z0-9]+/g, '').slice(0, TRACK_MAX) : ''
  return stem === '' ? 'ops' : `ops.${stem}`
}

/** The odds a program works at, before anything the engine adds: `launch` is a normal launch's chance (rd.ts launchP). */
export function opsOddsBase(launch: number, tier: LabTier | null, rung: 1 | 2 | 3): number {
  return clampN(OPS_LAUNCH_X * launch + (tier ? OPS_TIER[tier].odds : 0) - RUNG_PENALTY[rung - 1], OPS_ODDS_MIN, OPS_ODDS_MAX)
}

/** What a company brings to one program, read by lab-rules.ts (the cycle members) and handed in as numbers. */
export interface OpsSpec {
  /** The track it works on; absent: the lab-wide key. */
  track?: LabTrack
  rung: 1 | 2 | 3
  /** The trade's tier, or null for a trade with no Operations R&D. */
  tier: LabTier | null
  /** What it costs, internal dollars: the fixed price, or the nominal one when nothing can price it. */
  cost: number
  /** Years a normal project takes in this trade (rd.ts baseYears). */
  baseYears: number
  /** The odds a normal launch works at (rd.ts launchP). */
  launch: number
}

/**
 * The Task of one program. Built inside a function (a module-level `defineTask` would read an import while the module loads). Budget
 * fixed at 1; odds between 15% and 92% whatever the engine's terms add; years 1 to 4; no quality curve (a program changes a track's
 * channel, not a line's quality).
 */
export function opsTaskOf(s: OpsSpec): Task {
  return defineTask({
    field: opsField(s.track),
    mode: 'project',
    cost: s.cost > 0 && Number.isFinite(s.cost) ? s.cost : OPS_NOMINAL_COST,
    p0: opsOddsBase(s.launch, s.tier, s.rung),
    baseYears: s.baseYears * RUNG_YEARS[s.rung - 1],
    minYears: OPS_YEARS_MIN,
    maxYears: OPS_YEARS_MAX,
    kmax: 1,
    oddsLo: OPS_ODDS_MIN,
    oddsHi: OPS_ODDS_MAX,
  })
}

/** A line in whole odds points; null for one that rounds to nothing. */
function line(key: Reason['key'], label: string, pts: number): Reason | null {
  const whole = Math.round(pts)
  return whole === 0 ? null : { key, label, pts: whole }
}

/**
 * The lines that say what the base is made of, in odds points (a deviation from an average company: a manager of 50, a quality of 50,
 * no staff and no team): the skill of whoever runs it with the company's quality and its quality staff, and the research team. Both
 * scale with the program's 90%, so they are the points this company's people add to a program, not to a normal launch. They are
 * passed to the engine as `baseTerms`: shown, never added a second time (the base already holds them).
 */
export function opsTerms(s: ResearchSnap): Reason[] {
  const average = launchSkill({ ...s, skill: 50, quality: 50, qualityStaff: 0 })
  const out: Reason[] = []
  const skill = line('crew', 'skill', 100 * OPS_LAUNCH_X * (launchSkill(s) - average))
  const team = line('team', 'team', 100 * OPS_LAUNCH_X * launchTeam(s.scientists))
  if (skill !== null) out.push(skill)
  if (team !== null) out.push(team)
  return out
}

/**
 * How far a track's lab level has come, 0 to 100: `round(100 * level / LAB_LEVEL_MAX)`. 0 for a fresh lab, rising with each win (the
 * learning curve, lab-state.ts winLevel). With `year` the level is the one that year reads (it fades 5% a year after a win); without,
 * the level as the last win set it. A view for the Knowledge screens: the quote never reads it (the level already acts on the track).
 */
export function opsKnowledge(b: Pick<BizState, 'lab'>, track: LabTrack, year?: number): number {
  const st = readLab(b)
  const at = year !== undefined && Number.isFinite(year) ? year : st.levels[track].at
  return Math.round((100 * levelOf(st, track, at)) / LAB_LEVEL_MAX)
}
