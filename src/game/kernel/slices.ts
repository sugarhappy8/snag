// Slices (R2, K.5, design 13.5): every piece of saved state declares its home.
//
// A slice is a dotted path into GameState ('character', 'flags.worldEconomy', 'world') with a shape version, the chunk of the
// save it lives in, caps (nodes and characters) that a loader enforces, a normalize that runs when it is read, and an optional
// migrate that brings an older shape up. The save codec (save-codec.ts) reads the table to split a game into a head and chunks;
// act() reads the `write` rule to decide what it may share between drafts. Nothing here knows how a save is stored.
//
//   write 'replace'   writers build a new root and never edit the old one. Its text and checksum are cached by object identity,
//                     and act() hands every draft the same frozen object (freezeRoot), so a stray in-place write is a TypeError.
//   write 'inplace'   the default: cloned on every tap, re-stringified on every save.
//
// A key of one segment is a top-level field. A key of two segments carves itself out of its parent ('flags.worldEconomy' out of
// 'flags'). A slice with shape 'subkeys' ('world') makes every own key of its object a sub-slice, 'world.<name>', declared or
// not (hasSlice, sliceOf), so a module adds a shard without touching the table.
//
// This file is part of the kernel (L0): it imports only types, so any layer may read the table without joining a cycle.
// It draws no random numbers and keeps no state beyond the table itself.

/** Where a slice is stored: 'core' is the head of the save, the others are chunk records beside it. */
export type SliceChunk = 'core' | 'world' | 'log' | 'entities'

/**
 * 'whole': one value at `key`. 'logYears': the life log, split into the core tail and decade chunks.
 * 'subkeys': an object whose own keys are sub-slices `${key}.${name}` (g.world).
 */
export type SliceShape = 'whole' | 'logYears' | 'subkeys'

export interface SliceCaps {
  /** Most JSON nodes (objects, arrays and leaves) a loader accepts for this slice. */
  readonly nodes: number
  /** Most characters of its text. */
  readonly chars: number
}

/** How a record of entities is cut into chunk records: `e.<kind>.<n>` for n below `shards`. */
export interface EntityShards {
  /** /^[a-z0-9]{1,16}$/ */
  readonly kind: string
  /** 1 to 16. */
  readonly shards: number
}

export interface SliceDef {
  /** Dotted path into GameState, one or two segments: 'character', 'flags.worldEconomy', 'world'. A longer key carves itself out of its parent's text. */
  readonly key: string
  /** The saved shape of this slice. Starts at 1 (the v4.1.1 shape). Bumps with a `migrate` step. */
  readonly version: number
  readonly chunk: SliceChunk
  readonly caps: SliceCaps
  /** Applied when a chunk is read. Pure, idempotent, never throws; undefined drops the key. */
  readonly normalize: (raw: unknown) => unknown
  /** Brings a value stored at `from` (below `version`) to `version` in one call. `game` is the whole record being loaded (read only). */
  readonly migrate?: (from: number, json: unknown, game: Readonly<Record<string, unknown>>) => unknown
  /** 'replace' (writers build a new root; identity-cached, shared by act()) or 'inplace' (default). */
  readonly write?: 'replace' | 'inplace'
  /** Default 'whole'. */
  readonly shape?: SliceShape
  /** Only with chunk 'entities'. */
  readonly entities?: EntityShards
  /** What a lost chunk does: 'fresh' (default, the key is dropped and the game goes on) or 'fatal' (core chunk only). */
  readonly onLost?: 'fresh' | 'fatal'
}

/** Log years that stay in the core: the current one. */
export const LOG_TAIL = 1
/** Completed log years per `log.<n>` chunk, grouped by floor(age / 10). */
export const LOG_GROUP_YEARS = 10

const CHUNKS: readonly SliceChunk[] = ['core', 'world', 'log', 'entities']
const SHAPES: readonly SliceShape[] = ['whole', 'logYears', 'subkeys']
/** A declared segment: a field name. */
const SEGMENT = /^[A-Za-z][A-Za-z0-9]{0,31}$/
/** A segment that is not declared but derived under a 'subkeys' parent: a short lower case name. */
const DERIVED_NAME = /^[a-z][a-z0-9]{0,15}$/
const ENTITY_KIND = /^[a-z0-9]{1,16}$/
/** Segments no path may write through: they reach the prototype chain. */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
/** An object that can hold a key: not null, not an array. */
const isHolder = (v: unknown): v is Record<string, unknown> => isObj(v) && !Array.isArray(v)

// ---------------------------------------------------------------------------
// The table

const SLICES = new Map<string, SliceDef>()
let sorted: readonly SliceDef[] | null = null

function bad(key: unknown, why: string): never {
  throw new Error(`defineSlice(${String(key)}): ${why}`)
}

function checkKey(key: unknown): string {
  if (typeof key !== 'string') return bad(key, 'the key must be a string')
  const parts = key.split('.')
  if (parts.length > 2) bad(key, 'the key has one or two segments')
  for (const p of parts) {
    if (!SEGMENT.test(p)) bad(key, `segment "${p}" must be a letter then letters and digits, 32 at most`)
    if (FORBIDDEN.has(p)) bad(key, `segment "${p}" is not allowed`)
  }
  return key
}

function checkCaps(key: string, caps: SliceCaps | undefined): void {
  const good = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n > 0
  if (!isObj(caps) || !good(caps.nodes) || !good(caps.chars)) bad(key, 'caps.nodes and caps.chars must be whole numbers above 0')
}

function checkEntities(key: string, def: SliceDef): void {
  const e = def.entities
  if (e === undefined) {
    if (def.chunk === 'entities') bad(key, "chunk 'entities' needs entities: { kind, shards }")
    return
  }
  if (def.chunk !== 'entities') bad(key, "entities need chunk 'entities'")
  if (!isObj(e) || typeof e.kind !== 'string' || !ENTITY_KIND.test(e.kind)) bad(key, 'entities.kind must be 1 to 16 lower case letters or digits')
  if (!Number.isInteger(e.shards) || e.shards < 1 || e.shards > 16) bad(key, 'entities.shards must be a whole number from 1 to 16')
}

/**
 * Declare a slice. Throws on a malformed declaration (a duplicate or malformed key, a version below 1, caps that are not above 0,
 * entities that do not match the chunk, shape 'logYears' off the key 'log', onLost 'fatal' off the core chunk): the table is
 * code, so a bad row fails at the first import, never in a player's save. Returns the stored (frozen) declaration.
 */
export function defineSlice(def: SliceDef): SliceDef {
  const key = checkKey(def?.key)
  if (SLICES.has(key)) bad(key, 'already declared')
  if (!Number.isInteger(def.version) || def.version < 1) bad(key, 'version must be a whole number of at least 1')
  if (!CHUNKS.includes(def.chunk)) bad(key, `chunk must be one of ${CHUNKS.join(', ')}`)
  checkCaps(key, def.caps)
  if (typeof def.normalize !== 'function') bad(key, 'normalize must be a function')
  if (def.migrate !== undefined && typeof def.migrate !== 'function') bad(key, 'migrate must be a function')
  if (def.write !== undefined && def.write !== 'replace' && def.write !== 'inplace') bad(key, "write must be 'replace' or 'inplace'")
  if (def.shape !== undefined && !SHAPES.includes(def.shape)) bad(key, `shape must be one of ${SHAPES.join(', ')}`)
  if (def.shape === 'logYears' && key !== 'log') bad(key, "shape 'logYears' belongs to the key 'log'")
  if (def.shape === 'subkeys' && key.includes('.')) bad(key, "shape 'subkeys' needs a one-segment key")
  if (def.onLost !== undefined && def.onLost !== 'fresh' && def.onLost !== 'fatal') bad(key, "onLost must be 'fresh' or 'fatal'")
  if (def.onLost === 'fatal' && def.chunk !== 'core') bad(key, "onLost 'fatal' is for the core chunk only")
  checkEntities(key, def)
  const stored: SliceDef = Object.freeze({
    ...def,
    caps: Object.freeze({ nodes: def.caps.nodes, chars: def.caps.chars }),
    ...(def.entities !== undefined ? { entities: Object.freeze({ kind: def.entities.kind, shards: def.entities.shards }) } : {}),
  })
  SLICES.set(key, stored)
  sorted = null
  return stored
}

/** Every declared slice, sorted by key (UTF-16 order). Derived `world.<name>` rows are not listed. */
export function listSlices(): readonly SliceDef[] {
  sorted ??= Object.freeze([...SLICES.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)))
  return sorted
}

/** The parent slice of a derived `<parent>.<name>`, when `key` is one: the parent is declared 'subkeys' and the name is a short lower case word. */
function derivedParent(key: string): SliceDef | undefined {
  if (typeof key !== 'string') return undefined
  const parts = key.split('.')
  if (parts.length !== 2 || !DERIVED_NAME.test(parts[1]!) || FORBIDDEN.has(parts[1]!)) return undefined
  const parent = SLICES.get(parts[0]!)
  return parent !== undefined && parent.shape === 'subkeys' ? parent : undefined
}

/**
 * The declared row, or for `<parent>.<name>` under a 'subkeys' parent the row it derives: the parent's chunk, version, caps and
 * write rule, shape 'whole', and a normalize that keeps any value. (`world.facts` is a `replace` row in the `world` chunk.)
 */
export function sliceOf(key: string): SliceDef | undefined {
  const declared = SLICES.get(key)
  if (declared !== undefined) return declared
  const parent = derivedParent(key)
  if (parent === undefined) return undefined
  const derived: SliceDef = {
    key,
    version: parent.version,
    chunk: parent.chunk,
    caps: parent.caps,
    normalize: (raw) => raw,
    write: parent.write ?? 'inplace',
    shape: 'whole',
  }
  return Object.freeze(derived)
}

/** True for a declared key, and for `<parent>.<name>` when `<parent>` is a declared 'subkeys' slice (a shard no table row names). */
export function hasSlice(key: string): boolean {
  return SLICES.has(key) || derivedParent(key) !== undefined
}

// ---------------------------------------------------------------------------
// Paths

/** The segments of a dotted path, or null when one is empty. */
function segments(path: string): string[] | null {
  if (typeof path !== 'string') return null
  const parts = path.split('.')
  return parts.every((p) => p !== '') ? parts : null
}

/** The value at a dotted path, reading own properties only; undefined when any step is missing. */
export function getAt(root: unknown, path: string): unknown {
  const parts = segments(path)
  if (parts === null) return undefined
  let cur: unknown = root
  for (const p of parts) {
    if (!isObj(cur) || !hasOwn(cur, p)) return undefined
    cur = cur[p]
  }
  return cur
}

/**
 * Write `value` at a dotted path. An existing key keeps its position (so a head's key order stays the state's). A missing parent is
 * not invented: the write does nothing. A segment of '__proto__', 'constructor' or 'prototype', or an empty segment, throws.
 */
export function setAt(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = segments(path)
  if (parts === null) throw new TypeError(`setAt: "${path}" has an empty segment`)
  for (const p of parts) if (FORBIDDEN.has(p)) throw new TypeError(`setAt: "${path}" goes through ${p}`)
  let cur: unknown = root
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isHolder(cur) || !hasOwn(cur, parts[i]!)) return
    cur = cur[parts[i]!]
  }
  if (isHolder(cur)) cur[parts[parts.length - 1]!] = value
}

/** Remove the own key at a dotted path. Does nothing when any step is missing. */
export function deleteAt(root: Record<string, unknown>, path: string): void {
  const parts = segments(path)
  if (parts === null) return
  let cur: unknown = root
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isHolder(cur) || !hasOwn(cur, parts[i]!)) return
    cur = cur[parts[i]!]
  }
  const last = parts[parts.length - 1]!
  if (isHolder(cur) && hasOwn(cur, last)) delete cur[last]
}

// ---------------------------------------------------------------------------
// Counting and freezing (both iterative: a hostile save may be deep)

/**
 * The number of JSON nodes in `value`: the root, every object and array, every leaf. Returns `limit + 1` as soon as the count
 * passes `limit`, reading no further, so a loader can test a cap on a value it does not trust.
 */
export function countNodes(value: unknown, limit: number): number {
  let count = 1
  if (count > limit) return limit + 1
  if (!isObj(value)) return count
  const stack: Record<string, unknown>[] = [value]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const child: unknown = node[i]
        if (++count > limit) return limit + 1
        if (isObj(child)) stack.push(child)
      }
    } else {
      for (const k in node) {
        if (!hasOwn(node, k)) continue
        const child = node[k]
        if (++count > limit) return limit + 1
        if (isObj(child)) stack.push(child)
      }
    }
  }
  return count
}

/** Objects already deep-frozen by freezeRoot: a second call on one (or on a child of one) walks nothing. */
const FROZEN = new WeakSet<object>()

/**
 * Deep-freeze `root`, once per object. A replace slice is shared between drafts by reference; freezing it turns an in-place write
 * into a TypeError instead of a stale cache. Already frozen input is accepted, and its unfrozen children are still frozen.
 */
export function freezeRoot(root: object): void {
  if (!isObj(root) || FROZEN.has(root) || ArrayBuffer.isView(root)) return
  FROZEN.add(root)
  const stack: Record<string, unknown>[] = [root]
  const visit = (child: unknown): void => {
    if (isObj(child) && !FROZEN.has(child) && !ArrayBuffer.isView(child)) {
      FROZEN.add(child)
      stack.push(child)
    }
  }
  while (stack.length > 0) {
    const node = stack.pop()!
    if (!Object.isFrozen(node)) Object.freeze(node)
    if (Array.isArray(node)) for (let i = 0; i < node.length; i++) visit(node[i])
    else for (const k of Object.keys(node)) visit(node[k])
  }
}

// ---------------------------------------------------------------------------
// Migration

/**
 * Bring each slice of `game` up to its current version, in place. A slice's stored version is `versions[key]` when that is an own
 * finite number, else `missing` ('current' means the record is at the current version of every slice it does not name: nothing to do).
 * For a slice below its version that has a `migrate`, the result of `migrate(from, value, game)` is written back at the key
 * (undefined deletes it). Never throws: a throwing migrate drops the key and the loop goes on.
 */
export function migrateSlices(game: Record<string, unknown>, versions: Readonly<Record<string, number>> | null, missing: number | 'current'): void {
  for (const def of listSlices()) {
    if (def.migrate === undefined) continue
    const named = isObj(versions) && hasOwn(versions, def.key) ? versions[def.key] : undefined
    const stored: number = typeof named === 'number' && Number.isFinite(named) ? named : missing === 'current' ? def.version : missing
    if (!(stored < def.version)) continue
    try {
      const out = def.migrate(stored, getAt(game, def.key), game)
      if (out === undefined) deleteAt(game, def.key)
      else setAt(game, def.key, out)
    } catch {
      deleteAt(game, def.key)
    }
  }
}

/** The most slice versions read from a record's `sv` map (the table has about twenty rows; a hostile map is cut here). */
const MAX_SLICE_VERSIONS = 256
/** The highest slice version a record may name. */
const MAX_SLICE_VERSION = 1000

/**
 * The slice versions a v3 head names, cleaned: a plain object's own entries whose value is a whole number from 1 to 1000, at most
 * MAX_SLICE_VERSIONS of them. Anything else (a non-object, an array, a value out of range or of another type) is ignored, so a
 * damaged map reads as "every slice is current" for the entries it spoils. The result has no prototype to pollute. Null when `raw`
 * is not a plain object. Both the loader (migrateSave) and the chunk decoder (assembleSave) read a head's `sv` through this.
 */
export function cleanVersions(raw: unknown): Record<string, number> | null {
  if (!isHolder(raw)) return null
  const out: Record<string, number> = Object.create(null) as Record<string, number>
  let kept = 0
  for (const key of Object.keys(raw)) {
    if (kept >= MAX_SLICE_VERSIONS) break
    const version = raw[key]
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || version > MAX_SLICE_VERSION) continue
    out[key] = version
    kept++
  }
  return out
}
