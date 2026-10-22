// The main save behind one door, whichever backend holds it (save-backends.ts). A synchronous
// backend (localStorage; memory in tests) is written inside saveRecord and read live, as saveGame
// always worked, so a save is readable the moment it is made. An asynchronous one (IndexedDB)
// answers reads from a cache and writes through a queue: one write in flight, a later save replacing
// the one waiting (the latest wins), a removal running after the write in flight, and a step that
// storage never answers raising the warning after STORE_OP_TIMEOUT_MS. A record that a newer version
// of the game wrote is copied to quarantine before anything overwrites it. When the database fails
// (or the page is closing with the queue not dry) the newest save is also written, plain, to the
// legacy localStorage key: a backup the next boot reconciles with the database. This file only moves
// strings: parsing and migrating them is save.ts's business (readSaveCopy is the one place that reads a
// head back, to hand the player a save that stands alone).
//
// R2-S6 (K.5): a save can also be a HEAD plus CHUNK records (save-codec.ts). The queue still moves one string, the head, and the
// chunks ride beside it: a chunk the storage doesn't hold yet is written first, the head is the one commit point, and the chunks
// the new head no longer names are swept after it, so a failed step never loses the save that was there. Everything that must
// stand alone (the backup, the spill, what an asynchronous backend's reads answer) is the self-contained form of the same save.
// Which chunks the storage holds is asked of the storage, not remembered: a second tab on the same storage sweeps what its own head
// does not name, so just before a head is committed the store lists the chunk records again and puts back any the head names that
// are gone (a page's own memory of what it wrote is only a hint, used to skip encoding chunks that are surely there).
import { connectionLost, localSaveBackend, markIdbInUse, SAVE_KEY, type AsyncSaveBackend, type SaveBackend, type SyncSaveBackend } from './save-backends'
import { assembleStored, type ChunkSource } from './save-chunk-read'
import { isChunkedHead } from './save-codec'
import { deleteQuarantine, QUARANTINE_SLOTS, quarantineRecord, readQuarantine, type SaveNotice } from './save-quarantine'
import { migrateSave, SAVE_SCHEMA } from './save-schema'
import { decodeSnapshotRecord, encodeSnapshotRecord } from './snapshot-codec'

/** What the save warning and Home's notices show. */
export interface SaveStatus {
  /** One per kept copy of a record that couldn't be loaded, or per such record left in place. */
  readonly notices: readonly SaveNotice[]
  /** The newest save isn't in storage: the last write failed (or hangs), and none has worked since. */
  readonly persistFailed: boolean
  /** Present only while persistFailed: the database is at fault (its connection was lost, or a step hung), not a full disk. */
  readonly database?: true
}

/**
 * A queue step (a newer record's copy, an encode, a write, a removal) still unanswered after this
 * long is taken for a failed save: the warning shows and flushSave stops waiting. Storage that stops
 * answering (a stuck IndexedDB transaction) must never lose progress without a warning, nor leave a
 * Time Machine jump that waits on flushSave spinning.
 */
export const STORE_OP_TIMEOUT_MS = 20_000

/** The chunks of a save whose record is a head (R2-S6), handed over with it. */
export interface ChunkedWrite {
  /** Every chunk the head refers to (id to plain text), not only the new ones: the store writes what storage does not have yet. */
  readonly chunks: ReadonlyMap<string, string>
  /**
   * The self-contained form of the same game, for backups, spill and reads: computed lazily, at most once (the store keeps the
   * answer). It must describe the game as it was saved, so the state saved must not be edited afterwards.
   */
  readonly plain: () => string
}

/** A head's chunks, and its plain form once someone asked for it. */
interface Extra {
  readonly write: ChunkedWrite
  plain: string | null
}

/** Everything resetSaveStoreForTests puts back, in one place. */
interface State {
  /** The backend setSaveBackend chose; null means the default, localStorage. */
  backend: SaveBackend | null
  /** The newest save. An asynchronous backend's reads answer with it while its writes work. */
  newest: string | null
  /** The save last known to be in storage, which those reads fall back to after a failed write. */
  stored: string | null
  /** The newest save the queue hasn't taken yet: a later save replaces it. */
  pending: string | null
  /** A removal waits behind the write in flight. */
  removal: boolean
  /** Bumped by every removal, so that a write saved before it discards itself. */
  generation: number
  /** The queue is running. */
  busy: boolean
  /** flushSave calls waiting for the queue to run dry, or for its step in flight to time out. */
  flushes: ((ok: boolean) => void)[]
  /** The watchdog of the step in flight, while it runs. */
  timer: ReturnType<typeof setTimeout> | null
  /** The step in flight has gone unanswered for STORE_OP_TIMEOUT_MS (it runs on: it can't be cancelled). */
  stalled: boolean
  /** A record a newer version of the game wrote, kept in the main slot until it has a copy. */
  newer: { readonly raw: string; readonly version: number } | null
  /** saveRecord has run in this page: what it saved is newer than anything boot reads from storage. */
  sessionSaved: boolean
  /** The save this page last wrote, plain, to the legacy localStorage key as a backup; null when it wrote none (or took it away). */
  backup: string | null
  /** The marker that this browser keeps its life in IndexedDB has been set from this page. */
  marked: boolean
  /**
   * The chunked saves by their head text: at most the newest, the stored and the pending one (pruned after every change of
   * those three). A head that is not in here is a plain record, and its own text is its plain form.
   */
  extras: Map<string, Extra>
  /**
   * The chunk ids this page last saw in storage (a listing, plus what it put since). A HINT, not the truth: another tab sweeps and
   * writes too, so a write lists storage again before its head is committed (a synchronous one at its start, an asynchronous one
   * after its chunks are put) and works from that listing. Only meaningful once `primed`; cleared by a removal and by a change of backend.
   */
  persisted: Set<string>
  /** `persisted` was read from storage (boot, or the first chunked save of the page). */
  primed: boolean
  status: SaveStatus
}

function initialState(): State {
  return {
    backend: null,
    newest: null,
    stored: null,
    pending: null,
    removal: false,
    generation: 0,
    busy: false,
    flushes: [],
    timer: null,
    stalled: false,
    newer: null,
    sessionSaved: false,
    backup: null,
    marked: false,
    extras: new Map(),
    persisted: new Set(),
    primed: false,
    status: { notices: [], persistFailed: false },
  }
}

let state = initialState()

// These outlive resetSaveStoreForTests: subscribers own their subscriptions, save.ts injects the
// evictor once as it loads, and the default backend is made once per page (quarantine keeps its
// copies in turn per backend object, so every call has to get the same one).
const listeners = new Set<() => void>()
let evictor: () => boolean = () => false
let fallback: SyncSaveBackend | null = null

/** The default backend: localStorage under SAVE_KEY. Also where the backup of a save the database could not take goes. */
function legacyStore(): SyncSaveBackend {
  return (fallback ??= localSaveBackend(() => evictor()))
}

function active(): SaveBackend {
  return state.backend ?? legacyStore()
}

// --- The backend ---------------------------------------------------------------------------

/**
 * Keep the save in `backend` from now on; null goes back to the default, localStorage. Choose it
 * before the first save (at boot, or in a test after resetSaveStoreForTests): this only swaps the
 * backend, and nothing cached or stored in the old one is moved to the new one.
 */
export function setSaveBackend(backend: SaveBackend | null): void {
  state.backend = backend
  // What a backend holds is its own: another one's chunks are not in it.
  forgetPersisted(state)
}

/**
 * What the default localStorage backend calls when the browser refuses the save: it frees some room
 * and says whether it did (save.ts passes the Time Machine's evictLocalSnapshot). It must say true
 * only when it really freed some, or the save retries forever.
 */
export function setLocalQuotaEvictor(fn: () => boolean): void {
  evictor = fn
}

export function activeBackendName(): 'idb' | 'local' | 'memory' {
  return active().name
}

// --- Status --------------------------------------------------------------------------------

export function getSaveStatus(): SaveStatus {
  return state.status
}

/** `listener` is called whenever getSaveStatus() changes. Returns the unsubscribe function. */
export function subscribeSaveStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (err) {
      // A broken listener mustn't stop the save, nor pass for a failed write.
      console.error('A save status listener failed:', err)
    }
  }
}

function setStatus(status: SaveStatus): void {
  state.status = status
  notify()
}

/**
 * Called on every write's outcome: listeners hear of it only when the status changes, which is when
 * persistFailed flips or the first failure turns out to be the database's. `database` only gets
 * added to while a failure stands.
 */
function setPersistFailed(failed: boolean, database = false): void {
  const cur = state.status
  const blamesDatabase = failed && (database || (cur.persistFailed && cur.database === true))
  if (cur.persistFailed === failed && (cur.database === true) === blamesDatabase) return
  setStatus(blamesDatabase ? { notices: cur.notices, persistFailed: true, database: true } : { notices: cur.notices, persistFailed: failed })
}

/** Lists `notice` where the one listed under `replaces` (by default its own id) was, else last. */
function putNotice(notice: SaveNotice, replaces: string = notice.id): void {
  const notices: SaveNotice[] = []
  let placed = false
  for (const listed of state.status.notices) {
    if (listed.id === replaces && !placed) {
      notices.push(notice)
      placed = true
    } else if (listed.id !== replaces && listed.id !== notice.id) {
      notices.push(listed)
    }
  }
  if (!placed) notices.push(notice)
  setStatus({ ...state.status, notices })
}

function dropNotice(id: string): void {
  const notices = state.status.notices.filter((notice) => notice.id !== id)
  if (notices.length !== state.status.notices.length) setStatus({ ...state.status, notices })
}

// --- The record ----------------------------------------------------------------------------

/** What an asynchronous backend's reads answer with: `json` as the newest save and as the one in storage. */
function setCache(json: string | null): void {
  state.newest = json
  state.stored = json
  prune(state)
}

// --- The chunks ----------------------------------------------------------------------------

/** Keeps the chunks of `head` (a save that is a head plus chunks) until the save has been written and a later one has replaced it. */
function remember(s: State, head: string, chunked: ChunkedWrite): void {
  s.extras.set(head, { write: chunked, plain: null })
}

/** Drops what the table keeps for a head that is no longer the newest, the stored or the pending save. */
function prune(s: State): void {
  for (const head of [...s.extras.keys()]) if (head !== s.newest && head !== s.stored && head !== s.pending) s.extras.delete(head)
}

/** The self-contained text of the save `json` stands for: its plain form when it is a head, else itself. */
function plainText(s: State, json: string): string {
  const extra = s.extras.get(json)
  if (extra === undefined) return json
  return (extra.plain ??= extra.write.plain())
}

/** The chunk ids of this backend are not known any more (it was swapped, or the save was removed): read them again before they are trusted. */
function forgetPersisted(s: State): void {
  s.persisted = new Set()
  s.primed = false
}

/** The chunks of `json` for a backend that can hold them; undefined for a plain record and for a backend with nowhere to put chunks. */
function chunkedFor(s: State, backend: SaveBackend, json: string): ChunkedWrite | undefined {
  return backend.chunks === undefined ? undefined : s.extras.get(json)?.write
}

/** The chunks of the last listing (and our puts since) that the head just written does not name (and that are ours: a chunk store lists only its own generation). */
function staleChunks(s: State, wanted: ReadonlyMap<string, string>): string[] {
  const stale: string[] = []
  for (const id of s.persisted) if (!wanted.has(id)) stale.push(id)
  return stale
}

/**
 * One save onto a synchronous backend. A head with chunks: the storage is listed (another tab may have swept a chunk this page
 * still thinks it stored), each chunk it doesn't have is put first (a refusal fails the save and the head is not written, so the
 * save that was there still has every chunk it names), then the head is written (the commit), then the chunks nothing names any
 * more are swept. Nothing else is touched while a newer version's record waits for its copy. A plain record, and a backend with
 * nowhere to put chunks, is one write of the self-contained text.
 */
function writeSync(s: State, backend: SyncSaveBackend, json: string): boolean {
  const chunked = chunkedFor(s, backend, json)
  const store = backend.chunks
  if (chunked === undefined || store === undefined) return backend.write(plainText(s, json))
  // Listed on every write, not once: the list and the puts below run in one task, so nothing can sweep between them.
  s.persisted = new Set(store.ids())
  s.primed = true
  for (const [id, text] of chunked.chunks) {
    if (s.persisted.has(id)) continue
    if (!store.put(id, text)) return false
    s.persisted.add(id)
  }
  if (!backend.write(json)) return false
  if (s.newer === null) {
    const stale = staleChunks(s, chunked.chunks)
    if (stale.length > 0) {
      store.remove(stale)
      for (const id of stale) s.persisted.delete(id)
    }
  }
  return true
}

/**
 * Save `json` as the current life. A synchronous backend writes it here and now and returns whether
 * that worked. An asynchronous one caches it, queues the write and returns true; a write that fails
 * shows as getSaveStatus().persistFailed, and flushSave resolves false. A synchronous backend
 * queues too while the queue is busy (so an older write can't land over this one), and while a
 * newer record is waiting for its copy. A save queued while the queue is stalled raises the warning
 * at once: it can't be stored before the step that hangs settles.
 *
 * With `chunked`, `json` is a head (save-codec.ts) and the chunks it names are `chunked.chunks`: they are stored first, the head
 * after them, and the ones it no longer names after that (see writeSync, writeQueued). On a backend with nowhere to put chunks,
 * the save is written whole, as its self-contained form.
 */
export function saveRecord(json: string, chunked?: ChunkedWrite): boolean {
  const s = state
  s.sessionSaved = true
  s.newest = json
  if (chunked !== undefined) remember(s, json, chunked)
  const backend = active()
  if (backend.kind === 'sync' && !s.busy && s.newer === null) {
    let ok: boolean
    try {
      ok = writeSync(s, backend, json)
    } catch {
      ok = false
    }
    if (ok) s.stored = json
    prune(s)
    setPersistFailed(!ok)
    return ok
  }
  s.pending = json
  prune(s)
  kick()
  if (s.stalled) {
    backUp(s, json)
    setPersistFailed(true, true)
  }
  return true
}

/**
 * The saved record. A synchronous backend is read live. An asynchronous one answers from the cache:
 * the newest save while its writes work, and after a failed write the last one stored (what a
 * reload would load).
 */
export function readRecord(): string | null {
  const backend = active()
  if (backend.kind === 'async') {
    // What a reload would load, as one self-contained text: a head with its chunks is never handed out from the cache.
    const cached = state.status.persistFailed ? state.stored : state.newest
    return cached === null ? null : plainText(state, cached)
  }
  try {
    return backend.read()
  } catch {
    return null
  }
}

/**
 * The chunk record `id` of the saved record readRecord returns, as stored (plain text). Only a synchronous backend can answer in
 * place: null on an asynchronous one (its reads are the self-contained form, which needs no chunk), when the backend has no chunk
 * store, when there is no such record, or when storage can't be read.
 */
export function readChunk(id: string): string | null {
  const backend = active()
  if (backend.kind !== 'sync' || backend.chunks === undefined) return null
  try {
    return backend.chunks.get(id)
  } catch {
    return null
  }
}

/** True when the active backend can hold the chunks of a save: saveGame then writes a head and chunks, and else one self-contained record. */
export function chunksAvailable(): boolean {
  return active().chunks !== undefined
}

/**
 * Forget the save: the cache is emptied, a save still waiting is dropped, and a save already taken
 * by the queue discards itself (the generation moved on). A synchronous backend is emptied here and
 * now, as it has no write in flight to wait for; an asynchronous one after the write in flight. A
 * newer record waiting for its copy stays where it is. With no save left, the warning about an
 * earlier failed write goes too.
 */
export function removeRecord(): void {
  const s = state
  s.generation++
  s.pending = null
  setCache(null)
  // A backup of the life being forgotten would bring it back at the next boot.
  dropBackup(s)
  if (s.newer === null) {
    const backend = active()
    forgetPersisted(s)
    if (backend.kind === 'sync') {
      try {
        backend.remove()
      } catch {
        // storage disabled: there is nothing to remove
      }
      try {
        backend.chunks?.remove(backend.chunks.ids())
      } catch {
        // storage disabled: there is nothing to remove
      }
    } else {
      s.removal = true
      kick()
    }
  }
  setPersistFailed(false)
}

/**
 * The main slot holds `raw`, which a newer version of the game wrote (schema `version`): never
 * overwrite or remove it without a copy. Until the copy is made, removeRecord leaves the slot alone
 * and every save goes through the queue, which copies `raw` to quarantine (kind 'newer') before
 * writing; the copy's notice takes the place of one listed under SAVE_KEY. With no room for the
 * copy nothing is written and persistFailed is set: it fails closed.
 */
export function protectNewerRecord(raw: string, version: number): void {
  state.newer = { raw, version }
}

// --- The backup ----------------------------------------------------------------------------

/**
 * Writes `json`, plain, to the legacy localStorage key: a backup of the newest save for when the
 * database can't take it or the page is going. Only for an asynchronous backend (a synchronous one is
 * its own store), and never while a newer version's record is still waiting for its copy (that fails
 * closed). The next boot reads it beside the database record (save-hydrate.ts); it is taken away
 * again as soon as the database has the newest save. True when it was written. Never throws.
 */
function backUp(s: State, json: string): boolean {
  if (active().kind !== 'async' || s.newer !== null) return false
  let ok: boolean
  try {
    // The backup stands alone: the plain form of a head with chunks, never the head.
    ok = legacyStore().write(plainText(s, json))
  } catch {
    ok = false
  }
  // `json` (the head, when there is one) names the save the backup is of, as `newest` and `stored` do.
  if (ok) s.backup = json
  return ok
}

/** Takes away the backup this page wrote, if it did. A refused removal leaves it for the boot to settle. */
function dropBackup(s: State): void {
  if (s.backup === null) return
  s.backup = null
  try {
    legacyStore().remove()
  } catch {
    // storage disabled: there is nothing to remove
  }
}

/**
 * The page is closing or going to the background (pagehide, visibilitychange to hidden) and a promise
 * can't hold it open: if the newest save isn't in the database yet (a write still queued, in flight
 * or failed), write it synchronously and plain as a backup, and return whether that happened. The
 * boot picks it up if the page never comes back, and the queue removes it if the page does and the
 * database catches up. Nothing happens for a synchronous backend, or when the database has the save.
 */
export function spillSave(): boolean {
  const s = state
  const json = s.newest
  if (json === null || s.newer !== null || active().kind !== 'async') return false
  if (s.pending === null && !s.busy && !s.status.persistFailed) return false
  if (s.backup === json) return true
  return backUp(s, json)
}

// --- Boot ----------------------------------------------------------------------------------
// What save-hydrate.ts needs before the first render. Nothing else calls these.

/** Boot only: the backend in use (the default localStorage one when none was set). */
export function activeBackend(): SaveBackend {
  return active()
}

/** Boot only: true once saveRecord has run in this page. */
export function savedThisSession(): boolean {
  return state.sessionSaved
}

/**
 * Boot only: make `json` the newest and the stored save of the active backend without writing it. `ids` are the chunk
 * records the storage held at boot (a chunk store's ids()): the first chunked save then writes only what is not among
 * them, and sweeps the ones its head doesn't name. Without `ids` they are read at the first chunked save.
 * Returns false and does nothing once the page has saved: what boot read is older than that save.
 */
export function primeCache(json: string | null, ids?: readonly string[]): boolean {
  if (state.sessionSaved) return false
  setCache(json)
  if (ids !== undefined) {
    state.persisted = new Set(ids)
    state.primed = true
  }
  return true
}

/** Boot only: list a notice where the one with the same id (or `replaces`) was, else last. */
export function addSaveNotice(notice: SaveNotice, replaces?: string): void {
  putNotice(notice, replaces)
}

/**
 * Resolves once the queue has run dry: true when the newest save is in storage (or there is
 * nothing to store), false when its write failed. Each queue step has its own watchdog: a step
 * that storage leaves unanswered for STORE_OP_TIMEOUT_MS makes it resolve false then, and at once
 * while that step still hangs. The bound is per step, not overall: a slow but healthy queue (a
 * copy, an encode, a write, then a later save's encode and write) can hold it for several steps
 * with no warning. Never rejects.
 */
export function flushSave(): Promise<boolean> {
  const s = state
  if (s.stalled) return Promise.resolve(false)
  if (!s.busy) return Promise.resolve(!s.status.persistFailed)
  return new Promise((resolve) => {
    s.flushes.push(resolve)
  })
}

// --- The queue -----------------------------------------------------------------------------

function kick(): void {
  if (state.busy) return
  state.busy = true
  void drain(state)
}

function answerFlushes(s: State, ok: boolean): void {
  const waiting = s.flushes
  s.flushes = []
  for (const resolve of waiting) resolve(ok)
}

/**
 * Waits for one storage step of the queue, under a watchdog. A step still unanswered after
 * STORE_OP_TIMEOUT_MS stalls the queue: the warning shows and every flushSave waiting resolves
 * false. The step can't be cancelled, so the queue goes on waiting for it (no second write starts
 * meanwhile), and it is handled as usual whenever it settles.
 */
async function watched<T>(s: State, step: Promise<T>): Promise<T> {
  const timer = setTimeout(() => stall(s), STORE_OP_TIMEOUT_MS)
  s.timer = timer
  try {
    return await step
  } finally {
    clearTimeout(timer)
    s.timer = null
    s.stalled = false
  }
}

function stall(s: State): void {
  s.timer = null
  if (s !== state) return
  s.stalled = true
  // The database isn't answering: the newest save goes to the backup now, as every save made meanwhile will.
  if (s.newest !== null) backUp(s, s.newest)
  setPersistFailed(true, true)
  answerFlushes(s, false)
}

/** Every chunk record the store lists. */
async function removeAllChunks(store: NonNullable<AsyncSaveBackend['chunks']>): Promise<void> {
  const ids = await store.ids()
  if (ids.length > 0) await store.remove(ids)
}

/**
 * Runs the queue dry: a removal first (it was asked for after the write in flight, and every save
 * still waiting was made after it), then the newest save waiting. A loop whose state was reset stops.
 * Every storage call in here answers failure as a value, so this never rejects.
 */
async function drain(s: State): Promise<void> {
  // Let the rest of this task's saves arrive first: a burst then makes one write, of its last save.
  await Promise.resolve()
  while (s === state) {
    if (s.removal) {
      s.removal = false
      const backend = active()
      try {
        await watched(s, Promise.resolve(backend.remove()))
        // The chunks go after the head, so a record never names a chunk that is gone (a save this removal discarded may have put some).
        if (backend.kind === 'async' && backend.chunks !== undefined) await watched(s, removeAllChunks(backend.chunks))
        // Storage has caught up with the removal: nothing is left unsaved, even if it stalled first.
        if (s === state) setPersistFailed(false)
      } catch {
        // refused: the record stays, as a refused removal always has
      }
      // Whatever the chunk store held is gone, or is for the next save to list again.
      if (s === state) forgetPersisted(s)
    } else if (s.pending !== null) {
      const json = s.pending
      s.pending = null
      await writeQueued(s, json)
    } else {
      s.busy = false
      // The database has the newest save: a backup of it would only be an older copy to dispute at boot.
      if (!s.status.persistFailed) dropBackup(s)
      answerFlushes(s, !s.status.persistFailed)
      return
    }
  }
}

/**
 * One queued save. A newer record waiting in the main slot is copied first, and without a copy
 * nothing is written. A save that removeRecord came after discards itself at whatever stage it has
 * got to, and its outcome changes nothing.
 */
async function writeQueued(s: State, json: string): Promise<void> {
  const generation = s.generation
  const current = () => s === state && s.generation === generation
  const backend = active()
  const guard = s.newer
  if (guard !== null) {
    let notice: SaveNotice | null = null
    try {
      notice = await watched(s, quarantineRecord(backend, guard.raw, 'newer', guard.version))
    } catch {
      // storage failed: there is no copy
    }
    if (notice === null) {
      // No copy, no write: it fails closed (unless this save was dropped meanwhile).
      if (current()) setPersistFailed(true)
      return
    }
    if (s !== state) return
    // The newer record is safe in its copy: from now on the main slot holds an ordinary save.
    if (s.newer === guard) s.newer = null
    putNotice(notice, SAVE_KEY)
  }
  let ok: boolean
  let failure: unknown
  let sweep: (() => Promise<void>) | null = null
  try {
    if (backend.kind === 'sync') {
      // A removal came after this save: it discards itself before it reaches storage...
      if (!current()) return
      ok = writeSync(s, backend, json)
    } else {
      const chunked = chunkedFor(s, backend, json)
      if (chunked !== undefined && backend.chunks !== undefined) {
        const written = await writeChunked(s, backend, backend.chunks, json, chunked, current)
        if (written === null) return
        sweep = written
      } else {
        const record = await watched(s, encodeSnapshotRecord(plainText(s, json)))
        if (!current()) return
        await watched(s, backend.write(record))
      }
      ok = true
    }
  } catch (err) {
    ok = false
    failure = err
  }
  // ...or, already on its way, changes nothing when it lands: the removal runs after it.
  if (!current()) return
  if (ok) {
    s.stored = json
    prune(s)
    if (backend.kind === 'async' && !s.marked) {
      // The database took a save: from now on a record in the legacy key is a backup, not the game.
      s.marked = true
      markIdbInUse()
    }
    setPersistFailed(false)
    if (sweep !== null) {
      // The head is the commit: the chunks it no longer names are only garbage, and a sweep that fails is for the next save to retry.
      try {
        await sweep()
      } catch {
        // storage failed: the garbage stays until a later save sweeps it
      }
    }
  } else {
    // The newest save, not necessarily this one: later ones may have been made while it was failing.
    if (backend.kind === 'async') backUp(s, s.newest ?? json)
    setPersistFailed(true, connectionLost(failure))
  }
}

/**
 * The chunks of a head, then the head, onto IndexedDB. The ids it doesn't hold yet are encoded and put in one transaction, then
 * the head is encoded, the storage is listed once more and any chunk the head names that is gone (another tab's sweep, between
 * the first listing or put and now) is put again, and the head is written, each step under the watchdog and followed by the
 * generation check (a removal came after this save: null, and nothing more is written). Returns the sweep to run once the head is
 * stored, which removes the chunks the head doesn't name; a chunk put that fails throws, with the head not written. Coalescing is
 * safe because every call sends the whole set it names against what is stored, never "what is new since the last encode".
 */
async function writeChunked(
  s: State,
  backend: AsyncSaveBackend,
  store: NonNullable<AsyncSaveBackend['chunks']>,
  head: string,
  chunked: ChunkedWrite,
  current: () => boolean,
): Promise<(() => Promise<void>) | null> {
  if (!s.primed) {
    const ids = await watched(s, store.ids())
    if (!current()) return null
    s.persisted = new Set(ids)
    s.primed = true
  }
  /** Puts the chunks the head names that `persisted` does not list; false when this save was discarded meanwhile. */
  const putMissing = async (): Promise<boolean> => {
    const entries: [id: string, record: string][] = []
    for (const [id, text] of chunked.chunks) if (!s.persisted.has(id)) entries.push([id, await watched(s, encodeSnapshotRecord(text))])
    if (!current()) return false
    if (entries.length > 0) {
      await watched(s, store.put(entries))
      // The records landed, but this save may have been discarded meanwhile: then the removal after it lists them and takes them.
      if (!current()) return false
      for (const [id] of entries) s.persisted.add(id)
    }
    return true
  }
  if (!(await putMissing())) return null
  const record = await watched(s, encodeSnapshotRecord(head))
  if (!current()) return null
  // The commit point: ask the storage, not the page's memory, what it holds, so a head never names a chunk another tab swept.
  s.persisted = new Set(await watched(s, store.ids()))
  if (!current()) return null
  if (!(await putMissing())) return null
  await watched(s, backend.write(record))
  return async () => {
    const stale = staleChunks(s, chunked.chunks)
    if (stale.length === 0 || s.newer !== null) return
    await watched(s, store.remove(stale))
    if (s === state) for (const id of stale) s.persisted.delete(id)
  }
}

// --- The copies ----------------------------------------------------------------------------

/**
 * The exact text of the copy kept under `id`; with id SAVE_KEY, the record in the main slot (one left in place: a newer version's,
 * or one there was no room to copy). A main-slot record that is a head with chunks, every one of them in storage, is handed out as
 * the one self-contained save they make: a head alone could not be played once its chunks were swept. Otherwise it is as stored.
 * Null when there is none or storage fails; never an error.
 */
export async function readSaveCopy(id: string): Promise<string | null> {
  const backend = active()
  try {
    if (id !== SAVE_KEY) return await readQuarantine(backend, id)
    const record = await backend.read()
    return record === null ? null : ((await selfContained(backend, record)) ?? record)
  } catch {
    return null
  }
}

/** The chunk records of a backend as a ChunkSource; undefined for a backend with nowhere to keep them. */
function chunkSourceOf(backend: SaveBackend): ChunkSource | undefined {
  if (backend.kind === 'sync') {
    const store = backend.chunks
    return store === undefined ? undefined : async (ids) => new Map(ids.map((id) => [id, store.get(id)] as const))
  }
  const store = backend.chunks
  if (store === undefined) return undefined
  return async (ids) => {
    const rows = await store.get(ids)
    return new Map(ids.map((id, i) => [id, rows[i] ?? null] as const))
  }
}

/** The whole game a head and its chunks make, as the self-contained JSON text; null when `record` is no head, a later version's, or a chunk is missing or hostile. */
async function selfContained(backend: SaveBackend, record: string): Promise<string | null> {
  try {
    const head: unknown = JSON.parse(await decodeSnapshotRecord(record))
    if (!isChunkedHead(head) || (head.schemaVersion as number) > SAVE_SCHEMA) return null
    const assembled = await assembleStored(head, chunkSourceOf(backend))
    if (assembled.kind !== 'ready' || assembled.lost.length > 0) return null
    const found = migrateSave(assembled.game, { versions: assembled.versions })
    return found.kind === 'ready' ? JSON.stringify(found.game) : null
  } catch {
    return null
  }
}

/**
 * Removes the copy kept under `id` and, once a read confirms it is gone, its notice. The record in
 * the main slot (id SAVE_KEY) is never removed this way. Storage that fails leaves both; never an
 * error.
 */
export async function deleteSaveCopy(id: string): Promise<void> {
  if (id === SAVE_KEY) return
  const s = state
  const backend = active()
  try {
    await deleteQuarantine(backend, id)
    // Read raw, so that a read storage refuses throws (and keeps the notice) instead of passing for "gone".
    const gone = QUARANTINE_SLOTS.includes(id)
      ? localStorage.getItem(id) === null
      : backend.kind === 'async' && (await backend.overflow.get(id)) === null
    if (gone && s === state) dropNotice(id)
  } catch {
    // storage failed: the copy and its notice stay
  }
}

/** Tests only: how many heads the side table of chunked saves keeps (at most the newest, the stored and the pending one). */
export function chunkTableSizeForTests(): number {
  return state.extras.size
}

/** Back to how a page starts: the default backend, and nothing cached, queued, protected or listed. */
export function resetSaveStoreForTests(): void {
  const before = state
  if (before.timer !== null) clearTimeout(before.timer)
  state = initialState()
  // Nothing watches the old queue's step any more: a flush still waiting on it would wait forever.
  answerFlushes(before, false)
  if (before.status.persistFailed || before.status.notices.length > 0) notify()
}
