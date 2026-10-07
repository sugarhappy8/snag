// Family use of your luxury things: with your permission your partner, kids and relatives wear
// the watch, drive the supercar, take the yacht out and show off (on social media where it
// exists in the era, at school, at the club), and it can go well or badly.
//
// CONTRACT STUB (lead): the luxury builder implements this file. Signatures are fixed:
// relationships.ts personActions already appends familyUseNodes(g, p) and aging.ts YEARLY_HOOKS
// already runs yearlyFamilyUse after the wealth hook.
import type { GameState, MenuNode, Person } from '../types'

/** Rows on a family member's screen: what they may use of yours, grant/revoke permission. [] when n/a. */
export function familyUseNodes(_g: GameState, _p: Person): MenuNode[] {
  return []
}

/** Yearly hook: the family uses what you allowed and shows off (events, wear and tear, envy). */
export function yearlyFamilyUse(_g: GameState): void {}
