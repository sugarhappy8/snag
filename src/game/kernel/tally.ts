// A company's cash, by reason (R2-L19, design 4.2): the small tally the exact cash walk is built from.
//
// The ledger's flow table is per country and per class, so it cannot say where one company's year went. A company therefore keeps a
// tally of its own: for each reason, the whole dollars its cash gained or lost since its books last closed. The books close copies the
// tally into the year's row (`flows`) and starts again. At most TALLY_KEYS reasons a company-year, every number a whole dollar held to
// TALLY_MAX, and a reason that nets to zero is not kept, so a company's history costs a few hundred numbers.
//
// A tally has one key that is not a reason: `operating`, the year's operating result (the one booking that lands the simulation's
// closing cash, business/settle.ts). Keeping it apart from `sales` and `inputs` is what lets the walk tell that booking from the one-off
// sales and supplies a company booked during the year.
//
// This file is part of the kernel (L0): pure functions over plain data, and it imports the reason table only.
import { REASONS, type Reason } from './reasons'

/** A company's cash by reason: whole dollars, never a zero. */
export type Tally = Record<string, number>

/** The key of the year's operating result: the one key of a tally that is not a reason. */
export const TALLY_OPERATING = 'operating'
/** What a tally can be keyed by. */
export type TallyKey = Reason | typeof TALLY_OPERATING

/** The most keys one tally keeps. */
export const TALLY_KEYS = 16
/** The most a tallied amount holds, either way (the books' own bound, business/state.ts BOOK_MAX). */
export const TALLY_MAX = 1e15
/** The most keys one reader looks at: a hostile object cannot make a read slow. */
const LOOK_AT = 512
/** The reason a seventeenth reason folds into, so the sum of the tally never changes. It always has a free slot. */
const FOLD: Reason = 'luck'
/** The reasons other than FOLD that a tally keeps: one slot is left for FOLD. */
const OTHER_KEYS = TALLY_KEYS - 1

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** True for the names a tally can be keyed by: the ledger's reasons and `operating`. */
const isKey = (k: string): boolean => k === TALLY_OPERATING || hasOwn(REASONS, k)

/** A saved amount: whole and held to TALLY_MAX, 0 for anything that is not a finite number. */
function amountOf(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  return Math.round(Math.max(-TALLY_MAX, Math.min(TALLY_MAX, x))) + 0
}

/** `a` and `b` added and held to TALLY_MAX. */
const clampSum = (a: number, b: number): number => Math.max(-TALLY_MAX, Math.min(TALLY_MAX, a + b))

/** How many of the keys `t` keeps are not the folding reason. */
function others(t: Tally): number {
  let n = 0
  for (const k of Object.keys(t)) if (k !== FOLD && isKey(k)) n++
  return n
}

/** `t` when it is a tally that can be written to (a plain object), else undefined: a save can hold anything under `tally`. */
export function liveTally(t: unknown): Tally | undefined {
  return typeof t === 'object' && t !== null && !Array.isArray(t) ? (t as Tally) : undefined
}

/**
 * Adds a change of whole dollars to the tally under a reason (or `operating`). A key the tally has no room for (the sixteenth beyond fifteen) goes
 * to `luck`, so the sum stays what it was. A key that reaches zero is deleted. A change that is not a finite number adds nothing.
 */
export function addTally(t: Tally, reason: TallyKey, change: number): void {
  const whole = amountOf(change)
  if (whole === 0) return
  let key: string = reason
  if (!hasOwn(t, key) && key !== FOLD && others(t) >= OTHER_KEYS) key = FOLD
  const next = clampSum(hasOwn(t, key) ? amountOf(t[key]) : 0, whole)
  if (next === 0) delete t[key]
  else t[key] = next
}

/**
 * A stored tally, cleaned: undefined unless it is a plain object. Keys that are neither reasons nor `operating`, numbers that are not finite and zeros are
 * left out, every number is whole and held to TALLY_MAX, and a tally of more than 16 reasons keeps the 15 largest and folds the rest
 * into `luck`. Valid input keeps its own order, so a save reads back as the same JSON.
 */
export function readTally(raw: unknown): Tally | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const seen: [string, number][] = []
  let looked = 0
  for (const k of Object.keys(raw)) {
    if (++looked > LOOK_AT) break
    if (!isKey(k)) continue
    const v = amountOf((raw as Record<string, unknown>)[k])
    if (v !== 0) seen.push([k, v])
  }
  const kept = seen.filter(([k]) => k !== FOLD)
  if (kept.length <= OTHER_KEYS) return Object.fromEntries(seen)
  // Too many reasons: the 15 largest stay, the rest and any luck of its own are folded into one luck row.
  const big = new Set(
    [...kept]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || (a[0] < b[0] ? -1 : 1))
      .slice(0, OTHER_KEYS)
      .map(([k]) => k),
  )
  const out: Tally = {}
  let folded = 0
  for (const [k, v] of seen) {
    if (k === FOLD || !big.has(k)) folded = clampSum(folded, v)
    else out[k] = v
  }
  if (folded !== 0) out[FOLD] = folded
  return out
}

/**
 * Two stored tallies added together, each read as readTally reads it: what a year's row keeps when its books are closed twice.
 * Undefined when neither is a tally.
 */
export function mergeTally(a: unknown, b: unknown): Tally | undefined {
  const parts = [readTally(a), readTally(b)]
  if (parts[0] === undefined && parts[1] === undefined) return undefined
  const sum: Tally = {}
  for (const t of parts) {
    if (t === undefined) continue
    for (const k of Object.keys(t)) sum[k] = clampSum(sum[k] ?? 0, t[k]!)
  }
  return readTally(sum)
}
