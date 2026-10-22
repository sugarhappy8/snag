// The effort record of one piece of work (R3-E5, C.1): the nine numbers a project, a program or an engine keeps about its own effort.
// A migrated system holds one as an optional field on its own project (`RdProject.fx`, `TechProgram.fx`) and hands it to `step`, which
// updates it in place. It is data, not money: `spent` is a tally of what the run cost, and nobody reads cash from it.
//
//   progress  how far the work has got, 0 to 1 (the furthest any step reported)
//   quality   the quality the work landed or was quoted at, 0 to 10,000 (a tech lead is under 1,200)
//   spent     dollars the steps spent, whole, up to ten trillion
//   hours     hours of focused work, whole, up to 100,000 (about fifty years of full weeks)
//   setbacks  steps that did not work, whole, up to 99
//   insight   know-how the work banked, 0 to 100
//   fatigue   the strain the pace has built, 0 to 100 (the caller sets it; `step` leaves it alone)
//   last      the year of the last step, so a year is never booked twice (-1 for never)
//
// A save may hold anything, so `normalizeFx` is total: it cuts every number to its cap and never throws. Every cap is a number a
// person could defend, and test/effort-step.test.ts holds a hostile record to them. Nothing here draws or books.
import { clampNum, hasOwn, isRecord, round2 } from './num'
import type { Fx } from './types'

/** The most each number of an Fx can hold. `insight` is the know-how ceiling (KNOW_MAX, 100): a test holds the two equal. */
export const FX_CAPS = Object.freeze({
  progress: 1,
  quality: 10000,
  spent: 1e13,
  hours: 100000,
  setbacks: 99,
  insight: 100,
  fatigue: 100,
  last: 9999,
})

/** A number out of `raw[key]`, cut to `lo..hi`; anything that is not a finite number reads as `lo`. */
function numAt(raw: Record<string, unknown>, key: string, lo: number, hi: number, fallback: number = lo): number {
  return hasOwn(raw, key) ? clampNum(raw[key], lo, hi, fallback) : fallback
}

/**
 * A fresh record for work that starts in `year`: all zero, stamped the year before so the first step of the starting year books
 * (a second step in the same year is a replay and changes nothing). A year that is not a number reads as 0.
 */
export function newFx(year: number): Fx {
  return {
    v: 1,
    progress: 0,
    quality: 0,
    spent: 0,
    hours: 0,
    setbacks: 0,
    insight: 0,
    fatigue: 0,
    last: Math.round(clampNum(year, 0, FX_CAPS.last, 0)) - 1,
  }
}

/**
 * The record a stored value stands for: nine numbers within their caps, in one fixed key order. Total and pure: anything that is not
 * a record (or not a number inside it) reads as the fresh values, a number past its cap is cut to it, and only own keys count, so a
 * hostile `__proto__` can't speak. A good record comes back equal, and reading the result again changes nothing.
 */
export function normalizeFx(raw: unknown): Fx {
  const r: Record<string, unknown> = isRecord(raw) ? raw : {}
  return {
    v: 1,
    progress: round2(numAt(r, 'progress', 0, FX_CAPS.progress)),
    quality: round2(numAt(r, 'quality', 0, FX_CAPS.quality)),
    spent: Math.round(numAt(r, 'spent', 0, FX_CAPS.spent)),
    hours: Math.round(numAt(r, 'hours', 0, FX_CAPS.hours)),
    setbacks: Math.round(numAt(r, 'setbacks', 0, FX_CAPS.setbacks)),
    insight: round2(numAt(r, 'insight', 0, FX_CAPS.insight)),
    fatigue: round2(numAt(r, 'fatigue', 0, FX_CAPS.fatigue)),
    last: Math.round(numAt(r, 'last', -1, FX_CAPS.last)),
  }
}
