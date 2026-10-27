// The writer of edges (R4-E6b, D.3): the one place g.world.edges is written, and the memories that come with it. Nothing calls it yet
// (R4-E7 is the first caller); everything here is a no-op for a life that is not stamped except putEdge, which is a plain writer.
//
//   putEdge(g, key, patch)   merges the patch into the edge under `key` (a new edge needs all of t, f, r, s, o, y and l), or removes the
//                            edge for `null`. true when the map holds the edge as asked (written, or already so), false when it was
//                            refused and nothing was written. Refused: a key that is not an edge key (both ends must parse, 140
//                            characters at most; a secret key is no edge), a patch that is not a plain object, a patch that leaves a
//                            required field unreadable, a feud, a debt or a dialogue store the map has no room for, and a new edge
//                            when the map is full of bound edges.
//   remember(g, who, kind, o)  makes a memory on the edge `who > (o.with ?? the player)` and applies what the kind does to it, once.
//   putSecret(g, key, secret)  (R4-E11) the same for a secret under 'secret:<n>': the record, or null to remove it. A secret is no edge, so
//                            putEdge refuses its key and this refuses an edge key; it is the only writer of the records. The record is
//                            read back through the normalizer (a field that is not valid refuses the write), 40 secrets at most (the 41st
//                            is refused, a record already there can be replaced) and the root is replaced and frozen like putEdge's.
//
// The rules, in the order the tests prove them:
//   - The patch is merged into the edge and read back through the E6a normalizer (world/edges.ts), so a field out of range is cut, a
//     field that is not valid is dropped, an unknown key is ignored and `undefined` clears an optional field. Nothing is written when
//     the edge comes out as it was.
//   - The root is replaced, never edited: the keys are copied in ascending order (a sorted insert, one new key at most), every entry
//     that is not touched is the very same object, and what is stored is frozen (the root, the new edge and its lists). The Save track
//     shares each shard root between drafts, frozen (save-clone.ts), and the codec rewrites only the `e.edge.<n>` shard whose
//     entries changed; a stray in-place write is a TypeError at the line that wrote it, which is the alarm. Lists the caller passed are
//     copied, never frozen in place.
//   - A new edge in a map of 1,200 evicts the lowest-salience edge that is not bound (edgeLocalBound; ties go to the highest key, as in
//     the normalizer), and the edge being written is the one that is kept. A map whose 1,200 edges are all bound refuses.
//   - 12 feuds, 40 debts and the dialogue store on 120 edges are refused over the cap, not cut: a cut would take the field from an
//     edge the caller did not name. 4,000 memories in all are kept by eviction, as the normalizer does it: the oldest unpinned memory
//     of the lowest-salience edge goes first, a pinned one only when no unpinned memory is left anywhere.
//   - The map it reads is the map the reader would make of the stored one. A root this file wrote is known to be valid and is not read
//     again; any other root (a load, a clone, a hostile save) is normalized first, once.
//   - A write costs one pass over the root (the root is replaced, so the keys are copied) and nothing else that grows with the map: the
//     counts and the key list of the root it wrote are kept by its identity, and a write that only replaces edges shares the key list
//     and copies the entries without a look at the edits per key. A tap of 10 writes at 1,200 edges stays well under a millisecond on the
//     reference machine (test/world-edge-step.test.ts, section 7).
//
// remember writes the memory string `kind.year.weight.by` (world/edge-memory.ts) and applies MEMORY_FX[kind] to the edge's t, r, s and
// o, scaled by weight / 3 and clamped to the field ranges, rounded to hundredths so a stored number stays short. It does nothing unless
// the life is stamped (socialOn), writes nothing for a second call of the same kind on the same edge in the same year (no second memory
// and no second effect), keeps at most 8 memories an edge (the oldest unpinned first) and 4,000 in all. An edge it makes starts at
// t 50, r 50, s 0, o 0, with y and l this year, and f the Person's relationship when the edge points at the player (the affection
// invariant of edgeProblems), else 50. An edge that is there keeps its f and y.
//
// Pure of luck: no draw from the life's random stream, no named stream, no clock, no ledger (an edge holds no dollars that move; a debt record is bookkeeping E10b keeps).
// Layer 2: it imports the ref grammar, the person key, the caps, the memory table, the edge model, the player's ref, the stamp and the
// world root.
import { parseRef, type EntityRef } from '../kernel/ids'
import { personEntity } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import { EDGE_CAPS } from './caps'
import { MEMORY_FX, formatMemory, isMemoryKind, isPinnedKind, parseMemory, type MemoryKind } from './edge-memory'
import { edgeKey, edgeLocalBound, isSecretKey, normalizeEdges, salience, trustMap, type Edge, type EdgeKey, type EdgeMap, type SecretRecord } from './edges'
import { playerRef } from './people'
import { SEEN_MAX, SEEN_MIN, isPlain } from './rows'
import { socialOn } from './social'
import { ensureWorld, readWorld, worldShard } from './state'

/** An edge key is 140 characters at most (edges.ts). */
const KEY_MAX = 140
/** The lists of an edge: frozen when stored. */
const LISTS = ['m', 'n', 'd', 'q', 'dv'] as const

type Rec = Record<string, unknown>

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
/** isSecretKey as a plain test: its own signature is a type guard, which would narrow the key to never on the other side. */
const isSecret = (k: string): boolean => isSecretKey(k)
const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX

/** Roots this file wrote: valid by construction, so a read of one costs nothing. A root that is not here is normalized before it is trusted. */
const SEALED = new WeakSet<object>()
const NO_EDGES: EdgeMap = Object.freeze({})

/** The edge map of this game as the reader would make it. Pure. */
function current(g: GameState): EdgeMap {
  const raw: unknown = readWorld(g).edges
  if (raw === undefined) return NO_EDGES
  if (typeof raw === 'object' && raw !== null && SEALED.has(raw)) return raw as EdgeMap
  return worldShard<EdgeMap>(g, 'edges') ?? NO_EDGES
}

/** The two ends of an edge key, or null when it is not one (edgeKey is the grammar: both ends parse, 140 characters, the key is exactly `from>to`). */
function endsOf(key: unknown): readonly [EntityRef, EntityRef] | null {
  if (typeof key !== 'string' || key.length > KEY_MAX || isSecret(key)) return null
  const at = key.indexOf('>')
  if (at < 1 || key.indexOf('>', at + 1) >= 0) return null
  const from = key.slice(0, at) as EntityRef
  const to = key.slice(at + 1) as EntityRef
  return edgeKey(from, to) === key ? [from, to] : null
}

function sameVal(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((x, i) => x === b[i])
}

function sameEdge(a: Readonly<Edge>, b: Readonly<Edge>): boolean {
  const x = a as unknown as Rec
  const y = b as unknown as Rec
  const keys = Object.keys(x)
  if (keys.length !== Object.keys(y).length) return false
  for (const k of keys) if (!hasOwn(y, k) || !sameVal(x[k], y[k])) return false
  return true
}

/** The edge under `key` as the normalizer reads `merged`, or null when it is not an edge. A fresh object (the caller owns it), its lists maybe the caller's. */
function cleaned(key: string, merged: Rec): Edge | null {
  const one = normalizeEdges({ [key]: merged }) as Record<string, Edge>
  return hasOwn(one, key) ? one[key]! : null
}

/** The edge, sealed: a copy whose lists are the writer's own and frozen, itself frozen. A list that is frozen already is shared. */
function sealEdge(e: Edge): Edge {
  const out = { ...e } as Rec
  for (const f of LISTS) {
    const v = out[f]
    if (Array.isArray(v) && !Object.isFrozen(v)) out[f] = Object.freeze(v.slice())
  }
  return Object.freeze(out) as unknown as Edge
}

// ---------------------------------------------------------------------------------------------------------------------------------
// What the map holds, counted
// ---------------------------------------------------------------------------------------------------------------------------------

interface Tally {
  edges: number
  memories: number
  talkers: number
  feuds: number
  debts: number
}

function count(t: Tally, e: Readonly<Edge>, sign: 1 | -1): void {
  t.edges += sign
  t.memories += sign * (e.m?.length ?? 0)
  if (e.n !== undefined || e.d !== undefined) t.talkers += sign
  if (e.q !== undefined) t.feuds += sign
  if (e.dv !== undefined) t.debts += sign
}

function tallyOf(map: EdgeMap): Tally {
  const t: Tally = { edges: 0, memories: 0, talkers: 0, feuds: 0, debts: 0 }
  for (const k of Object.keys(map)) if (!isSecret(k)) count(t, map[k]!, 1)
  return t
}

/**
 * The counts of a root this file wrote, by its identity (R4-E7): the next write starts from them instead of walking 1,200 edges again.
 * A root that is not here (a load, a clone, a hostile save, a write that had to trim memories) is counted by walking it, once.
 */
const TALLIES = new WeakMap<object, Tally>()

/** The edge to evict for a new one: the lowest salience among the edges that are not bound, the highest key among equals. Null when every edge is bound. */
function weakestUnbound(map: EdgeMap): string | null {
  let best: string | null = null
  let low = Infinity
  for (const k of Object.keys(map)) {
    if (isSecret(k)) continue
    const e = map[k]!
    // an edge with a link kind is bound, so an unbound edge has a role of 0 and its salience is the sum
    const sal = e.f + e.s + Math.abs(e.o)
    if (sal > low || (sal === low && best !== null && k < best)) continue
    if (edgeLocalBound(e)) continue
    best = k
    low = sal
  }
  return best
}

const pinnedText = (s: string): boolean => {
  const m = parseMemory(s)
  return m !== null && isPinnedKind(m.kind)
}

/**
 * Takes `over` memories out of the map, the way the normalizer does: the edges that hold memories, lowest salience first (ties by key),
 * each gives up its oldest unpinned memories; only when no unpinned memory is left does a pinned one go. `entries` is what the map will
 * hold (the edit already in it); the edges it changes are returned. Pure.
 */
function trimMemories(entries: readonly (readonly [string, Edge])[], over: number): Map<string, Edge> {
  const holders = entries
    .filter(([, e]) => e.m !== undefined && e.m.length > 0)
    .map(([key, e]) => ({ key, e, sal: salience(e) }))
    .sort((a, b) => a.sal - b.sal || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const changed = new Map<string, Edge>()
  let left = over
  for (const onlyUnpinned of [true, false]) {
    for (const h of holders) {
      if (left <= 0) break
      const m = changed.get(h.key)?.m ?? h.e.m
      if (m === undefined) continue
      const keep: string[] = []
      for (const s of m) {
        if (left > 0 && (!onlyUnpinned || !pinnedText(s))) left--
        else keep.push(s)
      }
      if (keep.length === m.length) continue
      const next = { ...(changed.get(h.key) ?? h.e) } as Edge
      if (keep.length > 0) next.m = keep
      else delete next.m
      changed.set(h.key, next)
    }
  }
  return changed
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The one write
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * The keys of a root this file wrote, in order, by its identity (CP2): a write that replaces edges and adds none leaves the keys as they
 * were, so the next root shares the list instead of listing 1,200 keys again. The list is never edited, and a root that is not sealed is
 * never cached (nothing says it will not change).
 */
const KEYS = new WeakMap<object, readonly string[]>()

function keysOf(root: EdgeMap): readonly string[] {
  const hit = KEYS.get(root)
  if (hit !== undefined) return hit
  const keys = Object.keys(root)
  if (SEALED.has(root)) KEYS.set(root, keys)
  return keys
}

/** True when the edits only replace edges the root holds: no key is added and none is removed, so the root keeps its keys and their order. */
function replacesOnly(cur: EdgeMap, edits: ReadonlyMap<string, Edge | SecretRecord | null>, insertKey: string | null): boolean {
  if (insertKey !== null) return false
  for (const [k, v] of edits) if (v === null || v === undefined || !hasOwn(cur, k)) return false
  return true
}

/** Stores a new root: the keys of `cur` in order with `edits` applied (an edge, or null to remove it) and `insertKey` placed where it sorts. */
function commit(g: GameState, cur: EdgeMap, edits: ReadonlyMap<string, Edge | SecretRecord | null>, insertKey: string | null, tally?: Tally): void {
  const keys = keysOf(cur)
  // Born as a dictionary (no prototype yet): a map of 1,200 keys is one in the end, and an object that starts as a plain literal first
  // walks through a hidden-class step for each of its first keys. The prototype is put back before the root is stored, so what is stored
  // is an ordinary object.
  const out: Rec = Object.create(null) as Rec
  let outKeys: readonly string[]
  if (replacesOnly(cur, edits, insertKey)) {
    // an edge that is there keeps its place when it is written again, so the copy needs no look at the edits per key
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!
      out[k] = cur[k]
    }
    for (const [k, v] of edits) out[k] = v
    outKeys = keys
  } else {
    const list: string[] = []
    let pending = insertKey
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!
      if (pending !== null && pending < k) {
        out[pending] = edits.get(pending)
        list.push(pending)
        pending = null
      }
      if (edits.has(k)) {
        const v = edits.get(k)
        if (v !== null && v !== undefined) {
          out[k] = v
          list.push(k)
        }
        continue
      }
      out[k] = cur[k]
      list.push(k)
    }
    if (pending !== null) {
      out[pending] = edits.get(pending)
      list.push(pending)
    }
    outKeys = list
  }
  Object.setPrototypeOf(out, Object.prototype)
  Object.freeze(out)
  SEALED.add(out)
  KEYS.set(out, outKeys)
  // the root is valid by construction: the readers of edges.ts take it as it is and do not normalize 1,200 edges again after every write
  trustMap(out as unknown as EdgeMap)
  if (tally !== undefined) TALLIES.set(out, tally)
  ensureWorld(g).edges = out
}

/**
 * Writes the edge under `key`: the patch merged into it, or `null` to remove it. Returns true when the map holds the edge as asked
 * (it was written, or was so already, or there was nothing to remove) and false when the write was refused and nothing was written.
 * See the header for what is refused and how the caps are kept.
 */
export function putEdge(g: GameState, key: EdgeKey, patch: Partial<Edge> | null): boolean {
  if (endsOf(key) === null) return false
  if (patch !== null && !isPlain(patch)) return false
  const cur = current(g)
  const old = hasOwn(cur, key) ? cur[key] : undefined
  if (patch === null) {
    if (old === undefined) return true
    const had = TALLIES.get(cur)
    let next: Tally | undefined
    if (had !== undefined) {
      next = { ...had }
      count(next, old, -1)
    }
    commit(g, cur, new Map([[key, null]]), null, next)
    return true
  }
  const e = cleaned(key, old === undefined ? { ...patch } : { ...old, ...patch })
  if (e === null) return false
  if (old !== undefined && sameEdge(old, e)) return true

  // the room the write needs: the counts of the map without the old edge (and the one that makes room), with the new one
  const had = TALLIES.get(cur)
  const tally = had === undefined ? tallyOf(cur) : { ...had }
  if (old !== undefined) count(tally, old, -1)
  let victim: string | null = null
  if (old === undefined && tally.edges >= EDGE_CAPS.edges) {
    victim = weakestUnbound(cur)
    if (victim === null) return false
    count(tally, cur[victim]!, -1)
  }
  count(tally, e, 1)
  if (tally.feuds > EDGE_CAPS.feuds || tally.debts > EDGE_CAPS.debts || tally.talkers > EDGE_CAPS.talkEdges) return false

  const edits = new Map<string, Edge | null>()
  let put: Edge = e
  if (victim !== null) edits.set(victim, null)
  if (tally.memories > EDGE_CAPS.memTotal) {
    const entries: [string, Edge][] = []
    for (const k of Object.keys(cur)) if (!isSecret(k) && k !== key && k !== victim) entries.push([k, cur[k]!])
    entries.push([key, e])
    const trimmed = trimMemories(entries, tally.memories - EDGE_CAPS.memTotal)
    for (const [k, v] of trimmed) {
      if (k === key) put = v
      else edits.set(k, sealEdge(v))
    }
  }
  edits.set(key, sealEdge(put))
  // the counts are the new map's own unless memories were trimmed (then the next write walks the map once)
  commit(g, cur, edits, old === undefined ? key : null, tally.memories <= EDGE_CAPS.memTotal ? tally : undefined)
  return true
}

// ---------------------------------------------------------------------------------------------------------------------------------
// putSecret
// ---------------------------------------------------------------------------------------------------------------------------------

const sameHolders = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

function sameSecret(a: Readonly<SecretRecord>, b: Readonly<SecretRecord>): boolean {
  return a.a === b.a && a.k === b.k && a.v === b.v && a.y === b.y && a.p === b.p && sameHolders(a.h, b.h)
}

/** The record, sealed: a copy whose holders are the writer's own list, frozen, itself frozen. */
function sealSecret(s: Readonly<SecretRecord>): SecretRecord {
  return Object.freeze({ ...s, h: Object.freeze(s.h.slice()) as unknown as SecretRecord['h'] }) as SecretRecord
}

/** The secrets the root holds. */
function secretCount(map: EdgeMap): number {
  let n = 0
  for (const k of Object.keys(map)) if (isSecret(k)) n++
  return n
}

/**
 * Writes the secret under `key` ('secret:<n>'): the record, or `null` to remove it. Returns true when the map holds the secret as asked
 * (written, already so, or nothing to remove) and false when the write was refused and nothing was written: a key that is not a secret
 * key, a record the normalizer would not keep as it is given (a field out of range, a kind it does not know, a leak year that is not a
 * year; a list of holders over 6 or with a repeat is cut by the normalizer and the cut record is what is stored), and a 41st secret.
 */
export function putSecret(g: GameState, key: string, secret: SecretRecord | null): boolean {
  if (typeof key !== 'string' || !isSecret(key)) return false
  const cur = current(g)
  const old = hasOwn(cur, key) ? (cur as unknown as Record<string, SecretRecord>)[key] : undefined
  const tally = TALLIES.get(cur)
  if (secret === null) {
    if (old === undefined) return true
    commit(g, cur, new Map([[key, null]]), null, tally)
    return true
  }
  if (!isPlain(secret)) return false
  const one = normalizeEdges({ [key]: secret }) as unknown as Record<string, SecretRecord>
  if (!hasOwn(one, key)) return false
  const clean = one[key]!
  if (old !== undefined && sameSecret(old, clean)) return true
  if (old === undefined && secretCount(cur) >= EDGE_CAPS.secrets) return false
  commit(g, cur, new Map([[key, sealSecret(clean)]]), old === undefined ? key : null, tally)
  return true
}

// ---------------------------------------------------------------------------------------------------------------------------------
// remember
// ---------------------------------------------------------------------------------------------------------------------------------

/** A value moved by `d`, cut to the range and rounded to hundredths; a value that does not move is left as it is. */
function bump(v: number, d: number, lo: number, hi: number): number {
  if (d === 0) return v
  return Math.round(Math.min(hi, Math.max(lo, v + d)) * 100) / 100
}

/** The text added to a list that is already in year order, after the memories of its year. */
function withMemory(list: readonly string[], text: string, year: number): string[] {
  const out = list.slice()
  let at = out.length
  while (at > 0) {
    const m = parseMemory(out[at - 1])
    if (m !== null && m.year > year) at--
    else break
  }
  out.splice(at, 0, text)
  return out
}

/** The person of the game that a ref names, or undefined. */
function personOf(g: GameState, ref: EntityRef): Person | undefined {
  return g.people.find((p) => personEntity(p) === ref)
}

export interface RememberOptions {
  /** How much it weighs: 1 (the default), 2 or 3. */
  w?: 1 | 2 | 3
  /** Who did it: the ego (the default) or they. */
  by?: 'ego' | 'them'
  /** The second end of the edge; the player when absent. */
  with?: EntityRef
}

/**
 * Makes a memory of `kind` on the edge `who > (o.with ?? the player)`, and applies what the kind does to the edge, once. `who` is a
 * Person (named by personEntity) or an EntityRef. Returns true when it wrote, false when it did nothing: the life is not stamped,
 * the kind, weight, side or an end is not valid, the same kind is already on that edge for this year, or the edge cannot be made.
 */
export function remember(g: GameState, who: Person | EntityRef, kind: MemoryKind, o?: RememberOptions): boolean {
  if (!socialOn(g) || !isMemoryKind(kind)) return false
  const w = o?.w === undefined ? 1 : o.w
  const by = o?.by === undefined ? 'ego' : o.by
  if ((w !== 1 && w !== 2 && w !== 3) || (by !== 'ego' && by !== 'them')) return false
  const year = g.year
  if (!isYear(year)) return false
  const ego = o?.with === undefined ? playerRef(g) : o.with
  if (parseRef(ego) === null) return false
  let from: EntityRef
  let person: Person | undefined
  if (typeof who === 'string') {
    if (parseRef(who) === null) return false
    from = who
    person = personOf(g, who)
  } else if (typeof who === 'object' && who !== null) {
    from = personEntity(who)
    person = who
  } else return false
  if (from === 'pool:other') return false
  const key = edgeKey(from, ego)
  if (key === null) return false

  const cur = current(g)
  const old = hasOwn(cur, key) ? cur[key] : undefined
  const list = old?.m ?? []
  for (const s of list) {
    const m = parseMemory(s)
    if (m !== null && m.kind === kind && m.year === year) return false
  }
  const fx = MEMORY_FX[kind]
  const k = w / 3
  const base = old ?? { t: 50, f: 50, r: 50, s: 0, o: 0, y: year, l: year }
  const patch: Partial<Edge> = {
    t: bump(base.t, fx.t * k, 0, 100),
    r: bump(base.r, fx.r * k, 0, 100),
    s: bump(base.s, fx.s * k, 0, 100),
    o: bump(base.o, fx.o * k, -100, 100),
    l: Math.max(base.l, year),
    m: withMemory(list, formatMemory({ kind, year, w, by }), year),
  }
  if (old === undefined) {
    // the affection invariant: an edge that points at the player starts at the person's relationship
    const rel = person !== undefined && ego === playerRef(g) ? person.relationship : NaN
    patch.f = Number.isFinite(rel) ? Math.min(100, Math.max(0, rel)) : 50
    patch.y = year
  }
  return putEdge(g, key, patch)
}
