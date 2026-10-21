// Pins and recents (G.9): the places a player keeps, per life, in localStorage['anotherlife.ui.v1'].
//
// This is UI state. It never enters GameState: act() clones the state on every tap and the Time Machine rewinds it, and
// a pin is not part of the life. An heir has its own life id, so starts empty; a Time Machine jump keeps the life id, so
// pins survive it on purpose. Nothing under src/game imports this file.
//
// The stored text is untrusted (another build, a hand edit, a full disk), so readUiPrefs checks every field and bounds
// everything: 6 lives, 12 pins and 8 recents each, places of at most 12 groups of 80 characters, 16 KB in all. Every
// write to localStorage is in a try, so a private window or a full disk still gives a working page.
import { useSyncExternalStore } from 'react'
import { FLAGS } from '../../game/flags'
import { samePlace, type PlaceRef, type SearchTab } from './place'

export const UI_KEY = 'anotherlife.ui.v1'
export const MAX_PINS = 12
export const MAX_RECENTS = 8
export const MAX_LIVES = 6

/** The toast when a 13th place is pinned. */
export const PINS_FULL_TEXT = `You've pinned ${MAX_PINS}. Unpin one first.`

const MAX_PATH = 12
const MAX_SEGMENT = 80
/** The serialised prefs never pass this many characters. */
const MAX_BYTES = 16_384
/** Stored text over this is not ours (we write at most MAX_BYTES), so it is refused unparsed. */
const MAX_RAW = 65_536
/** Most entries of any stored list that are looked at, valid or not. */
const SCAN = 64

export interface LifePrefs {
  pins: PlaceRef[]
  recents: PlaceRef[]
}

/** `order`: life ids, newest first. `lives` has a null prototype, so a life id of `__proto__` is just a key. */
export interface UiPrefs {
  v: 1
  lives: Record<string, LifePrefs>
  order: string[]
}

const TABS: readonly SearchTab[] = ['occupation', 'assets', 'relationships', 'activities']

/** The tab a root menu id names, or null (a place is only ever one of the four tabs). */
export function tabOf(id: unknown): SearchTab | null {
  return typeof id === 'string' && (TABS as readonly string[]).includes(id) ? (id as SearchTab) : null
}

export function emptyPrefs(): UiPrefs {
  return { v: 1, lives: Object.create(null) as Record<string, LifePrefs>, order: [] }
}

const NO_LIFE: LifePrefs = Object.freeze({ pins: Object.freeze([]) as unknown as PlaceRef[], recents: Object.freeze([]) as unknown as PlaceRef[] })

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key)
}

function isText(x: unknown, max: number): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= max
}

/** A place, checked and rebuilt with nothing but its own three fields; null when any part is not valid. */
function readRef(raw: unknown): PlaceRef | null {
  if (!isRecord(raw)) return null
  const tab = tabOf(raw.tab)
  if (tab === null) return null
  const path = raw.path
  if (!Array.isArray(path) || path.length > MAX_PATH) return null
  const segments: string[] = []
  for (const seg of path) {
    if (!isText(seg, MAX_SEGMENT)) return null
    segments.push(seg)
  }
  if (raw.id === undefined) return { tab, path: segments }
  return isText(raw.id, MAX_SEGMENT) ? { tab, path: segments, id: raw.id } : null
}

/** The valid, distinct places of a stored list, in order, at most `cap`. */
function readList(raw: unknown, cap: number): PlaceRef[] {
  const out: PlaceRef[] = []
  if (!Array.isArray(raw)) return out
  const n = Math.min(raw.length, SCAN)
  for (let i = 0; i < n && out.length < cap; i++) {
    const ref = readRef(raw[i])
    if (ref !== null && !out.some((x) => samePlace(x, ref))) out.push(ref)
  }
  return out
}

function size(p: UiPrefs): number {
  return JSON.stringify(p).length
}

/**
 * Make `p` fit in MAX_BYTES. `p` is a fresh object (its `lives` and `order` are ours to change); the lists inside a life
 * are copied before they are trimmed. The oldest life goes first, then, for the last life, its oldest recents, then
 * its oldest pins.
 */
function fit(p: UiPrefs): UiPrefs {
  while (size(p) > MAX_BYTES) {
    if (p.order.length > 1) {
      const oldest = p.order.pop()!
      delete p.lives[oldest]
      continue
    }
    const id = p.order[0]
    const life = id === undefined ? undefined : p.lives[id]
    if (id === undefined || life === undefined) return emptyPrefs()
    const lists = { pins: [...life.pins], recents: [...life.recents] }
    if (lists.recents.length > 0) lists.recents.pop()
    else if (lists.pins.length > 0) lists.pins.pop()
    if (lists.pins.length === 0 && lists.recents.length === 0) {
      delete p.lives[id]
      p.order.length = 0
    } else {
      p.lives[id] = lists
    }
  }
  return p
}

function readChecked(raw: unknown): UiPrefs {
  const out = emptyPrefs()
  if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.lives)) return out
  const lives = raw.lives
  const tried = new Set<string>()
  const take = (id: unknown): void => {
    if (out.order.length >= MAX_LIVES || !isText(id, MAX_SEGMENT) || tried.has(id) || !hasOwn(lives, id)) return
    tried.add(id)
    const life = lives[id]
    if (!isRecord(life)) return
    const pins = readList(life.pins, MAX_PINS)
    const recents = readList(life.recents, MAX_RECENTS)
    // A life with nothing in it is the same as no life, and would only use up one of the six places.
    if (pins.length === 0 && recents.length === 0) return
    out.lives[id] = { pins, recents }
    out.order.push(id)
  }
  // Newest first as stored; lives the order does not name (only a hand edit does that) come after.
  if (Array.isArray(raw.order)) {
    const n = Math.min(raw.order.length, SCAN)
    for (let i = 0; i < n; i++) take(raw.order[i])
  }
  let looked = 0
  for (const id of Object.keys(lives)) {
    if (looked++ >= SCAN) break
    take(id)
  }
  return fit(out)
}

/** Stored data (anything at all) into valid, bounded prefs. Never throws. */
export function readUiPrefs(raw: unknown): UiPrefs {
  try {
    return readChecked(raw)
  } catch {
    return emptyPrefs()
  }
}

export function lifeOf(p: UiPrefs, lifeId: string): LifePrefs {
  return hasOwn(p.lives, lifeId) ? p.lives[lifeId]! : NO_LIFE
}

export function isPinned(p: UiPrefs, lifeId: string, ref: PlaceRef): boolean {
  return lifeOf(p, lifeId).pins.some((x) => samePlace(x, ref))
}

/** `p` with this life's lists replaced, the life moved to the front, the oldest lives evicted, and the 16 KB bound kept. */
function withLife(p: UiPrefs, lifeId: string, life: LifePrefs): UiPrefs {
  const order = p.order.filter((id) => id !== lifeId && hasOwn(p.lives, id))
  const lives = emptyPrefs().lives
  for (const id of order) lives[id] = p.lives[id]!
  if (life.pins.length > 0 || life.recents.length > 0) {
    lives[lifeId] = life
    order.unshift(lifeId)
  }
  while (order.length > MAX_LIVES) delete lives[order.pop()!]
  return fit({ v: 1, lives, order })
}

/**
 * Pin a place, or unpin it when it is already pinned. A new pin goes to the front. At 12 pins a new one is refused with
 * `reason: 'full'` and nothing changes. A place the reader would drop (wrong tab, too long) is refused without a reason.
 */
export function togglePin(p: UiPrefs, lifeId: string, ref: PlaceRef): { prefs: UiPrefs; ok: boolean; reason?: 'full' } {
  const place = readRef(ref)
  if (place === null || !isText(lifeId, MAX_SEGMENT)) return { prefs: p, ok: false }
  const life = lifeOf(p, lifeId)
  if (life.pins.some((x) => samePlace(x, place))) {
    const pins = life.pins.filter((x) => !samePlace(x, place))
    return { prefs: withLife(p, lifeId, { pins, recents: [...life.recents] }), ok: true }
  }
  if (life.pins.length >= MAX_PINS) return { prefs: p, ok: false, reason: 'full' }
  return { prefs: withLife(p, lifeId, { pins: [place, ...life.pins], recents: [...life.recents] }), ok: true }
}

/** Note a place the player used: newest first, an equal place moves to the front, at most 8. */
export function pushRecent(p: UiPrefs, lifeId: string, ref: PlaceRef): UiPrefs {
  const place = readRef(ref)
  if (place === null || !isText(lifeId, MAX_SEGMENT)) return p
  const life = lifeOf(p, lifeId)
  const newest = life.recents[0]
  // The same place again (a stay-open action tapped twice) changes nothing, so nothing is rewritten.
  if (newest !== undefined && samePlace(newest, place) && p.order[0] === lifeId) return p
  const recents = [place, ...life.recents.filter((x) => !samePlace(x, place))].slice(0, MAX_RECENTS)
  return withLife(p, lifeId, { pins: [...life.pins], recents })
}

// ---------------------------------------------------------------------------
// Storage

/** Read the prefs from localStorage (or `storage`). Any failure gives the defaults. */
export function loadPrefs(storage?: Pick<Storage, 'getItem'>): UiPrefs {
  try {
    const text = (storage ?? globalThis.localStorage).getItem(UI_KEY)
    if (typeof text !== 'string' || text.length > MAX_RAW) return emptyPrefs()
    return readUiPrefs(JSON.parse(text))
  } catch {
    return emptyPrefs()
  }
}

/** Write the prefs. False when the storage is missing, full or blocked, or the text would pass 16 KB. */
export function savePrefs(p: UiPrefs, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const text = JSON.stringify(p)
    if (text.length > MAX_BYTES) return false
    const target = storage ?? globalThis.localStorage
    target.setItem(UI_KEY, text)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// The live copy

let current: UiPrefs | null = null
const listeners = new Set<() => void>()

/** The snapshot: loaded on first use, then the same object until updatePrefs changes it. */
function snapshot(): UiPrefs {
  if (current === null) current = loadPrefs()
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  for (const l of [...listeners]) l()
}

/** The prefs as a component sees them. The reference is stable until updatePrefs changes something. */
export function usePrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Apply a change, save it (a failed save still keeps it for this session) and tell the components. */
export function updatePrefs(fn: (p: UiPrefs) => UiPrefs): void {
  const before = snapshot()
  const next = fn(before)
  if (next === before) return
  current = next
  savePrefs(next)
  notify()
}

/** Note that a place was used. A no-op unless the palette flag is on, so the rest of the UI can call it freely. */
export function recordRecent(lifeId: string, ref: PlaceRef): void {
  if (!FLAGS.navPalette) return
  updatePrefs((p) => pushRecent(p, lifeId, ref))
}

/** Forget the live copy, so the next read loads from storage again. For tests. */
export function resetPrefsForTest(): void {
  current = null
  notify()
}
