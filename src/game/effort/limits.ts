// Every number that bounds the effort engine (R3, C.1), in one place. A ceiling is a constant someone can change here, with a test
// that names it (test/effort-task.test.ts holds the table, test/ceiling-list.json the 100x probes). The values are documented in
// docs/EFFORT.md (R3-E10).
//
// This file is a leaf: it imports types only. Rule (d) of the layer ratchet flags a module-level `const` that reads an import, so
// a value derived from another constant is computed inside a function, in the file that needs it, never here.
import type { Posture, TermKey } from './types'

// --- Budget ---------------------------------------------------------------------------------------------------------------------
/** The least and the most budget multiple (money relative to the task's normal cost). More than 4 times buys nothing more. */
export const K_MIN = 0.01
export const K_MAX = 4

// --- Know-how -------------------------------------------------------------------------------------------------------------------
/** Know-how in one field is 0 to 100. */
export const KNOW_MAX = 100
/** A map holds at most this many fields. */
export const KNOW_HOW_FIELDS = 40
/** A value under this is not worth a key: it is dropped on read, learn and fade. */
export const KNOW_FLOOR = 0.5
/** An idle field keeps this much of its know-how each year. */
export const KNOW_FADE = 0.95
/** A failed project banks this share of how far it got, as know-how points per 100. */
export const KNOW_BANK = 0.35
/** Know-how never adds more than this many odds points, however a failure piles up (the R3 decision: at most 15). */
export const KNOW_ODDS_MAX = 15

// --- Odds terms, in points ------------------------------------------------------------------------------------------------------
/** One disclosure of research adds at most this many points to the public pool. */
export const SPILL_PTS_MAX = 6
/** The most odds points a quote takes from public research (the pool). */
export const SPILL_TERM_MAX = 18
export const TOOLS_PTS = 6
/** Odds points a field costs per step of hardness above 1 (and gives per step below). */
export const HARD_PTS = 30
export const TIRED_PTS = 40
export const RIVAL_PTS = 8
export const CREW_PTS_MAX = 12

// --- Speed and ambition ---------------------------------------------------------------------------------------------------------
/** The pace factor from ambition: 1 at ambition 50 and steady, at most 1.25 at ambition 100 and pushing. */
export const RHO_MIN = 0.85
export const RHO_MAX = 1.25
/** How much a posture scales the ambition term. */
export const POSTURE_FACTOR: Readonly<Record<Posture, number>> = Object.freeze({ lean: 0.6, steady: 1, push: 1.3 })
/** Fatigue a year of each posture adds (lean rests). */
export const POSTURE_STRAIN: Readonly<Record<Posture, number>> = Object.freeze({ lean: -4, steady: 0, push: 10 })
/** Payroll while pushing: 15% overtime. */
export const OVERTIME_PAY = 1.15
/** Fatigue under the knee costs no speed; above it each point costs FATIGUE_SLOPE of it. */
export const FATIGUE_KNEE = 35
export const FATIGUE_SLOPE = 0.004
/** At this fatigue the body gives out: a burnout. */
export const BURNOUT_F = 85
/** The most full-time people one task can use. */
export const FTE_CAP_MAX = 40
/** The most any one risk of a bold plan is reported at. */
export const RISK_MAX = 0.08

// --- The player's record --------------------------------------------------------------------------------------------------------
/** Ambition drifts with results within plus or minus this many points. */
export const SHIFT_MAX = 12
export const WIN_SHIFT = 0.4
export const BURNOUT_SHIFT = -1
/** Centres a mean life (willpower 55, discipline 55) on ambition 50. */
export const AMBITION_BASE = 6
/** Ambition shows from this age. */
export const AGE_REVEAL = 18

// --- Focus weeks ----------------------------------------------------------------------------------------------------------------
/** The pool of focus weeks a year. */
export const FOCUS_WEEKS = 12
/** Weeks past the pool that still work, each at a cost in fatigue. */
export const FOCUS_OVERTIME_MAX = 12
/** Fatigue a week of overtime adds. */
export const OVERTIME_STRAIN = 1.5

// --- Words ----------------------------------------------------------------------------------------------------------------------
/** The label of each term in the odds line ("Odds 62%: team +9, funding +7, hard field -12, tired -4"). Plain words, no dash. */
export const TERM_LABEL: Readonly<Record<TermKey, string>> = Object.freeze({
  team: 'team',
  funding: 'funding',
  crew: 'crew',
  tools: 'tools',
  know: 'know-how',
  hard: 'hard field',
  rival: 'rival pressure',
  spill: 'public research',
  bold: 'bold plan',
  tired: 'tired',
  ceo: 'steady CEO',
})
/** The label of the `hard` term when it is positive (a field easier than most). */
export const EASY_FIELD_LABEL = 'easy field'
