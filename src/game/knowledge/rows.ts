// R3-H3 (H.1): the rows of the flags.know record, and the pure reads of them. record.ts writes; this file only reads, so the
// estimate core (estimate.ts) can ask for a stored reading without an import cycle.
//
// The record is one value of the flags bag, owner-stamped and bounded:
//
//   flags.know = { v: 1, o, k: { <key>: 'mid|sdPermille|year|src[+src]' }, d?, h?, sy? }
//
//   o        the owner stamp, the same text as special/common.ts ownerKey (knowledge may not import special). A record whose o is
//            not the current character's reads as absent, and the key is classed personal, so an heir starts clean.
//   k        at most KNOW_LIMITS.keys rows, each a string with four strictly parsed fields: the reading (9 significant digits,
//            written the way String() writes a number), the relative sd in permille (30 to 1000), the year, and the sources merged
//            in that year ('press', or 'press+report'). A row that fails any rule reads as absent.
//   d, h, sy the dial of the standing orders (0 to 3), the heat of the illegal sources (0 to 20) and the year of the last yearly
//            step (never after g.year). R3-H4 and R3-H5 write them; this file only checks them.
//
// A row older than KNOW_LIMITS.years, or stamped after g.year (no foresight; a jump back in time), reads as absent. A hostile record
// reads as null or as a trimmed copy and never throws. Nothing here writes, and the only mention of the flags bag is the one key.
import type { GameState, Json } from '../types'
import { ruleOf } from './keys'
import type { StoredRow, Unit } from './types'

/** The flags key of the record. Read through this constant so the flags scan (test/world-flags.test.ts) classes it: personal. */
export const KNOW_FLAG = 'know'

export const KNOW_LIMITS = Object.freeze({ keys: 120, years: 12, heat: 20 } as const)

/** The most sources one row lists (every source of R3 once, with a spare). */
export const SRC_MAX = 12
/** The dial of the standing orders. */
export const DIAL_MAX = 3

/** A record with more rows than this is not an honest one (the cap is 120): it reads as absent, so a read never walks a huge object. */
const HOSTILE_ROWS = 1000
const ROW_MAX = 200
const MID_CHARS = 26
const MID_MIN = 1e-12
const MID_MAX = 1e18
const SD_PERMILLE_MIN = 30
const SD_PERMILLE_MAX = 1000
const MID_TEXT = /^-?\d+(?:\.\d+)?(?:e[+-]\d+)?$/
const WHOLE = /^(?:0|[1-9]\d{0,3})$/
const YEAR_TEXT = /^[1-9]\d{0,3}$/
/** A source token as a row writes it: 'press', 'investigator'. */
export const SRC_TOKEN = /^[a-z][a-z0-9]{0,11}$/

/** The record as stored (the rows are still text). */
export interface RawRec {
  v: 1
  o: string
  k: Record<string, string>
  d?: number
  h?: number
  sy?: number
}

/** The record as read: the rows that can be used today, parsed, stalest first; d, h and sy only when valid. */
export interface KnowRec {
  v: 1
  o: string
  k: Readonly<Record<string, StoredRow>>
  d?: number
  h?: number
  sy?: number
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** How many properties `o` has, counted only up to `cap + 1` (so a huge object costs no more than a small one). */
function countUpTo(o: object, cap: number): number {
  let n = 0
  for (const name in o) if (hasOwn(o, name) && ++n > cap) return n
  return n
}

/** The owner stamp of the current character: the text special/common.ts ownerKey makes. */
export function ownerOf(g: Pick<GameState, 'generation' | 'character'>): string {
  const generation = Number.isFinite(g.generation) ? Math.max(0, Math.round(g.generation)) : 0
  return `v2:${generation}:${g.character.id}`
}

/**
 * The record as the game holds it when it is the current owner's, has its two parts and is not absurdly large, else null. Never
 * writes. Its rows are still text, and may be damaged: readRows and storedRow check them.
 */
export function rawRec(g: GameState): RawRec | null {
  const v: unknown = g.flags[KNOW_FLAG]
  if (!isObj(v) || v.v !== 1 || v.o !== ownerOf(g) || !isObj(v.k) || countUpTo(v.k, HOSTILE_ROWS) > HOSTILE_ROWS) return null
  return v as unknown as RawRec
}

/** Put a record in the flags bag. */
export function putRec(g: GameState, rec: RawRec): void {
  g.flags[KNOW_FLAG] = rec as unknown as Json
}

/** Take the record out of the flags bag. */
export function dropRec(g: GameState): void {
  delete g.flags[KNOW_FLAG]
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Rows

function midOk(unit: Unit | null, mid: number): boolean {
  switch (unit) {
    case 'money':
    case 'count':
    case 'pct':
      return mid >= MID_MIN && mid <= MID_MAX
    case 'score':
      return mid >= 0 && mid <= 100
    case 'odds':
      return mid >= 0 && mid <= 1
    default:
      return Math.abs(mid) <= MID_MAX
  }
}

/** The sources a row lists, in the order they were merged. */
export const srcList = (src: string): string[] => src.split('+')

/**
 * One row's text as a StoredRow, or null when any field breaks its rule. Only the grammar and the unit's range are checked here;
 * whether the year still counts is usable(). `unit` is the unit of the key's rule (null for a hint key: any finite reading).
 */
export function parseRow(text: unknown, unit: Unit | null): StoredRow | null {
  if (typeof text !== 'string' || text.length > ROW_MAX) return null
  const f = text.split('|')
  if (f.length !== 4) return null
  const [m, s, y, src] = f as [string, string, string, string]
  if (m.length > MID_CHARS || !MID_TEXT.test(m)) return null
  const mid = Number(m)
  // Only the text String() writes: no leading zero, no plus sign, no spare digits, so a row reads back as it was written.
  if (!Number.isFinite(mid) || String(mid) !== m || !midOk(unit, mid)) return null
  if (!WHOLE.test(s)) return null
  const permille = Number(s)
  if (permille < SD_PERMILLE_MIN || permille > SD_PERMILLE_MAX) return null
  if (!YEAR_TEXT.test(y)) return null
  const tokens = srcList(src)
  if (tokens.length > SRC_MAX || new Set(tokens).size !== tokens.length || !tokens.every((t) => SRC_TOKEN.test(t))) return null
  return { mid, sd: permille / 1000, y: Number(y), src }
}

/** A row as text: the reading to 9 significant digits, the sd rounded up to the next permille (a band is never made sharper than it was). */
export function formatRow(mid: number, sd: number, y: number, srcs: readonly string[]): string {
  const permille = Math.min(SD_PERMILLE_MAX, Math.max(SD_PERMILLE_MIN, Math.ceil(sd * 1000 - 1e-9)))
  return `${Number(mid.toPrecision(9))}|${permille}|${y}|${srcs.join('+')}`
}

/** A row that counts today: not stamped after the year (no foresight), not older than KNOW_LIMITS.years. */
export function usable(row: StoredRow, year: number): boolean {
  return row.y <= year && year - row.y <= KNOW_LIMITS.years
}

/** Stalest first, ties by key: the order rows leave when the record is full and the order the hub lists them. */
export const staleFirst = (a: readonly [string, StoredRow], b: readonly [string, StoredRow]): number =>
  a[1].y - b[1].y || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)

/** Every row of the record that can be used today, stalest first, cut to the freshest KNOW_LIMITS.keys. */
export function readRows(g: GameState, rec: RawRec): Array<[string, StoredRow]> {
  const out: Array<[string, StoredRow]> = []
  for (const key of Object.keys(rec.k)) {
    const rule = ruleOf(key)
    if (!rule) continue
    const row = parseRow(rec.k[key], rule.unit)
    if (row && usable(row, g.year)) out.push([key, row])
  }
  out.sort(staleFirst)
  return out.length > KNOW_LIMITS.keys ? out.slice(out.length - KNOW_LIMITS.keys) : out
}

/**
 * The stored reading for `key` that can be used today, or null. `unit` is the caller's unit for a key whose rule has none (a hint
 * key). A record that holds more rows than the cap is read the way readKnow reads it, so both agree on which rows exist.
 */
export function storedRow(g: GameState, key: string, unit?: Unit): StoredRow | null {
  const rec = rawRec(g)
  if (!rec || !hasOwn(rec.k, key)) return null
  const rule = ruleOf(key)
  if (!rule) return null
  if (countUpTo(rec.k, KNOW_LIMITS.keys) > KNOW_LIMITS.keys) return readRows(g, rec).find(([name]) => name === key)?.[1] ?? null
  const row = parseRow(rec.k[key], rule.unit ?? unit ?? null)
  return row && usable(row, g.year) ? row : null
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The record's other fields

/** The dial of the standing orders: a whole number from 0 to 3, else absent. */
export const dialOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= DIAL_MAX ? v : undefined)

/** The heat of the illegal sources: a finite number, rounded and held to 0..KNOW_LIMITS.heat, else absent. */
export const heatOf = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(KNOW_LIMITS.heat, Math.max(0, Math.round(v))) : undefined

/** The year of the last yearly step: a whole year not after `year`, else absent. */
export const stampOf = (v: unknown, year: number): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= year ? v : undefined)

/**
 * The record as it can be read today, or null when there is none for this character: a trimmed, frozen copy with only the rows that
 * count, stalest first. Pure: it never writes, and what it returns is not the stored object.
 */
export function readKnow(g: GameState): Readonly<KnowRec> | null {
  const rec = rawRec(g)
  if (!rec) return null
  const k: Record<string, StoredRow> = {}
  for (const [key, row] of readRows(g, rec)) k[key] = Object.freeze(row)
  const d = dialOf(rec.d)
  const h = heatOf(rec.h)
  const sy = stampOf(rec.sy, g.year)
  return Object.freeze({
    v: 1,
    o: rec.o,
    k: Object.freeze(k),
    ...(d !== undefined ? { d } : {}),
    ...(h !== undefined ? { h } : {}),
    ...(sy !== undefined ? { sy } : {}),
  })
}
