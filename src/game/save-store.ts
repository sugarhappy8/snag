// The main save behind one door, whichever backend holds it (save-backends.ts). A synchronous
// backend (localStorage; memory in tests) is written inside saveRecord and read live, as saveGame
// always worked, so a save is readable the moment it is made. An asynchronous one (IndexedDB)
// answers reads from a cache and writes through a queue: one write in flight, a later save replacing
// the one waiting (the latest wins), a removal running after the write in flight, and a step that
// storage never answers raising the warning after STORE_OP_TIMEOUT_MS. A record that a newer version
// of the game wrote is copied to quarantine before anything overwrites it. This file only moves
// strings: parsing and migrating them is save.ts's business.
import { localSaveBackend, SAVE_KEY, type SaveBackend, type SyncSaveBackend } from './save-backends'
import { deleteQuarantine, QUARANTINE_SLOTS, quarantineRecord, readQuarantine, type SaveNotice } from './save-quarantine'
import { encodeSnapshotRecord } from './snapshot-codec'

/** What the save warning and Home's notices show. */
export interface SaveStatus {
  /** One per kept copy of a record that couldn't be loaded, or per such record left in place. */
  readonly notices: readonly SaveNotice[]
  /** The newest save isn't in storage: the last write failed (or hangs), and none has worked since. */
  readonly persistFailed: boolean
}

/**
 * A queue step (a newer record's copy, an encode, a write, a removal) still unanswered after this
 * long is taken for a failed save: the warning shows and flushSave stops waiting. Storage that stops
 * answering (a stuck IndexedDB transaction) must never lose progress without a warning, nor leave a
 * Time Machine jump that waits on flushSave spinning.
 */
export const STORE_OP_TIMEOUT_MS = 20_000

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

function active(): SaveBackend {
  return state.backend ?? (fallback ??= localSaveBackend(() => evictor()))
}

// --- The backend ---------------------------------------------------------------------------

/**
 * Keep the save in `backend` from now on; null goes back to the default, localStorage. Choose it
 * before the first save (at boot, or in a test after resetSaveStoreForTests): this only swaps the
 * backend, and nothing cached or stored in the old one is moved to the new one.
 */
export function setSaveBackend(backend: SaveBackend | null): void {
  state.backend = backend
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

/** Called on every write's outcome: listeners hear of it only when it flips. */
function setPersistFailed(failed: boolean): void {
  if (state.status.persistFailed !== failed) setStatus({ ...state.status, persistFailed: failed })
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
}

/**
 * Save `json` as the current life. A synchronous backend writes it here and now and returns whether
 * that worked. An asynchronous one caches it, queues the write and returns true; a write that fails
 * shows as getSaveStatus().persistFailed, and flushSave resolves false. A synchronous backend
 * queues too while the queue is busy (so an older write can't land over this one), and while a
 * newer record is waiting for its copy. A save queued while the queue is stalled raises the warning
 * at once: it can't be stored before the step that hangs settles.
 */
export function saveRecord(json: string): boolean {
  const s = state
  s.sessionSaved = true
  s.newest = json
  const backend = active()
  if (backend.kind === 'sync' && !s.busy && s.newer === null) {
    let ok: boolean
    try {
      ok = backend.write(json)
    } catch {
      ok = false
    }
    if (ok) s.stored = json
    setPersistFailed(!ok)
    return ok
  }
  s.pending = json
  kick()
  if (s.stalled) setPersistFailed(true)
  return true
}

/**
 * The saved record. A synchronous backend is read live. An asynchronous one answers from the cache:
 * the newest save while its writes work, and after a failed write the last one stored (what a
 * reload would load).
 */
export function readRecord(): string | null {
  const backend = active()
  if (backend.kind === 'async') return state.status.persistFailed ? state.stored : state.newest
  try {
    return backend.read()
  } catch {
    return null
  }
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
  if (s.newer === null) {
    const backend = active()
    if (backend.kind === 'sync') {
      try {
        backend.remove()
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
 * Boot only: make `json` the newest and the stored save of the active backend without writing it.
 * Returns false and does nothing once the page has saved: what boot read is older than that save.
 */
export function primeCache(json: string | null): boolean {
  if (state.sessionSaved) return false
  setCache(json)
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
  setPersistFailed(true)
  answerFlushes(s, false)
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
        // Storage has caught up with the removal: nothing is left unsaved, even if it stalled first.
        if (s === state) setPersistFailed(false)
      } catch {
        // refused: the record stays, as a refused removal always has
      }
    } else if (s.pending !== null) {
      const json = s.pending
      s.pending = null
      await writeQueued(s, json)
    } else {
      s.busy = false
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
  try {
    const record = backend.kind === 'async' ? await watched(s, encodeSnapshotRecord(json)) : json
    // A removal came after this save: it discards itself before it reaches storage...
    if (!current()) return
    if (backend.kind === 'sync') {
      ok = backend.write(record)
    } else {
      await watched(s, backend.write(record))
      ok = true
    }
  } catch {
    ok = false
  }
  // ...or, already on its way, changes nothing when it lands: the removal runs after it.
  if (!current()) return
  if (ok) s.stored = json
  setPersistFailed(!ok)
}

// --- The copies ----------------------------------------------------------------------------

/**
 * The exact text of the copy kept under `id`; with id SAVE_KEY, the record in the main slot as
 * stored (one left in place: a newer version's, or one there was no room to copy). Null when there
 * is none or storage fails; never an error.
 */
export async function readSaveCopy(id: string): Promise<string | null> {
  const backend = active()
  try {
    return id === SAVE_KEY ? await backend.read() : await readQuarantine(backend, id)
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

/** Back to how a page starts: the default backend, and nothing cached, queued, protected or listed. */
export function resetSaveStoreForTests(): void {
  const before = state
  if (before.timer !== null) clearTimeout(before.timer)
  state = initialState()
  // Nothing watches the old queue's step any more: a flush still waiting on it would wait forever.
  answerFlushes(before, false)
  if (before.status.persistFailed || before.status.notices.length > 0) notify()
}
