// Reconciliation (R4-E11 part B): the society side of the peace odds of a relative who is cut out or estranged. NOT WRITTEN YET.
//
// What part B writes here (the spec is in docs/superpowers/plans/2026-10-26-r4-v5.3.0/edges-acts.md, "R4-E11", and test/social-reconcile.test.ts
// is the red test that pins it): `reconcileOdds(g, p)` is `clamp(0.0015 x max(0, o), 0, 0.15)`, with `o` the obligation of the edge
// person > player (what a brokered peace raises, favor.ts `broker`, and what the mirror of a debt the person owes the player raises). It is
// 0 on a life that is not stamped and for a pair with no obligation, it never repeats the memory term (E8 put that inside `peaceOdds`),
// and it is added in `events/will-amends.ts` as `clamp(peaceOdds(g, p) + reconcileOdds(g, p), 0.05, 0.85)` when the life is stamped.
//
// The signature takes `Pick<GameState, 'world' | 'character'>` and not `'world'` alone as the section 3.1 text says: the edge person > player
// needs the player's ref, which is `person:<character id>`, so the character is part of what it reads (E8's `memoryOdds` does the same).
//
// Layer 3 (society). It reads world/ only and is pure.
import type { GameState, Person } from '../types'

/** The odds one point of obligation adds, and the most reconciliation adds in all (the numbers of the broker, favor.ts). */
export const RECONCILE_PER_POINT = 0.0015
export const RECONCILE_MAX = 0.15

/** Part B writes this. Until then it answers 0 for every pair. */
export function reconcileOdds(_g: Pick<GameState, 'world' | 'character'>, _p: Person): number {
  return 0
}
