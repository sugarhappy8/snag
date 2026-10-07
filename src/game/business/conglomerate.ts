// Conglomerates: merge two or more of your companies into one group with a shared board, a group
// CEO, pooled cash, synergies and one stock listing.
//
// CONTRACT STUB (lead): the conglomerates/boards builder implements this file. Signatures are
// fixed; business.ts and yearly.ts already call them.
import type { GameState, MenuNode } from '../types'

/** Rows for Business / Assets › Businesses: your groups and "Merge Companies". [] when n/a. */
export function conglomerateNodes(_g: GameState): MenuNode[] {
  return []
}

/** Yearly group step after every member company's year is booked (synergies, pooling, board). */
export function yearlyConglomerates(_g: GameState): void {}
