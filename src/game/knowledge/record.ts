// R3-H3 (H.1): the flags.know record, the writing side. What the player researched is kept here: a reading per key, merged with
// what was known before, aged by the drift of the thing it measures, and bounded. rows.ts holds the shape and every read; this file
// is learn, widen, forget and the list the Briefing hub shows.
//
//   learn   merges a new reading with the aged row by inverse variance (mergeReadings), refuses a source that is already in the
//           row for this year (a repeat buy never averages), sets the year and the sources, and writes in place. The record is
//           created on the first learn; a life that never researches anything never has one.
//   cap     at most KNOW_LIMITS.keys rows. A full record sheds its stalest rows first (ties by key), never the row just learned.
//           A write also drops the rows that cannot be read any more (older than 12 years, from after g.year, malformed).
//   widen   an event doubles the sd of the rows under a prefix (the market moved; what you knew is worth less). Never narrows.
//   forget  removes one row. An emptied record with no dial, heat or stamp goes with it.
//
// Nothing here draws: a source (R3-H4) turns the truth into a reading with a hashed draw and hands it to learn.
import type { GameState } from '../types'
import { agedSd, mergeReadings, rowEstimate, SD_MIN } from './estimate'
import { ruleOf } from './keys'
import {
  KNOW_LIMITS,
  SRC_MAX,
  SRC_TOKEN,
  dialOf,
  dropRec,
  formatRow,
  hasOwn,
  heatOf,
  ownerOf,
  parseRow,
  putRec,
  rawRec,
  readRows,
  srcList,
  stampOf,
  staleFirst,
  storedRow,
  usable,
  type RawRec,
} from './rows'
import type { Estimate, StoredRow, Unit } from './types'

export { KNOW_FLAG, KNOW_LIMITS, readKnow, storedRow } from './rows'
export type { KnowRec } from './rows'

/** widen never takes an sd past this. */
const WIDEN_CAP = 0.8
const MID_MIN = 1e-12
const MID_MAX = 1e18

const isLog = (u: Unit): boolean => u === 'money' || u === 'count' || u === 'pct'
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** A reading as a unit can hold it: clipped to a bounded scale, null when a log scale cannot take it or it is absurdly large. */
function holdable(unit: Unit, mid: number): number | null {
  if (unit === 'score') return clamp(mid, 0, 100)
  if (unit === 'odds') return clamp(mid, 0, 1)
  if (isLog(unit)) return mid >= MID_MIN && mid <= MID_MAX ? mid : null
  return Math.abs(mid) <= MID_MAX ? mid : null
}

/**
 * The record to write into: this character's own, cleaned (the rows that cannot be read are dropped, the cap is held, a bad dial,
 * heat or stamp is removed), or a new one when there is none, it is another character's, or it is damaged. Only a write calls this.
 */
export function recordFor(g: GameState): RawRec {
  const rec = rawRec(g)
  if (!rec) {
    const fresh: RawRec = { v: 1, o: ownerOf(g), k: {} }
    putRec(g, fresh)
    return fresh
  }
  const keep = new Set(readRows(g, rec).map(([key]) => key))
  for (const key of Object.keys(rec.k)) if (!keep.has(key)) delete rec.k[key]
  setField(rec, 'd', dialOf(rec.d))
  setField(rec, 'h', heatOf(rec.h))
  setField(rec, 'sy', stampOf(rec.sy, g.year))
  return rec
}

function setField(rec: RawRec, field: 'd' | 'h' | 'sy', value: number | undefined): void {
  if (rec[field] === value) return
  if (value === undefined) delete rec[field]
  else rec[field] = value
}

/** Shed the stalest rows (ties by key) until the record is within the cap; `keep` is the row just written and never goes. */
function shed(rec: RawRec, keep: string): void {
  const over = Object.keys(rec.k).length - KNOW_LIMITS.keys
  if (over <= 0) return
  const rest: Array<[string, StoredRow]> = []
  for (const key of Object.keys(rec.k)) {
    const row = key === keep ? null : parseRow(rec.k[key], ruleOf(key)?.unit ?? null)
    if (row) rest.push([key, row])
  }
  rest.sort(staleFirst)
  for (const [key] of rest.slice(0, over)) delete rec.k[key]
}

/**
 * Keep a reading of `key`. `r.mid` is what a source read (in the unit of the truth), `r.sd` its relative sd and `r.src` the source
 * ('press'); `r.unit` is needed only for a hint key, whose rule has none. The reading is merged with the row already held, aged to
 * this year, so two sources sharpen each other and a repeat of one source in one year is refused: null, nothing written. Also null
 * for a reading that cannot be stored (not finite, off the unit's scale, a bad key or source). Returns the row as stored.
 */
export function learn(g: GameState, key: string, r: { mid: number; sd: number; src: string; unit?: Unit }): StoredRow | null {
  const rule = ruleOf(key)
  if (!rule) return null
  const unit = rule.unit ?? r.unit ?? null
  if (unit === null || typeof r.src !== 'string' || !SRC_TOKEN.test(r.src)) return null
  if (!Number.isFinite(r.mid) || !Number.isFinite(r.sd) || r.sd <= 0) return null
  const mid = holdable(unit, r.mid)
  if (mid === null) return null
  const sd = clamp(r.sd, SD_MIN, 1)

  const old = storedRow(g, key, unit)
  const merged = old && old.y === g.year ? srcList(old.src) : []
  if (merged.includes(r.src) || merged.length >= SRC_MAX) return null
  const now = old ? mergeReadings({ mid: old.mid, sd: agedSd(old.sd, rule.drift, g.year - old.y) }, { mid, sd }, unit) : { mid, sd }
  const text = formatRow(now.mid, now.sd, g.year, [...merged, r.src])
  const row = parseRow(text, unit)
  if (!row || !usable(row, g.year)) return null

  const rec = recordFor(g)
  rec.k[key] = text
  shed(rec, key)
  return row
}

/**
 * An event made what the player knew worth less: every row under `keyPrefix` gets its sd multiplied by `factor` (default 2),
 * never past .8 and never narrowed. Writes nothing when there is no record or no row under the prefix.
 */
export function widen(g: GameState, keyPrefix: string, factor = 2): void {
  if (typeof keyPrefix !== 'string' || typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 1) return
  const rec = rawRec(g)
  if (!rec) return
  for (const key of Object.keys(rec.k)) {
    if (!key.startsWith(keyPrefix)) continue
    const rule = ruleOf(key)
    const row = rule ? parseRow(rec.k[key], rule.unit) : null
    if (!row || !usable(row, g.year)) continue
    const sd = Math.max(row.sd, Math.min(WIDEN_CAP, row.sd * factor))
    if (sd > row.sd) rec.k[key] = formatRow(row.mid, sd, row.y, srcList(row.src))
  }
}

/** Drop what is known about one key. The record goes too when that was its last row and it holds nothing else. */
export function forget(g: GameState, key: string): void {
  const rec = rawRec(g)
  if (!rec || typeof key !== 'string' || !hasOwn(rec.k, key)) return
  delete rec.k[key]
  if (Object.keys(rec.k).length === 0 && Object.keys(rec).every((field) => field === 'v' || field === 'o' || field === 'k')) dropRec(g)
}

/**
 * Everything the player has researched, as estimates, stalest first (ties by key): what the Briefing hub lists. It needs no truth:
 * each row is shown as it was read, aged to this year. A row whose key has no unit (a hint key) is left out. Pure; the mode does
 * not hide it (a screen decides what to show in Exact).
 */
export function storedEstimates(g: GameState): Estimate[] {
  const rec = rawRec(g)
  if (!rec) return []
  const out: Estimate[] = []
  for (const [key, row] of readRows(g, rec)) {
    const e = rowEstimate(g, key, row)
    if (e) out.push(e)
  }
  return out
}
