// Nepo babies: your kids (and other family) want jobs at your company. You decide: hire them,
// give them a real role or a made-up one, groom a successor or say no. Competence varies, staff
// notice, the board has opinions and the public has a word for it.
//
// CONTRACT STUB (lead): the nepo builder implements this file. Signatures are fixed:
// manage.ts businessView appends nepoNodes(g, a) after the Leadership rows, relationships.ts
// personActions appends nepoPersonNodes(g, p), and aging.ts YEARLY_HOOKS runs yearlyNepo
// after the wealth hook.
import type { Asset, GameState, MenuNode, Person } from '../types'

/** Company screen rows: "Family at the Company" (who works here, open a role, fire, promote). [] when n/a. */
export function nepoNodes(_g: GameState, _a: Asset): MenuNode[] {
  return []
}

/** Person screen rows for a relative: ask about a job, their role, their performance. [] when n/a. */
export function nepoPersonNodes(_g: GameState, _p: Person): MenuNode[] {
  return []
}

/** Yearly hook: kids ask for jobs, relatives at your companies perform, backlash and succession. */
export function yearlyNepo(_g: GameState): void {}
