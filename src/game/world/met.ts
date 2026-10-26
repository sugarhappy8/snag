// The Met store (R4-S4, D.1 c): who the player has met, as a keyed shard of the world, g.world.met. A record is a person the game
// has met or is bound to; a tombstone is what is left of one who is only owed, remembered or feuded with. The name of a person is
// stored the day it is first resolved, so a later edit to a name table never renames anyone (docs/PEOPLE.md, "The Met store").
//
//   normalizeMet(raw)     total and bounded: any value in, a valid shard out; a valid shard comes back as itself
//   readMet(g)            pure. The stored shard through its reader; an absent or garbage shard reads as the empty one
//   metRecord(g, key)     the record of a key, or null (a tombstone is not a record)
//   metTomb(g, key)       the tombstone of a key, or null
//   isTomb(x)             an array of seven that has the shape of a tombstone
//   metKinds(g)           records per sid kind, pure; every kind of SID_KINDS is there, 0 when none (R6 counts career peers with it)
//   metProblems(raw, ps)  every way a stored shard is wrong, one line each; ps (g.people) adds the two faults of a living Person
//   writeMet(g, next)     the one writer: replaces the root, only when something changed
//   packGb / unpackGb     the tombstone's `gb`: born * 2 + the gender bit (1 male), so waking a tombstone gives both back
//
// The shape is a plain object keyed by sid, with no `v` and no `y` (the version of the slice travels in `sv`). A key is a sid of the
// strict grammar (world/sid.ts), or a legacy person id `p<digits>` when the value is a tombstone: a debt outlives its Person.
//
//   record  { f, l, g, b, c, k, a, y, s, w, fl, gr, ob, d?, r?, j? }
//     f first name (24 characters), l last name (32), g gender (1 male), b born (1700..100000, wider than the rest on purpose: a person
//     is born before the life starts, so an elder of a 1900 life, or a latent person of cohort 1850 aged 90, must come back as stored),
//     c country id, k which name was drawn (0..8: 0 is the latent name, 1..7 the stored alternates, 8 the hyphenated surname), a the
//     five axes (AXIS_IDS order, whole 0..100), y first met, s last seen, d died (1900..100000: a life starts no earlier than
//     HISTORY_START), w role weight (0..9), fl stake flags (0..63: 1 debt, 2 spouse, 4 heir, 8 company, 16 feud, 32 will), gr grudge
//     (0..100), ob obligation (-100..100), r role tag and j job or firm ref (reserved for R6, sanitized, written by nobody in R4).
//   tombstone  [y, gr, ob, fl, first, last, gb]
//
// The reader cuts every field into its range and drops what cannot be read (a number that is not finite, a name that is no text, axes
// that are not five numbers, a key that is no sid, a tombstone of the wrong length, a record of more than 24 nodes). It scans at most
// 5,000 entries, keeps 400 records and 200 tombstones (protected entries first, then the freshest, then by key, so the survivors depend
// only on the set of names) and returns the keys in plain code-unit order. That order is `a < b` and never localeCompare: the entity
// codec (save-codec.ts partition) tests `prev < k`, and a shard that is not in that order rides whole in the world chunk.
//
// The writer replaces the root, never edits it, and seals what it stores: the root, each record and tombstone and the axes list are
// frozen, and a sealed root is known to be valid, so a read after a write costs nothing. An untouched entry keeps its identity, which is
// what lets the codec rewrite one chunk for one tap.
//
// Pure reads: no luck, no clock, no write. Nothing in a played life calls the writer in R4 (S7 builds the behaviour on it). Layer 2: it
// imports the kernel's leaves, the sid grammar and the world root, and registers itself like facts and frontier do.
import { parseRef } from '../kernel/ids'
import { heirUnsafe } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import type { AxisTuple } from './axes'
import { MET_CAPS } from './caps'
import { isPlain } from './rows'
import { isSid, parseSid, SID_KINDS } from './sid'
import { ensureWorld, nodeCount, readWorld, registerShard, worldShard } from './state'

/** One person the game has met. See the header for every field. */
export interface MetRecord {
  f: string
  l: string
  g: 0 | 1
  b: number
  c: string
  k: number
  a: AxisTuple
  y: number
  s: number
  w: number
  fl: number
  gr: number
  ob: number
  d?: number
  r?: string
  j?: string
}

/** What is left of a person who is only owed, remembered or feuded with: year, grudge, obligation, flags, first, last, gb (born * 2 + gender). */
export type Tomb = readonly [y: number, gr: number, ob: number, fl: number, first: string, last: string, gb: number]

/** The shard: keys ascend; a key is a sid, or a legacy person id for a tombstone only. */
export type MetShard = { [key: string]: MetRecord | Tomb }

/** The ranges the reader cuts to, stated once. */
export const MET_LIMITS = Object.freeze({
  yearMin: 1900,
  yearMax: 100_000,
  bornMin: 1700,
  firstMax: 24,
  lastMax: 32,
  kMax: 8,
  wMax: 9,
  flMax: 63,
  grMax: 100,
  obMax: 100,
  axisMax: 100,
  roleMax: 16,
  refMax: 52,
  gbMin: 3_400,
  gbMax: 200_001,
})

const L = MET_LIMITS

// ---------------------------------------------------------------------------------------------------------------------------
// Field readers: one rule for each field, and each says whether the value it was given is already that value
// ---------------------------------------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key)
/** A field of a record as the record itself holds it: an inherited property is never one of its fields. */
const ownOf = (o: Rec, key: string): unknown => (hasOwn(o, key) ? o[key] : undefined)

/** Control characters, and the two line separators: none of them belongs in a name. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g
/** A country id: what a pool or a place of the sid grammar can be. */
const COUNTRY = /^[A-Za-z0-9_-]{1,12}$/
/** A role tag. */
const ROLE = /^[a-z][a-z0-9.-]{0,15}$/
/** A legacy person id: `p` and digits. A Person made before sids existed is keyed by it. */
const LEGACY = /^p[0-9]{1,15}$/
/** The most of a text the reader looks at, so a ten-thousand-character name costs a bounded amount. */
const TEXT_READ = 4_096

/** A name: control characters out, trimmed, cut to `max` characters (never in the middle of a pair), or null when nothing is left. */
function nameOf(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null
  let t = (x.length > TEXT_READ ? x.slice(0, TEXT_READ) : x).replace(CONTROL, '').trim()
  if (t.length > max) {
    t = t.slice(0, max)
    const last = t.charCodeAt(t.length - 1)
    if (last >= 0xd800 && last <= 0xdbff) t = t.slice(0, -1)
    t = t.trim()
  }
  return t.length > 0 ? t : null
}

/** A whole number in lo..hi: a finite number is made whole and cut into the range; anything else is null. */
function wholeIn(x: unknown, lo: number, hi: number): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  const n = Math.trunc(x)
  return (n < lo ? lo : n > hi ? hi : n) + 0
}

/** The five axes: an array of exactly five numbers, each cut into 0..100. The array itself when it is already that. */
function axesOf(x: unknown): AxisTuple | null {
  if (!Array.isArray(x) || x.length !== 5) return null
  const out: number[] = []
  let same = true
  for (let i = 0; i < 5; i++) {
    const n = wholeIn(x[i], 0, L.axisMax)
    if (n === null) return null
    if (n !== x[i]) same = false
    out.push(n)
  }
  return same ? (x as unknown as AxisTuple) : (out as unknown as AxisTuple)
}

const countryOf = (x: unknown): string | null => (typeof x === 'string' && COUNTRY.test(x) ? x : null)
const roleOf = (x: unknown): string | null => (typeof x === 'string' && ROLE.test(x) ? x : null)
const jobOf = (x: unknown): string | null => (typeof x === 'string' && x.length <= L.refMax && parseRef(x) !== null ? x : null)

/** The keys of a record, in the order the reader writes them. */
const RECORD_KEYS = ['f', 'l', 'g', 'b', 'c', 'k', 'a', 'y', 's', 'w', 'fl', 'gr', 'ob', 'd', 'r', 'j'] as const
const KNOWN: ReadonlySet<string> = new Set(RECORD_KEYS)

/** A record of this shape, or null. The value itself when it is already exactly that (so a valid record keeps its identity). */
function cleanRecord(raw: unknown): MetRecord | null {
  try {
    if (!isPlain(raw)) return null
    const keys = Object.keys(raw)
    // A key besides the 16 may hold anything under it: such a record is counted before it is read, and one of more than 24 nodes goes.
    if (keys.some((key) => !KNOWN.has(key)) && nodeCount(raw, MET_CAPS.nodes) > MET_CAPS.nodes) return null
    const f = nameOf(ownOf(raw, 'f'), L.firstMax)
    const l = nameOf(ownOf(raw, 'l'), L.lastMax)
    const g = wholeIn(ownOf(raw, 'g'), 0, 1)
    const b = wholeIn(ownOf(raw, 'b'), L.bornMin, L.yearMax)
    const c = countryOf(ownOf(raw, 'c'))
    const k = wholeIn(ownOf(raw, 'k'), 0, L.kMax)
    const a = axesOf(ownOf(raw, 'a'))
    const y = wholeIn(ownOf(raw, 'y'), L.yearMin, L.yearMax)
    const s = wholeIn(ownOf(raw, 's'), L.yearMin, L.yearMax)
    const w = wholeIn(ownOf(raw, 'w'), 0, L.wMax)
    const fl = wholeIn(ownOf(raw, 'fl'), 0, L.flMax)
    const gr = wholeIn(ownOf(raw, 'gr'), 0, L.grMax)
    const ob = wholeIn(ownOf(raw, 'ob'), -L.obMax, L.obMax)
    if (f === null || l === null || g === null || b === null || c === null || k === null || a === null) return null
    if (y === null || s === null || w === null || fl === null || gr === null || ob === null) return null
    const out: MetRecord = { f, l, g: g as 0 | 1, b, c, k, a, y, s, w, fl, gr, ob }
    const d = wholeIn(ownOf(raw, 'd'), L.yearMin, L.yearMax)
    if (d !== null) out.d = d
    const r = roleOf(ownOf(raw, 'r'))
    if (r !== null) out.r = r
    const j = jobOf(ownOf(raw, 'j'))
    if (j !== null) out.j = j
    if (keys.length !== Object.keys(out).length) return out
    for (const key of keys) if ((out as unknown as Rec)[key] !== raw[key]) return out
    return raw as unknown as MetRecord
  } catch {
    return null
  }
}

/** A tombstone of this shape, or null. The value itself when it is already exactly that. */
function cleanTomb(raw: unknown): Tomb | null {
  try {
    if (!Array.isArray(raw) || raw.length !== 7) return null
    const y = wholeIn(raw[0], L.yearMin, L.yearMax)
    const gr = wholeIn(raw[1], 0, L.grMax)
    const ob = wholeIn(raw[2], -L.obMax, L.obMax)
    const fl = wholeIn(raw[3], 0, L.flMax)
    const first = nameOf(raw[4], L.firstMax)
    const last = nameOf(raw[5], L.lastMax)
    const gb = wholeIn(raw[6], L.gbMin, L.gbMax)
    if (y === null || gr === null || ob === null || fl === null || first === null || last === null || gb === null) return null
    const out: Tomb = [y, gr, ob, fl, first, last, gb]
    for (let i = 0; i < 7; i++) if (out[i] !== raw[i]) return out
    return raw as unknown as Tomb
  } catch {
    return null
  }
}

/** An array of seven with the shape of a tombstone. Shape only: the ranges are the reader's. */
export function isTomb(x: unknown): x is Tomb {
  if (!Array.isArray(x) || x.length !== 7) return false
  const n = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v)
  return n(x[0]) && n(x[1]) && n(x[2]) && n(x[3]) && typeof x[4] === 'string' && typeof x[5] === 'string' && n(x[6])
}

/** The `gb` of a tombstone: the born year times two, plus 1 for a man and 0 for a woman. */
export function packGb(born: number, g: 0 | 1): number {
  return born * 2 + g
}

/** The born year and the gender bit of a `gb`. */
export function unpackGb(gb: number): { born: number; g: 0 | 1 } {
  const g = gb % 2 === 1 ? 1 : 0
  return { born: (gb - g) / 2, g }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------------------------------------------------------

/** One entry on its way through the cut. */
interface Entry {
  key: string
  value: MetRecord | Tomb
}

const GRUDGE_HOLDS = 20

/** A stake of its own holds the entry: a flag, an obligation or a grudge of 20 or more. */
function heldOf(value: MetRecord | Tomb): boolean {
  if (Array.isArray(value)) {
    const t = value as Tomb
    return t[3] !== 0 || t[2] !== 0 || t[1] >= GRUDGE_HOLDS
  }
  const r = value as MetRecord
  return r.fl !== 0 || r.ob !== 0 || r.gr >= GRUDGE_HOLDS
}

/** When the entry was last seen: a record's `s`, a tombstone's year. */
const freshOf = (value: MetRecord | Tomb): number => (Array.isArray(value) ? (value as Tomb)[0] : (value as MetRecord).s)

const byKey = (a: { key: string }, b: { key: string }): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/** True when the keys of the list already ascend: a sort that has nothing to do is not run. */
function ascending(list: readonly Entry[]): boolean {
  for (let i = 1; i < list.length; i++) if (!(list[i - 1]!.key < list[i]!.key)) return false
  return true
}

interface Ranked {
  e: Entry
  held: boolean
  fresh: number
}

/** Negative when `a` ranks before `b`: protected first, then the freshest, then by key. A total order (a key is unique in a shard). */
const rankOf = (a: Ranked, b: Ranked): number => Number(b.held) - Number(a.held) || b.fresh - a.fresh || byKey(a.e, b.e)

/** Most entries over the cap that are found one at a time (a write that adds one person is one over); more are sorted. */
const FEW_OVER = 8

/**
 * The first `cap` of the list in rank order. The order is total, so the survivors depend only on the set of names. A list inside the
 * cap is returned as it is. A list a few over loses its lowest ranked one by one (a pass each), which is what every write at the cap
 * does; a long one is sorted.
 */
function cutTo(list: Entry[], cap: number): Entry[] {
  if (list.length <= cap) return list
  const ranked: Ranked[] = list.map((e) => ({ e, held: heldOf(e.value), fresh: freshOf(e.value) }))
  const over = list.length - cap
  if (over > FEW_OVER) return ranked.sort(rankOf).slice(0, cap).map((r) => r.e)
  const gone = new Set<Ranked>()
  for (let n = 0; n < over; n++) {
    let worst: Ranked | null = null
    for (const r of ranked) if (!gone.has(r) && (worst === null || rankOf(r, worst) > 0)) worst = r
    gone.add(worst!)
  }
  return ranked.filter((r) => !gone.has(r)).map((r) => r.e)
}

/**
 * The shard `raw` says, cleaned. An entry that is the very value `known` holds under its key was read already, key and value, and is
 * not read again: that is what keeps a write at a few microseconds when one tap touches one person.
 */
function build(raw: Rec, known: Readonly<MetShard> | null): MetShard {
  const keys = Object.keys(raw)
  const scanned = keys.length > MET_CAPS.scan ? keys.slice(0, MET_CAPS.scan) : keys
  const records: Entry[] = []
  const tombs: Entry[] = []
  for (const key of scanned) {
    const v = raw[key]
    if (known !== null && v !== undefined && known[key] === v && hasOwn(known, key)) {
      ;(Array.isArray(v) ? tombs : records).push({ key, value: v as MetRecord | Tomb })
      continue
    }
    if (key.length > MET_CAPS.key) continue
    const legacy = !isSid(key)
    if (legacy && !LEGACY.test(key)) continue
    const value = Array.isArray(v) ? cleanTomb(v) : legacy ? null : cleanRecord(v)
    if (value === null) continue
    ;(Array.isArray(value) ? tombs : records).push({ key, value })
  }
  const kept = [...cutTo(records, MET_CAPS.records), ...cutTo(tombs, MET_CAPS.tombs)]
  if (!ascending(kept)) kept.sort(byKey)
  if (kept.length === keys.length) {
    let same = true
    for (let i = 0; i < kept.length; i++) {
      const e = kept[i]!
      if (keys[i] !== e.key || raw[e.key] !== e.value) {
        same = false
        break
      }
    }
    if (same) return raw as MetShard
  }
  const out: MetShard = {}
  for (const e of kept) out[e.key] = e.value
  return out
}

/** Roots the writer made and sealed: a deeply frozen root that was valid when it was made is valid for good. */
const SEALED = new WeakSet<object>()

/**
 * Makes any value into a valid shard. It never throws. Anything that is not a plain object reads as the empty shard. A valid shard
 * comes back as itself (so a read costs nothing and keeps identity), and so does a root the writer sealed.
 */
export function normalizeMet(raw: unknown): MetShard {
  try {
    if (typeof raw === 'object' && raw !== null && SEALED.has(raw)) return raw as MetShard
    if (!isPlain(raw)) return {}
    return build(raw, null)
  } catch {
    return {}
  }
}

registerShard('met', { normalize: (raw) => normalizeMet(raw) })

const NONE: Readonly<MetShard> = Object.freeze({})

/** The stored shard, read through its reader. Pure: it never creates g.world and never writes. Treat what it returns as read-only. */
export function readMet(g: Pick<GameState, 'world'>): Readonly<MetShard> {
  return worldShard<MetShard>(g, 'met') ?? NONE
}

/** The record of a key, or null when there is none or the key holds only a tombstone. */
export function metRecord(g: Pick<GameState, 'world'>, key: string): Readonly<MetRecord> | null {
  const shard = readMet(g)
  if (typeof key !== 'string' || !hasOwn(shard, key)) return null
  const v = shard[key]
  return v === undefined || isTomb(v) ? null : (v as MetRecord)
}

/** The tombstone of a key, or null. */
export function metTomb(g: Pick<GameState, 'world'>, key: string): Readonly<Tomb> | null {
  const shard = readMet(g)
  if (typeof key !== 'string' || !hasOwn(shard, key)) return null
  const v = shard[key]
  return isTomb(v) ? v : null
}

/** Records per sid kind, every kind of SID_KINDS present (0 when none). Tombstones are not counted. Pure. */
export function metKinds(g: Pick<GameState, 'world'>): Readonly<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const kind of SID_KINDS) out[kind] = 0
  const shard = readMet(g)
  for (const key of Object.keys(shard)) {
    if (isTomb(shard[key])) continue
    const slot = parseSid(key)
    if (slot !== null) out[slot.kind] = (out[slot.kind] ?? 0) + 1
  }
  return Object.freeze(out)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------------------------------------------------------

function sameEntry(a: MetRecord | Tomb, b: MetRecord | Tomb): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }
  const x = a as unknown as Rec
  const y = b as unknown as Rec
  for (const key of RECORD_KEYS) {
    if (key === 'a') {
      const p = x.a as readonly number[]
      const q = y.a as readonly number[]
      for (let i = 0; i < 5; i++) if (p[i] !== q[i]) return false
    } else if (x[key] !== y[key]) return false
  }
  return true
}

function seal(entry: MetRecord | Tomb): void {
  if (Object.isFrozen(entry)) return
  if (!Array.isArray(entry)) Object.freeze((entry as MetRecord).a)
  Object.freeze(entry)
}

/**
 * Stores the shard `next` says: the root is replaced, only when something changed; keys go in ascending order; an entry equal to the
 * one stored under its key stays the stored one (identity), so the save layer rewrites only what a tap touched; the cleaned shard is
 * what is kept, so a field out of range, a key that is no sid and a count past the caps never reach the world. Nothing is written when
 * the shard is absent and `next` is empty (an old save keeps reading as it did, with no world made for it). What it stores is sealed:
 * the root, each record and tombstone and the axes list are frozen, and the caller's own objects among them are frozen too, so a record
 * is built new for each change and never edited. A `next` that is not a plain object is ignored.
 */
export function writeMet(g: GameState, next: Readonly<MetShard>): void {
  if (!isPlain(next)) return
  const raw: unknown = readWorld(g).met
  const cur: Readonly<MetShard> = raw === undefined ? NONE : readMet(g)
  let clean: MetShard
  try {
    clean = build(next as Rec, cur)
  } catch {
    return
  }
  const keys = Object.keys(clean)
  if (raw === undefined && keys.length === 0) return
  const out: MetShard = {}
  for (const key of keys) {
    const v = clean[key]!
    const old = hasOwn(cur, key) ? cur[key] : undefined
    out[key] = old !== undefined && (old === v || sameEntry(old, v)) ? old : v
  }
  if (raw !== undefined && cur === raw) {
    const have = Object.keys(cur)
    if (have.length === keys.length && keys.every((k, i) => have[i] === k && cur[k] === out[k])) return
  }
  for (const key of keys) seal(out[key]!)
  Object.freeze(out)
  SEALED.add(out)
  ensureWorld(g).met = out
}

// ---------------------------------------------------------------------------------------------------------------------------
// The problems of a stored shard
// ---------------------------------------------------------------------------------------------------------------------------

/** Lines metProblems returns at most: a hostile shard is reported, not listed to the end. */
const PROBLEMS_MAX = 64

const shown = (key: string): string => {
  const t = key.replace(CONTROL, '?')
  return t.length > 44 ? `${t.slice(0, 44)}...` : t
}

/** The first thing wrong with a whole-number field, or null. */
function wholeFault(name: string, x: unknown, lo: number, hi: number): string | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return `${name} is not a number`
  if (!Number.isInteger(x)) return `${name} ${x} is not a whole number`
  return x < lo || x > hi ? `${name} ${x} is outside ${lo}..${hi}` : null
}

const nameFault = (name: string, x: unknown, max: number): string | null => (typeof x === 'string' && nameOf(x, max) === x ? null : `${name} is not a name of 1 to ${max} characters`)

/** The first thing wrong with a stored record, or null. */
function recordFault(v: unknown): string | null {
  if (!isPlain(v)) return 'not a record or a tombstone'
  const count = nodeCount(v, 256)
  if (count > MET_CAPS.nodes) return `${count > 255 ? 'over 255' : count} nodes, more than the ${MET_CAPS.nodes} allowed`
  const at = (key: string): unknown => ownOf(v, key)
  const a = at('a')
  const axes = Array.isArray(a) && a.length === 5 && a.every((n) => wholeFault('a', n, 0, L.axisMax) === null)
  const found =
    nameFault('f', at('f'), L.firstMax) ??
    nameFault('l', at('l'), L.lastMax) ??
    wholeFault('g', at('g'), 0, 1) ??
    wholeFault('b', at('b'), L.bornMin, L.yearMax) ??
    (countryOf(at('c')) === null ? 'c is not a country id' : null) ??
    wholeFault('k', at('k'), 0, L.kMax) ??
    (axes ? null : 'a is not five whole numbers from 0 to 100') ??
    wholeFault('y', at('y'), L.yearMin, L.yearMax) ??
    wholeFault('s', at('s'), L.yearMin, L.yearMax) ??
    wholeFault('w', at('w'), 0, L.wMax) ??
    wholeFault('fl', at('fl'), 0, L.flMax) ??
    wholeFault('gr', at('gr'), 0, L.grMax) ??
    wholeFault('ob', at('ob'), -L.obMax, L.obMax)
  if (found !== null) return found
  const died = hasOwn(v, 'd') ? wholeFault('d', v.d, L.yearMin, L.yearMax) : null
  if (died !== null) return died
  if (hasOwn(v, 'r') && roleOf(v.r) === null) return 'r is not a role tag'
  if (hasOwn(v, 'j') && jobOf(v.j) === null) return `j is not a ref of ${L.refMax} characters at most`
  for (const key of Object.keys(v)) if (!KNOWN.has(key)) return `unknown key ${shown(key)}`
  return null
}

/** The first thing wrong with a stored tombstone, or null. */
function tombFault(v: readonly unknown[]): string | null {
  if (v.length !== 7) return `tombstone has ${v.length} entries, not 7`
  return (
    wholeFault('y', v[0], L.yearMin, L.yearMax) ??
    wholeFault('gr', v[1], 0, L.grMax) ??
    wholeFault('ob', v[2], -L.obMax, L.obMax) ??
    wholeFault('fl', v[3], 0, L.flMax) ??
    nameFault('first', v[4], L.firstMax) ??
    nameFault('last', v[5], L.lastMax) ??
    wholeFault('gb', v[6], L.gbMin, L.gbMax)
  )
}

/**
 * Every way a stored shard is wrong, one line each, none for an absent shard: a shard that is no plain object; more entries than the
 * 5,000 scanned; more than 400 records or 200 tombstones; keys out of ascending order; a key that is no sid (or a legacy id on a
 * record); a field out of its range or of the wrong kind; an unknown key or a record over 24 nodes; a tombstone of the wrong length.
 * With `people` (g.people), also: a living Person whose `data.sid` is a sid of the strict grammar and has no record (a lenient text
 * such as `s77` needs none, and a tombstone is not a record), and a sid on a child, stepchild or grandchild (heirUnsafe). Reads the
 * shard raw, as stored, and never writes. At most 64 lines.
 */
export function metProblems(raw: unknown, people?: readonly Pick<Person, 'id' | 'relation' | 'alive' | 'data'>[]): string[] {
  const out: string[] = []
  let more = false
  const add = (line: string): void => {
    if (out.length < PROBLEMS_MAX) out.push(line)
    else more = true
  }
  let shard: Rec | null = null
  if (raw !== undefined) {
    if (!isPlain(raw)) add('not a plain object of records')
    else shard = raw
  }
  if (shard !== null) {
    const keys = Object.keys(shard)
    if (keys.length > MET_CAPS.scan) add(`${keys.length} entries, more than the ${MET_CAPS.scan} scanned`)
    const scanned = keys.length > MET_CAPS.scan ? keys.slice(0, MET_CAPS.scan) : keys
    let records = 0
    let tombs = 0
    let ascending = true
    for (let i = 0; i < scanned.length; i++) {
      const key = scanned[i]!
      if (i > 0 && !(scanned[i - 1]! < key)) ascending = false
      const v = shard[key]
      const tomb = Array.isArray(v)
      if (tomb) tombs++
      else records++
      const goodKey = key.length <= MET_CAPS.key && (isSid(key) || (tomb && LEGACY.test(key)))
      if (!goodKey) {
        add(`bad key ${shown(key)}`)
        continue
      }
      const fault = tomb ? tombFault(v) : recordFault(v)
      if (fault !== null) add(`${key}: ${fault}`)
    }
    if (records > MET_CAPS.records) add(`${records} records, more than the ${MET_CAPS.records} allowed`)
    if (tombs > MET_CAPS.tombs) add(`${tombs} tombstones, more than the ${MET_CAPS.tombs} allowed`)
    if (!ascending) add('keys are not in ascending order')
  }
  if (people !== undefined) {
    const list = people.length > MET_CAPS.scan ? people.slice(0, MET_CAPS.scan) : people
    for (const p of list) {
      const sid: unknown = p.data?.sid
      if (heirUnsafe(p)) add(`person ${p.id} is a ${p.relation} and carries sid ${shown(String(sid))}`)
      if (p.alive && isSid(sid) && !(shard !== null && hasOwn(shard, sid) && isPlain(shard[sid]))) add(`person ${p.id} holds sid ${sid} and the shard has no record of it`)
    }
  }
  if (more) out.push('and more')
  return out
}
