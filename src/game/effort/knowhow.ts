// The know-how map (R3, C.1): how well a person or a company knows one field of work, 0 to 100. A company keeps its map as
// BizState.knowHow and the player's lives in flags['effort.you'] (fieldK); both are plain `Record<string, number>` and the engine
// takes the map by reference. These are the only functions that read or write one. (Knowledge's `flags.know`, the player's
// personal knowledge of the world, is another thing: see knowledge/.)
//
// A map is canonical: at most KNOW_HOW_FIELDS keys of the shape isField accepts, each a value from KNOW_FLOOR to KNOW_MAX at two
// decimal places. `readKnowHow` makes any value canonical (a save may hold anything); `learnKnowHow` and `fadeKnowHow` keep a
// canonical map canonical. A key that is a method name ('constructor') is a field like any other, so every read checks own keys.
import { KNOW_FADE, KNOW_FLOOR, KNOW_HOW_FIELDS, KNOW_MAX } from './limits'
import { clampNum, hasOwn, isRecord, round2 } from './num'
import { isField } from './task'

/** The know-how map a stored value stands for: bounded, validated, keys sorted. Total: anything that is not a map reads as empty. */
export function readKnowHow(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(raw)) return out
  const rows: [string, number][] = []
  for (const key of Object.keys(raw)) {
    if (!isField(key)) continue
    const v = raw[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const value = round2(clampNum(v, 0, KNOW_MAX))
    if (value >= KNOW_FLOOR) rows.push([key, value])
  }
  // Past the cap the biggest stay (ties by name), then the keys go in sorted order so the stored JSON never depends on save order.
  rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const kept = rows.slice(0, KNOW_HOW_FIELDS).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  for (const [key, value] of kept) out[key] = value
  return out
}

/** How well the map knows `field`: 0 to 100, and 0 for a field it doesn't hold, a value that isn't a number, or no map at all. */
export function knowHowOf(map: Readonly<Record<string, number>> | null | undefined, field: string): number {
  if (!isRecord(map) || !hasOwn(map, field)) return 0
  return clampNum(map[field], 0, KNOW_MAX, 0)
}

/**
 * Adds `gain` points to `field` in `map` (in place) and returns the new level. A gain that isn't a positive number, a field that
 * isn't a field and a result under KNOW_FLOOR change nothing (the level returned is the old one, 0 for a field not held). A map
 * already at KNOW_HOW_FIELDS fields takes a new field only by displacing its smallest, and only if the new one is bigger.
 */
export function learnKnowHow(map: Record<string, number>, field: string, gain: number): number {
  if (!isRecord(map) || !isField(field)) return 0
  const now = knowHowOf(map, field)
  if (typeof gain !== 'number' || !(gain > 0) || !Number.isFinite(gain)) return now
  const next = round2(Math.min(KNOW_MAX, now + gain))
  if (next < KNOW_FLOOR) return now
  if (!hasOwn(map, field)) {
    const keys = Object.keys(map)
    if (keys.length >= KNOW_HOW_FIELDS) {
      let low = keys[0]!
      for (const k of keys) if (knowHowOf(map, k) < knowHowOf(map, low) || (knowHowOf(map, k) === knowHowOf(map, low) && k > low)) low = k
      if (next <= knowHowOf(map, low)) return 0
      delete map[low]
    }
  }
  map[field] = next
  return next
}

/**
 * Each idle field keeps KNOW_FADE of its know-how (in place); one that falls under KNOW_FLOOR is dropped, and so is a field whose
 * value isn't a number. `idle` is a list or set of field names (a string is not one); a name the map doesn't hold is skipped.
 */
export function fadeKnowHow(map: Record<string, number>, idle: Iterable<string>): void {
  if (!isRecord(map) || typeof idle !== 'object' || idle === null || typeof (idle as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') return
  for (const field of new Set(idle)) {
    if (typeof field !== 'string' || !hasOwn(map, field)) continue
    const v: unknown = map[field]
    const next = typeof v === 'number' && Number.isFinite(v) ? round2(clampNum(v, 0, KNOW_MAX) * KNOW_FADE) : 0
    if (next < KNOW_FLOOR) delete map[field]
    else map[field] = next
  }
}
