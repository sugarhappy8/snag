// Reconciliation (R4-E11 part B, D.4, X27, C39): the society side of the peace odds of a relative who is cut out or estranged.
//
// `reconcileOdds(g, p)` is `clamp(0.0015 x max(0, o), 0, 0.15)`, with `o` the obligation of the edge person > player: what a brokered peace
// raises (favor.ts `broker`, 20 a time), and what the mirror of a debt the person owes the player raises. So it is:
//   - 0 on a life that is not stamped, whatever the world holds;
//   - 0 for a pair with no edge, no obligation, or an obligation owed the other way (o of 0 or less);
//   - 0.0015 for each point of obligation and 0.15 at o 100, the most it adds, for any o: a hostile or non-numeric o reads as 0, a huge one
//     is held at 0.15 (the 100 x probe: the obligation is a number of -100 to 100 and this is a clamp of a clamp).
// It is an ADDITION to the peace odds, not a replacement, and it does not repeat the memory term (E8 already put what the person remembers
// inside `peaceOdds`, events/will-core.ts, through `memoryOdds`). events/will-amends.ts adds the two when the life is stamped:
// `clamp(peaceOdds(g, p) + reconcileOdds(g, p), 0.05, 0.85)`, and takes `peaceOdds` alone when this is 0, so a stamped pair with no obligation
// rolls exactly as it did (the stamped replay of test/will-parity.test.ts stays equal). E12's `Make peace` row of a pair the will does not own
// uses it with `memoryOdds(g, p, 'peace')`.
//
// The signature takes `Pick<GameState, 'world' | 'character'>` and not `'world'` alone as section 3.1 says: the edge person > player needs the
// player's ref, which is `person:<character id>`, so the character is part of what it reads (E8's `memoryOdds` does the same). So it is
// pure, reads the world and the character only, and can't call the will's `peaceOdds` (that needs the whole state, and a `society->events`
// import is a pair of domains the lead has not approved, X26).
//
// Layer 3 (society). It reads world/ only. Other domains reach it through society/contract.ts (C39).
import { personEntity } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import { readEdge } from '../world/edges'
import { playerRef } from '../world/people'
import { socialOn } from '../world/social'

/** The odds one point of obligation adds, and the most reconciliation adds in all (the numbers of the broker, favor.ts). */
export const RECONCILE_PER_POINT = 0.0015
export const RECONCILE_MAX = 0.15

/** What the society side adds to the odds of making peace with `p`: 0 to 0.15 (see the header). Pure and total. */
export function reconcileOdds(g: Pick<GameState, 'world' | 'character'>, p: Person): number {
  if (!socialOn(g)) return 0
  const e = readEdge(g, personEntity(p), playerRef(g as GameState))
  if (e === null) return 0
  const o: unknown = e.o
  if (typeof o !== 'number' || !(o > 0)) return 0
  const odds = RECONCILE_PER_POINT * o
  return odds < RECONCILE_MAX ? odds : RECONCILE_MAX
}
