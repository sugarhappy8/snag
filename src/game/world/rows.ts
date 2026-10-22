// What the three index shards (world/people, firms, homes) share (R2-L14): the rules for a row, the cut to a cap, the merge of a
// fresh sync into the rows already there, and the one way an index is written (the holdings table of R2-L15 is written the same way).
//
// An index row says "the world knows about this entity": { id, seen } plus a field or two. The record itself (the Person, the
// Asset, the old NPC firm inside its owner) stays where it is and is never copied here. `seen` is the last year the record was
// observed in the game: a record that is gone leaves its row behind, with its old `seen` (never later than last year), until the
// level-of-detail sweep demotes it.
//
// Pure functions of their arguments, plus commitShard (the writer). No luck, no clock, no import of the game.
import { parseRef, type EntityRef } from '../kernel/ids'
import type { GameState } from '../types'
import { ensureWorld, readWorld } from './state'

/** The years a row's `seen` may name. */
export const SEEN_MIN = 1900
export const SEEN_MAX = 100_000
/** The most `over` (the count of records past the cap) may say. */
export const OVER_MAX = 100_000
/** Entries of a hostile rows array a normalizer looks at: the world is bounded by its node cap, a reader by this. */
const SCAN_MAX = 5_000

export interface IndexRow {
  id: EntityRef
  seen: number
}

export interface IndexShard<R extends IndexRow> {
  v: 1
  rows: R[]
  over: number
}

/** A non-null object that is not an array, a Date, a Map and so on: what JSON.parse and structuredClone make of `{ ... }`. */
export function isPlain(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && Object.prototype.toString.call(x) === '[object Object]'
}

/** A saved `seen`: an integer from 1900 to 100000, else null. */
export function seenOf(x: unknown): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX ? x : null
}

/** A saved `over`: a whole number from 0 to 100000, 0 for anything else. */
export function overOf(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  return Math.max(0, Math.min(OVER_MAX, Math.trunc(x))) || 0
}

/** `x` when it is a valid ref of this kind, else null. */
export function refOfKind(x: unknown, kind: string): EntityRef | null {
  const p = parseRef(x)
  return p !== null && p.kind === kind ? (x as EntityRef) : null
}

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Whether two values write the same JSON. A value that cannot be written (a cycle, a throwing getter) is never the same as anything. */
export function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * One row per id (the latest `seen` wins, the first of equals), cut to `cap` rows keeping the most recently seen (ties by id),
 * sorted by id. The result depends only on the set of rows, never on the order they came in.
 */
export function keepFreshest<R extends IndexRow>(rows: readonly R[], cap: number): R[] {
  const best = new Map<string, R>()
  for (const r of rows) {
    const have = best.get(r.id)
    if (!have || r.seen > have.seen) best.set(r.id, r)
  }
  let out = [...best.values()]
  if (out.length > cap) out = out.sort((a, b) => b.seen - a.seen || byId(a, b)).slice(0, cap)
  return out.sort(byId)
}

/**
 * Makes any value into a valid index shard: { v: 1, rows, over } with rows that pass `rowOf` (which returns a fresh clean row or
 * null), at most `cap` of them. It never throws. A valid input comes back as itself, so a shard that is already clean costs no copy
 * and keeps its identity (worldShard caches by it).
 */
export function normalizeIndex<R extends IndexRow>(raw: unknown, cap: number, rowOf: (x: unknown) => R | null): IndexShard<R> {
  try {
    const next: IndexShard<R> = { v: 1, rows: [], over: 0 }
    if (isPlain(raw) && raw.v === 1) {
      const src = raw.rows
      if (Array.isArray(src)) {
        const kept: R[] = []
        for (let i = 0; i < src.length && i < SCAN_MAX; i++) {
          const row = rowOf(src[i])
          if (row !== null) kept.push(row)
        }
        next.rows = keepFreshest(kept, cap)
      }
      next.over = overOf(raw.over)
    }
    return sameJson(raw, next) ? (raw as IndexShard<R>) : next
  } catch {
    return { v: 1, rows: [], over: 0 }
  }
}

/**
 * The rows after a sync: every row already there for a record that is not present now (it is gone, and keeps its old `seen`), plus
 * the rows `fresh` for the records that were selected. A present record that was not selected (it fell past the cap) has no row.
 * A gone record was not seen in this pass, so a row stamped with `year` (the world was synced earlier this year, then the record
 * left: a death and the estate before an heir's sync) goes back to last year, and no row claims "seen this year" for a record the
 * game no longer has.
 */
export function mergeRows<R extends IndexRow>(old: readonly R[], present: ReadonlySet<string>, fresh: readonly R[], year: number): R[] {
  const back = year - 1
  const gone = old.filter((r) => !present.has(r.id)).map((r) => (r.seen >= year && back >= SEEN_MIN ? { ...r, seen: back } : r))
  return [...gone, ...fresh]
}

/**
 * Stores a shard, by replacing its root, and only when it differs from what the world holds (an unchanged index is not rewritten, so
 * a second sync in a year changes nothing, and a state whose shard roots are frozen can be synced). When the shard is absent and the
 * new one is the empty one, nothing is written at all: an old save keeps reading as empty, with no world made for it.
 */
export function commitShard(g: GameState, name: 'people' | 'firms' | 'homes' | 'holdings' | 'lod', next: object, empty: object): void {
  const have: unknown = readWorld(g)[name]
  if (have === undefined ? sameJson(next, empty) : sameJson(next, have)) return
  ;(ensureWorld(g) as Record<string, unknown>)[name] = next
}
