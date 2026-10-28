// The door every change to Person.relationship goes through (R4-E5, D.3, X22, X23). core.ts wraps the two primitives below as
// addRelationship(g, p, delta, kind?) and setRelationship(g, p, value, kind?) and then tells the mirror what changed. Person.relationship
// stays the authority through R4: the primitives are the v5.2.0 code to the digit, the mirror is a hook that follows them, and
// R4-E7's world/edge-mirror.ts binds it. Until something binds it, a change goes nowhere but into the number.
//
//   applyRelationship(p, delta, kind?)   the old addRelationship: nothing for a non-finite relationship or delta (null), else
//                                        Math.round(clamp(p.relationship + delta)); returns what changed
//   assignRelationship(p, value, kind?)  the old raw write `p.relationship = value`: the value verbatim, no clamp and no rounding
//   bindMirror(fn)                       binds the hook; a second call replaces the first. A hook, not a port (kernel/ports.ts):
//                                        a port nothing binds fails test/hub-entry.test.ts, and the binder is three tasks away
//   notifyMirror(g, p, change)           what core.ts calls after a change; nothing while the hook is unbound
//
// The kind says what the change was: `affection` for a rise, `offence` for a fall (the mirror also raises resentment by what was
// lost), `decay` for the slow drift of the yearly step and the nepo mood steps (it does not). The default is the sign: a delta
// below zero, or an assigned value below the old one, is an `offence`; a caller names `decay` where it means it.
//
// Layer 0 and a leaf: it imports types only. The clamp below is a private copy of core.ts's, because core.ts imports this file and a
// second import the other way would close a cycle across two directories (cycleDirEdges must stay empty);
// test/kernel-relations.test.ts pins the two equal. No luck, no id, no write beyond `p.relationship`.
import type { GameState, Person } from '../types'

/** What a change of relationship was. */
export type RelKind = 'affection' | 'offence' | 'decay'

/** What a call changed: the number before and after, and the kind. */
export interface RelChange {
  before: number
  after: number
  kind: RelKind
}

/** The mirror's entry point: the game, the person and the change that was just applied. */
export type MirrorHook = (g: GameState, p: Person, change: RelChange) => void

/** core.ts's clamp: a NaN gives the low bound, else the value held between the bounds. Exported for test/kernel-relations.test.ts only. */
export function clampRel(n: number, lo = 0, hi = 100): number {
  if (Number.isNaN(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/** The old addRelationship. Returns null (and writes nothing) when the relationship or the delta is not a finite number. */
export function applyRelationship(p: Person, delta: number, kind?: RelKind): RelChange | null {
  if (!Number.isFinite(p.relationship) || !Number.isFinite(delta)) return null
  const before = p.relationship
  p.relationship = Math.round(clampRel(p.relationship + delta))
  return { before, after: p.relationship, kind: kind ?? (delta < 0 ? 'offence' : 'affection') }
}

/** The old raw write: the value as given, whatever it is. Always a change, so the mirror hears every one. */
export function assignRelationship(p: Person, value: number, kind?: RelKind): RelChange {
  const before = p.relationship
  p.relationship = value
  return { before, after: value, kind: kind ?? (value < before ? 'offence' : 'affection') }
}

let mirror: MirrorHook | null = null

/** Binds the mirror. A second call replaces the first. */
export function bindMirror(fn: MirrorHook): void {
  mirror = fn
}

/** Tells the mirror about a change that was applied. A no-op while the hook is unbound. */
export function notifyMirror(g: GameState, p: Person, change: RelChange): void {
  if (mirror !== null) mirror(g, p, change)
}
