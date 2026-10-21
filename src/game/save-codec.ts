// The save codec (R2, K.5, design 13.5): a GameState as a head and chunks, and back. The encode half (encodeSave, R2-S3) and the
// decode half (assembleSave, R2-S4, the hostile-chunk policy) are here. Nothing here touches storage; the store and the boot (R2-S6,
// R2-S7) fetch the chunk texts and hand them over.
//
// A save is a HEAD plus CHUNK records:
//
//   head    valid JSON. The `core` (every player-side field, in the key order of GameState) with a placeholder string
//           "~<slice key>" where a bigger slice was moved out, then `"chunks":<manifest>` and `"sv":<slice versions>`. It has
//           schemaVersion 3, so an older build files it as `newer` and keeps it, never as `damaged`.
//   chunks  content addressed texts, stored beside the head and written before it. A chunk is named `world`, `log.<n>` or
//           `e.<kind>.<n>`, and its id is `<name>.<textSum>`. The manifest says, by name, the id and the length of each.
//
// What leaves the core, by the slice table (save-slices.ts):
//
//   world chunk   one JSON object. `"<slice key>":<value>` for each slice of chunk 'world' that is a plain object or array
//                 (`"flags.worldEconomy"`), then `"<parent>":{"<name>":<value>,...}` for the shards of a 'subkeys' slice such as
//                 `world`, in ascending key order. A record that could not be cut into entity shards rides here whole.
//   log.<n>       a JSON array of the completed life-log years of one decade of age, in order. The last LOG_TAIL years stay in
//                 the core. A log that dips into an earlier decade stops chunking at the dip (a chunk must never reorder it).
//   e.<kind>.<n>  a JSON object holding the entries of an entity record whose key hashes to shard n (shardOf). Only a record
//                 whose keys are in ascending order is cut this way, so the decoder can merge the shards back in key order.
//
// Only a plain object or array, and not an empty one, is ever moved out, so a placeholder can never collide with a real value
// and an empty container costs nothing. The head keeps the key order of `JSON.stringify(g)`, which makes "reload gives identical
// JSON" a string comparison. A slice written `replace` is never edited in place: its text is cached by object identity (and the
// object is frozen, so a stray write is a TypeError and not a stale save). A slice written `inplace` is stringified every time,
// but its chunk id is content addressed, so an unchanged text is the same id and is not written again.
//
// The encoder draws no random numbers, never changes the state it reads (a deep-frozen state is fine), and keeps only caches that
// are a pure function of the text. It is a leaf of the layering: it imports the slice registry, the slice table and types.
//
// The decoder (assembleSave) is the other direction, and the one that meets hostile input, so it never trusts a head or a chunk:
//
//   - a manifest entry is checked against the grammar (name, id, length) before its text is even asked for;
//   - a text must have the manifest's length and checksum before it is parsed, and the parsed value must stay inside the caps of
//     the slices that live in its chunk (nodes and characters, summed over a decade or shard group), at most 100 levels deep, with
//     finite numbers, and the shape its chunk kind has (a world chunk an object, a log chunk an array of log years, an entity
//     shard an object whose keys hash to its shard);
//   - a chunk that fails any of that is a LostChunk (missing, hostile or size) and is never half applied;
//   - a good chunk is normalized slice by slice and put where the core holds its placeholder, the key keeping its place; a core
//     value that is not a placeholder wins over its chunk; a placeholder nothing replaced is deleted, so the slice reads as absent
//     (the economy then re-seeds at the current year with no retroactive earnings, economy/index.ts ensureEconomy);
//   - keys that reach the prototype chain are never written (slices.ts setAt refuses them, the entity merge refuses them).
//
// The result is a v2-shaped record plus schemaVersion, ready for migrateSave(game, { versions }); the migration is not run here.
import { LOG_GROUP_YEARS, LOG_TAIL, cleanVersions, countNodes, deleteAt, freezeRoot, getAt, listSlices, setAt, sliceOf, type SliceDef } from './kernel/slices'
import { ensureSliceTable } from './save-slices'
import type { GameState } from './types'

/** The head member that holds the manifest. */
export const HEAD_CHUNKS_KEY = 'chunks'
/** The head member that holds the slice versions. */
export const HEAD_VERSIONS_KEY = 'sv'
/** Most chunk records a save may name. A life that would pass it keeps the extra entity records whole in the world chunk. */
export const MAX_CHUNKS = 96
/** Most characters of one chunk text. A longer one is a bug, so the encoder throws (a throw is "save failed", save.ts). */
export const MAX_CHUNK_CHARS = 4_000_000

const CHUNK_NAME = '(?:world|log\\.[0-9]{1,2}|e\\.[a-z0-9]{1,16}\\.[0-9]{1,2})'
/** What a chunk name may be: `world`, `log.<n>`, `e.<kind>.<n>`. */
export const CHUNK_NAME_PATTERN = new RegExp(`^${CHUNK_NAME}$`)
/** What a chunk id may be: a chunk name, a dot and the textSum of the text (base 36, 6 to 32 characters). */
export const CHUNK_ID_PATTERN = new RegExp(`^${CHUNK_NAME}\\.[0-9a-z]{6,32}$`)

/** The first character of a placeholder; the rest is the slice key. */
export const PLACEHOLDER_MARK = '~'

/** The placeholder a head holds where the slice at `key` was moved out. */
export function placeholder(key: string): string {
  return PLACEHOLDER_MARK + key
}

/** A chunk as the manifest names it. `len` is `text.length` (UTF-16 units). */
export interface ChunkRef {
  readonly id: string
  readonly len: number
}
/** Chunk name to its id and length, in the order world, log decades, entity shards. */
export type ChunkManifest = Readonly<Record<string, ChunkRef>>

export interface EncodedSave {
  /** The core with placeholders, then "chunks" and "sv". Valid JSON. */
  readonly head: string
  /** Chunk id to plain text, every non-core chunk. */
  readonly chunks: ReadonlyMap<string, string>
  readonly manifest: ChunkManifest
  readonly stats: {
    /** The head's length in characters (the core, with its manifest). */
    readonly coreChars: number
    /** Chunk name to the length of its text. */
    readonly chunkChars: Readonly<Record<string, number>>
    /** JSON.stringify calls this encode made on slice values (a warm cache makes none; the core's own stringify is not counted). */
    readonly stringified: number
    /** Entity records that rode whole in the world chunk because their keys are not in ascending order (a producer that unsorts is caught here). */
    readonly unsortedEntities: readonly string[]
  }
}

type Rec = Record<string, unknown>

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const isObj = (v: unknown): v is object => typeof v === 'object' && v !== null
const isHolder = (v: unknown): v is Rec => isObj(v) && !Array.isArray(v)

/** True for a non-empty plain object or a non-empty array: the only values a chunk ever takes out of the core. */
function isMovable(v: unknown): v is object {
  if (Array.isArray(v)) return v.length > 0
  if (!isHolder(v)) return false
  for (const k in v) if (hasOwn(v, k)) return true
  return false
}

// ---------------------------------------------------------------------------
// Checksums and shards

/**
 * Two independent 32-bit FNV-style hashes plus the length, base 36: plenty for a few hundred chunks, and a pure function of the
 * text (the store and the Time Machine compare ids across sessions). It is hashText of save.ts, which has named the Time Machine's
 * chunks since v1.5.0, moved here so the main save and the Time Machine share one (R2-S9 makes save.ts import it).
 */
export function textSum(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 16777619)
    b = Math.imul(b ^ c, 0x5bd1e995)
    b ^= b >>> 13
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length.toString(36)}`
}

/** The shard (0 to shards - 1) an entity key belongs to: FNV-1a over its UTF-16 units. */
export function shardOf(key: string, shards: number): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) % shards
}

// ---------------------------------------------------------------------------
// Caches. Every one is a pure function of text or of frozen objects, so a stale entry cannot be served.

/** Text of a frozen `replace` root, by identity. */
let rootText = new WeakMap<object, string>()
/** Text of a completed (frozen) log year, by identity. */
let yearText = new WeakMap<object, string>()
/** One memo per log decade: the years it was built from (by identity), its text and id. */
let logMemo = new Map<number, { years: readonly object[]; text: string; id: string }>()
/** The world chunk: the pieces its text was joined from, the text and the id. A hit compares pieces with ===: a cached text is the same string. */
let worldMemo: { pieces: readonly string[]; text: string; id: string } | null = null
/** One memo per entity slice: the root it was cut from, and the texts of its shards. */
let entityMemo = new Map<string, EntityMemo>()
/** The `sv` text, for the table it was built from. */
let svMemo: { table: readonly SliceDef[]; text: string } | null = null

interface ShardMemo {
  keys: readonly string[]
  vals: readonly unknown[]
  text: string
  id: string
}
interface EntityMemo {
  root: object
  /** False when the record's keys are not in ascending order. */
  eligible: boolean
  /** Non-empty shards. */
  count: number
  shards: readonly (ShardMemo | undefined)[]
}

/** Forget every cache (tests start from a cold encoder; nothing else needs this). */
export function resetCodecCachesForTests(): void {
  rootText = new WeakMap()
  yearText = new WeakMap()
  logMemo = new Map()
  worldMemo = null
  entityMemo = new Map()
  svMemo = null
}

/** What one encode counts and carries between its steps. */
interface Run {
  stringified: number
  unsorted: string[]
}

/**
 * The text of a slice value. A `replace` root is frozen on its first sight and its text cached by identity, so a hit costs
 * nothing; an `inplace` value is stringified every time.
 */
function sliceText(value: object, replace: boolean, run: Run): string {
  if (replace) {
    const hit = rootText.get(value)
    if (hit !== undefined) return hit
    freezeRoot(value)
    run.stringified++
    const text = JSON.stringify(value)
    rootText.set(value, text)
    return text
  }
  run.stringified++
  return JSON.stringify(value)
}

// ---------------------------------------------------------------------------
// The head

/** A shallow copy of `view[parent]`, made once, so a placeholder can be written into it without touching the state. */
function detach(view: Rec, copied: Set<string>, parent: string): Rec | undefined {
  const current = view[parent]
  if (!isHolder(current)) return undefined
  if (!copied.has(parent)) {
    view[parent] = { ...current }
    copied.add(parent)
  }
  return view[parent] as Rec
}

/** Replace the value at `key` (one or two segments) in the view with its placeholder, and return the value; undefined when nothing moves. */
function takeOut(view: Rec, copied: Set<string>, key: string): object | undefined {
  const value = getAt(view, key)
  if (!isMovable(value)) return undefined
  const dot = key.indexOf('.')
  if (dot > 0 && detach(view, copied, key.slice(0, dot)) === undefined) return undefined
  setAt(view, key, placeholder(key))
  return value
}

/** `{"id":...}` text of a manifest, built by hand: names and ids are made of lower case letters, digits and dots only. */
function manifestText(entries: readonly (readonly [string, ChunkRef])[]): string {
  return `{${entries.map(([name, ref]) => `"${name}":{"id":"${ref.id}","len":${ref.len}}`).join(',')}}`
}

/** The `sv` text: every declared slice key (letters, digits, one dot) and its version. */
function versionsText(table: readonly SliceDef[]): string {
  if (svMemo !== null && svMemo.table === table) return svMemo.text
  const text = `{${table.map((s) => `"${s.key}":${s.version}`).join(',')}}`
  svMemo = { table, text }
  return text
}

// ---------------------------------------------------------------------------
// The life log

/** The decade chunk number of an age: floor(age / 10), kept in the grammar's two digits. NaN when the age is not a number. */
function decadeOf(age: unknown): number {
  if (typeof age !== 'number' || !Number.isFinite(age)) return Number.NaN
  return Math.min(99, Math.max(0, Math.floor(age / LOG_GROUP_YEARS)))
}

interface LogSplit {
  /** What stays in the core: the years after the chunked prefix, the tail included. */
  readonly rest: readonly unknown[]
  /** Decade number and its years, ascending. */
  readonly groups: readonly (readonly [number, readonly object[]])[]
}

/**
 * Cut the completed years of the log (all but the last LOG_TAIL) into decade groups. The chunked part is the longest prefix whose
 * decades never go down and whose members are log years, so the chunks followed by the core part are the log in its own order.
 */
function splitLog(log: unknown): LogSplit | null {
  if (!Array.isArray(log) || log.length <= LOG_TAIL) return null
  const completed = log.length - LOG_TAIL
  const groups: [number, object[]][] = []
  let taken = 0
  let last = -1
  for (let i = 0; i < completed; i++) {
    const y: unknown = log[i]
    if (!isHolder(y) || !Array.isArray(y.entries)) break
    const n = decadeOf(y.age)
    if (Number.isNaN(n) || n < last) break
    if (n !== last) groups.push([n, []])
    groups[groups.length - 1]![1].push(y)
    last = n
    taken++
  }
  if (taken === 0) return null
  return { rest: log.slice(taken), groups }
}

/** The text and id of one decade chunk. A single-entry memo per decade makes an unchanged decade about ten identity compares. */
function logChunk(n: number, years: readonly object[], run: Run): { text: string; id: string } {
  const memo = logMemo.get(n)
  if (memo !== undefined && memo.years.length === years.length && memo.years.every((y, i) => y === years[i])) return memo
  const texts = years.map((year) => {
    const hit = yearText.get(year)
    if (hit !== undefined) return hit
    freezeRoot(year)
    run.stringified++
    const text = JSON.stringify(year)
    yearText.set(year, text)
    return text
  })
  const text = `[${texts.join(',')}]`
  const out = { years: years.slice(), text, id: `log.${n}.${textSum(text)}` }
  logMemo.set(n, out)
  return out
}

// ---------------------------------------------------------------------------
// Entity records

/** The keys of an entity record cut into shards, or null when they are not in ascending order (or one is `__proto__`). */
function partition(value: Rec, shards: number): { keys: string[][]; count: number } | null {
  const keys = Object.keys(value)
  let prev: string | undefined
  for (const k of keys) {
    if (k === '__proto__' || (prev !== undefined && !(prev < k))) return null
    prev = k
  }
  const out: string[][] = Array.from({ length: shards }, () => [])
  for (const k of keys) out[shardOf(k, shards)]!.push(k)
  let count = 0
  for (const list of out) if (list.length > 0) count++
  return { keys: out, count }
}

/** Where a slice value goes in the world chunk: a whole slice under its own key, or a shard under its 'subkeys' parent. */
interface Member {
  readonly key: string
  readonly container?: string
}

interface EntityJob {
  readonly def: SliceDef
  /** The slice key, such as `world.<name>`. */
  readonly path: string
  /** The object of the head's view that holds the value, where its placeholder goes, and the key it holds it under. */
  readonly holder: Rec
  readonly name: string
  readonly value: Rec
  /** Where the record goes if it rides whole in the world chunk. */
  readonly member: Member
}

interface EntityPlan {
  readonly eligible: boolean
  /** Non-empty shards. */
  readonly count: number
  /** The keys of each shard; null when the memo for this root is still good (or the record is not eligible). */
  readonly keys: string[][] | null
}

function planEntity(job: EntityJob): EntityPlan {
  const memo = job.def.write === 'replace' ? entityMemo.get(job.path) : undefined
  if (memo !== undefined && memo.root === job.value) return { eligible: memo.eligible, count: memo.count, keys: null }
  const cut = partition(job.value, job.def.entities!.shards)
  return cut === null ? { eligible: false, count: 0, keys: null } : { eligible: true, count: cut.count, keys: cut.keys }
}

interface ShardOut {
  readonly name: string
  readonly id: string
  readonly text: string
}

/** The shard texts of an eligible entity record: from the memo when its root is the one it was cut from, else each shard whose entries changed. */
function entityChunks(job: EntityJob, plan: EntityPlan, run: Run): ShardOut[] {
  const { def, path, value } = job
  const kind = def.entities!.kind
  const replace = def.write === 'replace'
  const memo = replace ? entityMemo.get(path) : undefined
  if (plan.keys === null) {
    return memo!.shards.flatMap((s, n) => (s === undefined ? [] : [{ name: `e.${kind}.${n}`, id: s.id, text: s.text }]))
  }
  if (replace) freezeRoot(value)
  const shards: (ShardMemo | undefined)[] = []
  const out: ShardOut[] = []
  for (let n = 0; n < plan.keys.length; n++) {
    const keys = plan.keys[n]!
    if (keys.length === 0) {
      shards.push(undefined)
      continue
    }
    const vals = keys.map((k) => value[k])
    const old = memo?.shards[n]
    let shard: ShardMemo
    if (old !== undefined && old.keys.length === keys.length && old.keys.every((k, i) => k === keys[i]) && old.vals.every((v, i) => v === vals[i])) {
      shard = old
    } else {
      const part: Rec = {}
      for (let i = 0; i < keys.length; i++) part[keys[i]!] = vals[i]
      run.stringified++
      const text = JSON.stringify(part)
      shard = { keys, vals, text, id: `e.${kind}.${n}.${textSum(text)}` }
    }
    shards.push(shard)
    out.push({ name: `e.${kind}.${n}`, id: shard.id, text: shard.text })
  }
  if (replace) entityMemo.set(path, { root: value, eligible: true, count: out.length, shards })
  return out
}

// ---------------------------------------------------------------------------
// The encoder

/** A slice value that goes into the world chunk, with the member it is written under. */
interface WorldMember extends Member {
  readonly text: string
}

const byKey = (a: WorldMember, b: WorldMember): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/** The pieces of the world chunk text: whole slices by key, then each container's shards by name. */
function worldPieces(members: readonly WorldMember[]): string[] {
  const whole = members.filter((m) => m.container === undefined).sort(byKey)
  const containers = [...new Set(members.flatMap((m) => (m.container === undefined ? [] : [m.container])))].sort()
  const pieces: string[] = ['{']
  let first = true
  for (const m of whole) {
    pieces.push(`${first ? '' : ','}"${m.key}":`, m.text)
    first = false
  }
  for (const container of containers) {
    pieces.push(`${first ? '' : ','}"${container}":{`)
    first = false
    members
      .filter((m) => m.container === container)
      .sort(byKey)
      .forEach((m, i) => pieces.push(`${i === 0 ? '' : ','}"${m.key}":`, m.text))
    pieces.push('}')
  }
  pieces.push('}')
  return pieces
}

function put(chunks: Map<string, string>, entries: [string, ChunkRef][], name: string, id: string, text: string): void {
  if (text.length > MAX_CHUNK_CHARS) throw new Error(`save chunk "${name}" is ${text.length} characters, over MAX_CHUNK_CHARS (${MAX_CHUNK_CHARS})`)
  chunks.set(id, text)
  entries.push([name, { id, len: text.length }])
}

/** True when `key` is a row under a 'subkeys' parent (`world.testent`): the parent's container handles it. */
function underSubkeys(table: readonly SliceDef[], key: string): boolean {
  const dot = key.indexOf('.')
  if (dot < 0) return false
  const parent = key.slice(0, dot)
  return table.some((p) => p.shape === 'subkeys' && p.key === parent)
}

/**
 * Turn a state into a head and its chunks. Pure: it reads `g`, writes nothing, draws nothing. A replace slice whose root is
 * unchanged costs no stringify, so a tap that changes only the core pays for the core alone. Throws only when a chunk would pass
 * MAX_CHUNK_CHARS, which is a bug (the caller treats a throw as a failed save).
 */
export function encodeSave(g: GameState): EncodedSave {
  ensureSliceTable()
  const table = listSlices()
  const run: Run = { stringified: 0, unsorted: [] }
  // The core view: the state's own top-level keys, in the state's order. A slice that moves out leaves a placeholder in a copy.
  const view: Rec = { ...(g as unknown as Rec) }
  delete view[HEAD_CHUNKS_KEY]
  delete view[HEAD_VERSIONS_KEY]
  const copied = new Set<string>()
  const members: WorldMember[] = []
  const jobs: EntityJob[] = []
  const logs: { n: number; text: string; id: string }[] = []

  for (const def of table) {
    if (def.chunk === 'core' || underSubkeys(table, def.key)) continue
    if (def.shape === 'logYears') {
      const split = splitLog(view[def.key])
      if (split === null) continue
      view[def.key] = split.rest
      for (const [n, years] of split.groups) logs.push({ n, ...logChunk(n, years, run) })
    } else if (def.shape === 'subkeys') {
      // The container stays in the core as a shallow object; each own key that has a row in a chunk moves out.
      const container = view[def.key]
      if (def.chunk !== 'world' || !isHolder(container)) continue
      const holder: Rec = { ...container }
      view[def.key] = holder
      for (const name of Object.keys(holder)) {
        const path = `${def.key}.${name}`
        const row = sliceOf(path)
        const value = holder[name]
        if (row === undefined || (row.chunk !== 'world' && row.chunk !== 'entities') || !isMovable(value)) continue
        const member: Member = { key: name, container: def.key }
        if (row.chunk === 'entities' && isHolder(value)) jobs.push({ def: row, path, holder, name, value, member })
        else {
          members.push({ ...member, text: sliceText(value, row.write === 'replace', run) })
          holder[name] = placeholder(path)
        }
      }
    } else if (def.chunk === 'world' || def.chunk === 'entities') {
      const value = getAt(view, def.key)
      if (!isMovable(value)) continue
      if (def.chunk === 'entities' && isHolder(value)) {
        // A whole entity slice at a top-level or two-segment path: its placeholder goes where the value was.
        const dot = def.key.indexOf('.')
        const holder = dot < 0 ? view : detach(view, copied, def.key.slice(0, dot))
        if (holder !== undefined) jobs.push({ def, path: def.key, holder, name: def.key.slice(dot + 1), value, member: { key: def.key } })
        continue
      }
      const moved = takeOut(view, copied, def.key)
      if (moved !== undefined) members.push({ key: def.key, text: sliceText(moved, def.write === 'replace', run) })
    }
  }

  // Entity records, in table order. The chunk records left after the world chunk and the log decades are the budget: a record whose
  // shards would pass it, or whose keys are not in ascending order, rides whole in the world chunk.
  let budget = MAX_CHUNKS - 1 - logs.length
  const shardChunks: ShardOut[] = []
  for (const job of jobs) {
    const plan = planEntity(job)
    if (plan.eligible && plan.count <= budget) {
      budget -= plan.count
      shardChunks.push(...entityChunks(job, plan, run))
    } else {
      const replace = job.def.write === 'replace'
      if (!plan.eligible) {
        run.unsorted.push(job.path)
        if (replace) entityMemo.set(job.path, { root: job.value, eligible: false, count: 0, shards: [] })
      }
      members.push({ ...job.member, text: sliceText(job.value, replace, run) })
    }
    job.holder[job.name] = placeholder(job.path)
  }

  const chunks = new Map<string, string>()
  const entries: [string, ChunkRef][] = []
  if (members.length > 0) {
    const pieces = worldPieces(members)
    let memo = worldMemo
    if (memo === null || memo.pieces.length !== pieces.length || !memo.pieces.every((p, i) => p === pieces[i])) {
      const text = pieces.join('')
      memo = { pieces, text, id: `world.${textSum(text)}` }
      worldMemo = memo
    }
    put(chunks, entries, 'world', memo.id, memo.text)
  }
  for (const l of logs) put(chunks, entries, `log.${l.n}`, l.id, l.text)
  for (const s of shardChunks) put(chunks, entries, s.name, s.id, s.text)

  // The head: the core's own text with the manifest and the versions spliced in before its closing brace.
  const core = JSON.stringify(view)
  const head = `${core.slice(0, -1)}${core.length > 2 ? ',' : ''}"${HEAD_CHUNKS_KEY}":${manifestText(entries)},"${HEAD_VERSIONS_KEY}":${versionsText(table)}}`
  const manifest: Record<string, ChunkRef> = {}
  const chunkChars: Record<string, number> = {}
  for (const [name, ref] of entries) {
    manifest[name] = ref
    chunkChars[name] = ref.len
  }
  return { head, chunks, manifest, stats: { coreChars: head.length, chunkChars, stringified: run.stringified, unsortedEntities: run.unsorted } }
}

/** The state as plain JSON, whole: a valid record with no `chunks` key, for backups, exports and a backend with no chunk store. */
export function inlineSave(g: GameState): string {
  return JSON.stringify(g)
}

// ---------------------------------------------------------------------------
// The decoder (R2-S4)

/** Most characters of a hostile chunk text kept for the quarantine copy. */
export const MAX_RAW_CHARS = 2_000_000
/** Most losses one assemble reports: a hostile head could hold thousands of placeholders. */
const MAX_LOST = 128
/** Deepest nesting a chunk may have (isLoadableGame allows 128 for the whole record, and a chunk sits a few levels down). */
const MAX_CHUNK_DEPTH = 100
/** The longest chunk name kept in a LostChunk. */
const MAX_NAME_CHARS = 64
/** Segments no key from a file may be written under: they reach the prototype chain. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** What did not load: a chunk by name (or, when no chunk was named for it, a slice by key), and why. */
export interface LostChunk {
  readonly name: string
  /** 'missing': no text. 'hostile': the text, the manifest entry or the value is not what a writer makes. 'size': it passes its caps. */
  readonly why: 'missing' | 'hostile' | 'size'
  /** The hostile text, at most MAX_RAW_CHARS characters, kept for the quarantine copy. Only a hostile text has one. */
  readonly raw?: string
}

export type Assembled =
  | { readonly kind: 'ready'; readonly game: Record<string, unknown>; readonly versions: Readonly<Record<string, number>>; readonly lost: readonly LostChunk[] }
  | { readonly kind: 'invalid'; readonly reason: string }

/** A plain object at schema 3 or later whose own `chunks` is a plain object (not an array): a head that names chunks. */
export function isChunkedHead(value: unknown): value is Record<string, unknown> {
  if (!isHolder(value)) return false
  const schema = value.schemaVersion
  return typeof schema === 'number' && Number.isSafeInteger(schema) && schema >= 3 && hasOwn(value, HEAD_CHUNKS_KEY) && isHolder(value[HEAD_CHUNKS_KEY])
}

interface Entry {
  readonly name: string
  readonly id: string
  readonly len: number
}

const clip = (name: string): string => (name.length > MAX_NAME_CHARS ? name.slice(0, MAX_NAME_CHARS) : name)

/** A hostile chunk's loss, with its text (cut at MAX_RAW_CHARS) kept for the quarantine copy. */
const hostileLoss = (name: string, text: string): LostChunk => ({ name, why: 'hostile', raw: text.length > MAX_RAW_CHARS ? text.slice(0, MAX_RAW_CHARS) : text })

/**
 * The manifest of a head: its valid entries in manifest order, and a loss for each that fails. At most MAX_CHUNKS keys are looked
 * at (a longer manifest is cut there and the cut is one loss), so a hostile one costs a bounded read. Null when it is not an object.
 */
function readManifest(head: Rec): { entries: Entry[]; lost: LostChunk[] } | null {
  const manifest = head[HEAD_CHUNKS_KEY]
  if (!isHolder(manifest)) return null
  const entries: Entry[] = []
  const lost: LostChunk[] = []
  let seen = 0
  for (const name in manifest) {
    if (!hasOwn(manifest, name)) continue
    if (++seen > MAX_CHUNKS) {
      lost.push({ name: HEAD_CHUNKS_KEY, why: 'hostile' })
      break
    }
    const ref = manifest[name]
    const good =
      CHUNK_NAME_PATTERN.test(name) &&
      isHolder(ref) &&
      typeof ref.id === 'string' &&
      CHUNK_ID_PATTERN.test(ref.id) &&
      ref.id.startsWith(`${name}.`) &&
      typeof ref.len === 'number' &&
      Number.isSafeInteger(ref.len) &&
      ref.len >= 0 &&
      ref.len <= MAX_CHUNK_CHARS
    if (good) entries.push({ name, id: (ref as Rec).id as string, len: (ref as Rec).len as number })
    else lost.push({ name: clip(name), why: 'hostile' })
  }
  return { entries, lost }
}

/** The chunk ids a head names, valid ones only, in manifest order, at most MAX_CHUNKS. [] for a head with no usable manifest. */
export function neededChunkIds(head: Record<string, unknown>): string[] {
  if (!isHolder(head)) return []
  const manifest = readManifest(head)
  return manifest === null ? [] : manifest.entries.map((e) => e.id)
}

/** Where a chunk's content goes. */
type Place =
  | { readonly kind: 'world' }
  | { readonly kind: 'log' }
  | { readonly kind: 'entity'; readonly row: SliceDef; readonly shard: number }

/** The kind of chunk a name is, by the table; null when no slice claims it (an entity kind nobody declares, a shard past the count). */
function placeOf(name: string, table: readonly SliceDef[]): Place | null {
  if (name === 'world') return { kind: 'world' }
  if (name.startsWith('log.')) return table.some((s) => s.shape === 'logYears') ? { kind: 'log' } : null
  const [, kind, n] = name.split('.')
  const row = table.find((s) => s.chunk === 'entities' && s.entities?.kind === kind)
  const shard = Number(n)
  return row !== undefined && shard < row.entities!.shards ? { kind: 'entity', row, shard } : null
}

/** What is left of the caps of a group of chunks (every log decade is one group, every entity slice's shards another). */
interface Room {
  nodes: number
  chars: number
}

const groupOf = (place: Place): string => (place.kind === 'entity' ? place.row.key : place.kind)

/** The caps of a group: the world chunk may hold any world slice (or an entity record riding whole), the others have one row. */
function roomFor(place: Place, table: readonly SliceDef[]): Room {
  const rows =
    place.kind === 'world'
      ? table.filter((s) => s.chunk === 'world' || s.chunk === 'entities')
      : place.kind === 'log'
        ? table.filter((s) => s.shape === 'logYears')
        : [place.row]
  return { nodes: rows.reduce((a, s) => a + s.caps.nodes, 0), chars: rows.reduce((a, s) => a + s.caps.chars, 0) }
}

/** Depth and finite numbers, walked without recursion: a value JSON can parse but the engine cannot safely calculate with. */
function isSound(value: unknown): boolean {
  const items: unknown[] = [value]
  const depths: number[] = [0]
  while (items.length > 0) {
    const item = items.pop()
    const depth = depths.pop()!
    if (depth > MAX_CHUNK_DEPTH) return false
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return false
    } else if (isObj(item)) {
      for (const child of Array.isArray(item) ? item : Object.values(item)) {
        items.push(child)
        depths.push(depth + 1)
      }
    }
  }
  return true
}

/** A completed life-log year as save-schema.ts validLogYear reads it (its bounds are copied here so the codec stays a leaf): a bad decade is then a lost chunk, not a life that will not load. */
function isLogYear(y: unknown): boolean {
  return (
    isHolder(y) &&
    typeof y.age === 'number' &&
    Number.isSafeInteger(y.age) &&
    y.age >= 0 &&
    y.age <= 10_000 &&
    typeof y.year === 'number' &&
    Number.isSafeInteger(y.year) &&
    y.year >= 1900 &&
    y.year <= 100_000 &&
    Array.isArray(y.entries) &&
    y.entries.every((entry: unknown) => isHolder(entry) && typeof entry.id === 'string' && typeof entry.text === 'string' && typeof entry.tone === 'string')
  )
}

/** The shape a chunk of this kind has. A world chunk is an object whose 'subkeys' members are objects; a log chunk an array of log years; an entity shard an object of its own keys. */
function hasShape(place: Place, value: unknown, table: readonly SliceDef[]): boolean {
  if (place.kind === 'log') return Array.isArray(value) && value.every(isLogYear)
  if (!isHolder(value)) return false
  if (place.kind === 'entity') {
    const shards = place.row.entities!.shards
    return Object.keys(value).every((k) => !FORBIDDEN_KEYS.has(k) && shardOf(k, shards) === place.shard)
  }
  const containers = new Set(table.filter((s) => s.shape === 'subkeys').map((s) => s.key))
  return Object.keys(value).every((k) => !containers.has(k) || isHolder(value[k]))
}

type Got = { readonly ok: true; readonly value: unknown; readonly place: Place; readonly text: string } | { readonly ok: false; readonly lost: LostChunk }

/** Fetch, check and parse one chunk. Every way it can be wrong is a LostChunk; a chunk that gets through is whole. */
function readChunk(entry: Entry, text: unknown, table: readonly SliceDef[], rooms: Map<string, Room>): Got {
  const { name } = entry
  if (typeof text !== 'string') return { ok: false, lost: { name, why: 'missing' } }
  const hostile: Got = { ok: false, lost: hostileLoss(name, text) }
  const place = placeOf(name, table)
  if (place === null) return hostile
  if (text.length !== entry.len || textSum(text) !== entry.id.slice(name.length + 1)) return hostile
  const group = groupOf(place)
  let room = rooms.get(group)
  if (room === undefined) {
    room = roomFor(place, table)
    rooms.set(group, room)
  }
  const tooBig: Got = { ok: false, lost: { name, why: 'size' } }
  if (text.length > room.chars) return tooBig
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return hostile
  }
  const nodes = countNodes(value, room.nodes)
  if (nodes > room.nodes) return tooBig
  if (!isSound(value) || !hasShape(place, value, table)) return hostile
  room.nodes -= nodes
  room.chars -= text.length
  return { ok: true, value, place, text }
}

/** What a game is built into: a shallow copy of the head whose containers are copied before they are written, so the head is never touched. */
interface Build {
  readonly game: Rec
  readonly copied: Set<string>
  /** Slices whose normalize has run (a chunk value was normalized as it was placed). */
  readonly normalized: Set<string>
}

/** `row.normalize`, which never throws by contract; a buggy one reads as "drop this slice" and does not take the record with it. */
function normalizeOf(row: SliceDef, value: unknown): unknown {
  try {
    return row.normalize(value)
  } catch {
    return undefined
  }
}

/**
 * Put a chunk's value where the core holds the placeholder of `path`. 'kept': the core holds something else there (a real value
 * wins, normalized later) or nothing. 'dropped': the slice's own normalize refused the value, so the placeholder stays for the sweep.
 */
function place(b: Build, path: string, value: unknown): 'placed' | 'kept' | 'dropped' {
  if (getAt(b.game, path) !== placeholder(path)) return 'kept'
  const row = sliceOf(path)
  if (row === undefined) return 'kept'
  b.normalized.add(path)
  const out = normalizeOf(row, value)
  if (out === undefined) return 'dropped'
  const dot = path.indexOf('.')
  if (dot > 0 && detach(b.game, b.copied, path.slice(0, dot)) === undefined) return 'kept'
  setAt(b.game, path, out)
  return 'placed'
}

/** The members of a world chunk: whole slices under their own keys, and the shards of each 'subkeys' container. True when a member was dropped. */
function applyWorld(b: Build, value: Rec, rows: ReadonlyMap<string, SliceDef>): boolean {
  let dropped = false
  // A member no declared row names is ignored. A shard name is a row only when it is a short lower case word (sliceOf), so the
  // names that reach the prototype chain (__proto__, constructor, prototype) are never a path, and setAt is never asked for one.
  for (const key of Object.keys(value)) {
    const row = rows.get(key)
    if (row === undefined) continue
    const member = value[key]
    if (row.shape === 'subkeys') {
      const shards = member as Rec
      for (const name of Object.keys(shards)) {
        if (sliceOf(`${key}.${name}`) === undefined) continue
        if (place(b, `${key}.${name}`, shards[name]) === 'dropped') dropped = true
      }
    } else if (place(b, key, member) === 'dropped') dropped = true
  }
  return dropped
}

/** The log: the decade chunks in age order, then what the core still holds (the tail, and any years from a dip on). */
function applyLog(b: Build, row: SliceDef, decades: readonly { readonly n: number; readonly years: readonly unknown[] }[]): void {
  const tail = b.game[row.key]
  if (decades.length === 0 || !Array.isArray(tail)) return
  const years = [...decades].sort((x, y) => x.n - y.n).flatMap((d) => d.years)
  b.normalized.add(row.key)
  const out = normalizeOf(row, [...years, ...tail])
  if (out === undefined) deleteAt(b.game, row.key)
  else setAt(b.game, row.key, out)
}

/** One record from its shards, in ascending key order (the order the encoder required of it). The keys are checked, and made by fromEntries, which defines properties and never assigns. */
function mergeShards(parts: readonly Rec[]): Rec {
  const entries: [string, unknown][] = []
  for (const part of parts) for (const k of Object.keys(part)) entries.push([k, part[k]])
  entries.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
  return Object.fromEntries(entries)
}

/** True when the chunk that would have held a placeholder's slice is already a named loss, so the placeholder is not a second one. */
function attributed(row: SliceDef | undefined, lost: readonly LostChunk[]): boolean {
  if (row?.chunk === 'entities' && row.entities !== undefined) {
    const prefix = `e.${row.entities.kind}.`
    return lost.some((l) => l.name.startsWith(prefix))
  }
  return lost.some((l) => l.name === 'world')
}

/**
 * Rebuild a GameState record from a head and its chunk texts (by id; null or absent is a record the store does not have). The
 * result is the encoded state exactly (the same JSON string) when every chunk is good, and otherwise the state without what was
 * lost, named in `lost`. Never throws: whatever goes wrong, the answer is `invalid` or a record with a loss.
 */
export function assembleSave(head: Record<string, unknown>, texts: ReadonlyMap<string, string | null>): Assembled {
  try {
    if (!isChunkedHead(head)) return { kind: 'invalid', reason: 'not a chunked head: it needs schemaVersion 3 or later and a chunks object' }
    ensureSliceTable()
    const manifest = readManifest(head)
    if (manifest === null) return { kind: 'invalid', reason: 'the chunk manifest is not an object' }
    const table = listSlices()
    const rows = new Map(table.map((s) => [s.key, s] as const))
    const logRow = table.find((s) => s.shape === 'logYears')
    const fetchText = (id: string): unknown => (typeof texts?.get === 'function' ? texts.get(id) : undefined)

    const game: Rec = { ...head }
    delete game[HEAD_CHUNKS_KEY]
    delete game[HEAD_VERSIONS_KEY]
    const b: Build = { game, copied: new Set(), normalized: new Set() }
    const lost: LostChunk[] = [...manifest.lost]

    // Read and check every chunk first, so one that fails is never half applied; then apply them in a fixed order.
    const rooms = new Map<string, Room>()
    const worlds: { entry: Entry; value: Rec; text: string }[] = []
    const decades: { n: number; years: unknown[] }[] = []
    const shards = new Map<string, { row: SliceDef; parts: Rec[]; chunks: { name: string; text: string }[] }>()
    for (const entry of manifest.entries) {
      const got = readChunk(entry, fetchText(entry.id), table, rooms)
      if (!got.ok) {
        lost.push(got.lost)
        continue
      }
      if (got.place.kind === 'world') worlds.push({ entry, value: got.value as Rec, text: got.text })
      else if (got.place.kind === 'log') decades.push({ n: Number(entry.name.slice(4)), years: got.value as unknown[] })
      else {
        const group = shards.get(got.place.row.key) ?? { row: got.place.row, parts: [], chunks: [] }
        group.parts.push(got.value as Rec)
        group.chunks.push({ name: entry.name, text: got.text })
        shards.set(got.place.row.key, group)
      }
    }

    for (const w of worlds) if (applyWorld(b, w.value, rows)) lost.push(hostileLoss(w.entry.name, w.text))
    if (logRow !== undefined) applyLog(b, logRow, decades)
    for (const group of shards.values()) {
      if (place(b, group.row.key, mergeShards(group.parts)) === 'dropped') for (const c of group.chunks) lost.push(hostileLoss(c.name, c.text))
    }

    // A placeholder nothing replaced: the slice reads as absent.
    const swept: { path: string; row: SliceDef }[] = []
    for (const row of table) {
      if (row.chunk === 'core' || row.shape === 'logYears' || underSubkeys(table, row.key)) continue
      if (row.shape === 'subkeys') {
        const container = b.game[row.key]
        if (!isHolder(container)) continue
        const names = Object.keys(container).filter((n) => container[n] === placeholder(`${row.key}.${n}`))
        const holder = names.length > 0 ? detach(b.game, b.copied, row.key) : undefined
        if (holder === undefined) continue
        for (const n of names) {
          delete holder[n]
          swept.push({ path: `${row.key}.${n}`, row: sliceOf(`${row.key}.${n}`) ?? row })
        }
      } else if (getAt(b.game, row.key) === placeholder(row.key)) {
        const dot = row.key.indexOf('.')
        if (dot > 0 && detach(b.game, b.copied, row.key.slice(0, dot)) === undefined) continue
        deleteAt(b.game, row.key)
        swept.push({ path: row.key, row })
      }
    }
    for (const { path, row } of swept) if (!attributed(row, lost)) lost.push({ name: clip(path), why: 'missing' })

    // What the core held itself, and what no chunk replaced, is normalized by its own slice, once, in the table's order.
    for (const row of table) {
      if (b.normalized.has(row.key)) continue
      const value = getAt(b.game, row.key)
      if (value === undefined) continue
      const out = normalizeOf(row, value)
      if (out === value) continue
      const dot = row.key.indexOf('.')
      if (dot > 0 && detach(b.game, b.copied, row.key.slice(0, dot)) === undefined) continue
      if (out === undefined) deleteAt(b.game, row.key)
      else setAt(b.game, row.key, out)
    }

    return { kind: 'ready', game: b.game, versions: cleanVersions(head[HEAD_VERSIONS_KEY]) ?? {}, lost: lost.length > MAX_LOST ? lost.slice(0, MAX_LOST) : lost }
  } catch (error) {
    return { kind: 'invalid', reason: error instanceof Error ? clip(error.message) : 'unreadable chunked head' }
  }
}
