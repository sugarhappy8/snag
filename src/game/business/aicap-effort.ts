// The AI capability tracks on the Effort engine (R3-M6, C.3): the task of a capability research track, and the research level as a
// 0 to 100 view. A track is a deep-tech program (deeptech-effort.ts put its terms and its roll on `quote`), so it already banks and uses
// know-how in its own field (`dt.aiLab.cap.<cap>`, a lost track teaches that capability and no other), pays the frontier's public
// research and rival pressure of `ai.<cap>`, and shows its why in the budget slider. What this file adds is the track's own calibration,
// in one place the data file reads:
//
//   capTask        the calibration of a track at a level: odds .65 flat, two years, a yearly price of 3M x 1.4^level, a budget of
//                  .5 to 3 times the plan, a neutral field (hardness 1). The level costs money and lifts every model the lab trains
//                  (modelRating's `research` term), and it does not move the odds: they stay exact at every level.
//   capKnowledge   the research level as 0 to 100 (5 a level, 100 at the 20 where the track is `Fully researched.`). A view for the
//                  Knowledge screens, and never an input of the odds: the level already acts through the rating, so counting it
//                  as know-how would boost the same thing twice (the lab's level in Operations R&D is read the same way, M4).
//
// The task is the same calibration as the program task of the same facts (`programTask`), so the lab's funding quote and this task
// are one: `capProgram` reads its price and odds from here, the funding quote reads them back through `def.cost` and `def.odds`.
// Nothing here draws a number or books a dollar. A leaf of the business import graph (adapter rule): numbers and plain records in,
// a Task out; a module-level const is a literal (rule (d) of the layer ratchet).
import type { Task } from '../effort/types'
import type { CapId } from './ai-bench-data'
import { programField, programTask, type ProgramFacts } from './deeptech-effort'
import type { TechState } from './deeptech-state'

/** The research level at which a capability is `Fully researched.` and no track can be started. */
export const CAP_LEVEL_MAX = 20

/** A level as a number the curve can take: a number that is not a number is level 0, a level past the last is the last. */
function levelOf(level: number): number {
  if (typeof level !== 'number' || Number.isNaN(level) || level < 0) return 0
  return level > CAP_LEVEL_MAX ? CAP_LEVEL_MAX : level
}

/** The yearly price of the next track at a level, in US dollars at the plan's own budget: 3M, 1.4 times dearer for each level done. */
export function capCost(level: number): number {
  return 3_000_000 * 1.4 ** levelOf(level)
}

/** What a capability track is, as the engine needs it: its know-how field, its yearly price at `level`, its two years, its odds. */
export function capFacts(cap: CapId, level: number): ProgramFacts {
  return { field: programField('aiLab', cap), cost: capCost(level), years: 2, odds: 0.65 }
}

/** The task of the next track in a capability, at the lab's research `level` in it (US dollars; the lab's own scale is the caller's). */
export function capTask(cap: CapId, level: number): Task {
  return programTask(capFacts(cap, level))
}

/** The research level in a capability as 0 to 100: 5 points a level, 100 when it is fully researched. A view, never an input of the odds. */
export function capKnowledge(t: Pick<TechState, 'caps'>, cap: CapId): number {
  return Math.round((100 * levelOf(t.caps[cap] ?? 0)) / CAP_LEVEL_MAX)
}
