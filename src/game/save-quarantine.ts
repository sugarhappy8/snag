// Byte-exact copies of the records the game couldn't load, kept so that a failed load never costs a
// player their save. Three copies live in localStorage slots; with IndexedDB open, up to two more
// overflow into its `quarantine` store. A copy is never rewritten, and only deleteQuarantine removes
// one. This file only copies: what becomes of the original is the caller's decision, and so is what a
// kept copy turns out to be (scanQuarantine asks the caller's `diagnose`), so it needs nothing but the
// backends.
import { SAVE_KEY, type AsyncSaveBackend, type SaveBackend } from './save-backends'

/** The localStorage keys of the three slots, in the order they fill. They are localStorage's whichever backend holds the save. */
export const QUARANTINE_SLOTS: readonly string[] = [`${SAVE_KEY}.bad`, `${SAVE_KEY}.bad.2`, `${SAVE_KEY}.bad.3`]

/** The most copies kept at once, slots and overflow together. */
export const QUARANTINE_MAX = 5

/**
 * Why a record was set aside. `damaged` couldn't be read; `tooOld` is older than the oldest version
 * the game migrates; `newer` was written by a later version; `stale` reads fine but is no longer the
 * save, such as the old localStorage record left behind when IndexedDB took over.
 */
export type SaveNoticeKind = 'damaged' | 'stale' | 'tooOld' | 'newer'

/** One kept copy as Home lists it. `id` is what readQuarantine and deleteQuarantine take: a slot's key or an overflow key. */
export interface SaveNotice {
  readonly id: string
  readonly kind: SaveNoticeKind
  /** The copy's length in characters (UTF-16 units), as stored. */
  readonly bytes: number
  /** The save version the copy was written by, when it is known. */
  readonly version?: number
}

function notice(id: string, raw: string, kind: SaveNoticeKind, version?: number): SaveNotice {
  return version === undefined ? { id, kind, bytes: raw.length } : { id, kind, bytes: raw.length, version }
}

// --- The slots (localStorage) ------------------------------------------------------------------

/** What a slot holds: its text, null when it is empty, undefined when localStorage can't be read. */
function peek(slot: string): string | null | undefined {
  try {
    return localStorage.getItem(slot)
  } catch {
    return undefined
  }
}

function discard(slot: string): void {
  try {
    localStorage.removeItem(slot)
  } catch {
    // storage disabled: there is nothing to remove
  }
}

/**
 * Stores `raw` in an empty slot and reads it back. A write that isn't confirmed is taken out again:
 * it was never a kept copy, and it mustn't hold the slot (or count toward the five) for good.
 */
function keepInSlot(slot: string, raw: string): boolean {
  try {
    localStorage.setItem(slot, raw)
    if (localStorage.getItem(slot) === raw) return true
  } catch {
    // refused: storage full or disabled
  }
  discard(slot)
  return false
}

// --- The overflow (IndexedDB) ------------------------------------------------------------------

/** Runs a storage call; storage that fails is answered with `fallback`, never with an error. */
async function attempt<T, F>(call: () => Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await call()
  } catch {
    return fallback
  }
}

/** The same as keepInSlot, for an overflow key. */
async function keepInOverflow(overflow: AsyncSaveBackend['overflow'], key: string, raw: string): Promise<boolean> {
  const stored = await attempt(async () => {
    await overflow.put(key, raw)
    return overflow.get(key)
  }, null)
  if (stored === raw) return true
  await attempt(() => overflow.remove(key), undefined)
  return false
}

/** `bad-<n>` for the smallest n, from 1, that no key in the overflow uses. */
function freeKey(keys: readonly string[]): string {
  let n = 1
  while (keys.includes(`bad-${n}`)) n++
  return `bad-${n}`
}

// --- The copies --------------------------------------------------------------------------------

// Copies are made one at a time per backend. Two made together would both find the same key free,
// and the second would overwrite the first.
const queues = new WeakMap<SaveBackend, Promise<unknown>>()

function inTurn<T>(backend: SaveBackend, job: () => Promise<T>): Promise<T> {
  const done = (queues.get(backend) ?? Promise.resolve()).then(job)
  queues.set(backend, done.catch(() => undefined))
  return done
}

/**
 * Keeps `raw`, exactly as given, in the first free slot; when that write is refused or can't be read
 * back, or every slot is taken, in the overflow store of an IndexedDB backend. The notice comes back
 * only after the copy has been read back and found equal. Null means it wasn't kept (five are kept
 * already, or nothing would take it), and nothing has changed. A kept copy is never overwritten.
 */
export function quarantineRecord(backend: SaveBackend, raw: string, kind: SaveNoticeKind, version?: number): Promise<SaveNotice | null> {
  return inTurn(backend, async () => {
    // The overflow keys, or null when they can't be listed: the slots can still be used, the overflow can't.
    const keys = backend.kind === 'async' ? await attempt(() => backend.overflow.keys(), null) : []
    // Nothing is awaited between choosing a slot and writing to it, so nothing else in this page can take
    // it meanwhile. A slot that can't be read is neither free nor kept: it isn't written to blind.
    const held = QUARANTINE_SLOTS.filter((slot) => typeof peek(slot) === 'string').length
    if (held + (keys?.length ?? 0) >= QUARANTINE_MAX) return null
    const slot = QUARANTINE_SLOTS.find((s) => peek(s) === null)
    if (slot !== undefined && keepInSlot(slot, raw)) return notice(slot, raw, kind, version)
    if (backend.kind === 'async' && keys !== null) {
      const key = freeKey(keys)
      if (await keepInOverflow(backend.overflow, key, raw)) return notice(key, raw, kind, version)
    }
    return null
  })
}

/**
 * One notice per kept copy: the slots in order, then the overflow keys in key order. What a copy is
 * comes from `diagnose` (an error from it is not caught here); its size comes from the text as stored.
 * A copy that can't be read is left out.
 */
export async function scanQuarantine(
  backend: SaveBackend,
  diagnose: (raw: string) => Promise<{ kind: SaveNoticeKind; version?: number }>,
): Promise<SaveNotice[]> {
  const notices: SaveNotice[] = []
  const list = async (id: string, raw: string): Promise<void> => {
    const { kind, version } = await diagnose(raw)
    notices.push(notice(id, raw, kind, version))
  }
  for (const slot of QUARANTINE_SLOTS) {
    const raw = peek(slot)
    if (typeof raw === 'string') await list(slot, raw)
  }
  if (backend.kind === 'async') {
    for (const key of await attempt(() => backend.overflow.keys(), [])) {
      const raw = await attempt(() => backend.overflow.get(key), null)
      if (raw !== null) await list(key, raw)
    }
  }
  return notices
}

/** The exact text of the copy kept under `id`; null when there is none or it can't be read. */
export async function readQuarantine(backend: SaveBackend, id: string): Promise<string | null> {
  if (QUARANTINE_SLOTS.includes(id)) return peek(id) ?? null
  if (backend.kind !== 'async') return null
  return attempt(() => backend.overflow.get(id), null)
}

/** Removes the copy kept under `id`, and only that one. A removal storage refuses is a no-op. */
export async function deleteQuarantine(backend: SaveBackend, id: string): Promise<void> {
  if (QUARANTINE_SLOTS.includes(id)) discard(id)
  else if (backend.kind === 'async') await attempt(() => backend.overflow.remove(id), undefined)
}
