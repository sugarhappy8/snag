// The two hooks that cross a track and a layer (R3, D8): what a finished piece of research reveals, and how much of the odds the
// player may see. Effort sits at layer 2 and merges first; Knowledge (what a reveal teaches) and Fog (what the odds line may
// show) merge later and live above it. Each binds its function here once, when its module loads, and the engine calls the hook.
// With nothing bound, a reveal goes nowhere and every term shows exactly, which is what the test suite (Exact mode) wants.
//
// They are NOT kernel ports (kernel/ports.ts): test/hub-entry.test.ts fails when a defined port is unbound after the real entry
// points, and these binders arrive after this file. The rule is the same as a port's: a second bind of the same function is
// fine, a different one throws. This file imports types only.
import type { GameState } from '../types'
import type { Reveal, TermKey } from './types'

/**
 * What the player may see of the odds. `exact` is true when every number shows as it is. `knows` says whether a term is known
 * well enough to print (a term that is not shows as "unknown factors"). `band` writes the odds themselves, `p` in 0..1: the
 * text that follows "Odds " ("62%" exactly, "about 60%" in a realistic mode).
 */
export interface RevealPolicy {
  exact: boolean
  knows(term: TermKey): boolean
  band(p: number): string
}

/** Everything shows as it is: the policy while nothing is bound, and the one the test suite runs under. */
export const EXACT_POLICY: RevealPolicy = Object.freeze({
  exact: true,
  knows: (): boolean => true,
  band: (p: number): string => `${Math.round(Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)) * 100)}%`,
})

type RevealedFn = (g: GameState, reveals: readonly Reveal[]) => void
type PolicyFn = (g: GameState) => RevealPolicy

let revealedFn: RevealedFn | undefined
let policyFn: PolicyFn | undefined

/** Binds what happens to the reveals a finished piece of research returns (Knowledge). Once: the same function again is fine, a different one throws. */
export function bindRevealed(fn: RevealedFn): void {
  if (typeof fn !== 'function') throw new TypeError('effort hook revealed needs a function')
  if (revealedFn === undefined) revealedFn = fn
  else if (revealedFn !== fn) throw new Error('effort hook revealed is already bound')
}

/** Hands the reveals of one piece of research to whoever is bound; does nothing while nothing is. `step` calls it once, after booking, never on a replay. */
export function revealedSink(g: GameState, reveals: readonly Reveal[]): void {
  if (revealedFn !== undefined) revealedFn(g, reveals)
}

/** Binds how the odds are shown (Fog). Once: the same function again is fine, a different one throws. */
export function bindRevealPolicy(fn: PolicyFn): void {
  if (typeof fn !== 'function') throw new TypeError('effort hook revealPolicy needs a function')
  if (policyFn === undefined) policyFn = fn
  else if (policyFn !== fn) throw new Error('effort hook revealPolicy is already bound')
}

/** The policy for this game: the bound function's answer, or EXACT_POLICY while nothing is bound or the answer isn't a policy. */
export function revealPolicyOf(g: GameState): RevealPolicy {
  if (policyFn === undefined) return EXACT_POLICY
  const p = policyFn(g)
  const ok = typeof p === 'object' && p !== null && typeof p.exact === 'boolean' && typeof p.knows === 'function' && typeof p.band === 'function'
  return ok ? p : EXACT_POLICY
}
