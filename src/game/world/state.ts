// The world root (R2, design 13.2): GameState.world, its reader, its writer and the registry of the shards that live inside it.
//
//   readWorld(g)       pure. An absent or garbage g.world reads as a frozen { v: 1 }; nothing is written, so an old save needs no migration.
//   ensureWorld(g)     the writer: creates { v: 1 }, and drops garbage (here, on the first write, never on a read).
//   registerShard      at module load, a shard names itself and gives the reader that makes its saved form safe. A shard that is
//                      not registered is not part of the world: normalizeWorld drops it.
//   worldShard(g, n)   pure. The shard read through its registered reader (cached per object).
//   normalizeWorld     total and bounded: what a load, a restore or a Time Machine jump passes g.world through. It never throws,
//                      whatever it is given, and it never returns more than WORLD_NODE_CAP nodes.
//
// A shard is written by replacing its root, never by editing it in place (ensureWorld(g).people = { ...next }), because the Save
// track shares each shard root between drafts, frozen. worldShard caches by the identity of the saved object for the same reason:
// an object that is edited in place would read stale. The ledger is the one in-place shard and is read through peekLedger instead.
//
// This file imports no shard module (the registration hub, world/shards.ts, imports them), so the root can never be part of a cycle
// with the shards it holds. `./world` is still the file src/game/world.ts (countries and names); never add world/index.ts.
import type { GameState } from '../types'
import { WORLD_NODE_CAP } from './caps'
import type { WorldState } from './types'

export const WORLD_V = 1

/** The years a world's own `y` may name. */
const YEAR_MIN = 1900
const YEAR_MAX = 100_000
/** A shard name: a lower case word of 16 characters at most. `v` and `y` are the root's own fields. */
const NAME = /^[a-z][a-z0-9]{0,15}$/

export interface ShardDef {
  /** Total: whatever raw is, it returns a safe value (bounded, versioned), or undefined to drop the shard. A valid input comes back as itself. */
  normalize: (raw: unknown) => unknown
}

interface Registered {
  def: ShardDef
  /** Normalized output by the identity of the saved object: a second read of the same object is free. */
  cache: WeakMap<object, unknown>
}

const SHARDS = new Map<string, Registered>()

const EMPTY: Readonly<WorldState> = Object.freeze<WorldState>({ v: 1 })

const has = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)

/** A non-null object that is not an array, a Date, a Map and so on: what JSON.parse and structuredClone make of `{ ... }`. */
function isPlain(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && Object.prototype.toString.call(x) === '[object Object]'
}

function isWorld(x: unknown): x is WorldState {
  return isPlain(x) && x.v === WORLD_V
}

/** The world of this game. Pure: an absent, garbage or wrong-version `world` reads as a frozen { v: 1 }. */
export function readWorld(g: Pick<GameState, 'world'>): Readonly<WorldState> {
  const w: unknown = g.world
  return isWorld(w) ? w : EMPTY
}

/** The world, created on the first call: a writer. Garbage is replaced by a fresh { v: 1 }. */
export function ensureWorld(g: GameState): WorldState {
  const w: unknown = g.world
  if (isWorld(w)) return w
  const fresh: WorldState = { v: WORLD_V }
  g.world = fresh
  return fresh
}

/**
 * Names a shard of the world and gives its reader. Call it at module load. Registering the same definition twice is fine; a
 * different one for a taken name throws, and so does a name that is not 1 to 16 lower case letters and digits (or is `v` or `y`).
 */
export function registerShard(name: string, def: ShardDef): void {
  if (typeof name !== 'string' || !NAME.test(name) || name === 'v' || name === 'y') throw new RangeError(`registerShard: bad shard name ${String(name)}`)
  if (!def || typeof def.normalize !== 'function') throw new TypeError(`registerShard: ${name} needs a normalize function`)
  const have = SHARDS.get(name)
  if (have) {
    if (have.def === def) return
    throw new Error(`registerShard: ${name} is already registered with another definition`)
  }
  SHARDS.set(name, { def, cache: new WeakMap() })
}

/** The registered shard names, sorted. */
export function shardNames(): readonly string[] {
  return [...SHARDS.keys()].sort()
}

/** A shard read through its registered reader. Pure. Undefined when the shard is absent, not registered, or its reader drops it. */
export function worldShard<T = unknown>(g: Pick<GameState, 'world'>, name: string): Readonly<T> | undefined {
  const entry = SHARDS.get(name)
  if (!entry) return undefined
  const world = readWorld(g)
  if (!has(world, name)) return undefined
  const raw = world[name]
  if (raw === undefined) return undefined
  try {
    if (raw === null || typeof raw !== 'object') return entry.def.normalize(raw) as Readonly<T> | undefined
    if (entry.cache.has(raw)) return entry.cache.get(raw) as Readonly<T> | undefined
    const out = entry.def.normalize(raw)
    entry.cache.set(raw, out)
    return out as Readonly<T> | undefined
  } catch {
    return undefined
  }
}

/** Nodes of `value`, each value one node (the way the save loader counts), stopping as soon as the count passes `limit` (cycles end there too). */
function nodeCount(value: unknown, limit: number): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length) {
    const item = stack.pop()
    if (++n > limit) return n
    if (item !== null && typeof item === 'object') {
      const kids: unknown[] = Array.isArray(item) ? item : Object.values(item)
      if (n + stack.length + kids.length > limit) return limit + 1
      for (const k of kids) stack.push(k)
    }
  }
  return n
}

interface Kept {
  name: string
  value: unknown
  nodes: number
  drop: boolean
}

function build(raw: unknown): WorldState {
  const out: WorldState = { v: WORLD_V }
  if (!isWorld(raw)) return out
  const y = raw.y
  if (typeof y === 'number' && Number.isInteger(y) && y >= YEAR_MIN && y <= YEAR_MAX) out.y = y
  // The root itself, its `v` and its `y` are nodes too.
  let total = 2 + (out.y === undefined ? 0 : 1)
  const kept: Kept[] = []
  for (const name of shardNames()) {
    if (!has(raw, name)) continue
    let value: unknown
    try {
      value = SHARDS.get(name)!.def.normalize(raw[name])
    } catch {
      continue
    }
    if (value === undefined) continue
    const nodes = nodeCount(value, WORLD_NODE_CAP)
    kept.push({ name, value, nodes, drop: false })
    total += nodes
  }
  if (total > WORLD_NODE_CAP) {
    // Largest first, ties by name. A shard that passed the cap by itself is counted as cap + 1, so it always goes before the rest.
    const order = [...kept].sort((a, b) => b.nodes - a.nodes || (a.name < b.name ? -1 : 1))
    for (const k of order) {
      if (total <= WORLD_NODE_CAP) break
      k.drop = true
      total -= k.nodes
    }
  }
  for (const k of kept) if (!k.drop) out[k.name] = k.value
  return out
}

/**
 * Makes any value into a valid world: { v: 1 } for anything that is not one, `y` only as an integer from 1900 to 100000, only the
 * registered shards (each through its own reader), and at most WORLD_NODE_CAP nodes (the largest shards are dropped first). It never throws.
 */
export function normalizeWorld(raw: unknown): WorldState {
  try {
    return build(raw)
  } catch {
    return { v: WORLD_V }
  }
}
