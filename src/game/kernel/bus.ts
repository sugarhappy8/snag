// The bus (R2, K.3 b, design 14.4): how one module tells the others that something happened, without importing them.
//
// emit(g, fact) takes a plain fact (kernel/fact.ts), checks it, and hands it to the handlers that registered for its kind
// (ModuleDef.handles, found with handlersFor): first the handlers of the exact kind sorted by module id, then the '*' handlers
// sorted by module id. It is synchronous: when emit returns, every handler has run. It is not money (money moves through the
// ledger, never through a fact) and it is not a story.
//
// Rules this file keeps:
//   - the order is a pure function of the registered set, so the order modules were imported in never changes who hears what first;
//   - a fact a handler emits does not recurse. It waits in a first-in-first-out queue and is delivered once every handler of the
//     current fact has returned, to the state the top-level emit was called with;
//   - it is bounded: one top-level emit causes at most FACT_LIMITS.cascade (64) handler runs and never more than that many facts
//     waiting. A cascade that would pass either limit is cut, counted in `truncated`, and the call returns normally;
//   - a fact that is not valid, or whose kind no module declared (ModuleDef.facts), is dropped and counted, never delivered;
//   - the handlers get one frozen copy of the normalized fact, so a handler cannot change what the next one hears;
//   - it draws no random number, reads no clock and writes only what the handlers write. Call it from a yearly step or an action,
//     never from a menu, a hint or a view: on the deep-frozen state of the fuzz walk a handler's write throws a TypeError.
//
// A handler declares the one slice it writes. A test sets a guard (setBusGuard) that proves it: before a handler runs the guard is
// called with who it is and which slice it owns and returns a function that runs after the handler (test/kernel-kit.ts
// ownSliceGuard compares the state outside the slice there). Production never sets a guard.
//
// The counters (busStats) are module-level, never saved and never read by the game: a decision that read them would make a play
// depend on how often a test emitted. This file imports the game types (a type), the fact and the registry (L0).
import type { GameState } from '../types'
import { FACT_LIMITS, normalizeFact, type Fact } from './fact'
import { handlersFor, registeredFacts } from './registry'

/** Who is about to run: the module, the one slice its handler declared and the kind of the fact. */
export interface BusGuardInfo {
  moduleId: string
  slice: string
  kind: string
}

/** Called before a handler runs; the function it returns runs after the handler returns (not when it throws). */
export type BusGuard = (info: BusGuardInfo, g: GameState) => () => void

/** One top-level emit in progress: the facts in order, how many were taken, the handler runs so far, and whether it was cut. */
interface Cascade {
  facts: Fact[]
  next: number
  runs: number
  cut: boolean
}

let guard: BusGuard | null = null
/** The cascade being delivered, or null between top-level emits. */
let active: Cascade | null = null
const stats = { emitted: 0, dropped: 0, delivered: 0, truncated: 0 }

/**
 * Sends a fact. Returns true when the fact was accepted (and, outside a handler, delivered), false when it was dropped: not an
 * object, a bad kind or year (normalizeFact), a kind no module declared, or, inside a handler, no room in the queue.
 * A handler that throws stops the cascade, the error goes up to the caller, and the bus is ready for the next emit.
 */
export function emit(g: GameState, fact: Fact): boolean {
  const f = normalizeFact(fact)
  if (f === null || !registeredFacts().has(f.k)) {
    stats.dropped++
    return false
  }
  Object.freeze(f)
  if (active !== null) {
    if (active.facts.length - active.next >= FACT_LIMITS.cascade) {
      active.cut = true
      stats.dropped++
      return false
    }
    stats.emitted++
    active.facts.push(f)
    return true
  }
  stats.emitted++
  const cascade: Cascade = { facts: [f], next: 0, runs: 0, cut: false }
  active = cascade
  try {
    deliver: while (cascade.next < cascade.facts.length) {
      const current = cascade.facts[cascade.next++]!
      for (const { moduleId, entry } of handlersFor(current.k)) {
        if (cascade.runs >= FACT_LIMITS.cascade) {
          cascade.cut = true
          break deliver
        }
        cascade.runs++
        stats.delivered++
        const watch = guard
        const after = watch === null ? null : watch({ moduleId, slice: entry.slice, kind: current.k }, g)
        entry.run(g, current)
        if (after !== null) after()
      }
    }
    if (cascade.cut) stats.truncated++
  } finally {
    active = null
  }
  return true
}

/** Sets the guard every delivery goes through, or null for none. For tests and the fuzz walk only. */
export function setBusGuard(next: BusGuard | null): void {
  guard = next
}

/** A copy of the counters: facts accepted, dropped (an emit that returned false), handler runs and cascades cut. For tests, never for the game. */
export function busStats(): { emitted: number; dropped: number; delivered: number; truncated: number } {
  return { ...stats }
}

/** Sets the four counters to zero. */
export function resetBusStats(): void {
  stats.emitted = 0
  stats.dropped = 0
  stats.delivered = 0
  stats.truncated = 0
}
