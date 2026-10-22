// State lines (R2-P8, E.T3 b): stateLine(g, key, value), a yearly status line that speaks when its state crosses a threshold,
// or when it has been quiet for a while and the state still holds, in variants that never repeat the last two used.
//
// It is presentation and nothing else: no g.rng, no stream, no draw of any kind. The variant is a hash of the life, the year
// and the memory key (hunit), taken over the variants that are not among the last two used, so three variants cycle. What the
// game said last is one short string per key in g.flags.textMem.s (text/memory.ts: '<year>,<band>,<variant>,<previous>').
// A call that stays quiet writes nothing, so a call is idempotent within a year, and a record from a year after g.year is
// never read (no foresight).
//
// Imports the memory, the hash, the table and, for types only, the game state. bandBy and logBand live in ./band (a leaf the
// table needs for its own rows) and are re-exported here, so their import path stays this file.
import type { GameState } from '../types'
import { hunit } from './hash'
import { isMemKey, readState, readTextMem, rememberState, writableTextMem } from './memory'
import { STATE_TABLE, type StateKey, type StateSpec } from './state-table'

export { bandBy, logBand } from './band'

/** How many recent variants a line avoids, the years of silence after which an unchanged state speaks again, and the fewest years between two lines when the band changed. The 120-record cap is TEXT_MEM_LIMITS.states. */
export const STATE_LIMITS = Object.freeze({ exclude: 2, every: 5, gap: 2 } as const)

/** The newest year a record can name (six digits in the codec). */
const YEAR_MAX = 999_999
/** The variant index is one digit in the codec. */
const VARIANTS_MAX = 10
const SLOT_RE = /\{(\w+)\}/g

/** {name} -> slots.name, a missing slot -> ''. One pass: a value that holds braces is never read again. */
export function fillSlots(line: string, slots?: Readonly<Record<string, string>>): string {
  return line.replace(SLOT_RE, (_all, name: string) => {
    const v = slots && Object.hasOwn(slots, name) ? slots[name] : ''
    return typeof v === 'string' ? v : ''
  })
}

/** The memory key of a row, with the id of one person when it has one: 'key' or 'key.id'. Null when it is not a valid memory key (a hostile id included). */
function memKeyOf(key: string, id: string | undefined): string | null {
  if (id === undefined) return isMemKey(key) ? key : null
  if (!isMemKey(id)) return null
  const joined = `${key}.${id}`
  return isMemKey(joined) ? joined : null
}

/** The bucket of a value: 0 for a value that is not finite, else the row's band, whole and kept between 0 and 99. */
function bandOf(spec: StateSpec, value: number): number {
  if (!Number.isFinite(value)) return 0
  const b = spec.band(value)
  return Number.isFinite(b) ? Math.min(99, Math.max(0, Math.floor(b))) : 0
}

/** A whole number of years, at least `least`; `fallback` when it is not a finite number. */
function wholeYears(n: number | undefined, fallback: number, least: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(least, Math.floor(n)) : fallback
}

/**
 * The engine of stateLine, over any table (tests inject theirs). Returns the line to log, or null when the state has nothing
 * new to say. Rules, in order:
 *  1. The band of the value (a non-finite value is band 0).
 *  2. No record, or a record from a year after g.year: speak.
 *  3. The same band: speak only when `every` is above 0 and at least `every` years have passed.
 *  4. A different band: speak only when at least `gap` years have passed. Otherwise stay quiet and leave the record alone, so
 *     the change still counts next year (a deferred change is not a lost one).
 *  5. Speaking writes { year, band, variant, previous variant } and returns the variant with its slots filled. Staying quiet
 *     writes nothing, so a second call in the same year can never speak.
 * `opts.id` keys the record to one person (or thing): 'allowance.one.p42'. A key or id that is not a valid memory key returns null.
 */
export function stateLineWith(
  table: Readonly<Record<string, StateSpec>>,
  g: GameState,
  key: string,
  value: number,
  opts: { id?: string; slots?: Readonly<Record<string, string>> } = {},
): string | null {
  if (!Object.hasOwn(table, key)) return null
  const spec = table[key]
  const memKey = memKeyOf(key, opts.id)
  const year = g.year
  const n = Math.min(spec.variants.length, VARIANTS_MAX)
  if (memKey === null || n === 0 || !Number.isInteger(year) || year < 0 || year > YEAR_MAX) return null

  const band = bandOf(spec, value)
  const rec = readState(readTextMem(g), memKey, year)
  if (rec) {
    const since = year - rec.year
    const every = wholeYears(spec.every, STATE_LIMITS.every, 0)
    const gap = wholeYears(spec.gap, STATE_LIMITS.gap, 1)
    if (rec.band === band ? every === 0 || since < Math.max(1, every) : since < gap) return null
  }

  // The variants not among the last two used; with fewer to spare, not the last one; a single variant has no choice.
  const avoid = rec ? [rec.v1, rec.v2] : []
  let open = Array.from({ length: n }, (_, i) => i).filter((i) => !avoid.includes(i))
  if (open.length === 0) open = Array.from({ length: n }, (_, i) => i).filter((i) => i !== rec?.v1)
  if (open.length === 0) open = [0]
  const variant = open[Math.floor(hunit(g.lifeId, year, memKey) * open.length)]

  rememberState(writableTextMem(g), memKey, { year, band, v1: variant, v2: rec ? rec.v1 : -1 })
  return fillSlots(spec.variants[variant], opts.slots)
}

/** The state line of a row of STATE_TABLE: speaks on a change of band, or after `every` quiet years, in variants that never repeat the last two. Pure presentation (see the file header). */
export function stateLine(g: GameState, key: StateKey, value: number, opts?: { id?: string; slots?: Readonly<Record<string, string>> }): string | null {
  return stateLineWith(STATE_TABLE, g, key, value, opts)
}
