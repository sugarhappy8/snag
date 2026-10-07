// The board of directors. A company has a board once anyone else owns part of it (investors,
// public shareholders) or it belongs to a conglomerate. The board keeps whoever is CEO (the player
// or a hired manager) in check: big decisions need its approval, it sets the manager's mandate,
// reviews performance every year and can fire the CEO.
//
// CONTRACT STUB (lead): the conglomerates/boards builder implements this file. Signatures are
// fixed; manage.ts, business.ts and yearly.ts already call them.
import type { Asset, GameState, MenuNode } from '../types'
import type { BizState, Statement } from './state'

/** True when this company has a board that can say no (outside owners, listed, or in a group). */
export function hasBoard(_g: GameState, _b: BizState): boolean {
  return false
}

/** The Leadership › Board rows on a company's screen (members, votes, mandate). [] when none. */
export function boardNodes(_g: GameState, _a: Asset): MenuNode[] {
  return []
}

/** Yearly board review after the books close (performance, CEO pay, firing, mandates). */
export function boardYear(_g: GameState, _a: Asset, _b: BizState, _s: Statement): void {}
