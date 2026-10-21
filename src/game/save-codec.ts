// The save codec (R2, K.5, design 13.5): a GameState as a head and chunks. This is the encode half (R2-S3); the decode half
// (assembleSave, the hostile-chunk policy) joins it in R2-S4. Nothing here touches storage, and nothing calls it yet.
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
import { LOG_GROUP_YEARS, LOG_TAIL, freezeRoot, getAt, listSlices, setAt, sliceOf, type SliceDef } from './kernel/slices'
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
