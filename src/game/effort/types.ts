// The shapes of the effort engine (R3, C.1). Types only: the builders live in task.ts, the constants in limits.ts, the curves in
// curves.ts, `quote` in engine.ts and `step` in step.ts. Every other lane codes against this file, so a name here is a contract.
//
// The engine turns what a player or a company puts into a piece of work (money, a crew, tools, know-how, a posture) into odds,
// years and quality, and says why in labelled lines. It draws no random number and books no dollar: the caller draws one number
// and passes it to `resolve`, and the caller pays through the ledger.

/** What the work is: a project with a result, practice, study, or gathering intelligence. */
export type EffortMode = 'project' | 'practice' | 'study' | 'intel'
/** How hard the player pushes. Lean eases off, push buys speed and costs fatigue. */
export type Posture = 'lean' | 'steady' | 'push'
/** How a piece of work came out. */
export type OutcomeKind = 'fail' | 'partial' | 'works' | 'hit'
/** Why a failure failed, read from the quote's reasons (a pure function of them). */
export type CauseKind = 'deadEnd' | 'starved' | 'churn' | 'shortcut' | 'rival' | 'tired'
/** One labelled term of the odds. `ceo` is the steady hired CEO, passed in by the caller as a base term. */
export type TermKey = 'team' | 'funding' | 'crew' | 'tools' | 'know' | 'hard' | 'rival' | 'spill' | 'bold' | 'tired' | 'ceo'

/**
 * How money buys quality: `up * (1 - k^-exp)` from k = 1, `down * log2(k)` below it (the shape of the product budget curve).
 * The raw number is clamped to `lo..hi` and then bent under `ceiling` with `room` points of cushion. `room` 0 is a hard clamp.
 */
export interface QualityCurve {
  up: number
  down: number
  exp: number
  ceiling: number
  room: number
  lo: number
  hi: number
}

/**
 * A kind of work, calibrated to today's numbers. Built with `defineTask` (task.ts), which fills the defaults, checks the bounds
 * and freezes the result. All odds are in 0..1; years are whole years in `minYears..maxYears`.
 */
export interface Task {
  /** The know-how key: lower case first letter, then letters, digits and dots, at most 40 characters ('rd.beverage'). */
  field: string
  mode: EffortMode
  /** The normal cost of one run, in dollars. Never scales with how rich the company is: inputs buy odds and speed. */
  cost: number
  /** 0.5 (easy) to 2 (hard); 1 is neutral. */
  hardness: number
  /** Years at k = 1 and neutral speed. */
  baseYears: number
  minYears: number
  maxYears: number
  /** Most budget multiples this task takes (at most K_MAX). */
  kmax: number
  /** Odds at k = 1 before the other terms. */
  p0: number
  /** Odds: `1 - (1 - p0) * k^-oddsExp`. */
  oddsExp: number
  /** Years: `baseYears / (k^yearsExp * speed)`. */
  yearsExp: number
  oddsLo: number
  oddsHi: number
  /** Most full-time people the task can use (at most FTE_CAP_MAX); labor saturates at this. */
  fteCap: number
  /** The crew the calibration assumed, or null for no crew term. */
  refCrew: { fte: number; skill: number } | null
  /** Odds points a doubling of the crew's output adds (the crew term is capped at CREW_PTS_MAX). */
  crewPts: number
  /** How money buys quality, or null for a task with no quality. */
  quality: QualityCurve | null
  /** The chance a win is a hit, and the quality it adds, or null. */
  hit: { p: number; bonus: number } | null
  /** A result lands within this many quality points of the quote, either way. */
  spread: number
  /** The extra odds of a half result (a partial), 0 for none. */
  partial: number
  /** Know-how points a study or practice session adds (R6; no migrated project calls it). */
  learn: number
  /** Speed from know-how: the factor is `1 + knowYears * K / 100`, 0 to 0.15. Only the studio engine sets it. */
  knowYears: number
}

/** What a caller writes to build a Task: the three identity fields, and any of the rest. */
export type TaskSpec = Partial<Omit<Task, 'field' | 'mode' | 'cost'>> & Pick<Task, 'field' | 'mode' | 'cost'>

/** One person on the crew. `drive` is 0..100 (50 is neutral), `fatigue` 0..100 (0 is neutral). */
export interface Worker {
  fte: number
  skill: number
  morale: number
  drive?: number
  fatigue?: number
}

/** One labelled line of the odds, in odds points. */
export interface Reason {
  key: TermKey
  label: string
  pts: number
}

/** What a caller knows about the run. Every field is optional; the defaults are neutral (ambition 50, steady, fatigue 0, no crew). */
export interface EffortInput {
  /** 'you' reads the player's record for the fields left out. */
  who?: 'you'
  /** Budget multiple: money relative to the task's normal cost. */
  k?: number
  /** Odds before the engine's terms; the task's p0 when left out. */
  base?: number
  /** Labelled terms the caller has already worked out (team, a steady CEO), passed through to the reasons. */
  baseTerms?: readonly Reason[]
  quality0?: number
  people?: readonly Worker[]
  /** 0..1 */
  tools?: number
  /** Know-how in this field, 0..100. */
  knowledge?: number
  /** 0..100, 50 is neutral. */
  ambition?: number
  posture?: Posture
  /** 0..100 */
  fatigue?: number
  /** Odds points of rival pressure (at most RIVAL_PTS). */
  rival?: number
  /** Odds points of public research (at most SPILL_TERM_MAX). */
  spill?: number
}

/** What `quote` answers. Pure: the same input gives the same quote, and nothing in it came from a roll. */
export interface Quote {
  /** Odds the work works, 0..1. */
  p: number
  /** Odds a win is a hit. */
  hitP: number
  years: number
  yearsExact: number
  /** Expected quality if it works, or null. */
  quality: number | null
  spread: number
  /** The budget multiple after the bounds. */
  k: number
  /** Dollars the run costs: `k * cost`. Nothing about cash. */
  spend: number
  /** 1.15 when pushing (overtime), else 1. */
  payrollX: number
  /** The labelled lines; they sum to `round(p * 100) - round(base * 100)`. */
  reasons: Reason[]
  effort: { crew: number; tools: number; rho: number; phi: number; speed: number }
  /** Risks of a bold plan, reported and not rolled. */
  risk: { shortcut: number; explosion: number; scandal: number }
  burnout: boolean
  /** The ceilings that bound the answer ('k', 'fte', 'knowledge', 'quality', 'rho'). */
  capped: string[]
}

/** How a run came out, from the caller's single draw. */
export interface Outcome {
  kind: OutcomeKind
  /** `(p - u) * 100`: how far inside the odds the draw fell, negative on a failure. */
  margin: number
  cause: CauseKind | null
  /** How far the work got, 0..1. */
  done: number
}

/** The record a project or program keeps about its own effort. Nine numbers, each bounded. */
export interface Fx {
  v: 1
  progress: number
  quality: number
  spent: number
  hours: number
  setbacks: number
  insight: number
  fatigue: number
  /** The year of the last step, so a year is never booked twice. */
  last: number
}

/** A fact a run teaches: Knowledge turns it into a stored estimate. */
export interface Reveal {
  field: string
  strength: number
  kind: OutcomeKind
}

/** What `step` needs to book a result. */
export interface StepCtx {
  year: number
  who?: 'you'
  /** The company's know-how map, by reference (the player's lives in flags['effort.you']). */
  know?: Record<string, number>
  fx?: Fx
  k?: number
  weeks?: number
  quality?: number
}

/** What `step` did. A replay (the same year again) changes nothing. */
export interface StepResult {
  replay: boolean
  knowledge: number
  learned: number
  shift: number
  reveals: Reveal[]
}
