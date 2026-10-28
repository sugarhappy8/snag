// The mirror (R4-E7, D.3, X22, X23, C3): every change to Person.relationship, followed into the Edge `person > player`.
//
// core.ts (layer 0) wraps the two primitives of kernel/relations.ts as addRelationship(g, p, delta, kind?) and setRelationship(g, p, value,
// kind?) and then tells a hook what changed. This file is what the hook is bound to: importing it binds it (bindMirror, below), so the
// step file imports it for its effect and so does life.ts, whose createNewLife is the only place a life is stamped. The hook is not a
// port (X23): a port that nothing binds fails test/hub-entry.test.ts, and the binder arrived three tasks after the codemod (C3).
//
// What the mirror does, in the order it asks:
//   - nothing unless the life is stamped (socialOn: the world shard `social`, written by createNewLife when the key `social` is on, X6);
//     an unstamped life writes no edge and no shard, so every v5.2.0 save and every heir of one plays as it always did;
//   - nothing for a pet, for a change that leaves the number as it was (a zero delta, a bound, a raw write of the same value), for a number
//     that is not finite, or for a person who has no ref (an id that is no name: personEntity gives pool:other);
//   - otherwise the edge `personEntity(p) > playerRef(g)`: made at first touch (trust 50, respect 50, resentment 0, obligation 0, since
//     and last touched this year) and given `f = after`, so `edge.f === p.relationship` after every call for a number in 0 to 100 (the
//     edge model cuts a number to that range); an `offence` adds what was lost (`before - after`) to the resentment `s`, up to 100;
//     an `affection` or a `decay` adds nothing. An edge that is there keeps its other fields; `l` moves to this year.
// Everything goes through putEdge (world/edge-write.ts), the one writer: the caps, the sorted insert, the sealed root and the eviction of
// the weakest edge are its rules. A map of 1,200 edges that are all bound refuses a new one and the mirror lets it go; the number has
// moved all the same, because Person.relationship is the authority and the edge only follows it.
//
// Pure of luck and of money: no draw from g.rng, no id, no ledger row, nothing written outside g.world.
//
// Layer 2: it imports the kernel's hook and person key, the edge model and writer, the player's ref and the stamp.
import { personEntity } from '../kernel/person-ref'
import { bindMirror, type RelChange } from '../kernel/relations'
import type { GameState, Person } from '../types'
import { putEdge } from './edge-write'
import { edgeKey, readEdge, type Edge } from './edges'
import { playerRef } from './people'
import { socialOn } from './social'

/** A number held between the bounds, to hundredths (a stored number stays short). */
const hundredths = (x: number): number => Math.round(Math.min(100, Math.max(0, x)) * 100) / 100

/**
 * Follows one change of a relationship into the edge. The hook that kernel/relations.ts calls after every change; exported so a test can
 * wrap it (test/social-parity-kit.ts checks the edge after each call).
 */
export function mirrorChange(g: GameState, p: Person, change: RelChange): void {
  if (!socialOn(g) || p.relation === 'pet') return
  const { before, after } = change
  if (typeof after !== 'number' || !Number.isFinite(after) || after === before) return
  const from = personEntity(p)
  if (from === 'pool:other') return
  const to = playerRef(g)
  const key = edgeKey(from, to)
  if (key === null) return
  const year = g.year
  const f = Math.max(0, Math.min(100, after))
  const lost = change.kind === 'offence' && typeof before === 'number' && Number.isFinite(before) && before > after ? before - after : 0
  const old = readEdge(g, from, to)
  if (old === null) {
    putEdge(g, key, { t: 50, f, r: 50, s: hundredths(lost), o: 0, y: year, l: year })
    return
  }
  const patch: Partial<Edge> = {}
  if (old.f !== f) patch.f = f
  if (lost > 0) {
    const s = hundredths(old.s + lost)
    if (s !== old.s) patch.s = s
  }
  if (old.l < year) patch.l = year
  if (Object.keys(patch).length > 0) putEdge(g, key, patch)
}

bindMirror(mirrorChange)
