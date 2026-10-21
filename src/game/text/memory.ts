// Text kit memory (R1-T1, E.T1): what the game said lately, kept in g.flags.textMem.
// Every value is a string or a string array, so a pool costs one JSON node and the whole memory stays
// under about 690 nodes. A pool is one short string: 'b<mask>.<last>' for a shuffle-bag (a pool of 12
// lines or fewer) or 'w<i>,<j>,...' for a window (the last 8 indexes, oldest first). The readers are strict:
// a value that is not exactly the codec reads as empty, and the writer trims a hostile save back inside the
// caps, so a damaged or oversized memory can never make the state grow.
// R2-B2 adds one more string, the text cursor c ('<year>,<count>', see text/draw.ts): it lives here because it is stored in the
// memory, and this file owns the codec and the repair of everything stored in it.
// Imports types only, so it is a leaf.
import type { GameState } from '../types'

export const TEXT_MEM_LIMITS = Object.freeze({
  pools: 300,
  families: 120,
  /** Indexes a window pool remembers. */
  recent: 8,
  /** A pool of this many lines or fewer is a shuffle-bag. */
  bag: 12,
  /** Years a family remembers. */
  famYears: 12,
  /** Years back that familyStats counts. */
  famWindow: 10,
  rings: 4,
  /** Keys a ring holds. */
  ring: 64,
  /** Characters in a ring key. */
  ringKey: 80,
} as const)

/** g.flags.textMem. Every value is a string or a string array so a pool costs one JSON node. */
export type TextMem = {
  v: 1
  /** pool key -> 'b<mask>' or 'b<mask>.<last>' (shuffle-bag, pools of 12 or fewer) or 'w<i>,<j>,...' (the last up to 8 indexes, oldest first). */
  p: Record<string, string>
  /** family key -> ascending years of use, '2031,2033,2040', at most 12 */
  f: Record<string, string>
  /** named rings of opaque keys, oldest first (the flavor ring, R1-T2) */
  r: Record<string, string[]>
  /** The text cursor (R2-B2): '<year>,<count>', how many text draws that year has made. Absent until the first draw. */
  c?: string
}

export type PoolRecall =
  | { kind: 'bag'; used: number; last: number } // used = bitmask of picked indexes this cycle, last = -1 when none
  | { kind: 'window'; recent: number[] }

// Keys start with a letter: an integer-like key would reorder a plain object, and insertion order is recency order.
const KEY_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,47}$/
const BAG_RE = /^b(\d{1,4})(?:\.(\d{1,2}))?$/
const WINDOW_RE = /^w\d{1,5}(?:,\d{1,5}){0,7}$/
const FAMILY_RE = /^\d{1,6}(?:,\d{1,6}){0,11}$/
const CURSOR_RE = /^(\d{1,7}),(\d{1,9})$/
/** The longest valid cursor: a seven digit year, a comma, a nine digit count. Longer strings are rejected unread. */
const MAX_CURSOR_RECORD = 17
/** The longest valid records: a window of 8 five-digit indexes, a family of 12 six-digit years. Longer strings are rejected unread. */
const MAX_POOL_RECORD = 48
const MAX_FAMILY_RECORD = 83
/** The largest index a window record can hold (five digits). */
const MAX_INDEX = 99_999
const BAG_MASKS = 4096

/** A key the memory accepts for a pool, a family or a ring: a letter, then letters, digits and _ . : -, 48 characters at most. */
export function isMemKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key)
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseBag(s: string): { used: number; last: number } | null {
  const m = BAG_RE.exec(s)
  if (!m) return null
  const used = Number(m[1])
  const last = m[2] === undefined ? -1 : Number(m[2])
  return used < BAG_MASKS && last < TEXT_MEM_LIMITS.bag ? { used, last } : null
}

function parseWindow(s: string): number[] | null {
  return WINDOW_RE.test(s) ? s.slice(1).split(',').map(Number) : null
}

function parseFamily(s: string): number[] | null {
  if (!FAMILY_RE.test(s)) return null
  const years = s.split(',').map(Number)
  for (let i = 1; i < years.length; i++) if (years[i] < years[i - 1]) return null
  return years
}

/** The cursor a string holds, or null when it is not exactly the codec ('<year>,<count>': one to seven digits, a comma, one to nine digits). */
export function parseTextCursor(s: unknown): { year: number; n: number } | null {
  if (typeof s !== 'string' || s.length > MAX_CURSOR_RECORD) return null
  const m = CURSOR_RE.exec(s)
  return m ? { year: Number(m[1]), n: Number(m[2]) } : null
}

/** The newest `cap` strings of at most 80 characters, oldest first. Anything else in the list is dropped. */
function cleanRing(list: readonly unknown[], cap: number): string[] {
  const out: string[] = []
  for (let i = list.length - 1; i >= 0 && out.length < cap; i--) {
    const x = list[i]
    if (typeof x === 'string' && x.length <= TEXT_MEM_LIMITS.ringKey) out.push(x)
  }
  return out.reverse()
}

/** The newest `cap` entries of a map that pass `valid`, in their stored order. */
function newest(raw: unknown, cap: number, valid: (v: string) => boolean): [string, string][] {
  if (!isPlain(raw)) return []
  const out: [string, string][] = []
  for (const [k, v] of Object.entries(raw)) if (isMemKey(k) && typeof v === 'string' && valid(v)) out.push([k, v])
  return out.slice(-cap)
}

/** A fresh, valid memory built from whatever is stored: junk, wrong types and oversize maps are dropped or trimmed. */
function clean(raw: unknown): TextMem {
  const mem: TextMem = { v: 1, p: {}, f: {}, r: {} }
  if (!isPlain(raw) || raw.v !== 1) return mem
  for (const [k, v] of newest(raw.p, TEXT_MEM_LIMITS.pools, (s) => s.length <= MAX_POOL_RECORD && (parseBag(s) !== null || parseWindow(s) !== null))) mem.p[k] = v
  for (const [k, v] of newest(raw.f, TEXT_MEM_LIMITS.families, (s) => s.length <= MAX_FAMILY_RECORD && parseFamily(s) !== null)) mem.f[k] = v
  if (isPlain(raw.r)) {
    let rings = 0
    for (const [k, v] of Object.entries(raw.r)) {
      if (rings >= TEXT_MEM_LIMITS.rings) break
      if (!isMemKey(k) || !Array.isArray(v)) continue
      mem.r[k] = cleanRing(v, TEXT_MEM_LIMITS.ring)
      rings++
    }
  }
  if (parseTextCursor(raw.c) !== null) mem.c = raw.c as string
  return mem
}

/** Pure. A sanitized deep copy of g.flags.textMem (junk, wrong types, oversize maps are dropped or trimmed). Never throws, never writes. */
export function readTextMem(g: GameState): TextMem {
  return clean(g.flags.textMem)
}

/**
 * Memories this module stored itself, each with the game state that holds it. clean() walks the whole memory (up to about 700
 * nodes), and every text draw asks for the writable memory, so a memory that already passed is not cleaned again. A structuredClone
 * (what the store does on every action) or a JSON round trip gives a new object: it is cleaned once, so a hostile save is still
 * repaired on its first write. A shallow copy of the state (supply-resilience.ts scenario() makes one, with its own flags) shares the
 * memory object but is not its owner, so it gets a cleaned copy of its own, as it did before the cache: its text draws never reach
 * the original. (The owner is the state, not its flags: world-flags.test.ts keeps whole-object uses of flags at a baseline.)
 */
const VALID = new WeakMap<object, GameState>()

/**
 * The live, sanitized object stored at g.flags.textMem (created when missing). For code that already mutates a draft.
 * A memory this function stored for this same state is returned as it is: nothing in the game writes to it except through this kit.
 */
export function writableTextMem(g: GameState): TextMem {
  const stored = g.flags.textMem
  if (typeof stored === 'object' && stored !== null && VALID.get(stored) === g) return stored as unknown as TextMem
  const mem = clean(stored)
  g.flags.textMem = mem
  VALID.set(mem, g)
  return mem
}

export function recallPool(mem: TextMem, key: string, n: number): PoolRecall {
  const rec = Object.hasOwn(mem.p, key) ? mem.p[key] : undefined
  if (n <= TEXT_MEM_LIMITS.bag) {
    const bag = typeof rec === 'string' && n >= 1 ? parseBag(rec) : null
    if (!bag) return { kind: 'bag', used: 0, last: -1 }
    return { kind: 'bag', used: bag.used & ((1 << n) - 1), last: bag.last < n ? bag.last : -1 }
  }
  const recent = typeof rec === 'string' ? parseWindow(rec) : null
  return { kind: 'window', recent: recent ? recent.filter((i) => i < n) : [] }
}

/** Drops the oldest keys of a map past `cap`: insertion order is recency order. */
function evict(map: Record<string, unknown>, cap: number): void {
  const keys = Object.keys(map)
  for (let i = 0; i < keys.length - cap; i++) delete map[keys[i]]
}

/** Records that line `index` of the pool was just used. Touches the key (moves it last) and evicts the oldest past 300. */
export function rememberPool(mem: TextMem, key: string, n: number, index: number): void {
  if (!isMemKey(key) || !Number.isInteger(index) || index < 0 || index >= n || index > MAX_INDEX) return
  const recall = recallPool(mem, key, n)
  let rec: string
  if (recall.kind === 'bag') {
    // A full bag starts a new cycle with just this line.
    const used = recall.used === (1 << n) - 1 ? 1 << index : recall.used | (1 << index)
    rec = `b${used}.${index}`
  } else {
    rec = 'w' + [...recall.recent, index].slice(-TEXT_MEM_LIMITS.recent).join(',')
  }
  delete mem.p[key]
  mem.p[key] = rec
  evict(mem.p, TEXT_MEM_LIMITS.pools)
}

/** Notes that the family was used this year: appends g.year, drops years 10 or more behind it and years after it, keeps the newest 12. */
export function noteFamily(g: GameState, fam: string): void {
  if (!isMemKey(fam) || !Number.isInteger(g.year) || g.year < 0 || g.year > 999_999) return
  const mem = writableTextMem(g)
  const years = (Object.hasOwn(mem.f, fam) ? parseFamily(mem.f[fam]) : null) ?? []
  const kept = years.filter((y) => y > g.year - TEXT_MEM_LIMITS.famWindow && y <= g.year)
  kept.push(g.year)
  delete mem.f[fam]
  mem.f[fam] = kept.slice(-TEXT_MEM_LIMITS.famYears).join(',')
  evict(mem.f, TEXT_MEM_LIMITS.families)
}

/**
 * Pure. When the family was last used (the latest year not after g.year, or null) and how many uses fall
 * in the last 10 years: years y with g.year - 10 < y <= g.year. A year after g.year is never read.
 */
export function familyStats(g: GameState, fam: string): { last: number | null; count10: number } {
  const f = readTextMem(g).f
  const years = isMemKey(fam) && Object.hasOwn(f, fam) ? parseFamily(f[fam]) : null
  let last: number | null = null
  let count10 = 0
  for (const y of years ?? []) {
    if (y > g.year) continue
    last = y
    if (y > g.year - TEXT_MEM_LIMITS.famWindow) count10++
  }
  return { last, count10 }
}

/** The named ring, oldest first, or null when it was never written. A copy. */
export function ringRead(g: GameState, name: string): string[] | null {
  const r = readTextMem(g).r
  return isMemKey(name) && Object.hasOwn(r, name) ? r[name] : null
}

/** Replaces the named ring with the newest `cap` (default and maximum 64) strings of at most 80 characters. At most 4 rings: a fifth is ignored. */
export function ringWrite(g: GameState, name: string, keys: readonly string[], cap: number = TEXT_MEM_LIMITS.ring): void {
  if (!isMemKey(name)) return
  const mem = writableTextMem(g)
  if (!Object.hasOwn(mem.r, name) && Object.keys(mem.r).length >= TEXT_MEM_LIMITS.rings) return
  const size = Number.isFinite(cap) ? Math.min(TEXT_MEM_LIMITS.ring, Math.max(1, Math.floor(cap))) : TEXT_MEM_LIMITS.ring
  mem.r[name] = cleanRing(keys, size)
}
