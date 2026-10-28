// What holds an edge in place (R4-E14, D.3, X13, X14, X25, C4, C5, C6): the predicate that widens E6a's edge-local `edgeLocalBound`
// with the cases only a person can show, the two eviction guards that use it, and the two hooks the Met store asks the Edges track for.
//
//   isBound(g, key)        true when the edge `key` must not be let go. It is bound when
//                          - the edge itself says so (edgeLocalBound: a link kind, an unpaid debt, a feud rung, a pinned memory), or
//                          - a person at one of its ends (the player's own end counts for nothing) is held at the person level:
//                            owes the player (the ties record `data.w`, read through edge-legacy.ts), is a living spouse or fiance,
//                            is a child or stepchild, holds a share of a company in the holdings table, owns an old NPC firm
//                            (`data.npcCompany`), holds a family job (`data.nepo`), or is cut out of the will or estranged
//                            (the will record `data.wl`, through edge-legacy.ts).
//                          The person-level reasons need no edge: a key with no edge behind it answers for the people at its ends. A
//                          key that is no edge key (a secret, a text that does not parse, anything that is not a text) is not bound.
//   boundTest(g, map?)     the same predicate for a loop: the held people are read once, so a pass over 1,200 edges costs one look at
//                          the people and the table, and a Set lookup for each edge. `map` is the edge map to read (default: the one
//                          the reads see); putEdge hands it the map it is about to change.
//   boundFarEnds(g)        the protector `edges.bound`: the personKey of the person at the far end of every bound edge, sorted, once each.
//                          An edge that is bound by its own fields gives both of its person ends (the player's excepted); an edge that is
//                          bound only through a person gives the person that is held. Keys are what the Met store keeps (a legacy person is
//                          its id, a sid-born one its sid), so a record whose edge holds a debt is never swept (X14).
//   playerEdgeSalience(g, key)   the salience `edges.salience`: f + s + abs(o) of the edge `person:<key> > player` and nothing for the
//                          link role, because the Met record adds its own role weight times ten and a weight is never counted twice (X13).
//
// Both hooks are registered here, at module load (registerProtector and registerSalience of met-ops.ts, S7). world/lod.ts is not edited:
// its guard already protects every person of g.people, the player and the holders; the real guard for a sid-born person who is not in
// g.people is S7's sweepMet, which asks the protector (C5, C6).
//
// putEdge (world/edge-write.ts) evicts the weakest edge that is not bound, and the yearly step (world/edge-step.ts) removes an orphan
// edge only when it is not bound: both use this predicate since this task, where E6b and E7 could use only the edge-local part. The
// normalizer of world/edges.ts has no game in hand and keeps edgeLocalBound; it cuts only a hostile or over-full map.
//
// Pure and total: nothing is written, no number is drawn, no id is made; any game, any people, any data (a getter that throws, a record
// of the wrong shape) answers false, 0 or an empty list. Layer 2: it reads types, the edge model, the legacy readers, the holdings
// table, the people index (npcFirmId, playerRef) and the person key, and registers with met-ops.ts. It imports nothing from society/,
// events/ or business/ (test/layer-kit.ts: a layer-2 file may not reach upward, C4).
import type { EntityRef } from '../kernel/ids'
import { personKey } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import { MET_CAPS } from './caps'
import { legacyTies, legacyWl } from './edge-legacy'
import { edgeKey, edgeLocalBound, edgeMap, isSecretKey, readEdge, salience, type EdgeKey, type EdgeMap } from './edges'
import { readHoldings } from './holdings'
import { registerProtector, registerSalience } from './met-ops'
import { npcFirmId, playerRef } from './people'
import { isPlain } from './rows'

/** Most people read for the person-level reasons: the reader's bound on a hostile list (edges.ts PEOPLE_MAX, met-ops.ts MET_CAPS.scan). */
const PEOPLE_MAX = 5_000
const PERSON = 'person:'
/** An edge key is 140 characters at most (edges.ts). */
const KEY_MAX = 140

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
/** isSecretKey as a plain test: its own signature is a type guard, which would narrow the key to never on the other side. */
const isSecret = (k: string): boolean => isSecretKey(k)
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The player's ref, or an empty text when the game has none (a hostile game answers the empty text and every end is then a far end). */
function egoOf(g: GameState): string {
  try {
    const ref: unknown = playerRef(g)
    return typeof ref === 'string' ? ref : ''
  } catch {
    return ''
  }
}

/** The two ends of an edge key, or null when it is no edge key: both ends parse, 140 characters at most, exactly the key `from>to`. */
function endsOf(key: unknown): readonly [EntityRef, EntityRef] | null {
  if (typeof key !== 'string' || key.length > KEY_MAX || isSecret(key)) return null
  const at = key.indexOf('>')
  if (at < 1 || key.indexOf('>', at + 1) >= 0) return null
  const from = key.slice(0, at) as EntityRef
  const to = key.slice(at + 1) as EntityRef
  return edgeKey(from, to) === key ? [from, to] : null
}

/** A family job on a person: `data.nepo` is a record with a company id (the raw read of business/nepo-job.ts readJob, which this layer may not import). */
function holdsFamilyJob(p: Person): boolean {
  const nepo: unknown = p.data?.nepo
  if (!isPlain(nepo)) return false
  const id = nepo.assetId
  return typeof id === 'string' && id !== ''
}

/** The persons that hold a share of a company in the holdings table (as personKey values), the player and the outside excepted. */
function holdersOf(g: GameState, ego: string): Set<string> {
  const out = new Set<string>()
  try {
    for (const row of readHoldings(g).rows) {
      const owner: unknown = row[0]
      if (typeof owner === 'string' && owner.startsWith(PERSON) && owner !== ego) out.add(owner.slice(PERSON.length))
    }
  } catch {
    // an unreadable table holds nobody
  }
  return out
}

/** True when the person is held at the person level (see the header). Total: a person that cannot be read is not held. */
function personHeld(p: unknown, egoId: string): boolean {
  try {
    if (p === null || typeof p !== 'object') return false
    const q = p as Person
    if (q.relation === 'pet') return false
    if ((q.relation === 'spouse' || q.relation === 'fiance') && q.alive === true) return true
    if (q.relation === 'child' || q.relation === 'stepchild') return true
    if (legacyTies(q, egoId).owes > 0) return true
    const wl = legacyWl(q, egoId)
    if (wl.cut || wl.estr) return true
    return npcFirmId(q) !== null || holdsFamilyJob(q)
  } catch {
    return false
  }
}

/**
 * The people who are held at the person level, as personKey values: the persons of g.people with one of the reasons of the header, and
 * every holder of the holdings table (a holder who has left g.people is still named there). The player is never in it.
 */
function heldPeople(g: GameState, ego: string): Set<string> {
  const out = holdersOf(g, ego)
  const egoId = ego.startsWith(PERSON) ? ego.slice(PERSON.length) : ''
  const people: unknown = g.people
  if (Array.isArray(people)) {
    const n = Math.min(people.length, PEOPLE_MAX)
    for (let i = 0; i < n; i++) {
      const p: unknown = people[i]
      if (!personHeld(p, egoId)) continue
      try {
        const key: unknown = personKey(p as Person)
        if (typeof key === 'string' && key !== '' && PERSON + key !== ego) out.add(key)
      } catch {
        // a person with no key holds nothing
      }
    }
  }
  return out
}

/** The person ends of an edge other than the player's, as personKey values. */
function farEnds(ends: readonly [EntityRef, EntityRef], ego: string): string[] {
  const out: string[] = []
  for (const end of ends) if (end !== ego && end.startsWith(PERSON)) out.push(end.slice(PERSON.length))
  return out
}

/**
 * The bound predicate for a pass over many keys (see the header): the held people are read once, and only when an edge is not already
 * bound by its own fields. `map` defaults to the edge map the reads see. Total.
 */
export function boundTest(g: GameState, map?: EdgeMap): (key: EdgeKey) => boolean {
  let held: Set<string> | null = null
  const ego = egoOf(g)
  let edges: EdgeMap | null = null
  return (key: EdgeKey): boolean => {
    try {
      const ends = endsOf(key)
      if (ends === null) return false
      edges ??= map ?? edgeMap(g)
      const e = hasOwn(edges, key) ? edges[key] : undefined
      if (e !== undefined && edgeLocalBound(e)) return true
      held ??= heldPeople(g, ego)
      if (held.size === 0) return false
      return farEnds(ends, ego).some((k) => held!.has(k))
    } catch {
      return false
    }
  }
}

/** True when the edge `key` must not be let go: bound by its own fields, or through a person at one of its ends (see the header). Pure and total. */
export function isBound(g: GameState, key: EdgeKey): boolean {
  return boundTest(g)(key)
}

/**
 * The protector `edges.bound`: the personKey of the person at the far end of every bound edge, sorted and once each (see the header). At most
 * MET_CAPS.scan keys are read by the Met store, and an edge map holds 1,200 edges at most, so the list is short. Total: a life with no edges, or an
 * edge root that is no map, names nobody.
 */
export function boundFarEnds(g: GameState): readonly string[] {
  try {
    const map = edgeMap(g)
    const keys = Object.keys(map)
    if (keys.length === 0) return []
    const ego = egoOf(g)
    let held: Set<string> | null = null
    const out = new Set<string>()
    for (const key of keys) {
      const ends = endsOf(key)
      if (ends === null) continue
      const far = farEnds(ends, ego)
      if (far.length === 0) continue
      if (edgeLocalBound(map[key]!)) {
        for (const k of far) out.add(k)
      } else {
        held ??= heldPeople(g, ego)
        if (held.size === 0) continue
        for (const k of far) if (held.has(k)) out.add(k)
      }
    }
    return [...out].sort(cmp).slice(0, MET_CAPS.scan)
  } catch {
    return []
  }
}

/** The salience `edges.salience`: f + s + abs(o) of the edge `person:<key> > player`, 0 when there is none, and no weight for the role (X13). Total. */
export function playerEdgeSalience(g: GameState, key: string): number {
  try {
    if (typeof key !== 'string' || key === '') return 0
    const from = `${PERSON}${key}` as EntityRef
    const to = playerRef(g)
    const e = readEdge(g, from, to)
    return e === null ? 0 : salience(e, 0)
  } catch {
    return 0
  }
}

registerProtector('edges.bound', boundFarEnds)
registerSalience('edges.salience', playerEdgeSalience)
