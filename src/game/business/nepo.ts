// Nepo babies: your kids (and other family) want jobs at your company. You decide: hire them,
// give them a real role or a made-up one, groom a successor or say no. Competence varies, staff
// notice, the board has opinions and the public has a word for it.
//
// Modules: nepo-job.ts (a relative's job, stored on the Person), nepo-roles.ts (ranks, titles, pay),
// nepo-model.ts (competence: pure), nepo-state.ts (per-company state in BizState.family and the
// lists), nepo-actions.ts (hire, promote, demote, pay, fire, make CEO, succession; board votes),
// nepo-asks.ts (the "can I work at the company?" popups), nepo-year.ts (pay, learning, morale, the
// press, arcs), nepo-menu.ts (company screen and person sheet), nepo-succession.ts (turning a
// relative into the CEO; career.syncCeo uses it), events/nepo-life.ts (connections for rich
// parents: an arranged summer job, an opening for the child of a famous parent).
//
// manage.ts businessView appends nepoNodes(g, a) after the Leadership rows, relationships.ts
// personActions appends nepoPersonNodes(g, p), and the yearly registry (modules/yearly-aging.ts) runs yearlyNepo after the
// wealth hook.
import { yearlyNepoLife } from '../events/nepo-life'
import type { Asset, GameState, MenuNode, Person } from '../types'
import { askRound } from './nepo-asks'
import { familyNodes, relativeNodes } from './nepo-menu'
import { familyYear } from './nepo-year'

export { holdsFamilyJob } from './nepo-job'
export { familyStaffLine } from './nepo-staff-line'

/** Company screen rows: "Family at the Company" (who works here, open a role, fire, promote). [] when n/a. */
export function nepoNodes(g: GameState, a: Asset): MenuNode[] {
  return familyNodes(g, a)
}

/** Person screen rows for a relative: ask about a job, their role, their performance. [] when n/a. */
export function nepoPersonNodes(g: GameState, p: Person): MenuNode[] {
  return relativeNodes(g, p)
}

/** Yearly hook: kids ask for jobs, relatives at your companies perform, backlash and succession. */
export function yearlyNepo(g: GameState): void {
  if (!g.character.alive) return
  familyYear(g)
  askRound(g)
  yearlyNepoLife(g)
}
