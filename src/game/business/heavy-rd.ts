// Heavy R&D (docs/superpowers/specs/2026-10-14-heavy-rnd-design.md), the pure part: what a breakthrough
// leaves behind once it works. One record per kind in the market it was launched in (a list in game
// flags) is the single source of truth for three pure readers: the kind's demand over time
// (heavyLevel), when and how well each rival follows (heavyArrival, heavyVersionQuality), and the
// lift the whole trade gets (heavyPulse). None of them touches the game RNG: the same records and the
// same year always give the same answer, so the planner's what-ifs stay deterministic.
import type { GameState, Json } from '../types'
import { marketKey } from './competition-core'
import { breakthroughByName } from './heavy-data'
import type { DemandLevel } from './product-data'
import { hashOf, mix } from './product-market'
import { clampN } from './util'

/** A breakthrough that worked, in the market it was launched in. */
export interface HeavyRecord {
  /** Its catalogue name (heavy-data.ts), which is also the family of the pioneer's line. */
  family: string
  /** Launch year: the first year the line is on sale. */
  year: number
  /** Years of development it took (1-6): the least anyone else needs after the launch. */
  years: number
  /** Quality of the pioneer's line at launch. */
  quality: number
  /** What it cost, internal dollars: a costlier breakthrough lifts the trade more. */
  cost: number
  /** Asset id of the pioneer. */
  by: string
}

/** Most records kept per trade and market (the catalogue has two or three per trade). */
export const MAX_HEAVY_RECORDS = 12
/** Entries of a stored list that are looked at (a damaged save can't make every read slow). */
const MAX_SCAN = 64
const MAX_BY = 64

const NONE: readonly HeavyRecord[] = Object.freeze([])

// ---------------------------------------------------------------------------
// The records in game flags

/** The flag a market's records live under: 'heavy.' + trade + '|' + market ('world' or a country id). */
export function heavyKey(industry: string, market: string): string {
  return 'heavy.' + industry + '|' + market
}

/** A stored record, checked field by field and clamped; null when it is not a usable record. */
function cleanRecord(x: unknown): HeavyRecord | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const { family, year, years, quality, cost, by } = o
  if (typeof family !== 'string' || breakthroughByName(family) === null) return null
  if (typeof year !== 'number' || typeof years !== 'number' || typeof quality !== 'number' || typeof cost !== 'number') return null
  if (!Number.isFinite(year) || !Number.isFinite(years) || !Number.isFinite(quality) || !Number.isFinite(cost)) return null
  if (typeof by !== 'string') return null
  return {
    family,
    year: Math.round(clampN(year, 1800, 2300)),
    years: Math.round(clampN(years, 1, 6)),
    quality: Math.round(clampN(quality, 0, 100)),
    cost: clampN(cost, 0, 1e15),
    by: by.slice(0, MAX_BY),
  }
}

/**
 * The records of a trade in a market: a validated copy, at most MAX_HEAVY_RECORDS, newest last, one
 * per family (the earliest). Anything damaged is dropped and numbers are clamped; a flag of the wrong
 * type reads as none. With no flag it returns one shared, frozen, empty list (no allocation: this is
 * read on every market context, and the planner builds hundreds).
 */
export function readHeavy(g: Pick<GameState, 'flags'>, industry: string, market: string): readonly HeavyRecord[] {
  const raw = g.flags ? g.flags[heavyKey(industry, market)] : undefined
  if (!Array.isArray(raw) || raw.length === 0) return NONE
  const out: HeavyRecord[] = []
  const at = new Map<string, number>()
  for (let i = Math.max(0, raw.length - MAX_SCAN); i < raw.length; i++) {
    const r = cleanRecord(raw[i])
    if (!r) continue
    const seen = at.get(r.family)
    if (seen === undefined) {
      at.set(r.family, out.length)
      out.push(r)
    } else if (r.year < out[seen].year) out[seen] = r
  }
  if (!out.length) return NONE
  return out.length > MAX_HEAVY_RECORDS ? out.slice(-MAX_HEAVY_RECORDS) : out
}

/** The records of a company's own market ('world' for a tradable trade, else its country). */
export function heavyOf(g: Pick<GameState, 'flags'>, b: { industry: string; countryId: string }): readonly HeavyRecord[] {
  return readHeavy(g, b.industry, marketKey(b))
}

/**
 * Write a launch into the market's list. A family that is already there keeps its earliest record (the
 * pioneer stays the pioneer); the list holds at most MAX_HEAVY_RECORDS, dropping the oldest. A record
 * that isn't valid is not stored. Rewrites the list from the validated one, so damage is repaired.
 */
export function addHeavy(g: GameState, industry: string, market: string, rec: HeavyRecord): void {
  const clean = cleanRecord(rec)
  if (!clean) return
  const list = [...readHeavy(g, industry, market)]
  const i = list.findIndex((r) => r.family === clean.family)
  if (i < 0) list.push(clean)
  else if (clean.year < list[i].year) list[i] = clean
  const stored: Json[] = list.slice(-MAX_HEAVY_RECORDS).map((r) => ({ family: r.family, year: r.year, years: r.years, quality: r.quality, cost: r.cost, by: r.by }))
  g.flags[heavyKey(industry, market)] = stored
}

// ---------------------------------------------------------------------------
// The kind's demand

/** Years after the launch at which half of the eventual adoption is reached, and how wide the S is. */
const ADOPT_MID = 4
const ADOPT_WIDTH = 1.6
/** The S-curve ends here: full adoption ten years after the launch. */
const ADOPT_YEARS = 10
/** Demand holds at its peak until this many years after the launch, then declines... */
const PEAK_YEARS = 18
/** ...toward this share of the peak... */
const FALL_TO = 0.6
/** ...with this time constant (years). */
const FALL_YEARS = 10

const logistic = (t: number): number => 1 / (1 + Math.exp(-(t - ADOPT_MID) / ADOPT_WIDTH))
const LOGISTIC_END = logistic(ADOPT_YEARS)

/**
 * Demand for a breakthrough kind in its market and year: nothing before the launch, then an S-curve
 * over ten years up to a plateau, and from year 18 a slow decline toward 0.6 of the peak. Once the
 * kind exists it is never below 0.005 (the floor demandLevel uses). Pure.
 */
export function heavyLevel(rec: HeavyRecord, year: number): DemandLevel {
  if (!Number.isFinite(year) || !(year >= rec.year)) return { exists: false, adoption: 0, level: 0 }
  const t = year - rec.year
  const adoption = t >= ADOPT_YEARS ? 1 : Math.max(0.005, Math.min(1, logistic(t) / LOGISTIC_END))
  const fall = t > PEAK_YEARS ? FALL_TO + (1 - FALL_TO) * Math.exp(-(t - PEAK_YEARS) / FALL_YEARS) : 1
  return { exists: true, adoption, level: Math.max(0.005, adoption * fall) }
}

/** The demand curve of a family when there is a record for it (null: not a recorded breakthrough). */
export function heavyLevelFor(family: string, records: readonly HeavyRecord[], year: number): DemandLevel | null {
  for (const r of records) if (r.family === family) return heavyLevel(r, year)
  return null
}

// ---------------------------------------------------------------------------
// Everyone else pays the same time to catch up

/**
 * How many development times a rival of each size needs after the launch (a smaller rival can't fund
 * it as fast; none is faster than the pioneer, so none is under 1). A rival of a tier not listed is
 * read as a mid-size one.
 */
export const TIER_LAG: Readonly<Record<string, number>> = Object.freeze({ giant: 1, major: 1.25, mid: 1.5, small: 2 })

/** The year a rival offers its own version: the launch plus the tier's lag, and a year more for half of them. */
export function heavyArrival(rec: HeavyRecord, rival: { id: string; tier: string }): number {
  const lag = Object.hasOwn(TIER_LAG, rival.tier) ? TIER_LAG[rival.tier] : TIER_LAG.mid
  const late = mix(hashOf(rival.id), hashOf(rec.family), 2) < 0.5 ? 0 : 1
  const at = rec.year + Math.ceil(rec.years * lag) + late
  return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY
}

/** The year the long tail of small competitors follows: twice the development time after the launch. */
export function heavyFringeArrival(rec: HeavyRecord): number {
  return rec.year + Math.ceil(rec.years * 2)
}

/** Quality of a rival's version: a little under the pioneer's (6 to 15 points), never better. */
export function heavyVersionQuality(rec: HeavyRecord, rival: { id: string; tier: string }): number {
  const worse = 6 + Math.floor(mix(hashOf(rival.id), hashOf(rec.family), 3) * 10)
  return Math.round(Math.max(Math.min(10, rec.quality), Math.min(rec.quality, rec.quality - worse)))
}

// ---------------------------------------------------------------------------
// Demand for the whole market

/** A breakthrough lifts the trade by this much at the least... */
const PULSE_BASE = 0.1
/** ...plus this much for every doubling of its cost over PULSE_REF, up to PULSE_DOUBLINGS doublings. */
const PULSE_PER_DOUBLING = 0.04
const PULSE_DOUBLINGS = 4
/** A typical small trade's breakthrough: 8 times the base cost of a classic line (rd.ts RD_BASE is 30,000). */
const PULSE_REF = 240_000
/** The lift builds up over the first three years (the launch year is the first of them)... */
const PULSE_RAMP = 3
/** ...holds until this many years after the launch... */
const PULSE_HOLD = 8
/** ...then halves every ten years. */
const PULSE_HALF_LIFE = 10
/** All breakthroughs together lift a market by at most this much. */
const PULSE_CAP = 0.4

/**
 * The multiplier on a market's potential (ctx.pot) from the breakthroughs in it: 1 with none. Each
 * record adds 10% to 26% of the market (more for a costlier one), building over three years from the
 * launch, holding for eight, then fading with a ten-year half-life; the sum is capped at +40% and the
 * answer is always a finite number from 1 to 1.4. Pure in (records, year).
 */
export function heavyPulse(records: readonly HeavyRecord[], year: number): number {
  if (!records.length || !Number.isFinite(year)) return 1
  let sum = 0
  for (const r of records) {
    if (!(year >= r.year)) continue
    const t = year - r.year
    const doublings = Number.isFinite(r.cost) && r.cost > PULSE_REF ? Math.min(PULSE_DOUBLINGS, Math.log2(r.cost / PULSE_REF)) : 0
    const ramp = Math.min(1, (t + 1) / PULSE_RAMP)
    const fade = t > PULSE_HOLD ? Math.pow(0.5, (t - PULSE_HOLD) / PULSE_HALF_LIFE) : 1
    const lift = (PULSE_BASE + PULSE_PER_DOUBLING * doublings) * ramp * fade
    if (Number.isFinite(lift)) sum += lift
  }
  return 1 + Math.min(PULSE_CAP, Math.max(0, sum))
}
