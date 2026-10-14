// Persistence: the current life (kept by save-store.ts, in IndexedDB or localStorage), and in
// localStorage the ribbon collection, the graveyard and the Time Machine's start-of-year snapshots.
import { refreshRoyalCareers } from './npc-lives'
import { isFiniteNumber, isGameShell, isLoadableGame, isRecord, migrateLegacyAi, migrateSave } from './save-schema'
import { readRecord, removeRecord, saveRecord, setLocalQuotaEvictor } from './save-store'
import { refreshFamilyTalents } from './talents'
import { decodeSnapshotRecord, encodeSnapshotRecord } from './snapshot-codec'
import { isStartOfYear, stopOf, TIME_MACHINE_STOPS, type TimeStop } from './timeMachine'
import type { AncestorSummary, GameState, Json } from './types'

// It lives in save-schema.ts now; test/offline.test.ts still imports it from here.
export { migrateLegacyAi }
export { deleteSaveCopy, flushSave, getSaveStatus, readSaveCopy, subscribeSaveStatus } from './save-store'
export type { SaveStatus } from './save-store'
export type { SaveNotice } from './save-quarantine'

const RIBBONS_KEY = 'anotherlife.ribbons.v1'
const GRAVEYARD_KEY = 'anotherlife.graveyard.v1'
/** Graves kept (the oldest are bulldozed first). */
const GRAVEYARD_MAX = 100

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // quota exceeded / storage disabled
    return false
  }
}

/**
 * Save the current life. With localStorage, false only when the browser refused even after the
 * Time Machine gave back the room its snapshots were using (evictLocalSnapshot): snapshots never
 * cost you the game. With IndexedDB the write is queued and this is true; a write that fails shows
 * in getSaveStatus().persistFailed, and flushSave() resolves false.
 */
export function saveGame(g: GameState): boolean {
  let json: string
  try {
    json = JSON.stringify(g)
  } catch {
    return false
  }
  return saveRecord(json)
}

/** The saved life brought up to the current schema, as a fresh object; null when there is none it can play. No side effects. */
export function loadGame(): GameState | null {
  const record = readRecord()
  if (record === null) return null
  let value: unknown
  try {
    value = JSON.parse(record)
  } catch {
    return null
  }
  const saved = migrateSave(value)
  if (saved.kind !== 'ready') return null
  refreshRoyalCareers(saved.game)
  refreshFamilyTalents(saved.game)
  return saved.game
}

/** Forget the saved life (it was abandoned). A record a newer version wrote stays until it has a copy. */
export function clearSave(): void {
  removeRecord()
}

/** Ribbon id -> times earned. */
export function loadRibbons(): Record<string, number> {
  const raw = read<unknown>(RIBBONS_KEY)
  if (!isRecord(raw)) return {}
  const out: Record<string, number> = {}
  for (const [id, count] of Object.entries(raw)) {
    if (!id || id === '__proto__' || id === 'constructor' || id === 'prototype' || !isFiniteNumber(count) || count <= 0) continue
    out[id] = Math.floor(count)
  }
  return out
}

/** Count one more earning of a ribbon. False when the browser refused to store it. */
export function recordRibbon(id: string): boolean {
  const all = loadRibbons()
  all[id] = (all[id] ?? 0) + 1
  return write(RIBBONS_KEY, all)
}

/** Take back one earning of a ribbon (a death the Time Machine undid). */
export function unrecordRibbon(id: string): void {
  const all = loadRibbons()
  const n = all[id] ?? 0
  if (n <= 0) return
  if (n === 1) delete all[id]
  else all[id] = n - 1
  write(RIBBONS_KEY, all)
}

export interface GraveyardEntry extends AncestorSummary {
  lifeId: string
  obituary: string | null
}

export function loadGraveyard(): GraveyardEntry[] {
  const raw = read<unknown>(GRAVEYARD_KEY)
  if (!Array.isArray(raw)) return []
  const out: GraveyardEntry[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const valid = typeof entry.lifeId === 'string'
      && typeof entry.name === 'string'
      && typeof entry.gender === 'string'
      && isFiniteNumber(entry.generation)
      && isFiniteNumber(entry.bornYear)
      && isFiniteNumber(entry.diedYear)
      && isFiniteNumber(entry.age)
      && typeof entry.causeOfDeath === 'string'
      && isFiniteNumber(entry.netWorth)
      && typeof entry.occupation === 'string'
      && (entry.ribbon === undefined || entry.ribbon === null || typeof entry.ribbon === 'string')
      && (entry.obituary === undefined || entry.obituary === null || typeof entry.obituary === 'string')
      && (entry.countryId === undefined || typeof entry.countryId === 'string')
    if (!valid) continue
    out.push({ ...(entry as unknown as GraveyardEntry), ribbon: typeof entry.ribbon === 'string' ? entry.ribbon : null, obituary: typeof entry.obituary === 'string' ? entry.obituary : null })
    if (out.length >= GRAVEYARD_MAX) break
  }
  return out
}

/**
 * Bury a life (replacing an older grave of the same life). Returns the old graves that had to
 * make room, or null when the browser refused to store it.
 */
export function addToGraveyard(entry: GraveyardEntry): GraveyardEntry[] | null {
  const all = loadGraveyard().filter((e) => e.lifeId !== entry.lifeId)
  all.unshift(entry)
  return write(GRAVEYARD_KEY, all.slice(0, GRAVEYARD_MAX)) ? all.slice(GRAVEYARD_MAX) : null
}

export function removeFromGraveyard(lifeId: string): void {
  write(GRAVEYARD_KEY, loadGraveyard().filter((e) => e.lifeId !== lifeId))
}

/**
 * Record a finished life: its ribbon and its grave. Notes in g.flags exactly what was stored,
 * so the Time Machine can take precisely that back (unrecordDeath).
 */
export function recordDeath(g: GameState, entry: GraveyardEntry): void {
  g.flags.deathRecorded = true
  g.flags.recordedRibbon = g.ribbon && recordRibbon(g.ribbon) ? g.ribbon : null
  const bumped = addToGraveyard(entry)
  g.flags.recordedGrave = bumped !== null
  if (bumped && bumped.length > 0) g.flags.bumpedGraves = bumped as unknown as Json
}

/**
 * The death of `g` never happened (the Time Machine undid it): take back its grave (restoring
 * any old grave it pushed out) and the ribbon recorded for it.
 */
export function unrecordDeath(g: GameState): void {
  if (g.flags.deathRecorded !== true) return
  // Deaths recorded before these notes existed recorded both.
  const legacy = !('recordedGrave' in g.flags)
  if (legacy || g.flags.recordedGrave === true) {
    const all = loadGraveyard()
    const graves = all.filter((e) => e.lifeId !== g.lifeId)
    // Old graves this death pushed out come back, unless its grave is already gone (the
    // graveyard was cleared, or the grave bulldozed): then nothing should reappear. The ribbon
    // is taken back either way, so bulldozing your own grave can't keep it.
    const stillThere = graves.length < all.length
    const bumped = stillThere && Array.isArray(g.flags.bumpedGraves) ? (g.flags.bumpedGraves as unknown as GraveyardEntry[]) : []
    for (const old of bumped) if (old && typeof old.lifeId === 'string' && !graves.some((e) => e.lifeId === old.lifeId)) graves.push(old)
    if (graves.length !== all.length || bumped.length > 0) write(GRAVEYARD_KEY, graves.slice(0, GRAVEYARD_MAX))
  }
  const ribbon = legacy ? g.ribbon : g.flags.recordedRibbon
  if (typeof ribbon === 'string' && ribbon) unrecordRibbon(ribbon)
}

/** Forget every earned ribbon and past life (Settings → Danger zone). */
export function clearRibbonsAndGraveyard(): void {
  try {
    localStorage.removeItem(RIBBONS_KEY)
    localStorage.removeItem(GRAVEYARD_KEY)
  } catch {
    // storage disabled
  }
}

// ---------------------------------------------------------------------------
// Time Machine snapshots
//
// The life as it was at the start of each of its last TIME_MACHINE_STOPS years, kept apart
// from the main save so a slow or failed snapshot can never cost the player their game.
//
// - Payloads live in IndexedDB (plenty of room). Without it they fall back to localStorage
//   under LOCAL_SNAPSHOT_BUDGET characters, giving their room back whenever the main save
//   needs it, and failing that to memory (lost on reload).
// - They are compact: the life log is most of a late-game save (about 70% of the ~100-300 KB
//   of a 70-year life), so each year of it is stored once as a chunk shared by every snapshot
//   that contains it unchanged. Ten snapshots cost little more than one.
// - A small index in localStorage lists the snapshots (age, year, a summary, the chunks each
//   one uses), so menus can read it synchronously and it survives reloads.
// - Every storage operation runs one at a time on a promise chain; snapshotWritesSettled()
//   waits for it.

export type SnapshotBackendName = 'idb' | 'local' | 'memory'

/** Where snapshot payloads are kept: a tiny async key-value store. */
export interface SnapshotBackend {
  name: SnapshotBackendName
  get(keys: string[]): Promise<(string | null)[]>
  /** All or nothing: on failure nothing from this batch is left behind. */
  put(entries: [string, string][]): Promise<void>
  remove(keys: string[]): Promise<void>
  keys(): Promise<string[]>
  /** Characters in use (localStorage only, to stay inside its budget). */
  usage?(): number
}

const INDEX_KEY = 'anotherlife.timemachine.v1'
const LOCAL_PREFIX = 'anotherlife.tm.'
/** localStorage is ~5 MB per site: leave most of it to the main save, ribbons and graveyard. */
export const LOCAL_SNAPSHOT_BUDGET = 1_500_000
const IDB_NAME = 'anotherlife-timemachine'
const IDB_STORE = 'snapshots'

interface StoredStop extends TimeStop {
  /** Id of the snapshot's record (content hash: a write never overwrites a live snapshot). */
  rec: string
  /** Log chunk ids this snapshot uses, oldest year first. */
  chunks: string[]
}

interface TimeIndex {
  v: 1
  lifeId: string
  /** Backend holding the payloads (null until the first snapshot is written). */
  where: SnapshotBackendName | null
  /** Age whose start-of-year snapshot is still owed (see isStartOfYear). */
  pending: number | null
  /** Oldest first. */
  stops: StoredStop[]
}

const NO_STOPS: readonly TimeStop[] = Object.freeze([])

function emptyIndex(lifeId = ''): TimeIndex {
  return { v: 1, lifeId, where: null, pending: null, stops: [] }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function readStop(v: unknown): StoredStop | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  if (!isNum(s.age) || !isNum(s.year) || typeof s.rec !== 'string') return null
  if (!Array.isArray(s.chunks) || !s.chunks.every((c) => typeof c === 'string')) return null
  const stop: StoredStop = {
    age: s.age,
    year: s.year,
    money: isNum(s.money) ? s.money : 0,
    role: typeof s.role === 'string' ? s.role : '',
    rec: s.rec,
    chunks: s.chunks as string[],
  }
  if (typeof s.countryId === 'string' && s.countryId) stop.countryId = s.countryId
  if (isNum(s.nominalScale) && s.nominalScale > 0) stop.nominalScale = s.nominalScale
  if (isNum(s.usdNominalScale) && s.usdNominalScale > 0) stop.usdNominalScale = s.usdNominalScale
  return stop
}

function loadIndex(): TimeIndex {
  const raw = read<Record<string, unknown>>(INDEX_KEY)
  if (!raw || raw.v !== 1 || typeof raw.lifeId !== 'string') return emptyIndex()
  const where = raw.where === 'idb' || raw.where === 'local' ? raw.where : null
  const stops = where && Array.isArray(raw.stops) ? raw.stops.map(readStop).filter((s): s is StoredStop => s !== null) : []
  stops.sort((a, b) => a.age - b.age)
  // Memory snapshots died with the previous page.
  return { v: 1, lifeId: raw.lifeId, where, pending: isNum(raw.pending) ? raw.pending : null, stops }
}

let index: TimeIndex = loadIndex()
/** Bumped whenever the timeline changes under in-flight writes (new life, a jump, a reset). */
let epoch = 0
const listeners = new Set<() => void>()

function saveIndex(): void {
  write(INDEX_KEY, index)
}

function changed(next: Partial<TimeIndex>): void {
  index = { ...index, ...next }
  saveIndex()
  for (const l of listeners) l()
}

/** Snapshots of `lifeId` the Time Machine can use, oldest first (stable until they change). */
export function timeStops(lifeId: string): readonly TimeStop[] {
  return index.lifeId === lifeId && index.stops.length ? index.stops : NO_STOPS
}

/** Called whenever the list of snapshots changes. Returns an unsubscribe function. */
export function subscribeTimeStops(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// --- Backends ----------------------------------------------------------------------------

export function memorySnapshotBackend(): SnapshotBackend {
  const data = new Map<string, string>()
  return {
    name: 'memory',
    get: async (keys) => keys.map((k) => data.get(k) ?? null),
    put: async (entries) => {
      for (const [k, v] of entries) data.set(k, v)
    },
    remove: async (keys) => {
      for (const k of keys) data.delete(k)
    },
    keys: async () => [...data.keys()],
  }
}

function localKeys(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LOCAL_PREFIX)) out.push(k.slice(LOCAL_PREFIX.length))
    }
  } catch {
    // storage disabled
  }
  return out
}

function localRemove(keys: string[]): void {
  for (const k of keys) {
    try {
      localStorage.removeItem(LOCAL_PREFIX + k)
    } catch {
      // ignore
    }
  }
}

export function localSnapshotBackend(): SnapshotBackend {
  return {
    name: 'local',
    get: async (keys) =>
      keys.map((k) => {
        try {
          return localStorage.getItem(LOCAL_PREFIX + k)
        } catch {
          return null
        }
      }),
    put: async (entries) => {
      const done: string[] = []
      try {
        for (const [k, v] of entries) {
          localStorage.setItem(LOCAL_PREFIX + k, v)
          done.push(k)
        }
      } catch (err) {
        localRemove(done)
        throw err
      }
    },
    remove: async (keys) => localRemove(keys),
    keys: async () => localKeys(),
    usage: () => {
      let n = 0
      try {
        for (const k of localKeys()) n += k.length + LOCAL_PREFIX.length + (localStorage.getItem(LOCAL_PREFIX + k)?.length ?? 0)
      } catch {
        // ignore
      }
      return n
    },
  }
}

function openIdb(): Promise<SnapshotBackend> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    // Private modes and blocked storage can leave open() hanging: don't wait forever.
    const timer = setTimeout(() => reject(new Error('IndexedDB timed out')), 4000)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(IDB_NAME, 1)
    } catch (err) {
      clearTimeout(timer)
      reject(err)
      return
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
    }
    req.onerror = () => {
      clearTimeout(timer)
      reject(req.error)
    }
    req.onblocked = () => {
      clearTimeout(timer)
      reject(new Error('IndexedDB blocked'))
    }
    req.onsuccess = () => {
      clearTimeout(timer)
      const db = req.result
      const run = (mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void): Promise<void> =>
        new Promise((done, fail) => {
          const tx = db.transaction(IDB_STORE, mode)
          tx.oncomplete = () => done()
          tx.onerror = () => fail(tx.error)
          tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'))
          fn(tx.objectStore(IDB_STORE))
        })
      resolve({
        name: 'idb',
        get: async (keys) => {
          const out: (string | null)[] = keys.map(() => null)
          await run('readonly', (store) =>
            keys.forEach((k, i) => {
              const req = store.get(k)
              req.onsuccess = () => {
                out[i] = typeof req.result === 'string' ? req.result : null
              }
            }),
          )
          return out
        },
        put: (entries) => run('readwrite', (store) => entries.forEach(([k, v]) => store.put(v, k))),
        remove: (keys) => run('readwrite', (store) => keys.forEach((k) => store.delete(k))),
        keys: async () => {
          let out: string[] = []
          await run('readonly', (store) => {
            const req = store.getAllKeys()
            req.onsuccess = () => {
              out = req.result.map(String)
            }
          })
          return out
        },
      })
    }
  })
}

function localStorageWorks(): boolean {
  try {
    const k = `${LOCAL_PREFIX}probe`
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

let backendOverride: SnapshotBackend | null = null
let backendPromise: Promise<SnapshotBackend> | null = null

function backend(): Promise<SnapshotBackend> {
  if (backendOverride) return Promise.resolve(backendOverride)
  backendPromise ??= openIdb().catch(() => (localStorageWorks() ? localSnapshotBackend() : memorySnapshotBackend()))
  return backendPromise
}

/**
 * Use `b` for snapshot payloads (tests, or a host with its own storage); null goes back to the
 * automatic choice. Snapshots kept by the previous backend are dropped at the next write.
 */
export function setSnapshotBackend(b: SnapshotBackend | null): void {
  backendOverride = b
  backendPromise = null
}

// --- The serial queue ----------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve()

/**
 * A storage operation still running after this long is given up on, so storage that stops
 * answering (a stuck IndexedDB transaction) can't hold every later snapshot and jump forever.
 */
export const SNAPSHOT_OP_TIMEOUT_MS = 20_000

function limited<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // The stuck operation may still finish later: a write then gives up instead of listing a
      // year whose pieces were swept meanwhile.
      epoch++
      reject(new Error('Snapshot storage timed out'))
    }, SNAPSHOT_OP_TIMEOUT_MS)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function enqueue<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  const run = chain.then(() => limited(op())).catch(() => fallback)
  chain = run
  return run
}

/** Resolves once every queued snapshot write, read and cleanup has finished. */
export function snapshotWritesSettled(): Promise<void> {
  return chain.then(
    () => undefined,
    () => undefined,
  )
}

// --- Packing -------------------------------------------------------------------------------

function recordKey(lifeId: string, rec: string): string {
  return `s|${lifeId}|${rec}`
}

function chunkKey(lifeId: string, id: string): string {
  return `l|${lifeId}|${id}`
}

/** Two independent 32-bit FNV-style hashes plus the length: plenty for a few hundred chunks. */
function hashText(s: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 16777619)
    b = Math.imul(b ^ c, 0x5bd1e995)
    b ^= b >>> 13
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${s.length.toString(36)}`
}

interface Packed {
  lifeId: string
  age: number
  stop: TimeStop
  /** The state with its log replaced by chunk ids (same key order as the original). */
  record: string
  rec: string
  chunks: [string, string][]
}

function pack(g: GameState): Packed {
  const chunks: [string, string][] = []
  const ids: string[] = []
  for (const year of g.log) {
    const json = JSON.stringify(year)
    const id = `${year.age}.${hashText(json)}`
    ids.push(id)
    chunks.push([id, json])
  }
  // The next year's opening world is this year's closing world. Share those large
  // immutable frames across time stops just like log years, preserving exact JSON.
  const flags = { ...g.flags }, world = flags.worldEconomy
  if (isRecord(world) && (world.v === 1 || world.v === 2)) {
    const packed = { ...world }
    for (const key of ['countries', 'previous']) if (isRecord(packed[key])) {
      const json = JSON.stringify(packed[key]), id = `world.${hashText(json)}`
      chunks.push([id, json]); packed[key] = id
    }
    if (isRecord(packed.history)) {
      const frames = new Map<number, Record<string, unknown>>()
      for (const [country, points] of Object.entries(packed.history)) if (Array.isArray(points)) for (const point of points) if (isRecord(point) && isFiniteNumber(point.year)) {
        const frame = frames.get(point.year) ?? {}
        frame[country] = point; frames.set(point.year, frame)
      }
      const historyIds = [...frames].sort(([a], [b]) => a - b).map(([, frame]) => {
        const json = JSON.stringify(frame), id = `history.${hashText(json)}`
        chunks.push([id, json]); return id
      })
      packed.history = { snapshotYears: historyIds, countryOrder: Object.keys(packed.history) }
    }
    flags.worldEconomy = packed as typeof world
  }
  const record = JSON.stringify({ ...g, log: ids, flags })
  const rec = `${g.character.age}.${hashText(record)}`
  return { lifeId: g.lifeId, age: g.character.age, stop: stopOf(g), record, rec, chunks }
}

function referencedChunks(): Set<string> {
  const out = new Set<string>()
  for (const s of index.stops) for (const c of s.chunks) out.add(c)
  return out
}

/** Every storage key the index refers to. */
function liveKeys(): Set<string> {
  const keep = new Set<string>()
  for (const s of index.stops) {
    keep.add(recordKey(index.lifeId, s.rec))
    for (const c of s.chunks) keep.add(chunkKey(index.lifeId, c))
  }
  return keep
}

/** Make storage match the index: drop payloads and chunks nothing refers to (and other lives'). */
async function sweep(b: SnapshotBackend): Promise<void> {
  const keep = liveKeys()
  const drop = (await b.keys()).filter((k) => !keep.has(k))
  if (drop.length) await b.remove(drop)
}

/** Add (or replace) a stop, keeping the newest TIME_MACHINE_STOPS by age. */
function addStop(stop: StoredStop): void {
  const stops = index.stops.filter((s) => s.age !== stop.age)
  stops.push(stop)
  stops.sort((a, b) => a.age - b.age)
  changed({ stops: stops.slice(Math.max(0, stops.length - TIME_MACHINE_STOPS)) })
}

async function writeSnapshot(p: Packed, at: number): Promise<boolean> {
  // World frames are shared separately, so each remaining record is often only
  // 10–30 KB. Compress these too: ten small repeated family/asset records still
  // compete with the expanding world for the same fixed browser-storage budget.
  const encodedRecord = await encodeSnapshotRecord(p.record, 1000)
  const encodedChunks = await Promise.all(p.chunks.map(async ([id, json]) => [id, id.startsWith('world.') || id.startsWith('history.') ? await encodeSnapshotRecord(json, 1000) : json] as [string, string]))
  const b = await backend()
  const current = () => epoch === at && index.lifeId === p.lifeId
  if (!current()) return false
  if (index.where !== b.name) {
    // The old payloads (if any) are somewhere this page can't reach: start over here.
    if (index.where === 'local' && b.name !== 'local') localRemove(localKeys())
    changed({ where: b.name, stops: [] })
    await sweep(b)
  }
  for (;;) {
    if (!current()) return false
    const have = referencedChunks()
    const entries: [string, string][] = [[recordKey(p.lifeId, p.rec), encodedRecord]]
    for (const [id, json] of encodedChunks) {
      if (have.has(id)) continue
      have.add(id)
      entries.push([chunkKey(p.lifeId, id), json])
    }
    const size = entries.reduce((n, [k, v]) => n + k.length + v.length + LOCAL_PREFIX.length, 0)
    const fits = !b.usage || b.usage() + size <= LOCAL_SNAPSHOT_BUDGET
    if (fits) {
      try {
        await b.put(entries)
        break
      } catch {
        // Full: make room below and try again.
      }
    }
    // Make room by forgetting the oldest year (never the one being replaced).
    const oldest = index.stops.find((s) => s.age !== p.age)
    if (!oldest) return false
    changed({ stops: index.stops.filter((s) => s !== oldest) })
    await sweep(b)
  }
  if (!current()) {
    await sweep(b)
    return false
  }
  addStop({ ...p.stop, rec: p.rec, chunks: p.chunks.map(([id]) => id) })
  await sweep(b)
  return true
}

// --- The timeline --------------------------------------------------------------------------

/**
 * A new timeline: a new life, an heir, or "Live again". Forgets every snapshot of the previous
 * one; `pendingAge` is the age whose start-of-year snapshot to take once its popups are done.
 */
export function startTimeline(lifeId: string, pendingAge: number | null): void {
  epoch++
  index = { ...emptyIndex(lifeId), pending: pendingAge }
  saveIndex()
  for (const l of listeners) l()
  void enqueue(async () => sweep(await backend()), undefined)
}

/** A saved life was loaded: keep its snapshots, or start fresh if they belong to another life. */
export function resumeTimeline(lifeId: string): void {
  if (index.lifeId !== lifeId) startTimeline(lifeId, null)
}

/** Forget every snapshot (the life was abandoned). */
export function clearTimeline(): void {
  startTimeline('', null)
}

/** The next start-of-year snapshot is owed at `age` (the birthday is happening now). */
export function expectSnapshot(lifeId: string, age: number): void {
  if (index.lifeId !== lifeId) startTimeline(lifeId, age)
  else changed({ pending: age })
}

/**
 * Take the start-of-year snapshot if it is owed now (see isStartOfYear). Call after every
 * committed change; cheap when nothing is owed. Never throws: snapshots are best-effort.
 */
export function snapshotIfDue(g: GameState): Promise<boolean> {
  if (index.lifeId !== g.lifeId || index.pending === null) return Promise.resolve(false)
  if (!g.character.alive) {
    // Died before the year really started: nothing to keep.
    changed({ pending: null })
    return Promise.resolve(false)
  }
  if (!isStartOfYear(g, index.pending)) return Promise.resolve(false)
  changed({ pending: null })
  return takeSnapshot(g)
}

/** Snapshot `g` now (it must be the committed state of the current timeline). */
export function takeSnapshot(g: GameState): Promise<boolean> {
  if (index.lifeId !== g.lifeId) return Promise.resolve(false)
  let p: Packed
  try {
    p = pack(g)
  } catch {
    return Promise.resolve(false)
  }
  const at = epoch
  return enqueue(() => writeSnapshot(p, at), false)
}

/** The life exactly as it was at the start of age `age`, or null if it can't be loaded. */
export function loadSnapshot(lifeId: string, age: number): Promise<GameState | null> {
  return enqueue(async () => {
    const stop = index.lifeId === lifeId ? index.stops.find((s) => s.age === age) : undefined
    if (!stop) return null
    const b = await backend()
    if (index.where !== b.name) return null
    const [record] = await b.get([recordKey(lifeId, stop.rec)])
    if (!record) return null
    const g = JSON.parse(await decodeSnapshotRecord(record)) as GameState
    const ids: unknown = g.log
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null
    const parts = await b.get(ids.map((id: string) => chunkKey(lifeId, id)))
    if (parts.some((p) => p === null)) return null
    g.log = parts.map((p) => JSON.parse(p as string))
    const world = g.flags?.worldEconomy
    if (isRecord(world) && (world.v === 1 || world.v === 2)) {
      for (const key of ['countries', 'previous']) if (typeof world[key] === 'string' && world[key].startsWith('world.')) {
        const [frame] = await b.get([chunkKey(lifeId, world[key])])
        if (!frame) return null
        world[key] = JSON.parse(await decodeSnapshotRecord(frame))
      }
      const history = world.history
      if (isRecord(history) && Array.isArray(history.snapshotYears) && Array.isArray(history.countryOrder)) {
        if (!history.snapshotYears.every(id => typeof id === 'string' && id.startsWith('history.')) || !history.countryOrder.every(id => typeof id === 'string')) return null
        const records = await b.get(history.snapshotYears.map(id => chunkKey(lifeId, id as string)))
        const restored: Record<string, Json[]> = Object.fromEntries(history.countryOrder.map(id => [id, []]))
        for (const row of records) {
          if (!row) return null
          const frame = JSON.parse(await decodeSnapshotRecord(row)) as Record<string, Json>
          for (const country of history.countryOrder as string[]) if (frame[country] !== undefined) restored[country].push(frame[country])
        }
        world.history = restored
      }
    }
    if (!isGameShell(g)) return null
    const migrated = migrateLegacyAi(g)
    if (!isLoadableGame(migrated) || migrated.lifeId !== lifeId || migrated.character.age !== age || !migrated.character.alive) return null
    refreshRoyalCareers(migrated)
    refreshFamilyTalents(migrated)
    return migrated
  }, null)
}

/** After a jump to `age`: the years after it never happened. */
export function forgetFuture(lifeId: string, age: number): void {
  if (index.lifeId !== lifeId) return
  epoch++
  changed({ pending: null, stops: index.stops.filter((s) => s.age <= age) })
  void enqueue(async () => sweep(await backend()), undefined)
}

/** Drop one snapshot that turned out to be unreadable. */
export function forgetStop(lifeId: string, age: number): void {
  if (index.lifeId !== lifeId) return
  changed({ stops: index.stops.filter((s) => s.age !== age) })
  void enqueue(async () => sweep(await backend()), undefined)
}

/**
 * The main save didn't fit: give back the room of the oldest snapshot kept in localStorage (or
 * any leftovers). Synchronous, since saveGame retries right away. False when nothing was freed.
 */
function evictLocalSnapshot(): boolean {
  const stored = localKeys()
  if (stored.length === 0) return false
  const local = index.where === 'local'
  if (local && index.stops.length > 0) index = { ...index, stops: index.stops.slice(1) }
  const keep = local ? liveKeys() : new Set<string>()
  const drop = stored.filter((k) => !keep.has(k))
  if (drop.length === 0) return false
  // A snapshot being written here right now may have just lost its chunks: let it give up cleanly.
  if (local) epoch++
  localRemove(drop)
  saveIndex()
  for (const l of listeners) l()
  return true
}

// The main save's localStorage backend asks for this room when the browser refuses it.
setLocalQuotaEvictor(evictLocalSnapshot)
