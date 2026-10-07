// Notifications for low-level code that removes assets (debt seizure, repossession, divorce) so
// higher-level modules can react without being imported here (that would create import cycles).
// business/conglomerate-state.ts registers itself to wind up a group that lost a member.
import type { Asset, GameState } from './types'

type BusinessGone = (g: GameState, a: Asset) => void

const businessGoneHooks: BusinessGone[] = []

/** Run `fn` whenever a company leaves the player's hands outside the business screens. */
export function onBusinessGone(fn: BusinessGone): void {
  if (!businessGoneHooks.includes(fn)) businessGoneHooks.push(fn)
}

/** Call after removing a kind 'business' asset from g.assets (no-op for other kinds). */
export function businessGone(g: GameState, a: Asset): void {
  if (a.kind !== 'business') return
  for (const fn of businessGoneHooks) fn(g, a)
}
