// Conglomerates: merge two or more of your companies into one group with a shared board, a group
// CEO, a pooled treasury, synergies and one stock listing. Each division still runs as its own
// company (its own screen, market share, CEO and board, with the group's people on it).
//
// Modules: conglomerate-state.ts (the group record every member carries, ownership, values,
// leaving and dissolving), conglomerate-econ.ts (related industries, synergies, complexity, the
// conglomerate discount, fees, merger terms and deal values: pure), conglomerate-actions.ts (the
// player's moves and the group board), conglomerate-year.ts (the group's year), conglomerate-menu.ts
// (the screens), conglomerate-division.ts (a division's own rows). This file is the public API.
import type { GameState, MenuNode } from '../types'
import { groupNodes } from './conglomerate-menu'
import { yearlyGroups } from './conglomerate-year'

export { groupRescue } from './conglomerate-year'
export { divisionExitNodes, divisionLine, groupOfCompany } from './conglomerate-division'
export { addToGroup, formGroup, groupBlock, spinOff } from './conglomerate-actions'
export { groupById, groupsOf, inGroup, type Group } from './conglomerate-state'

/** Rows for Business / Assets › Businesses: your groups and "Form a Conglomerate". [] when n/a. */
export function conglomerateNodes(g: GameState): MenuNode[] {
  if (!g.character.alive) return []
  return groupNodes(g)
}

/** Yearly group step after every member company's year is booked (synergies, pooling, board). */
export function yearlyConglomerates(g: GameState): void {
  yearlyGroups(g)
}
